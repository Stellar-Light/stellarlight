/** verifyMainnetContract used to accept any address stellar.expert could
 * resolve, which proves the contract EXISTS and nothing about whose it is.
 * Measured over the 137 live rows on 2026-09-03: 19 were shared token
 * contracts and 8 were contracts stellar.expert attributes to a different
 * repo — 27 provably wrong against 4 provably right, all published under a
 * signal named "verified-contract-id". These are those cases. */
import { StrKey } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";
import {
	keepStoredContract,
	mainnetCheckUnread,
	verifyMainnetContract,
} from "../../../scripts/scan/fetch-repo-code";

// Real contract strkeys: the scanner probes only ids whose checksum holds.
const ID_A = StrKey.encodeContract(Buffer.alloc(32, 1));
const ID_B = StrKey.encodeContract(Buffer.alloc(32, 2));
// The id's shape with a broken checksum, as a typo or a truncation leaves it.
const BAD = `C${"A".repeat(55)}`;

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
				asset:
					"USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN-1",
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
			await verifyMainnetContract(
				`price feed ${ID_A}`,
				"ELDEVODE/synapse-trade",
			),
		).toBeNull();
	});

	it("accepts a contract validated against THIS repo, as self-validated", async () => {
		stub({
			[ID_A]: {
				contract: ID_A,
				validation: {
					repository:
						"https://github.com/reflector-network/reflector-contract.git",
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
		expect(
			await verifyMainnetContract(`ours: ${ID_A}`, "kalepail/ohloss"),
		).toEqual({ id: ID_A, basis: "published" });
	});

	it("prefers a self-validated id over a merely published sibling", async () => {
		stub({
			[ID_A]: { contract: ID_A },
			[ID_B]: {
				contract: ID_B,
				validation: { repository: "https://github.com/acme/vault" },
			},
		});
		expect(
			await verifyMainnetContract(`${ID_A} and ${ID_B}`, "acme/vault"),
		).toEqual({ id: ID_B, basis: "self-validated" });
	});

	it("answers could-not-check on 429 rather than falling through to another candidate", async () => {
		// Half of a 137-row audit came back 429 in one burst. Could-not-look
		// must not read as could-not-find, or a worse id gets promoted.
		stub({ [ID_A]: { contract: ID_A }, [ID_B]: { contract: ID_B } }, 429);
		expect(await verifyMainnetContract(`${ID_A} ${ID_B}`, "acme/vault")).toBe(
			"could-not-check",
		);
	});
});

// 2026-11-06: stellar.expert's API went paid and answers 402. The scanner read
// that as "no such contract" and wrote null over six verified ids
// (Lobster-Protocol/stellar-integrations, Eras256/Nirium, Tansu, Reflector's
// connector, Skyhitz, Trion), and lowered their code depth with them.
describe("verifyMainnetContract: a check that did not run is not an answer", () => {
	it("reads a 402 (paid API) as could-not-check, never as no contract", async () => {
		stub({ [ID_A]: { contract: ID_A } }, 402);
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toBe(
			"could-not-check",
		);
	});

	it("reads a network failure as could-not-check, never letting a later id stand in", async () => {
		vi.stubGlobal("fetch", async (url: string) => {
			if (String(url).endsWith(ID_A)) throw new Error("socket hang up");
			return { ok: true, status: 200, json: async () => ({ contract: ID_B }) };
		});
		expect(
			await verifyMainnetContract(`${ID_A} then ${ID_B}`, "acme/vault"),
		).toBe("could-not-check");
	});

	it("never probes an id whose checksum fails, so a typo cannot end the check as unread", async () => {
		const asked: string[] = [];
		vi.stubGlobal("fetch", async (url: string) => {
			const id = String(url).split("/").pop() as string;
			asked.push(id);
			if (id === BAD) return { ok: false, status: 400, json: async () => ({}) };
			return { ok: true, status: 200, json: async () => ({ contract: id }) };
		});
		expect(
			await verifyMainnetContract(`${BAD} then ${ID_B}`, "acme/vault"),
		).toEqual({ id: ID_B, basis: "published" });
		expect(asked).toEqual([ID_B]);
	});

	it("still reads a 404 for every id as a checked answer: no contract", async () => {
		stub({});
		expect(
			await verifyMainnetContract(`${ID_A} ${ID_B}`, "acme/vault"),
		).toBeNull();
	});
});

describe("mainnetCheckUnread: when the scan's contract check did not run", () => {
	it("is unread when the README exists but could not be read", () => {
		expect(mainnetCheckUnread(true, null, null)).toBe(true);
	});
	it("is an answer when the repo has no README, so it cites no id", () => {
		expect(mainnetCheckUnread(false, null, null)).toBe(false);
	});
	it("is an answer when the README was read and the check ran", () => {
		expect(mainnetCheckUnread(true, "no ids here", null)).toBe(false);
	});
	it("is unread when stellar.expert could not answer", () => {
		expect(mainnetCheckUnread(true, `ours ${ID_A}`, "could-not-check")).toBe(
			true,
		);
	});
});

describe("keepStoredContract: the scan scores and writes the stored id when its check did not run", () => {
	const fresh = (unread: boolean) => ({
		mainnetContractUnread: unread,
		depthInput: {
			scalars: { mainnetContractId: null, mainnetContractBasis: null },
		} as never as Parameters<typeof keepStoredContract>[0]["depthInput"],
	});
	const stored = {
		mainnetContractId: ID_A,
		mainnetContractBasis: "published" as const,
	};

	it("puts the stored id and basis back when the check could not run", () => {
		const r = fresh(true);
		expect(keepStoredContract(r, stored)).toBe(true);
		expect(r.depthInput.scalars).toMatchObject({
			mainnetContractId: ID_A,
			mainnetContractBasis: "published",
		});
	});

	it("leaves a check that ran alone, even when it found nothing", () => {
		const r = fresh(false);
		expect(keepStoredContract(r, stored)).toBe(false);
		expect(r.depthInput.scalars).toMatchObject({
			mainnetContractId: null,
			mainnetContractBasis: null,
		});
	});
});
