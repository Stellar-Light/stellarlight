/**
 * The admin tally view's pure half: one row per address that is either
 * whitelisted or has a ballot, carrying the FIRST ballot (the one a round
 * counts) and whether the voter came back and changed it.
 *
 * Kept pure so the page is a renderer and this is the part a test can pin.
 */
import type { BallotSelections } from "./ballot";
import { normalizeSelections } from "./mirror";

export interface TallyVoterIn {
	address?: string | null;
	label?: string | null;
}

export interface TallyBallotIn {
	address?: string | null;
	selections?: unknown;
	txHash?: string | null;
	submissions?: number | null;
	firstSubmittedAt?: string | null;
	history?: Array<{
		selections?: unknown;
		txHash?: string | null;
		at?: string | null;
	} | null> | null;
}

export interface TallyRow {
	address: string;
	label: string;
	whitelisted: boolean;
	voted: boolean;
	/** Submitted more than once; the first ballot still counts. */
	revoted: boolean;
	submissions: number;
	picks: BallotSelections;
	at: string | null;
	txHash: string | null;
}

const norm = (a: unknown) =>
	String(a ?? "")
		.trim()
		.toUpperCase();

export function tallyViewRows(
	voters: TallyVoterIn[],
	ballots: TallyBallotIn[],
): {
	rows: TallyRow[];
	whitelisted: number;
	voted: number;
	notVoted: number;
	revoted: number;
	/** Ballots from addresses that are not whitelisted (an open rehearsal). */
	walkIns: number;
} {
	const labels = new Map<string, string>();
	for (const v of voters) {
		const a = norm(v.address);
		if (a && !labels.has(a)) labels.set(a, String(v.label ?? ""));
	}
	const byAddress = new Map<string, TallyBallotIn>();
	for (const b of ballots) {
		const a = norm(b.address);
		if (!a) continue;
		const prior = byAddress.get(a);
		const at = (x: TallyBallotIn) => x.firstSubmittedAt ?? "";
		// Oldest row wins if a race ever produced two for one address.
		if (!prior || at(b) < at(prior)) byAddress.set(a, b);
	}
	const addresses = new Set<string>([...labels.keys(), ...byAddress.keys()]);
	const rows: TallyRow[] = [];
	for (const address of addresses) {
		const b = byAddress.get(address);
		const trail = (b?.history ?? []).filter(
			(e): e is NonNullable<typeof e> => !!e,
		);
		const first =
			trail.find((e) =>
				Object.values(normalizeSelections(e.selections)).some(
					(s) => s.length > 0,
				),
			) ?? null;
		const picks = normalizeSelections(first ? first.selections : b?.selections);
		const submissions = b?.submissions ?? (b ? 1 : 0);
		rows.push({
			address,
			label: labels.get(address) ?? "",
			whitelisted: labels.has(address),
			voted: !!b,
			revoted: submissions > 1,
			submissions,
			picks,
			at: first?.at ?? b?.firstSubmittedAt ?? null,
			txHash: first?.txHash ?? b?.txHash ?? null,
		});
	}
	rows.sort(
		(x, y) =>
			Number(y.voted) - Number(x.voted) || x.address.localeCompare(y.address),
	);
	const voted = rows.filter((r) => r.voted).length;
	return {
		rows,
		whitelisted: labels.size,
		voted,
		notVoted: rows.filter((r) => r.whitelisted && !r.voted).length,
		revoted: rows.filter((r) => r.revoted).length,
		walkIns: rows.filter((r) => r.voted && !r.whitelisted).length,
	};
}
