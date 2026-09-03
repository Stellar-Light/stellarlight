/** verifyMainnetContract used to accept any address stellar.expert could
 * resolve, which proves the contract EXISTS and nothing about whose it is.
 * Measured over the 137 live rows on 2026-09-03: 19 were shared token
 * contracts and 8 were contracts stellar.expert attributes to a different
 * repo — 27 provably wrong against 4 provably right, all published under a
 * signal named "verified-contract-id". These are those cases. */
import { describe, expect, it, vi } from "vitest";
import { verifyMainnetContract } from "../../../scripts/scan/fetch-repo-code";

const ID_A = `C${"A".repeat(55)}`;
const ID_B = `C${"B".repeat(55)}`;

/** Serve stellar.expert responses by contract id. */
function stub(byId: Record<string, unknown>, status = 200) {
	vi.stubGlobal("fetch", async (url: string) => {
		const id = String(url).split("/").pop() as string;
		const body = byId[id];
		if (!body) return { ok: false, status: 404, json: async () => ({}) };
		return { ok: status < 400, status, json: async () => body };
	});
}

describe("verifyMainnetContract ownership", () => {
	it("rejects a Stellar Asset Contract — the USDC SAC is not a repo's contract", async () => {
		stub({
			[ID_A]: {
				contract: ID_A,
				asset: "USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN-1",
			},
		});
		expect(
			await verifyMainnetContract(`config USDC ${ID_A}`, "someone/x402-app"),
		).toBeNull();
	});

	it("rejects a contract stellar.expert attributes to a different repo", async () => {
		stub({
			[ID_A]: {
				contract: ID_A,
				validation: {
					repository: "https://github.com/reflector-network/reflector-contract",
				},
			},
		});
		expect(
			await verifyMainnetContract(`price feed ${ID_A}`, "ELDEVODE/synapse-trade"),
		).toBeNull();
	});

	it("accepts a contract validated against THIS repo, as self-validated", async () => {
		stub({
			[ID_A]: {
				contract: ID_A,
				validation: {
					repository: "https://github.com/reflector-network/reflector-contract.git",
				},
			},
		});
		expect(
			await verifyMainnetContract(
				`deployed at ${ID_A}`,
				"reflector-network/reflector-contract",
			),
		).toEqual({ id: ID_A, basis: "self-validated" });
	});

	it("keeps an unvalidated, non-token address but marks the basis published", async () => {
		stub({ [ID_A]: { contract: ID_A } });
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "kalepail/ohloss")).toEqual(
			{ id: ID_A, basis: "published" },
		);
	});

	it("prefers a self-validated id over a merely published sibling", async () => {
		stub({
			[ID_A]: { contract: ID_A },
			[ID_B]: {
				contract: ID_B,
				validation: { repository: "https://github.com/acme/vault" },
			},
		});
		expect(await verifyMainnetContract(`${ID_A} and ${ID_B}`, "acme/vault")).toEqual(
			{ id: ID_B, basis: "self-validated" },
		);
	});

	it("returns null on 429 rather than falling through to another candidate", async () => {
		// Half of a 137-row audit came back 429 in one burst. Could-not-look
		// must not read as could-not-find, or a worse id gets promoted.
		stub({ [ID_A]: { contract: ID_A }, [ID_B]: { contract: ID_B } }, 429);
		expect(await verifyMainnetContract(`${ID_A} ${ID_B}`, "acme/vault")).toBeNull();
	});
});
