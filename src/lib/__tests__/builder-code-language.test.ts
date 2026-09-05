import { describe, expect, it } from "vitest";
import { admitByCodeLanguage } from "@/lib/builder-code-language";

const repo = (
	fullName: string,
	primaryLanguage: string,
	lastCommitAt: string,
) => ({
	owner: fullName.split("/")[0],
	fullName,
	url: `https://github.com/${fullName}`,
	primaryLanguage,
	stars: 3,
	lastCommitAt,
	repoScore: 40,
});

const owned = [
	repo("Dione-b/soroban-vault", "Rust", "2026-08-01T00:00:00Z"),
	repo("Dione-b/stellar-dash", "TypeScript", "2026-09-01T00:00:00Z"),
	repo("Dione-b/older-contract", "Rust", "2026-02-01T00:00:00Z"),
];

describe("admitByCodeLanguage", () => {
	it("admits on a language token, naming the language as INDEXED", () => {
		const a = admitByCodeLanguage(["rust"], owned);
		// the typed token keys it; the value is the stored casing, not the query
		expect(a.terms).toEqual({ rust: "Rust" });
		expect(a.repos.map((r) => r.fullName)).toEqual([
			"Dione-b/soroban-vault", // most recent Rust repo first
			"Dione-b/older-contract",
		]);
		expect(a.repos[0].primaryLanguage).toBe("Rust");
	});

	it("does not admit on a non-language token (no substring matching)", () => {
		// "nigeria" is nobody's primaryLanguage; "rus" must not match "Rust"
		for (const t of ["nigeria", "soroban", "rus", "rustacean"]) {
			expect(admitByCodeLanguage([t], owned).terms).toEqual({});
			expect(admitByCodeLanguage([t], owned).repos).toEqual([]);
		}
	});

	it("resolves only the language token, leaving AND partners to the prose", () => {
		// "rust nigeria": the route requires every token to hit prose OR here, so
		// leaving `nigeria` unresolved is what keeps the location filter honest.
		const a = admitByCodeLanguage(["rust", "nigeria"], owned);
		expect(Object.keys(a.terms)).toEqual(["rust"]);
	});

	it("caps the evidence list", () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			repo(`me/r${i}`, "Rust", `2026-0${(i % 9) + 1}-01T00:00:00Z`),
		);
		expect(admitByCodeLanguage(["rust"], many).repos).toHaveLength(5);
		expect(admitByCodeLanguage(["rust"], many, 2).repos).toHaveLength(2);
		// a builder with no indexed repos is simply not admitted
		expect(admitByCodeLanguage(["rust"], []).terms).toEqual({});
	});
});
