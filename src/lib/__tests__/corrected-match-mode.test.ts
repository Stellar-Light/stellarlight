/**
 * sls-076: q="Strupey" returned Stroopy.AI at matchMode=strict with
 * "all keywords matched" and confidence 0.92 — although neither the name nor
 * the slug contains "strupey". The admission came from our own curated
 * spelling-correction synonym (strupey → stroopy), which is deliberate and
 * good; the LABEL was the lie. Two independent agent runs promoted the row
 * into identity evidence for an unverified name on the strength of it.
 *
 * The fix: a row admitted ONLY through a spelling correction reports
 * matchMode "corrected", never a keyword tier.
 */
import { describe, expect, it } from "vitest";
import {
	buildHaystack,
	correctionMediated,
	tokenize,
} from "../project-search-match";
import { searchRepos } from "../repo-search";
import { SPELLING_CORRECTIONS } from "../search-vocabulary";

const stroopy = buildHaystack({
	name: "Stroopy.AI",
	slug: "stroopyai",
	shortDescription: "AI companion for the Stellar ecosystem",
	category: "User-Facing App",
} as never);

describe("spelling corrections are labelled, not laundered", () => {
	it("knows strupey is a correction", () => {
		expect(SPELLING_CORRECTIONS.strupey).toBe("stroopy");
	});

	it("flags the Stroopy row as correction-mediated for q=Strupey", () => {
		expect(correctionMediated(stroopy, tokenize("Strupey"))).toBe(true);
	});

	it("does NOT flag it for its real name", () => {
		expect(correctionMediated(stroopy, tokenize("Stroopy"))).toBe(false);
		expect(correctionMediated(stroopy, tokenize("stroopyai"))).toBe(false);
	});

	it("leaves domain synonyms alone — cex is a synonym, not a correction", () => {
		const binance = buildHaystack({
			name: "Binance",
			slug: "binance",
			shortDescription: "Binance is a centralized exchange that lists XLM",
			category: "User-Facing App",
			types: ["Exchange"],
		} as never);
		expect(correctionMediated(binance, tokenize("cex exchange"))).toBe(false);
	});

	it("does not fire when the literal token genuinely occurs", () => {
		const hay = buildHaystack({
			name: "Strupey Labs",
			slug: "strupey-labs",
			shortDescription: "hypothetical row that really carries the token",
		} as never);
		expect(correctionMediated(hay, tokenize("Strupey"))).toBe(false);
	});
});

// sls-093: the repo-search port. q=strupey served the same rows as q=stroopy
// at matchMode strict, "every query term matched", with the token in none.
describe("repo search labels a spelling-corrected match", () => {
	const repo = (fullName: string, description: string) => ({
		fullName,
		description,
		primaryLanguage: "TypeScript",
		readmeExcerpt: "",
		topics: [],
		lastCommitAt: "2026-07-01T00:00:00Z",
		repoScore: 50,
		stars: 10,
		codeSymbols: [],
	});
	const docs = [
		repo("StroopyOrg/Stroopy", "Stroopy, an AI wallet companion for Stellar"),
		repo("someone/wallet-kit", "A wallet kit for Stellar apps"),
	];
	// biome-ignore lint/suspicious/noExplicitAny: mock payload
	const payload: any = { find: async () => ({ docs, totalDocs: docs.length }) };
	const mode = async (q: string) =>
		(await searchRepos(payload, q, { limit: 5 })).matchMode;

	it("q=strupey is corrected, not strict", async () => {
		expect(await mode("strupey")).toBe("corrected");
	});

	it("q=stroopy stays strict (the control)", async () => {
		expect(await mode("stroopy")).toBe("strict");
	});

	it("q=strupey wallet: the best row holds its tier only via the correction", async () => {
		expect(await mode("strupey wallet")).toBe("corrected");
	});

	it("a row that really carries the token stays strict", async () => {
		docs.push(repo("strupey/strupey", "A repo that is named strupey"));
		expect(await mode("strupey")).toBe("strict");
		docs.pop();
	});
});
