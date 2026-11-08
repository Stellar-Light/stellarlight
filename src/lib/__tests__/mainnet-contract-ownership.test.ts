/** verifyMainnetContract used to accept any address stellar.expert could
 * resolve, which proves the contract EXISTS and nothing about whose it is.
 * Measured over the 137 live rows on 2026-09-03: 19 were shared token
 * contracts and 8 were contracts attributed to a different repo, 27 provably
 * wrong against 4 provably right, all published under a signal named
 * "verified-contract-id". These are those cases.
 *
 * stellar.expert's API went paid on 2026-11-06, so the check now reads the
 * same evidence itself: mainnet RPC for the contract instance and its WASM,
 * the WASM's SEP-55 source_repo, and GitHub's attestations for the WASM hash.
 * The stub serves real XDR and refuses what the live RPC refuses. */
import { createHash } from "node:crypto";
import { Contract, StrKey, xdr } from "@stellar/stellar-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	keepStoredContract,
	mainnetCheckUnread,
	verifyMainnetContract,
} from "../../../scripts/scan/fetch-repo-code";
import {
	codeKey,
	contractMeta,
	instanceKey,
	MAINNET_RPC,
} from "../contract-ownership";

// Real contract strkeys: the scanner probes only ids whose checksum holds.
const ID_A = StrKey.encodeContract(Buffer.alloc(32, 1));
const ID_B = StrKey.encodeContract(Buffer.alloc(32, 2));
// The id's shape with a broken checksum, as a typo or a truncation leaves it.
const BAD = `C${"A".repeat(55)}`;

afterEach(() => vi.unstubAllGlobals());

const leb = (n: number): number[] =>
	n < 0x80 ? [n] : [(n & 0x7f) | 0x80, ...leb(n >>> 7)];
const custom = (name: string, body: Buffer) => {
	const payload = Buffer.concat([
		Buffer.from(leb(name.length)),
		Buffer.from(name),
		body,
	]);
	return Buffer.concat([Buffer.from([0, ...leb(payload.length)]), payload]);
};
const metaXdr = (meta: Record<string, string>) =>
	Buffer.concat(
		Object.entries(meta).map(([key, val]) =>
			xdr.ScMetaEntry.scMetaV0(new xdr.ScMetaV0({ key, val })).toXDR(),
		),
	);

/** A WASM module laid out as a Soroban build is: a contractspecv0 section to
 * skip (long enough for a two-byte size), then one contractmetav0 section of
 * XDR SCMetaEntry values per meta given. */
function wasmWith(...metas: Record<string, string>[]): Buffer {
	return Buffer.concat([
		Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
		custom("contractspecv0", Buffer.alloc(200, 7)),
		...metas.map((m) => custom("contractmetav0", metaXdr(m))),
	]);
}

/** Mainnet ledger entries and GitHub attestations, served by a fetch stub the
 * way the live RPC and API answer. `override` answers a URL first. */
function mainnet() {
	const ledger = new Map<string, string>();
	const attested = new Map<string, number>();
	const instance = (id: string, executable: xdr.ContractExecutable) =>
		ledger.set(
			instanceKey(id),
			xdr.LedgerEntryData.contractData(
				new xdr.ContractDataEntry({
					ext: new xdr.ExtensionPoint(0),
					contract: new Contract(id).address().toScAddress(),
					key: xdr.ScVal.scvLedgerKeyContractInstance(),
					durability: xdr.ContractDataDurability.persistent(),
					val: xdr.ScVal.scvContractInstance(
						new xdr.ScContractInstance({ executable, storage: null }),
					),
				}),
			).toXDR("base64"),
		);
	return {
		/** A contract running a WASM built with this meta; its sha256 in hex. */
		wasm(id: string, ...metas: Record<string, string>[]): string {
			const code = wasmWith(...metas);
			const hash = createHash("sha256").update(code).digest();
			instance(id, xdr.ContractExecutable.contractExecutableWasm(hash));
			ledger.set(
				codeKey(hash),
				xdr.LedgerEntryData.contractCode(
					new xdr.ContractCodeEntry({
						ext: new xdr.ContractCodeEntryExt(0),
						hash,
						code,
					}),
				).toXDR("base64"),
			);
			return hash.toString("hex");
		},
		/** A Stellar Asset Contract: a network token's wrapper. */
		asset(id: string) {
			instance(id, xdr.ContractExecutable.contractExecutableStellarAsset());
		},
		attest(repo: string, hash: string, count = 1) {
			attested.set(`${repo.toLowerCase()} ${hash}`, count);
		},
		serve(override?: (url: string) => Response | undefined): {
			urls: string[];
			rpcKeys: string[][];
		} {
			const urls: string[] = [];
			const rpcKeys: string[][] = [];
			vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
				const u = String(url);
				urls.push(u);
				const answer = override?.(u);
				if (answer) return answer;
				if (u === MAINNET_RPC) {
					const { id, params } = JSON.parse(String(init?.body));
					const keys = params.keys as string[];
					rpcKeys.push(keys);
					// Measured on mainnet.sorobanrpc.com: a repeated key, or none,
					// is refused.
					if (!keys.length || new Set(keys).size < keys.length)
						return Response.json({
							jsonrpc: "2.0",
							id,
							error: { code: -32603, message: "could not query captive core" },
						});
					return Response.json({
						jsonrpc: "2.0",
						id,
						result: {
							latestLedger: 65364392,
							entries: keys
								.filter((k) => ledger.has(k))
								.map((k) => ({
									key: k,
									xdr: ledger.get(k),
									lastModifiedLedgerSeq: 65000000,
									liveUntilLedgerSeq: 67000000,
								})),
						},
					});
				}
				const att =
					/^https:\/\/api\.github\.com\/repos\/([^/]+\/[^/]+)\/attestations\/sha256:([0-9a-f]{64})$/.exec(
						u,
					);
				if (att) {
					const n = attested.get(`${att[1].toLowerCase()} ${att[2]}`);
					return n
						? Response.json({ attestations: Array(n).fill({}) })
						: Response.json({ message: "Not Found" }, { status: 404 });
				}
				throw new Error(`unexpected fetch: ${u}`);
			});
			return { urls, rpcKeys };
		},
	};
}

