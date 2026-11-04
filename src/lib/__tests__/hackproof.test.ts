import { describe, expect, it } from "vitest";
import { CURATED_BUILDS, HACKPROOF_BUILDS } from "@/data/curated-builds";
import hackproof from "@/data/hackmeridian-2026-hackproof.json";
import {
	CURATED_BUILD_ID,
	ENTRY_BASES,
	entryBasisLine,
} from "@/lib/hackathon-build-links";
import {
	type ContractChecks,
	contractVerdict,
	entryBasisOf,
	expertProbe,
	fileProbe,
	findMention,
	firstHeading,
	namedUpFront,
	type RepoText,
	rpcProbes,
} from "@/lib/hackproof";

const text = (over: Partial<RepoText> = {}): RepoText => ({
	name: "vault",
	description: null,
	topics: [],
	readme: { path: "README.md", text: "# Vault\nA Soroban vault." },
	docs: [],
	...over,
});
const read = (t: RepoText, docsRead = 0, docsTotal = 0) =>
	({ state: "read", text: t, docsRead, docsTotal }) as const;

describe("which records are stored, and on what basis", () => {
	it("a repo whose own text names the event is repo-names-event, with where it says so", () => {
		expect(
			entryBasisOf(
				read(
					text({
						readme: { path: "README.md", text: "Built at HackMeridian 2026." },
					}),
				),
				false,
			),
		).toEqual({
			basis: "repo-names-event",
			mention: { in: "readme", path: "README.md" },
		});
		// The README first, then the name, description and topics.
		expect(
			findMention(
				text({
					name: "hack-meridian-2026",
					description: "Hack Meridian build",
				}),
			),
		).toEqual({ in: "name", path: null });
		expect(findMention(text({ topics: ["soroban", "hackmeridian"] }))).toEqual({
			in: "topics",
			path: null,
		});
		// Another markdown file, by its path.
		expect(
			findMention(
				text({
					docs: [{ path: "docs/PITCH.md", text: "our HackMeridian pitch" }],
				}),
			),
		).toEqual({ in: "doc", path: "docs/PITCH.md" });
	});

	it("a variant phrase counts only when no text names HackMeridian itself", () => {
		const variant = text({
			readme: {
				path: "README.md",
				text: "built for the Stellar Meridian hackathon",
			},
		});
		expect(findMention(variant)).toEqual({ in: "readme", path: "README.md" });
		// HackMeridian in a doc wins over a variant in the name.
		expect(
			findMention(
				text({
					name: "cmi-hackthon-meridian",
					docs: [{ path: "specs/ROADMAP.md", text: "the HackMeridian demo" }],
				}),
			),
		).toEqual({ in: "doc", path: "specs/ROADMAP.md" });
		// Meridian alone is the conference, not the hackathon.
		expect(
			findMention(
				text({
					readme: { path: "README.md", text: "See you at Meridian 2026" },
				}),
			),
		).toBeNull();
	});

	it("reads other markdown files only when the README, name, description and topics are silent", () => {
		expect(namedUpFront(text({ description: "HackMeridian MVP" }))).toBe(true);
		expect(namedUpFront(text())).toBe(false);
		// A doc does not count up front: it has to be read.
		expect(
			namedUpFront(text({ docs: [{ path: "a.md", text: "HackMeridian" }] })),
		).toBe(false);
	});

	it("a placement alone keeps a readable silent repo as placement-listed, never more", () => {
		expect(entryBasisOf(read(text(), 20, 20), true)).toEqual({
			basis: "placement-listed",
			mention: null,
		});
		// The same repo with no placement is not stored.
		expect(entryBasisOf(read(text(), 20, 20), false)).toEqual({
			left: "its own text does not name HackMeridian (README, name, description, topics and 20 of 20 other markdown files read)",
			couldNotCheck: false,
		});
		// A capped read that finds nothing is not a checked silence.
		expect(entryBasisOf(read(text(), 60, 98), false)).toMatchObject({
			couldNotCheck: true,
		});
	});

	it("a repo that is gone or unreadable is left out, whatever the list stored about it", () => {
		expect(entryBasisOf({ state: "gone" }, true)).toEqual({
			left: "the repo answers not found, so its own text cannot be read",
			couldNotCheck: false,
		});
		expect(
			entryBasisOf({ state: "could-not-check", reason: "HTTP 502" }, false),
		).toEqual({ left: "could not check: HTTP 502", couldNotCheck: true });
	});
});

