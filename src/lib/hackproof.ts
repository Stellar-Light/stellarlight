/**
 * HackMeridian 2026 records from HackProof: the rules that decide which
 * records Scout stores and what each stored row may claim. Pure, so the
 * generator (scripts/build-hackmeridian-2026-hackproof.ts), which makes the
 * reads, and the tests apply the same rules.
 *
 * A record is a repo HackProof found on GitHub and Stellar testnet, not an
 * entry in the organizer's list. Scout keeps one only when the repo's own
 * text names the event (repo-names-event) or HackProof lists a placement for
 * it (placement-listed), and keeps a contract id it cites only when Scout's
 * own three checks pass. Every probe has three outcomes: found, checked and
 * absent, could not check; a could-not-check never reads as absent.
 */
import type { EntryBasis, MentionIn } from "@/lib/hackathon-build-links";

/** HackMeridian named, in any spacing or case ("Hack Meridian", "hack-meridian"). */
export const EVENT_NAMED = /hack[\s_\-.]*meridian/i;
/** The variant phrases a team uses for it ("Meridian hackathon"). */
export const EVENT_VARIANT =
	/hack\w*on[\s_\-.]*meridian|meridian[\s_\-.]*(?:2026[\s_\-.]*)?hack/i;

/** A repo's own text as read: its name, GitHub description and topics, the
 * README GitHub shows, and its other markdown files (shallowest first). */
export interface RepoText {
	name: string;
	description: string | null;
	topics: string[];
	readme: { path: string; text: string } | null;
	docs: Array<{ path: string; text: string }>;
}

export interface Mention {
	in: MentionIn;
	/** The file, for readme and doc; null for the repo's name, description or topics. */
	path: string | null;
}

function hit(t: RepoText, re: RegExp, docs: boolean): Mention | null {
	if (t.readme && re.test(t.readme.text))
		return { in: "readme", path: t.readme.path };
	if (re.test(t.name)) return { in: "name", path: null };
	if (t.description && re.test(t.description))
		return { in: "description", path: null };
	if (t.topics.some((x) => re.test(x))) return { in: "topics", path: null };
	const doc = docs ? t.docs.find((d) => re.test(d.text)) : undefined;
	return doc ? { in: "doc", path: doc.path } : null;
}

/** Whether the README, name, description or topics name the event, so no
 * other markdown file needs reading. */
export const namedUpFront = (t: RepoText): boolean =>
	hit(t, EVENT_NAMED, false) !== null;

/** Where the repo's own text first names the event: the README, its name,
 * description, topics, then another markdown file; then the same places
 * for a variant phrase. null = no text read names it. */
export function findMention(t: RepoText): Mention | null {
	return hit(t, EVENT_NAMED, true) ?? hit(t, EVENT_VARIANT, true);
}

/** What the repo read found. docsRead below docsTotal is a partial read. */
export type RepoRead =
	| { state: "read"; text: RepoText; docsRead: number; docsTotal: number }
	| { state: "gone" }
	| { state: "could-not-check"; reason: string };

export type BasisDecision =
	| { basis: EntryBasis; mention: Mention | null }
	| { left: string; couldNotCheck: boolean };

/** Why a record is stored, or why it is left out. A repo that answers not
 * found is left out even when HackProof's stored copy names the event: the
 * team's own text can no longer be read. A placement alone keeps a readable
 * repo (placement-listed); nothing else does. */
export function entryBasisOf(read: RepoRead, placed: boolean): BasisDecision {
	if (read.state === "gone")
		return {
			left: "the repo answers not found, so its own text cannot be read",
			couldNotCheck: false,
		};
	if (read.state === "could-not-check")
		return { left: `could not check: ${read.reason}`, couldNotCheck: true };
	const mention = findMention(read.text);
	if (mention) return { basis: "repo-names-event", mention };
	if (placed) return { basis: "placement-listed", mention: null };
	const partial = read.docsRead < read.docsTotal;
	return {
		left: `its own text does not name HackMeridian (README, name, description, topics and ${read.docsRead} of ${read.docsTotal} other markdown files read)`,
		couldNotCheck: partial,
	};
}

/** One check of a cited contract id. */
export type Probe<F = unknown> =
	| ({ state: "found" } & F)
	| { state: "checked-absent"; why: string }
	| { state: "could-not-check"; why: string };

export interface ContractChecks {
	/** The cited file, read at HEAD, holds the id. */
	file: Probe;
	/** getLedgerEntries finds the contract instance on testnet, live or
	 * archived. */
	rpc: Probe<{ archived: boolean }>;
	/** stellar.expert's record of the contract's creation. */
	expert: Probe<{ createdAt: string | null }>;
}

export type ContractVerdict =
	| { keep: true; createdAt: string }
	| { keep: false; reason: string; couldNotCheck: boolean };

/** Keep a cited id only when all three checks pass and it was created
 * inside the event window. A check that failed outright decides first; a
 * check that could not run keeps the id out as could-not-check, never as
 * absent. */
