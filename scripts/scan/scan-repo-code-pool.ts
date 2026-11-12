/**
 * Selection-pool helpers for scripts/scan/scan-repo-code.ts, split out so they
 * can be unit-tested without importing the scanner (which opens a DB handle at
 * module load).
 */
import { type NotePin, readingFor } from "../../src/lib/note-pins";
import { notePinsFor, pinnedRepos } from "../../src/lib/repo-knowledge";

/** How many already-scanned rows either selection path pulls before filtering
 *  in memory. */
export const SCANNED_POOL_CAP = 3000;

/** The line to print when a capped fetch may have hidden rows. A silent
 *  truncation is invisible in the run log and looks exactly like "the backlog
 *  is exhausted". */
export function poolWarning(fetched: number, cap: number): string | null {
	return fetched < cap
		? null
		: `WARNING: the scanned pool hit its ${cap}-row cap. Rows beyond it were never considered, so "no eligible repos" below may mean "none in the window", not "none at all". Raise SCANNED_POOL_CAP or narrow --lang.`;
}

/** At most this many repos a wave picks for their pinned notes alone
 * (sls-115). They lead the wave and run in its loop, so the call budget
 * counts them like any other repo. */
export const PIN_DUE_CAP = 25;

/** A repo is re-picked for its pins at most once a day, the stale rule's
 * cooldown, so one whose scan keeps failing costs a scan a day, not one a
 * wave. TODO(improvements/TODO.md, 2026-11-11): a guard that counts pins
 * unread for more than N days; until then a pin that never resolves is
 * re-read daily in silence. */
const PIN_COOLDOWN_MS = 24 * 36e5;

/**
 * Whether a repo holding pinned notes is due a scan for them alone (sls-115):
 * a pin has no usable reading at the row's scannedRef (none stored, one taken
 * at another commit or for another pin, or one that could not be read), or
 * the repo was pushed after the scan that took its readings. A pin whose own
 * commit is the scannedRef needs no reading unless a stored one is unread. Without this, a pin added to a
 * quiet repo answers unknown until the repo's next push, which may never come.
 */
export function pinScanDue(
	pins: NotePin[],
	row: {
		codeScanState?: unknown;
		codeScannedAt?: unknown;
		lastCommitAt?: unknown;
		scannedRef?: unknown;
		pinnedValues?: unknown;
	},
	nowMs: number,
): boolean {
	if (!pins.length || row.codeScanState === "gone") return false;
	const scannedAt = row.codeScannedAt
		? Date.parse(String(row.codeScannedAt))
		: Number.NaN;
	if (!Number.isNaN(scannedAt) && nowMs - scannedAt <= PIN_COOLDOWN_MS)
		return false;
	const pushedAt = row.lastCommitAt
		? Date.parse(String(row.lastCommitAt))
		: Number.NaN;
	if (!Number.isNaN(scannedAt) && pushedAt > scannedAt) return true;
	const ref = typeof row.scannedRef === "string" ? row.scannedRef : null;
	return pins.some((pin) => {
		// A stored reading decides: unread stays due, even at the pin's own
		// commit. With none stored, the pin's own commit needs no read.
		const read = readingFor(pin, ref, row.pinnedValues);
		if (read) return read.state === "unread";
		return ref?.toLowerCase() !== pin.commit.toLowerCase();
	});
}

/** What the pin-due pass reads of each row: the fields the scan loop reads
 * (keepStoredContract writes the stored contract back when its check cannot
 * run, so a row without them would null a stored contract id) and the
 * fields pinScanDue judges. */
export const PIN_DUE_SELECT = {
	fullName: true,
	repoScore: true,
	isFork: true,
	isArchived: true,
	primaryLanguage: true,
	mainnetContractId: true,
	mainnetContractBasis: true,
	codeScanState: true,
	lastCommitAt: true,
	codeScannedAt: true,
	scannedRef: true,
	pinnedValues: true,
} as const;

export interface PinDueQuery {
	collection: "repos";
	where: { or: Array<{ fullName: { like: string } }> };
	limit: number;
	depth: 0;
	context: { internal: true };
	select: typeof PIN_DUE_SELECT;
}

/**
 * The wave with its pin-due repos first (sls-115): rows of the registry's
 * pinned repos (exact name, any casing) in the wave's language that
 * pinScanDue judges due, at most PIN_DUE_CAP, then the wave's own rows
 * without them, cut to `limit`. `pinned` and `pinsFor` default to the
 * registry; tests pass their own.
 */
export async function pinDueWave<T extends { fullName?: unknown }>(
	find: (q: PinDueQuery) => Promise<{ docs: unknown[] }>,
	docs: T[],
	o: {
		lang: string;
		limit: number;
		now: number;
		pinned?: string[];
		pinsFor?: (fullName: string) => NotePin[];
	},
): Promise<{ docs: Array<T | Record<string, unknown>>; due: string[] }> {
	const pinned = o.pinned ?? pinnedRepos();
	const pinsFor = o.pinsFor ?? notePinsFor;
	if (!pinned.length) return { docs, due: [] };
	const res = await find({
		collection: "repos",
		where: { or: pinned.map((n) => ({ fullName: { like: n } })) },
		limit: Math.min(500, 50 * pinned.length),
		depth: 0,
		context: { internal: true },
		select: PIN_DUE_SELECT,
	});
	const keys = new Set(pinned.map((n) => n.toLowerCase()));
	const due = (res.docs as Array<Record<string, unknown>>)
		.filter((d) => keys.has(String(d.fullName).toLowerCase()))
		.filter((d) => o.lang === "all" || d.primaryLanguage === o.lang)
		.filter((d) => pinScanDue(pinsFor(String(d.fullName)), d, o.now))
		.slice(0, PIN_DUE_CAP);
	if (!due.length) return { docs, due: [] };
	const names = due.map((d) => String(d.fullName));
	const taken = new Set(names);
	return {
		docs: [...due, ...docs.filter((d) => !taken.has(String(d.fullName)))].slice(
			0,
			o.limit,
		),
		due: names,
	};
}
