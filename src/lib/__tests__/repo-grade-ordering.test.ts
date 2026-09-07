/**
 * Ranking invariants for repoScore — the number /api/repos/search sorts on and
 * agents are told to trust.
 *
 * On 2026-09-07 the top TWELVE repos in the index were hackathon submissions
 * with 0-4 stars and no project link. stellar/js-stellar-sdk (695 stars) sat at
 * 76 and stellar/stellar-core (3,301 stars, on the curated canonical list) at
 * 56, while a 0-star judged entry scored a flat 85.
 *
 * Two causes, both fixed and both pinned here:
 *   1. the hackathon judge lift was ungated — judgeScore 1.0 set the score to
 *      0.05 + 0.8 = 0.85 regardless of anything else;
 *   2. curatedCanonical fed only the codeDepth lift, so a repo a human named
 *      THE answer earned nothing unless it also had Soroban code depth — which
 *      a C++ network implementation never has.
 */
import { describe, expect, it } from "vitest";
import { repoGrade,
	FIRST_PARTY_OWNERS,
	isFirstParty,
} from "../repo-grade";

const NOW = new Date().toISOString();

const jsSdk = () =>
	repoGrade({
		lastCommitAt: NOW,
		stargazerCount: 695,
		hasDescription: true,
		topicCount: 4,
		openIssues: 15,
		commits90d: 65,
		projectProminence: 90,
		codeDepth: 0.94,
		curatedCanonical: true,
	});

const stellarCore = () =>
	repoGrade({
		lastCommitAt: NOW,
		stargazerCount: 3301,
		hasDescription: true,
		topicCount: 3,
		openIssues: 40,
		commits90d: 60,
		curatedCanonical: true,
		// No Soroban depth: it IS the C++ network implementation.
	});

/** 0 stars, no project, no funding — judged 5/5 at a hackathon. */
const judgedEntry = (judge = 1) =>
	repoGrade({
		lastCommitAt: "2026-04-12",
		stargazerCount: 0,
		hasDescription: false,
		topicCount: 0,
		openIssues: 0,
		judgeScore: judge,
		codeDepth: 0.702,
	});

describe("a hackathon review does not outrank the ecosystem's references", () => {
	it("the JavaScript SDK outranks a 5/5-judged 0-star entry", () => {
		expect(jsSdk().score).toBeGreaterThan(judgedEntry().score);
	});

	it("stellar-core outranks a 5/5-judged 0-star entry", () => {
		expect(stellarCore().score).toBeGreaterThan(judgedEntry().score);
	});

	it("an unvouched judged entry no longer lands in the high band", () => {
		// The exact regression: it used to be a flat 85.
		expect(judgedEntry().score).toBeLessThan(70);
	});

	it("a judged entry still beats an unjudged one just like it", () => {
		const unjudged = repoGrade({
			lastCommitAt: "2026-04-12",
			stargazerCount: 0,
			hasDescription: false,
			topicCount: 0,
			openIssues: 0,
			codeDepth: 0.702,
		});
		expect(judgedEntry().score).toBeGreaterThan(unjudged.score);
	});

	it("a better review still scores higher than a worse one", () => {
		expect(judgedEntry(1).score).toBeGreaterThan(judgedEntry(0.4).score);
	});

	it("a judged entry that IS linked to a funded project keeps most of the lift", () => {
		const linked = repoGrade({
			lastCommitAt: "2026-04-12",
			stargazerCount: 0,
			hasDescription: false,
			topicCount: 0,
			openIssues: 0,
			judgeScore: 1,
			codeDepth: 0.702,
			scfAwarded: true,
			projectProminence: 60,
		});
		expect(linked.score).toBeGreaterThan(judgedEntry().score + 20);
	});
});

describe("being named the canonical answer counts", () => {
	it("curatedCanonical raises authority above zero", () => {
		expect(stellarCore().authority).toBeGreaterThan(0);
	});

	it("a canonical repo with perfect own merit clears the old 60 ceiling", () => {
		// 0.6*ownMerit + 0.4*boostedAuthority capped a no-authority repo at 60,
		// which no amount of stars or freshness could pass.
		expect(stellarCore().score).toBeGreaterThan(60);
	});

	it("canonical status does not rescue a repo with no merit of its own", () => {
		const empty = repoGrade({
			lastCommitAt: "2023-01-01",
			stargazerCount: 0,
			hasDescription: false,
			topicCount: 0,
			openIssues: 0,
			curatedCanonical: true,
		});
		expect(empty.score).toBeLessThan(40);
	});
});