const attestationUrl = (repo: string, hash: string) =>
	`https://api.github.com/repos/${repo}/attestations/sha256:${hash}`;

describe("verifyMainnetContract ownership", () => {
	it("rejects a Stellar Asset Contract: the USDC SAC is not a repo's contract", async () => {
		const chain = mainnet();
		chain.asset(ID_A);
		chain.serve();
		expect(
			await verifyMainnetContract(`config USDC ${ID_A}`, "someone/x402-app"),
		).toBeNull();
	});

	it("rejects a contract whose build names a different repo that attested it", async () => {
		const chain = mainnet();
		const hash = chain.wasm(ID_A, {
			source_repo: "github:reflector-network/reflector-contract",
		});
		chain.attest("reflector-network/reflector-contract", hash);
		chain.serve();
		expect(
			await verifyMainnetContract(
				`price feed ${ID_A}`,
				"ELDEVODE/synapse-trade",
			),
		).toBeNull();
	});

	it("accepts a contract whose build names THIS repo and is attested there, as self-validated", async () => {
		const chain = mainnet();
		// Case, a .git suffix and a trailing slash do not change the repo named.
		const hash = chain.wasm(
			ID_A,
			{ rsver: "1.89.0" },
			{ source_repo: "github:Reflector-Network/Reflector-Contract.git/" },
		);
		chain.attest("reflector-network/reflector-contract", hash, 2);
		chain.serve();
		const acct = { api: 0, raw: 0 };
		expect(
			await verifyMainnetContract(
				`deployed at ${ID_A}`,
				"reflector-network/reflector-contract",
				acct,
			),
		).toEqual({ id: ID_A, basis: "self-validated" });
		// The attestation request spends the scan's GitHub budget.
		expect(acct.api).toBe(1);
	});

	it("keeps an unclaimed, non-token address but marks the basis published", async () => {
		const chain = mainnet();
		chain.wasm(ID_A, { rssdkver: "22.0.8" });
		const { urls } = chain.serve();
		expect(
			await verifyMainnetContract(`ours: ${ID_A}`, "kalepail/ohloss"),
		).toEqual({ id: ID_A, basis: "published" });
		// Nothing is claimed, so there is nothing to ask GitHub.
		expect(urls.every((u) => u === MAINNET_RPC)).toBe(true);
	});

	it("prefers a self-validated id over a merely published sibling", async () => {
		const chain = mainnet();
		chain.wasm(ID_A);
		const hash = chain.wasm(ID_B, { source_repo: "github:acme/vault" });
		chain.attest("acme/vault", hash);
		chain.serve();
		expect(
			await verifyMainnetContract(`${ID_A} and ${ID_B}`, "acme/vault"),
		).toEqual({ id: ID_B, basis: "self-validated" });
	});

	it("marks a build that names THIS repo but holds no attestation published, not self-validated", async () => {
		const chain = mainnet();
		const hash = chain.wasm(ID_A, { source_repo: "github:acme/vault" });
		const { urls } = chain.serve();
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toEqual({
			id: ID_A,
			basis: "published",
		});
		expect(urls).toContain(attestationUrl("acme/vault", hash));
	});

	it("marks a build that names another repo without an attestation published, not excluded", async () => {
		const chain = mainnet();
		const hash = chain.wasm(ID_A, { source_repo: "github:someone/else" });
		const { urls } = chain.serve();
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toEqual({
			id: ID_A,
			basis: "published",
		});
		expect(urls).toContain(attestationUrl("someone/else", hash));
	});

	it("reads two ids that run one WASM with a single code key, which the RPC requires", async () => {
		const chain = mainnet();
		chain.wasm(ID_A);
		chain.wasm(ID_B); // the same build, so the same hash and code entry
		const { rpcKeys } = chain.serve();
		expect(
			await verifyMainnetContract(`${ID_A} and ${ID_B}`, "acme/vault"),
		).toEqual({ id: ID_A, basis: "published" });
		expect(rpcKeys.map((k) => k.length)).toEqual([2, 1]);
	});
});

