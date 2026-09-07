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
import { repoGrade } from "../repo-grade";

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