describe("stars are evidence about the ecosystem that gave them", () => {
	/** 4,314 stars, scanned, no Stellar code — iancoleman/bip39. */
	const popularElsewhere = () =>
		repoGrade({
			lastCommitAt: "2026-05-01",
			stargazerCount: 4314,
			hasDescription: true,
			topicCount: 3,
			openIssues: 20,
			stellarProof: "none",
			codeDepth: 0,
		});

	/** 21 stars, deep Soroban code, three curated notes — blend-contracts. */
	const stellarProtocol = () =>
		repoGrade({
			lastCommitAt: "2026-06-01",
			stargazerCount: 21,
			hasDescription: true,
			topicCount: 3,
			openIssues: 4,
			stellarProof: "cargo-sdk",
			codeDepth: 0.828,
			projectProminence: 90,
			scfAwarded: true,
			knowledgeNoteCount: 3,
		});

	it("a live Stellar protocol outranks a popular repo with no Stellar code", () => {
		expect(stellarProtocol().score).toBeGreaterThan(popularElsewhere().score);
	});

	it("an UNSCANNED repo is not punished — absence of evidence is not evidence", () => {
		const scanned = popularElsewhere();
		const unscanned = repoGrade({
			lastCommitAt: "2026-05-01",
			stargazerCount: 4314,
			hasDescription: true,
			topicCount: 3,
			openIssues: 20,
			stellarProof: null,
		});
		expect(unscanned.score).toBeGreaterThan(scanned.score);
	});

	it("a curated knowledge note vouches for a repo nothing else vouches for", () => {
		const base = {
			lastCommitAt: "2026-04-12",
			stargazerCount: 0,
			hasDescription: false,
			topicCount: 0,
			openIssues: 0,
			codeDepth: 0.8,
		};
		expect(repoGrade({ ...base, knowledgeNoteCount: 2 }).score).toBeGreaterThan(
			repoGrade({ ...base, knowledgeNoteCount: 0 }).score,
		);
	});
});

/**
 * 2026-09-07 — "what's the point of code depth then, if we are not actually
 * looking at the code and just guessing off a broken system to grade repos"
 *
 * The scanner reads sixteen facts out of each of 10,876 repos. Until this date
 * exactly two of them (codeDepth, stellarProof) reached the grade, and both were
 * MULTIPLIED by a funding proxy — so a repo we had read, tested and verified was
 * discounted up to 55% for being unfunded. These lock the fix.
 */