// 2026-11-06: stellar.expert's API went paid and answers 402. The scanner read
// that as "no such contract" and wrote null over six verified ids
// (Lobster-Protocol/stellar-integrations, Eras256/Nirium, Tansu, Reflector's
// connector, Skyhitz, Trion), and lowered their code depth with them.
describe("verifyMainnetContract: a check that did not run is not an answer", () => {
	it.each([
		["HTTP 402", () => new Response("Payment Required", { status: 402 })],
		["HTTP 503", () => new Response("", { status: 503 })],
		[
			"a JSON-RPC error",
			() =>
				Response.json({
					jsonrpc: "2.0",
					id: 1,
					error: { code: -32603, message: "could not query captive core" },
				}),
		],
		[
			"no answer",
			() => {
				throw new Error("socket hang up");
			},
		],
	])(
		"reads an RPC answering %s as could-not-check, never as no contract",
		async (_, fail) => {
			const chain = mainnet();
			chain.wasm(ID_A);
			const { urls } = chain.serve((u) =>
				u === MAINNET_RPC ? fail() : undefined,
			);
			expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toBe(
				"could-not-check",
			);
			expect(urls).toContain(MAINNET_RPC);
		},
	);

	it.each([
		["403", () => new Response("", { status: 403 })],
		["401", () => new Response("", { status: 401 })],
		["429", () => new Response("", { status: 429 })],
		["502", () => new Response("", { status: 502 })],
		[
			"nothing",
			() => {
				throw new Error("socket hang up");
			},
		],
	])(
		"reads an attestation request answered %s as could-not-check, never letting a later id stand in",
		async (_, fail) => {
			// Half of a 137-row audit came back 429 in one burst. Could-not-look
			// must not read as could-not-find, or a worse id gets promoted.
			const chain = mainnet();
			const hash = chain.wasm(ID_A, { source_repo: "github:acme/vault" });
			chain.attest("acme/vault", hash);
			chain.wasm(ID_B);
			const { urls } = chain.serve((u) =>
				u.includes("/attestations/") ? fail() : undefined,
			);
			expect(
				await verifyMainnetContract(`${ID_A} then ${ID_B}`, "acme/vault"),
			).toBe("could-not-check");
			expect(urls).toContain(attestationUrl("acme/vault", hash));
		},
	);

	it("never probes an id whose checksum fails, so a typo cannot end the check as unread", async () => {
		const chain = mainnet();
		chain.wasm(ID_B);
		const { rpcKeys } = chain.serve();
		expect(
			await verifyMainnetContract(`${BAD} then ${ID_B}`, "acme/vault"),
		).toEqual({ id: ID_B, basis: "published" });
		expect(rpcKeys[0]).toEqual([instanceKey(ID_B)]);
	});

	it("goes to the next id when mainnet has no instance for one", async () => {
		const chain = mainnet();
		chain.wasm(ID_B);
		chain.serve();
		expect(
			await verifyMainnetContract(`${ID_A} then ${ID_B}`, "acme/vault"),
		).toEqual({ id: ID_B, basis: "published" });
	});

	it("still reads every id absent from mainnet as a checked answer: no contract", async () => {
		const { urls } = mainnet().serve();
		expect(
			await verifyMainnetContract(`${ID_A} ${ID_B}`, "acme/vault"),
		).toBeNull();
		expect(urls).toEqual([MAINNET_RPC]);
	});
});

describe("contractMeta: SEP-55 meta from a WASM", () => {
	it("reads every contractmetav0 section, and a truncated entry ends the read without a throw", () => {
		const wasm = wasmWith(
			{ rsver: "1.89.0" },
			{ source_repo: "github:acme/vault", home_domain: "acme.example" },
		);
		expect(Object.fromEntries(contractMeta(wasm))).toEqual({
			rsver: "1.89.0",
			source_repo: "github:acme/vault",
			home_domain: "acme.example",
		});
		expect(Object.fromEntries(contractMeta(wasm.subarray(0, -6)))).toEqual({
			rsver: "1.89.0",
			source_repo: "github:acme/vault",
		});
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
	it("is unread when the contract check could not run", () => {
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