describe("a cited contract is kept only when Scout's own checks pass", () => {
	const window = {
		start: "2026-10-25T09:00:00Z",
		end: "2026-10-26T12:00:00Z",
	};
	const pass: ContractChecks = {
		file: { state: "found" },
		rpc: { state: "found", archived: true },
		expert: { state: "found", createdAt: "2026-10-25T17:12:47Z" },
	};

	it("passes: the file holds it, testnet has it (archived counts) and it was created during the event", () => {
		expect(contractVerdict(pass, window)).toEqual({
			keep: true,
			createdAt: "2026-10-25T17:12:47Z",
		});
	});

	it("absent: a file without the id, no instance, no record, or a creation outside the window", () => {
		expect(
			contractVerdict(
				{
					...pass,
					file: { state: "checked-absent", why: "not found at HEAD" },
				},
				window,
			),
		).toEqual({
			keep: false,
			reason: "the cited file: not found at HEAD",
			couldNotCheck: false,
		});
		expect(
			contractVerdict(
				{
					...pass,
					rpc: {
						state: "checked-absent",
						why: "getLedgerEntries finds no contract instance",
					},
				},
				window,
			),
		).toMatchObject({ keep: false, couldNotCheck: false });
		// The hour before hacking opened is outside the event.
		expect(
			contractVerdict(
				{
					...pass,
					expert: { state: "found", createdAt: "2026-10-25T08:30:00Z" },
				},
				window,
			),
		).toEqual({
			keep: false,
			reason: "created 2026-10-25T08:30:00Z, outside the event window",
			couldNotCheck: false,
		});
	});

	it("could not check: kept out, said as unchecked, never as absent", () => {
		const v = contractVerdict(
			{ ...pass, expert: { state: "could-not-check", why: "HTTP 429" } },
			window,
		);
		expect(v).toEqual({
			keep: false,
			reason: "could not check stellar.expert (HTTP 429)",
			couldNotCheck: true,
		});
		expect(
			contractVerdict(
				{ ...pass, expert: { state: "found", createdAt: null } },
				window,
			),
		).toMatchObject({ keep: false, couldNotCheck: true });
		// An outright failure decides over a check that could not run.
		expect(
			contractVerdict(
				{
					file: {
						state: "checked-absent",
						why: "read at HEAD, the id is not in it",
					},
					rpc: { state: "could-not-check", why: "no RPC answer" },
					expert: pass.expert,
				},
				window,
			),
		).toMatchObject({ keep: false, couldNotCheck: false });
	});

	it("reads the probes from saved answers", () => {
		// getLedgerEntries: one live, one archived, one not listed.
		const probes = rpcProbes(["k1", "k2", "k3"], {
			jsonrpc: "2.0",
			id: 1,
			result: {
				latestLedger: 5561059,
				entries: [
					{ key: "k1", liveUntilLedgerSeq: 6000000 },
					{ key: "k2", liveUntilLedgerSeq: 0 },
				],
			},
		});
		expect([...probes]).toEqual([
			["k1", { state: "found", archived: false }],
			["k2", { state: "found", archived: true }],
			[
				"k3",
				{
					state: "checked-absent",
					why: "getLedgerEntries finds no contract instance",
				},
			],
		]);
		// An error answer checks nothing.
		expect(
			rpcProbes(["k1"], { error: { code: -32600, message: "bad" } }).get("k1"),
		).toMatchObject({ state: "could-not-check" });
		expect(rpcProbes(["k1"], null).get("k1")).toEqual({
			state: "could-not-check",
			why: "no RPC answer",
		});
		expect(expertProbe(200, { created: 1792948367 })).toEqual({
			state: "found",
			createdAt: "2026-10-25T17:12:47Z",
		});
		expect(expertProbe(404, null)).toMatchObject({ state: "checked-absent" });
		expect(expertProbe(429, null)).toEqual({
			state: "could-not-check",
			why: "HTTP 429",
		});
		expect(fileProbe(200, "CONTRACT=CABC", "CABC")).toEqual({ state: "found" });
		expect(fileProbe(200, "nothing here", "CABC")).toMatchObject({
			state: "checked-absent",
		});
		expect(fileProbe(404, null, "CABC")).toMatchObject({
			state: "checked-absent",
		});
		expect(fileProbe(null, null, "CABC")).toMatchObject({
			state: "could-not-check",
		});
	});
});