describe("code evidence outranks institutional recognition", () => {
	const scanned = {
		lastCommitAt: new Date().toISOString(),
		stargazerCount: 3,
		hasDescription: true,
		topicCount: 6,
		codeScanned: true,
		testsPresent: true,
		ciPresent: true,
		lastReleaseAt: new Date().toISOString(),
		versionStatus: "supported",
		contractInterfaceCount: 48,
		codeDepth: 0.45,
		stellarProof: "cargo-sdk",
		commits90d: 95,
	};

	it("an unfunded repo we have READ beats a funded one we have not", () => {
		// The colibri case: 3 stars, no grant, no prominence, no curation — but
		// releases, tests, CI, a live SDK pin and 48 contract methods.
		const read = repoGrade(scanned);
		const funded = repoGrade({
			lastCommitAt: new Date().toISOString(),
			stargazerCount: 3,
			hasDescription: true,
			topicCount: 6,
			scfAwarded: true,
			projectProminence: 40,
			codeScanned: true, // scanned, and the scan found none of it
		});
		expect(read.score).toBeGreaterThan(funded.score);
	});

	it("read code alone clears the midpoint, with no grant and 3 stars", () => {
		// Not a tuned number: half the scale earned purely from what the scanner
		// read. The real fazzatti/colibri, which also carries six knowledge
		// notes, lands at 62 — it scored 35 before.
		expect(repoGrade(scanned).score).toBeGreaterThanOrEqual(50);
	});

	it("first-party publication is authority on its own", () => {
		// SDF never receives an SCF award — it awards them. All 212 first-party
		// repos sat on the "nothing vouches for it" floor until 2026-09-07.
		const sdf = repoGrade({ ...scanned, firstParty: true });
		expect(sdf.score).toBeGreaterThan(repoGrade(scanned).score);
	});

	it("a first-party repo is never discounted as 'not about Stellar'", () => {
		// stellar/js-xdr is the codec every SDK is built on and imports no
		// soroban-sdk, so the proof test read "none" and cut its evidence to 25%.
		const codec = { ...scanned, stellarProof: "none", codeDepth: 0 };
		expect(repoGrade({ ...codec, firstParty: true }).score).toBeGreaterThan(
			repoGrade(codec).score,
		);
	});

	it("tests and CI on a repo with no Stellar code do not count as Stellar evidence", () => {
		// keybase/client: 9,248 stars, tests, CI, releases, no Stellar code.
		const foreign = { ...scanned, stellarProof: "none", codeDepth: 0 };
		expect(repoGrade(foreign).score).toBeLessThan(repoGrade(scanned).score);
	});

	it("a deprecated SDK pin lowers the score; an unknown one does not", () => {
		const dead = repoGrade({ ...scanned, versionStatus: "deprecated" });
		const unknown = repoGrade({ ...scanned, versionStatus: "unknown" });
		expect(dead.score).toBeLessThan(unknown.score);
	});

	it("an unscanned repo is not scored as though it failed the scan", () => {
		// Absence of a reading is not a negative reading: dropping the code terms
		// must renormalize, not zero them.
		const base = {
			lastCommitAt: new Date().toISOString(),
			stargazerCount: 400,
			hasDescription: true,
			topicCount: 4,
		};
		const unscanned = repoGrade(base);
		const scannedEmpty = repoGrade({ ...base, codeScanned: true });
		expect(unscanned.score).toBeGreaterThan(scannedEmpty.score);
	});

	it("deep code that nobody has touched in two years is a weaker reference", () => {
		const stale = repoGrade({
			...scanned,
			lastCommitAt: new Date(Date.now() - 800 * 86_400_000).toISOString(),
			commits90d: 0,
		});
		expect(stale.score).toBeLessThan(repoGrade(scanned).score);
	});
});

describe("first-party ownership", () => {
	it("covers the SDF orgs, including the experimental frontier", () => {
		// stellar-experimental describes itself as "Experiments at the frontier of
		// the Stellar Development Foundation" and holds henyey (a pure-Rust
		// Stellar Core), stellar-spec (protocol specifications), the Zig and C
		// Soroban SDKs and stellar-raven. 18 of its 30 repos were unindexed.
		for (const o of ["stellar", "stellar-experimental", "stellar-deprecated"])
			expect(FIRST_PARTY_OWNERS.has(o)).toBe(true);
	});

	it("holds only real SDF ORGANISATIONS, not accounts holding the name", () => {
		// Verified against the GitHub API 2026-09-07: `soroban` is type=User with
		// 0 repos (created 2014) and `stellardevelopmentfoundation` is type=User
		// with 1 repo and no name or company. Both sat in this set. Harmless
		// while it only broke search ties; not harmless once it grants 0.95
		// corroboration, +0.4 authority, exemption from the relevance discount,
		// and uncapped indexing of everything the account publishes.
		for (const o of ["soroban", "stellardevelopmentfoundation"])
			expect(FIRST_PARTY_OWNERS.has(o)).toBe(false);
	});

	it("accepts owner or owner/name, and is case-insensitive", () => {
		expect(isFirstParty("stellar-experimental/stellar-raven")).toBe(true);
		expect(isFirstParty("Stellar/js-xdr")).toBe(true);
		expect(isFirstParty("stellar")).toBe(true);
	});

	it("does not claim lookalike orgs", () => {
		for (const o of [
			"stellar-light",
			"stellarterm",
			"StellarCN/py-stellar-base",
			"lightsail-network/java-stellar-sdk",
			"",
			null,
		])
			expect(isFirstParty(o)).toBe(false);
	});
});
