// @vitest-environment node
/**
 * An asset's identity is (code, issuer), so every pool or hub entry is keyed
 * by the asset's contract id. A ticker match told MyKobo's EURC that Blend
 * lists it, and a corrupted EURC id left Circle's EURC rates null for months.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Asset, Networks, StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import { STABLECOIN_REGISTRY } from "@/data/stablecoin-registry";
import {
	BLEND_POOLS,
	blendListings,
	SUSHI_HUBS,
	sacContractId,
} from "../stablecoin-defi";

// No network: a pool read fails, which leaves the listing with null rates.
vi.mock("@blend-capital/blend-sdk", () => ({
	PoolV2: { load: vi.fn().mockRejectedValue(new Error("offline")) },
}));

const CIRCLE_EURC = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2";
const MYKOBO_EURC = "GAQRF3UGHBT6JYQZ7YSUYCIYWAF4T2SAA5237Q5LIQYJOHHFAWDXZ7NM";

describe("blendListings matches the asset, not its ticker", () => {
	it("lists Circle's EURC in both pools under its contract id", async () => {
		const id = sacContractId("EURC", CIRCLE_EURC);
		const got = await blendListings("EURC", CIRCLE_EURC);
		expect(got.map((l) => l.poolName)).toEqual([
			"Fixed Pool",
			"YieldBlox Pool",
		]);
		for (const l of got) expect(l.poolUrl).toContain(`assetId=${id}`);
	});

	it("does not list another issuer's EURC", async () => {
		expect(await blendListings("EURC", MYKOBO_EURC)).toEqual([]);
	});

	it("does not list a USDC from an issuer that is not Circle's", async () => {
		expect(await blendListings("USDC", CIRCLE_EURC)).toEqual([]);
	});
});

describe("every labelled asset id is the asset's own contract", () => {
	const derived = new Map<string, string[]>();
	const underived: string[] = [];
	for (const a of STABLECOIN_REGISTRY) {
		const id = sacContractId(a.code, a.issuer);
		if (!id) underived.push(`${a.code}:${a.issuer}`);
		else derived.set(a.code, [...(derived.get(a.code) ?? []), id]);
	}
	derived.set("XLM", [Asset.native().contractId(Networks.PUBLIC)]);
	// A ticker more than one issuer uses names no asset by itself, so a label
	// with that ticker is pinned to the issuer whose asset the venue lists.
	const PINNED: Record<string, string> = { EURC: CIRCLE_EURC };
	const expected = (label: string) => {
		const pin = PINNED[label];
		if (pin) return [sacContractId(label, pin)];
		const ids = derived.get(label) ?? [];
		return ids.length > 1 ? [] : ids;
	};

	it("derives a contract for every registry row", () => {
		expect(underived).toEqual([]);
	});
	const labelled = [
		...BLEND_POOLS.flatMap((p) =>
			Object.entries(p.assets).map(([label, id]) => ({
				where: p.name,
				label,
				id,
			})),
		),
		...SUSHI_HUBS.map((h) => ({
			where: "Sushi hub",
			label: h.label,
			id: h.id,
		})),
	];
	it.each(labelled)("$where $label", ({ label, id }) => {
		expect(expected(label)).toContain(id);
	});
});

describe("every Stellar id literal in src/lib passes its checksum", () => {
	// Verbatim quotes of a third party's text, kept as written.
	const QUOTED = new Set([
		// sergical/blockchain-wallet-validator's README example key.
		"GBQMXVTR5HQNRGXPR4ZPBOZR7VQXOQMEQMZWIVLIW2MYBXC2HQWZZ4VJ",
	]);
	const dir = join(__dirname, "..");
	const files = readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(
		(f) => /\.tsx?$/.test(f) && !f.includes("__tests__"),
	);
	it("finds the files", () => expect(files.length).toBeGreaterThan(50));
	const bad: string[] = [];
	for (const f of files) {
		const src = readFileSync(join(dir, f), "utf8");
		// Wider than a valid key on purpose: a dropped or added character, or
		// a 0, 1, 8 or 9 typo, is a corrupted id too.
		for (const [id] of src.matchAll(
			/(?<![A-Za-z0-9_])[CG][A-Z0-9]{50,60}(?![A-Za-z0-9_])/g,
		)) {
			const ok =
				id.length === 56 &&
				(id[0] === "C"
					? StrKey.isValidContract(id)
					: StrKey.isValidEd25519PublicKey(id));
			if (!ok && !QUOTED.has(id)) bad.push(`${f}: ${id}`);
		}
	}
	it("has no corrupted id", () => expect(bad).toEqual([]));
});