describe("a build's name", () => {
	it("is the README's first heading outside code fences, as plain text", () => {
		expect(
			firstHeading("```\n# not this\n```\n# Card Place — trading cards"),
		).toBe("Card Place - trading cards");
		expect(firstHeading('<div>\n<h1 align="center">Breakwater</h1>')).toBe(
			"Breakwater",
		);
		expect(firstHeading("﻿# UnlockShares")).toBe("UnlockShares");
		expect(firstHeading("# [Nest](https://x.test) **beta**")).toBe("Nest beta");
		// No heading, or a sentence too long to be a name: the repo name is used.
		expect(firstHeading("<p><img src=x></p>\n## Setup")).toBeNull();
		expect(firstHeading(`# ${"word ".repeat(30)}`)).toBeNull();
		expect(firstHeading(null)).toBeNull();
	});
});

// Owner decisions 2026-11-04: the 96 records whose repo names HackMeridian
// plus the one placement whose repo is silent; placements secondhand;
// HackProof credited on every row; its MIT notice kept.
describe("HackMeridian 2026 from HackProof", () => {
	const PIN = "ea7e1982c9beea491048e668fa6dfb62a4f9a8e5";
	const RECORDS = `https://github.com/devodii/hackproof/blob/${PIN}/data/2026/`;
	const AWARDS = `https://github.com/devodii/hackproof/blob/${PIN}/data/hackmeridian-2026.yaml`;
	const byBasis = (b: string) =>
		HACKPROOF_BUILDS.filter((r) => r.entryBasis === b);

	it("stores 97 rows: 96 whose repo names the event, one listed placement", () => {
		expect(HACKPROOF_BUILDS).toHaveLength(97);
		expect(byBasis("repo-names-event")).toHaveLength(96);
		expect(byBasis("placement-listed")).toHaveLength(1);
		const ids = [...CURATED_BUILDS, ...HACKPROOF_BUILDS].map((b) => b.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const b of HACKPROOF_BUILDS) {
			expect(b.id).toMatch(CURATED_BUILD_ID);
			expect(b.id.startsWith("curated-hackmeridian-2026-")).toBe(true);
			expect(b.hackathonSlug).toBe("hackmeridian-2026");
			expect(ENTRY_BASES).toContain(b.entryBasis);
		}
	});

	it("credits HackProof on every row: its record at the pinned commit, and its placement file", () => {
		for (const b of HACKPROOF_BUILDS) {
			expect(b.url.startsWith(RECORDS), b.id).toBe(true);
			expect(
				b.url.endsWith(`${b.id.replace("curated-hackmeridian-2026-", "")}.yml`),
			).toBe(true);
			// A placement is HackProof's, sourced to its event file; no other row carries one.
			expect(b.winnerSource ?? null, b.id).toBe(b.isWinner ? AWARDS : null);
			expect(b.isWinner, b.id).toBe(b.placement !== null);
		}
		expect(
			HACKPROOF_BUILDS.filter((b) => b.isWinner)
				.map((b) => b.placement)
				.sort(),
		).toEqual([
			"First place",
			"First place",
			"Runner-up",
			"Runner-up",
			"Runner-up",
			"Runner-up",
		]);
		// The MIT notice travels with the data.
		expect(hackproof.license).toMatch(/^MIT License/);
		expect(hackproof.license).toMatch(/Permission is hereby granted/);
		expect(hackproof.source.commit).toBe(PIN);
		expect(hackproof.source.awards).toBe(AWARDS);
	});

	it("a row never claims more than its basis", () => {
		for (const b of byBasis("repo-names-event")) {
			// Where the repo says so, read on a day, a file for README and doc.
			const m = b.entryEvidence?.mention;
			expect(m, b.id).toBeTruthy();
			expect(m?.readAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(["readme", "doc"].includes(m?.in ?? "") === !!m?.path, b.id).toBe(
				true,
			);
		}
		// placement-listed: a placement and no mention, never the repo's claim.
		for (const b of byBasis("placement-listed")) {
			expect(b.isWinner).toBe(true);
			expect(b.entryEvidence?.mention).toBeNull();
		}
		// A track only when the team declared it.
		const tracks = new Map<string | null, number>();
		for (const b of HACKPROOF_BUILDS)
			tracks.set(b.track, (tracks.get(b.track) ?? 0) + 1);
		expect(Object.fromEntries(tracks)).toEqual({
			Genesis: 56,
			Scale: 9,
			null: 32,
		});
	});

	it("keeps only contracts Scout's checks passed, created during the event, with a could-not-check left out by reason", () => {
		const start = Date.parse("2026-10-25T09:00:00Z");
		const end = Date.parse("2026-10-26T12:00:00Z");
		for (const b of HACKPROOF_BUILDS) {
			expect(b.contractsCheckedAt, b.id).toBe(hackproof.checkedAt);
			for (const c of b.contracts ?? []) {
				expect(c.id).toMatch(/^C[A-Z2-7]{55}$/);
				expect(c.network).toBe("testnet");
				const t = Date.parse(c.createdAt);
				expect(t >= start && t <= end, `${b.id} ${c.id}`).toBe(true);
				expect(c.path).toBeTruthy();
			}
		}
		// Every id left out says why; none is both kept and left out.
		const kept = new Set(
			HACKPROOF_BUILDS.flatMap((b) => (b.contracts ?? []).map((c) => c.id)),
		);
		for (const c of hackproof.contractsLeft) {
			expect(c.reason).toBeTruthy();
			expect(kept.has(c.id), c.id).toBe(false);
		}
	});

	it("the page's line for a row says its basis and no more", () => {
		const said = HACKPROOF_BUILDS.map(
			(b) => entryBasisLine(b, "HackMeridian 2026") ?? "",
		);
		for (const line of said) {
			expect(line).not.toMatch(
				/\b(entered|submitted|submission|official|organi[sz]er|took part)\b/i,
			);
			expect(line).not.toMatch(/[\u2013\u2014]/);
		}
		const named = HACKPROOF_BUILDS.find(
			(b) => b.entryBasis === "repo-names-event" && b.contracts?.length === 0,
		);
		expect(entryBasisLine(named ?? {}, "HackMeridian 2026")).toBe(
			"The team's repo says it was built for HackMeridian 2026.",
		);
		expect(
			entryBasisLine(
				{ entryBasis: "repo-names-event", contracts: [1, 2, 3] },
				"HackMeridian 2026",
			),
		).toBe(
			"The team's repo says it was built for HackMeridian 2026. 3 contracts it cites were created on testnet during the event.",
		);
		expect(
			entryBasisLine({ entryBasis: "placement-listed", contracts: [] }, "X"),
		).toBe(
			"HackProof lists this repo as a placement; the repo's own text does not name the event.",
		);
		// No basis, no line: a DoraHacks row or a winner from its own page.
		expect(entryBasisLine({}, "X")).toBeNull();
	});

	it("writes no em or en dash", () => {
		expect(JSON.stringify(HACKPROOF_BUILDS)).not.toMatch(/[\u2013\u2014]/);
	});
});
