/** P5: supersession as FIELDS. The facts lived in knowledgeNotes prose; a
 * curated dated map now carries them, and this test holds prose and fields
 * together so neither can drift from the other. */
import { describe, expect, it } from "vitest";
import { REPO_KNOWLEDGE_NOTES } from "../repo-knowledge";
import {
	REPO_SUCCESSIONS,
	REPO_SUPERSESSIONS,
	repoSupersession,
} from "../repo-relations";

/** The note markers curated notes use for the repo ITSELF being gone. A
 *  successor's note says "Moved from" / "Successor of", never these. */
const SELF_MARKERS =
	/^ARCHIVED|^RENAMED:|REPOSITORY DEPRECATED|'This repository has moved/;
/** A successor's note names its predecessor — "redirects here", "Moved from",
 *  "Successor of" — and may quote the predecessor's banner. Those notes carry
 *  the same markers about the OTHER repo, so they are excluded by language,
 *  not by an allowlist that would rot. */
const SUCCESSOR_LANGUAGE =
	/redirects here|Moved from|Successor of|renamed from/i;

describe("supersession fields (P5)", () => {
	it("every public note that says the repo itself is archived, renamed or deprecated has a map entry", () => {
		const missing: string[] = [];
		for (const [repo, notes] of Object.entries(REPO_KNOWLEDGE_NOTES)) {
			const text = notes
				.filter((n) => (n.visibility ?? "public") === "public")
				.map((n) => n.note)
				.join(" ");
			if (SUCCESSOR_LANGUAGE.test(text)) continue;
			if (SELF_MARKERS.test(text) && !REPO_SUPERSESSIONS[repo])
				missing.push(repo);
		}
		expect(missing).toEqual([]);
	});

	it("successors are never keys — a repo whose older packages are deprecated in its favour is not superseded", () => {
		for (const s of [
			"stellar/js-stellar-sdk",
			"stellar/go-stellar-sdk",
			"stellar/passkey-kit",
			"stellar/smart-account-kit",
			"stellar/stellar-rpc",
			"stellar/stellar-horizon",
			"blend-capital/blend-contracts-v2",
			"stellar/typescript-wallet-sdk",
			"stellar/js-xdr",
		])
			expect(REPO_SUPERSESSIONS[s], s).toBeUndefined();
	});

	it("keys are lowercase; supersededBy is owner/repo as GitHub spells it, or null", () => {
		for (const [k, v] of Object.entries(REPO_SUPERSESSIONS)) {
			expect(k).toBe(k.toLowerCase());
			if (v.supersededBy) expect(v.supersededBy).toMatch(/^[\w.-]+\/[\w.-]+$/);
			expect(v.source.length).toBeGreaterThan(20);
		}
	});

	it("deprecatedAt is the repo's own date (YYYY-MM-DD) or null — never the day we read it", () => {
		for (const [k, v] of Object.entries(REPO_SUPERSESSIONS)) {
			if (v.deprecatedAt === null) continue;
			expect(v.deprecatedAt, k).toMatch(/^\d{4}-\d{2}-\d{2}$/);
			expect(v.deprecatedAt, k).not.toBe(v.asOf);
		}
		// the banner that gives no date must say null, not the read date
		expect(
			REPO_SUPERSESSIONS["stellar/kotlin-wallet-sdk"].deprecatedAt,
		).toBeNull();
	});

	it("the successor view enrich stamps is derived from the same map, and blend v1 -> v2 survives", () => {
		expect(REPO_SUCCESSIONS["blend-capital/blend-contracts"]).toBe(
			"blend-capital/blend-contracts-v2",
		);
		for (const [k, v] of Object.entries(REPO_SUCCESSIONS))
			expect(REPO_SUPERSESSIONS[k]?.supersededBy).toBe(v);
		expect(Object.keys(REPO_SUCCESSIONS).length).toBe(
			Object.values(REPO_SUPERSESSIONS).filter((v) => v.supersededBy).length,
		);
	});

	it("repoSupersession is case-insensitive and null for a repo with no statement", () => {
		expect(repoSupersession("STELLAR/GO")?.supersededBy).toBe(
			"stellar/go-stellar-sdk",
		);
		expect(repoSupersession("stellar/go")?.supersessionKind).toBe("archived");
		expect(repoSupersession("x/y")).toBeNull();
	});
});