export function contractVerdict(
	c: ContractChecks,
	window: { start: string; end: string },
): ContractVerdict {
	const no = (reason: string) => ({ keep: false as const, reason });
	if (c.file.state === "checked-absent")
		return { ...no(`the cited file: ${c.file.why}`), couldNotCheck: false };
	if (c.rpc.state === "checked-absent")
		return { ...no(`testnet: ${c.rpc.why}`), couldNotCheck: false };
	if (c.expert.state === "checked-absent")
		return { ...no(`stellar.expert: ${c.expert.why}`), couldNotCheck: false };
	const unread = [
		c.file.state === "could-not-check" ? `the cited file (${c.file.why})` : "",
		c.rpc.state === "could-not-check" ? `testnet (${c.rpc.why})` : "",
		c.expert.state === "could-not-check"
			? `stellar.expert (${c.expert.why})`
			: "",
	].filter(Boolean);
	if (unread.length)
		return {
			...no(`could not check ${unread.join(", ")}`),
			couldNotCheck: true,
		};
	const createdAt = c.expert.state === "found" ? c.expert.createdAt : null;
	if (!createdAt)
		return {
			...no("could not check stellar.expert (no creation time)"),
			couldNotCheck: true,
		};
	const t = Date.parse(createdAt);
	if (!(t >= Date.parse(window.start) && t <= Date.parse(window.end)))
		return {
			...no(`created ${createdAt}, outside the event window`),
			couldNotCheck: false,
		};
	return { keep: true, createdAt };
}

/** getLedgerEntries' answer for the instance keys asked, by key: found
 * (archived when its TTL has passed), or checked-absent when the answer
 * lists no entry for it. An error answer leaves every key could-not-check. */
export function rpcProbes(
	keys: string[],
	answer: unknown,
): Map<string, ContractChecks["rpc"]> {
	const a = answer as {
		error?: unknown;
		result?: {
			latestLedger?: number;
			entries?: Array<{ key?: string; liveUntilLedgerSeq?: number }> | null;
		};
	} | null;
	const out = new Map<string, ContractChecks["rpc"]>();
	const latest = a?.result?.latestLedger;
	if (!a || a.error || typeof latest !== "number") {
		const why = a?.error
			? `RPC error ${JSON.stringify(a.error).slice(0, 80)}`
			: "no RPC answer";
		for (const k of keys) out.set(k, { state: "could-not-check", why });
		return out;
	}
	const byKey = new Map((a.result?.entries ?? []).map((e) => [e.key, e]));
	for (const k of keys) {
		const e = byKey.get(k);
		out.set(
			k,
			e
				? {
						state: "found",
						archived:
							typeof e.liveUntilLedgerSeq === "number" &&
							e.liveUntilLedgerSeq < latest,
					}
				: {
						state: "checked-absent",
						why: "getLedgerEntries finds no contract instance",
					},
		);
	}
	return out;
}

/** stellar.expert's contract record: its creation time, checked-absent on
 * a 404, could-not-check on any other failure. */
export function expertProbe(
	status: number | null,
	body: unknown,
): ContractChecks["expert"] {
	if (status === 404)
		return { state: "checked-absent", why: "no record of the contract" };
	if (status !== 200)
		return {
			state: "could-not-check",
			why: status ? `HTTP ${status}` : "no answer",
		};
	const created = (body as { created?: unknown } | null)?.created;
	return {
		state: "found",
		createdAt:
			typeof created === "number"
				? new Date(created * 1000).toISOString().replace(".000Z", "Z")
				: null,
	};
}

/** The cited file's check: found when the text holds the id. */
export function fileProbe(
	status: number | null,
	text: string | null,
	id: string,
): ContractChecks["file"] {
	if (status === 404)
		return { state: "checked-absent", why: "not found at HEAD" };
	if (status !== 200 || text === null)
		return {
			state: "could-not-check",
			why: status ? `HTTP ${status}` : "no answer",
		};
	return text.includes(id)
		? { state: "found" }
		: { state: "checked-absent", why: "read at HEAD, the id is not in it" };
}

/** A README's first top-level heading outside code fences (a "# " line or
 * an <h1> tag), as plain text, or null when it has none fit to be a name. */
export function firstHeading(readme: string | null): string | null {
	if (!readme) return null;
	let fence = false;
	for (const raw of readme.replace(/^﻿/, "").split(/\r?\n/)) {
		const line = raw.trim();
		if (/^(```|~~~)/.test(line)) {
			fence = !fence;
			continue;
		}
		if (fence) continue;
		const m =
			/^#\s+(.+?)\s*#*\s*$/.exec(line) ?? /<h1[^>]*>(.*?)<\/h1>/i.exec(line);
		if (!m) continue;
		const text = plain(m[1]);
		return text && text.length <= 100 ? text : null;
	}
	return null;
}

/** A heading's markdown and HTML stripped (clean). */
export function plain(s: string): string {
	return clean(
		s
			.replace(/<[^>]*>/g, " ")
			.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/(\*\*|__|\*|`)(.+?)\1/g, "$2")
			.replace(/[*`]/g, ""),
	);
}

/** Text taken from a repo, with dashes U+2013 and U+2014 written as a
 * hyphen and whitespace collapsed. */
export const clean = (s: string): string =>
	s.replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();
