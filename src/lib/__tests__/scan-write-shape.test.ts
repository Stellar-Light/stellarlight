import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	errorToWrite,
	FORBIDDEN_WRITE_KEYS,
	type SignalsInput,
	signalsToWrite,
} from "../../../scripts/scan/write-shape";
import type { CodeFacts } from "../code-signals";

const FACTS: CodeFacts = {
	sorobanSdkVersion: "22.0.3",
	versionStatus: "current",
	contractMacroCount: 4,
	hasAuthPatterns: true,
	hasStoragePatterns: true,
	hasEvents: false,
	isDeployableContract: true,
	usesNoStd: true,
	stellarJsDep: null,
};

const okInput: SignalsInput = {
	outcome: "ok",
	scanNote: null,
	proof: "cargo-sdk",
	facts: FACTS,
	codeDepth: 0.78,
	farmScore: 0,
	farmFlags: [],
	codeSymbols: ["initialize_escrow", "EscrowContract"],
	mainnetContractId: "CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL",
};

describe("write-shape — the signals-only write gate", () => {
	it("ok outcome persists the full signal set + state=scanned", () => {
		const w = signalsToWrite(okInput, "2026-07-05T00:00:00.000Z");
		expect(w.stellarProof).toBe("cargo-sdk");
		expect(w.codeDepth).toBe(0.78);
		expect(w.versionStatus).toBe("current");
		expect(w.isDeployableContract).toBe(true);
		expect(w.codeScanState).toBe("scanned");
		expect(w.codeScannedAt).toBe("2026-07-05T00:00:00.000Z");
		expect(w.codeSymbols).toEqual(["initialize_escrow", "EscrowContract"]);
		expect(w.mainnetContractId).toBe(
			"CAC5SKP5FJT2ZZ7YLV4UCOM6Z5SQCCVPZWHLLLVQNQG2RWWOOSP3IYRL",
		);
	});

	it("SAFETY: error outcome persists ONLY scan-state — never a proof/depth judgment", () => {
		const w = signalsToWrite(
			{
				...okInput,
				outcome: "error",
				proof: "none",
				scanNote: "blob-unreadable",
			},
			"t",
		);
		expect(Object.keys(w).sort()).toEqual([
			"codeScanNote",
			"codeScanState",
			"codeScannedAt",
		]);
		expect(w.codeScanState).toBe("error");
		expect(w).not.toHaveProperty("stellarProof"); // a broken read must not record proof=none
		expect(w).not.toHaveProperty("codeDepth");
	});

	it("SAFETY: incomplete outcome persists ONLY scan-state", () => {
		const w = signalsToWrite(
			{ ...okInput, outcome: "incomplete", scanNote: "tree-incomplete" },
			"t",
		);
		expect(Object.keys(w).sort()).toEqual([
			"codeScanNote",
			"codeScanState",
			"codeScannedAt",
		]);
		expect(w.codeScanState).toBe("incomplete");
	});

	it("SAFETY: no demotion/authority field is EVER writable (tier, unverifiedStellar, repoScore…)", () => {
		for (const w of [
			signalsToWrite(okInput, "t"),
			signalsToWrite({ ...okInput, outcome: "error" }, "t"),
			errorToWrite("boom", "t"),
		]) {
			for (const k of FORBIDDEN_WRITE_KEYS)
				expect(w, `forbidden key ${k}`).not.toHaveProperty(k);
		}
	});

	it("errorToWrite records the failure, truncated, retryable", () => {
		const w = errorToWrite("x".repeat(500), "t");
		expect(w.codeScanState).toBe("error");
		expect((w.codeScanError as string).length).toBeLessThanOrEqual(200);
	});
});

// ── CI greps on the scanner source: no deletes/creates, gate not bypassed ──
describe("SAFETY: scan-repo-code.ts write discipline", () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const src = readFileSync(
		join(here, "../../../scripts/scan/scan-repo-code.ts"),
		"utf8",
	);

	it("H1: never deletes, never creates — updates existing docs only", () => {
		expect(src).not.toMatch(/payload\s*\.\s*delete/);
		expect(src).not.toMatch(/deleteMany/);
		expect(src).not.toMatch(/payload\s*\.\s*create/);
	});

	it("every write goes through the tested gate (signalsToWrite/errorToWrite)", () => {
		expect(src).toMatch(/signalsToWrite\(/);
		expect(src).toMatch(/errorToWrite\(/);
		// the update call passes the gate-built `data`, never an inline literal
		const updates = src.match(/payload\.update\(([^)]*)\)/gs) ?? [];
		expect(updates.length).toBeGreaterThan(0);
		for (const u of updates) expect(u).toMatch(/data\s*[,}]/);
	});
});
