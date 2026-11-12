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
	CONTRACT_UNREAD,
	keepStoredContract,
	mainnetCheckUnread,
	readContractFns,
	type SourceRead,
	verifyMainnetContract,
} from "../../../scripts/scan/fetch-repo-code";
import { contractSource } from "../code-symbols";
import {
	codeKey,
	contractMeta,
	instanceKey,
	MAINNET_RPC,
	sameOwnerLinks,
	sourceMatches,
	specFunctions,
	submoduleTargets,
} from "../contract-ownership";
import fx from "./fixtures/contract-attribution.json";

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
		/** A contract as mainnet serves it: its real instance and code entries. */
		real(c: {
			id: string;
			wasmHash: string;
			instanceXdr: string;
			codeXdr: string;
		}) {
			ledger.set(instanceKey(c.id), c.instanceXdr);
			ledger.set(codeKey(Buffer.from(c.wasmHash, "hex")), c.codeXdr);
		},
		/** A contract running exactly these WASM bytes. */
		code(id: string, code: Buffer) {
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
		},
		/** A Stellar Asset Contract: a network token's wrapper. */
		asset(id: string) {
			instance(id, xdr.ContractExecutable.contractExecutableStellarAsset());
		},
		/** Drop a WASM's code entry while its instance stays listed. */
		forgetCode(hash: string) {
			ledger.delete(codeKey(Buffer.from(hash, "hex")));
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

	it("keeps a contract whose build names a different repo that attested it as cited, never as this repo's", async () => {
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
		).toEqual({ id: ID_A, basis: "cited" });
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

	it("keeps an unclaimed, non-token address its source does not define, as cited", async () => {
		const chain = mainnet();
		chain.wasm(ID_A, { rssdkver: "22.0.8" });
		const { urls } = chain.serve();
		expect(
			await verifyMainnetContract(`ours: ${ID_A}`, "kalepail/ohloss"),
		).toEqual({ id: ID_A, basis: "cited" });
		// Nothing is claimed, so there is nothing to ask GitHub.
		expect(urls.every((u) => u === MAINNET_RPC)).toBe(true);
	});

	it("prefers a self-validated id over a cited sibling", async () => {
		const chain = mainnet();
		chain.wasm(ID_A);
		const hash = chain.wasm(ID_B, { source_repo: "github:acme/vault" });
		chain.attest("acme/vault", hash);
		chain.serve();
		expect(
			await verifyMainnetContract(`${ID_A} and ${ID_B}`, "acme/vault"),
		).toEqual({ id: ID_B, basis: "self-validated" });
	});

	it("marks a build that names THIS repo but holds no attestation cited, not self-validated", async () => {
		const chain = mainnet();
		const hash = chain.wasm(ID_A, { source_repo: "github:acme/vault" });
		const { urls } = chain.serve();
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toEqual({
			id: ID_A,
			basis: "cited",
		});
		expect(urls).toContain(attestationUrl("acme/vault", hash));
	});

	it("marks a build that names another repo without an attestation cited, not excluded", async () => {
		const chain = mainnet();
		const hash = chain.wasm(ID_A, { source_repo: "github:someone/else" });
		const { urls } = chain.serve();
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toEqual({
			id: ID_A,
			basis: "cited",
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
		).toEqual({ id: ID_A, basis: "cited" });
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
		).toEqual({ id: ID_B, basis: "cited" });
		expect(rpcKeys[0]).toEqual([instanceKey(ID_B)]);
	});

	it("goes to the next id when mainnet has no instance for one", async () => {
		const chain = mainnet();
		chain.wasm(ID_B);
		chain.serve();
		expect(
			await verifyMainnetContract(`${ID_A} then ${ID_B}`, "acme/vault"),
		).toEqual({ id: ID_B, basis: "cited" });
	});

	it("still reads every id absent from mainnet as a checked answer: no contract", async () => {
		const { urls } = mainnet().serve();
		expect(
			await verifyMainnetContract(`${ID_A} ${ID_B}`, "acme/vault"),
		).toBeNull();
		expect(urls).toEqual([MAINNET_RPC]);
	});
});

// Review 2026-11-11 of the RPC rewrite: paths a scan can meet that no case
// covered, each of which must neither erase a stored id nor invent an owner.
describe("verifyMainnetContract: missing or malformed evidence", () => {
	it("keeps the id the repo already holds when the RPC no longer lists its instance", async () => {
		// A contract cannot be deleted; the RPC serves live state only, so an
		// instance evicted to the hot archive can be missing from the answer.
		mainnet().serve();
		expect(
			await verifyMainnetContract(
				`ours: ${ID_A}`,
				"acme/vault",
				undefined,
				ID_A,
			),
		).toBe("could-not-check");
	});

	it("still reads an absent instance as no contract when the repo holds a different id", async () => {
		mainnet().serve();
		expect(
			await verifyMainnetContract(
				`ours: ${ID_A}`,
				"acme/vault",
				undefined,
				ID_B,
			),
		).toBeNull();
	});

	it("reads a listed instance whose code entry is missing as could-not-check", async () => {
		const chain = mainnet();
		chain.forgetCode(chain.wasm(ID_A, { source_repo: "github:acme/vault" }));
		chain.serve();
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toBe(
			"could-not-check",
		);
	});

	it("reads an attestation answer listing none as no attestation: cited, not self-validated", async () => {
		const chain = mainnet();
		const hash = chain.wasm(ID_A, { source_repo: "github:acme/vault" });
		chain.serve((u) =>
			u === attestationUrl("acme/vault", hash)
				? Response.json({ attestations: [] })
				: undefined,
		);
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toEqual({
			id: ID_A,
			basis: "cited",
		});
	});

	it("treats a malformed source_repo as no claim and never builds a URL from it", async () => {
		for (const claim of [
			"https://github.com/acme/vault",
			"github:acme/vault/../../other",
			"github:acme/va%2Fult",
			"github:../vault",
		]) {
			const chain = mainnet();
			chain.wasm(ID_A, { source_repo: claim });
			const { urls } = chain.serve();
			expect(
				await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault"),
			).toEqual({ id: ID_A, basis: "cited" });
			expect(urls.every((u) => u === MAINNET_RPC)).toBe(true);
		}
	});

	it("reads an instance entry that does not decode as could-not-check", async () => {
		const chain = mainnet();
		chain.serve((u) =>
			u === MAINNET_RPC
				? Response.json({
						jsonrpc: "2.0",
						id: 1,
						result: {
							latestLedger: 65364392,
							entries: [{ key: instanceKey(ID_A), xdr: "AAAA" }],
						},
					})
				: undefined,
		);
		expect(await verifyMainnetContract(`ours: ${ID_A}`, "acme/vault")).toBe(
			"could-not-check",
		);
	});
});

describe("contractMeta: SEP-55 meta from a WASM", () => {
	it("stops a section name at its section's end, whatever length it claims", () => {
		// id 0, size 7, then a name length of 0xffffffff that the 7 bytes cannot
		// hold, repeated through about 126 KB: unclamped, each name decoded the
		// rest of the buffer, about 2 s of CPU (review, 2026-11-11).
		const crafted = Buffer.concat([
			Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]),
			Buffer.from([0x00, 0x07, 0xff, 0xff, 0xff, 0xff, 0x0f, 0x41, 0x41]),
			Buffer.concat(
				Array.from({ length: 18_000 }, () =>
					Buffer.from([0x00, 0x05, 0xff, 0xff, 0xff, 0xff, 0x0f]),
				),
			),
		]);
		const started = performance.now();
		expect(contractMeta(crafted).size).toBe(0);
		expect(performance.now() - started).toBeLessThan(200);
	});

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

/** The defect this answers (measured 2026-11-11 over all 135 /api/contracts
 * rows): a README cites the contracts it calls as readily as the one it
 * deployed, and every non-token id was served as the repo's own.
 * reflector-network/reflector-stellar-connector held the SushiSwap V3 factory
 * it reads prices from; lumenmap/lumenmap held Soroswap's factory, which
 * soroswap/core deployed. The ledger entries and the README and Rust
 * excerpts are real (fixtures/contract-attribution.json names each source). */
describe("whose contract: the deployed interface against the repo's own source", () => {
	const { sushiFactory: sushi, soroswapFactory: soroswap } = fx;
	const code = (c: { codeXdr: string }) =>
		xdr.LedgerEntryData.fromXDR(c.codeXdr, "base64").contractCode().code();
	const noSource = {
		defined: new Set<string>(),
		defaults: [],
		unread: false,
		isFork: false,
	};
	const ownerSource = {
		...contractSource([soroswap.owner.source]),
		unread: false,
		isFork: false,
	};

	it("reads the functions a deployed WASM exports from its contractspecv0", () => {
		expect(specFunctions(code(soroswap)).sort()).toEqual(
			[
				"all_pairs",
				"all_pairs_length",
				"create_pair",
				"fee_to",
				"fee_to_setter",
				"fees_enabled",
				"get_pair",
				"initialize",
				"pair_exists",
				"set_fee_to",
				"set_fee_to_setter",
				"set_fees_enabled",
			].sort(),
		);
		expect(specFunctions(Buffer.from("not a wasm"))).toEqual([]);
	});

	it("Reflector's connector cites the SushiSwap factory in a config block: cited, not its contract", async () => {
		const chain = mainnet();
		chain.real(sushi);
		chain.serve();
		expect(
			await verifyMainnetContract(
				sushi.citedBy.readme,
				sushi.citedBy.repo,
				undefined,
				sushi.id,
				noSource,
			),
		).toEqual({ id: sushi.id, basis: "cited" });
	});

	it("soroswap/core, whose source is the deployed factory, stays its owner: source-matched", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await verifyMainnetContract(
				soroswap.owner.readme,
				soroswap.owner.repo,
				undefined,
				soroswap.id,
				ownerSource,
			),
		).toEqual({ id: soroswap.id, basis: "source-matched" });
	});

	it("lumenmap's entity registry cites the same factory: cited", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await verifyMainnetContract(
				soroswap.citedBy.readme,
				soroswap.citedBy.repo,
				undefined,
				soroswap.id,
				noSource,
			),
		).toEqual({ id: soroswap.id, basis: "cited" });
	});

	it("a #[contractclient] trait naming every factory function is a caller's, never the source", async () => {
		const client = contractSource([soroswap.owner.clientTrait]).defined;
		expect(client.size).toBe(0);
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await verifyMainnetContract(
				soroswap.citedBy.readme,
				"someone/router-app",
				undefined,
				null,
				{ ...noSource, defined: client },
			),
		).toEqual({ id: soroswap.id, basis: "cited" });
	});

	it("a GitHub fork carrying the owner's source and README is cited: both are its parent's", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await verifyMainnetContract(
				soroswap.owner.readme,
				"someone/core",
				undefined,
				null,
				{ ...ownerSource, isFork: true },
			),
		).toEqual({ id: soroswap.id, basis: "cited" });
	});

	it("an owned id wins over a cited one the README names first", async () => {
		const chain = mainnet();
		chain.real(sushi);
		chain.real(soroswap);
		chain.serve();
		expect(
			await verifyMainnetContract(
				`${sushi.citedBy.readme}\n${soroswap.owner.readme}`,
				soroswap.owner.repo,
				undefined,
				null,
				ownerSource,
			),
		).toEqual({ id: soroswap.id, basis: "source-matched" });
	});

	it("judges the held id wherever the README still names it, past the first three", async () => {
		// Kryon-Protocol/Kryon's README grew a table of eleven ids above its
		// mainnet one; reading only the first three erased the held id.
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		const above = [1, 2, 3]
			.map((n) => StrKey.encodeContract(Buffer.alloc(32, n)))
			.join("\n");
		expect(
			await verifyMainnetContract(
				`${above}\n${soroswap.owner.readme}`,
				soroswap.owner.repo,
				undefined,
				soroswap.id,
				ownerSource,
			),
		).toEqual({ id: soroswap.id, basis: "source-matched" });
	});
});

/** Four documented deployers would have read cited (measured 2026-11-11):
 * their contract lives in a repo next door. Lobster-Protocol/stellar-integrations
 * is the team's frontend and links Lobster-Protocol/Stellar, whose source
 * rebuilds the mainnet WASM; ackrate/ackrate-protocol's WASM names
 * ackrate/ackrate-protocol-contracts in SEP-55; ALGOREX-PH's frontend links its
 * contract repo; jashuleyn/HatiHatid's source is a submodule with no
 * .gitmodules. The sibling must be one this repo points to, under its own
 * GitHub owner. The deployed WASM and the sibling's source are real. */
describe("whose contract: a same-owner repo this repo points to", () => {
	const { sushiFactory: sushi, soroswapFactory: soroswap } = fx;
	const factory: SourceRead = {
		...contractSource([soroswap.owner.source]),
		unread: false,
	};
	type Answer = SourceRead | null | typeof CONTRACT_UNREAD;
	const reader = (answers: Record<string, Answer>) => async (repo: string) =>
		repo in answers ? answers[repo] : null;
	const judge = async (
		readme: string,
		repo: string,
		siblings: {
			pointed: string[];
			opaque?: boolean;
			answers: Record<string, Answer>;
		},
		isFork = false,
		own: Partial<SourceRead> = {},
	) =>
		verifyMainnetContract(readme, repo, undefined, null, {
			defined: new Set(),
			defaults: [],
			unread: false,
			...own,
			isFork,
			siblings: {
				pointed: siblings.pointed,
				opaque: siblings.opaque ?? false,
				read: reader(siblings.answers),
			},
		});

	it("a team's frontend whose README links its contract repo: sibling-matched", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await judge(soroswap.owner.readme, "soroswap/frontend", {
				pointed: ["soroswap/core"],
				answers: { "soroswap/core": factory },
			}),
		).toEqual({ id: soroswap.id, basis: "sibling-matched" });
	});

	it("the repo the WASM's SEP-55 source_repo names, under the same owner, is read", async () => {
		// The real factory WASM with a contractmetav0 section naming a sibling.
		const leb = (n: number): number[] =>
			n < 0x80 ? [n] : [(n & 0x7f) | 0x80, ...leb(n >>> 7)];
		const meta = xdr.ScMetaEntry.scMetaV0(
			new xdr.ScMetaV0({
				key: "source_repo",
				val: "github:soroswap/factory-contracts",
			}),
		).toXDR();
		const name = Buffer.from("contractmetav0");
		const body = Buffer.concat([Buffer.from(leb(name.length)), name, meta]);
		const bytes = Buffer.concat([
			xdr.LedgerEntryData.fromXDR(soroswap.codeXdr, "base64")
				.contractCode()
				.code(),
			Buffer.from([0, ...leb(body.length)]),
			body,
		]);
		const chain = mainnet();
		chain.code(soroswap.id, bytes);
		chain.serve();
		const answers = { "soroswap/factory-contracts": factory };
		expect(
			await judge(soroswap.owner.readme, "soroswap/sdk", {
				pointed: [],
				answers,
			}),
		).toEqual({ id: soroswap.id, basis: "sibling-matched" });
		// Another owner's build names its own repo: never this repo's sibling.
		expect(
			await judge(soroswap.citedBy.readme, "lumenmap/lumenmap", {
				pointed: [],
				answers,
			}),
		).toEqual({ id: soroswap.id, basis: "cited" });
	});

	it("Reflector's connector links a same-owner repo that does not define the SushiSwap factory: cited", async () => {
		const chain = mainnet();
		chain.real(sushi);
		chain.serve();
		expect(
			await judge(sushi.citedBy.readme, sushi.citedBy.repo, {
				pointed: ["reflector-network/reflector-contract"],
				answers: {
					"reflector-network/reflector-contract": {
						defined: new Set(["lastprice", "decimals", "assets"]),
						defaults: [],
						unread: false,
					},
				},
			}),
		).toEqual({ id: sushi.id, basis: "cited" });
	});

	it("a pointed-to repo GitHub hides (private or gone) cannot decide it: published, not cited", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await judge(soroswap.owner.readme, "soroswap/frontend", {
				pointed: ["soroswap/private-contracts"],
				answers: { "soroswap/private-contracts": null },
			}),
		).toEqual({ id: soroswap.id, basis: "published" });
	});

	it("a submodule whose target cannot be read cannot decide it either: published", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await judge(soroswap.owner.readme, "jashuleyn/HatiHatid", {
				pointed: [],
				opaque: true,
				answers: {},
			}),
		).toEqual({ id: soroswap.id, basis: "published" });
	});

	it("a sibling GitHub could not answer for is a check that did not run", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await judge(soroswap.owner.readme, "soroswap/frontend", {
				pointed: ["soroswap/core"],
				answers: { "soroswap/core": CONTRACT_UNREAD },
			}),
		).toBe(CONTRACT_UNREAD);
	});

	it("a fork's pointers are its parent's: cited, even when they match", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await judge(
				soroswap.owner.readme,
				"someone/frontend",
				{ pointed: ["soroswap/core"], answers: { "soroswap/core": factory } },
				true,
			),
		).toEqual({ id: soroswap.id, basis: "cited" });
	});

	it("points only at repos under the repo's own GitHub owner", () => {
		expect(
			sameOwnerLinks(
				"Lobster-Protocol/stellar-integrations",
				"from [Lobster-Protocol/Stellar](https://github.com/Lobster-Protocol/Stellar). See github.com/lobster-protocol/stellar-integrations and https://github.com/soroswap/core.git",
			),
		).toEqual(["Lobster-Protocol/Stellar"]);
		expect(
			submoduleTargets(
				"acme/app",
				["contracts", "vendor/blend", "lost"],
				'[submodule "contracts"]\n\tpath = contracts\n\turl = git@github.com:acme/app-contracts.git\n[submodule "vendor/blend"]\n\tpath = vendor/blend\n\turl = https://github.com/blend-capital/blend-contracts\n',
			),
		).toEqual({ targets: ["acme/app-contracts"], opaque: true });
		expect(submoduleTargets("acme/app", [], null)).toEqual({
			targets: [],
			opaque: false,
		});
	});
});

/** A SEP-41 token implements its interface as a trait impl: `impl
 * token::Interface for Token` in older SDKs, `#[contractimpl(contracttrait)]
 * impl TokenInterface for Token` in newer ones. Reading neither form,
 * gabrielfonte/stellar-token's source defined 4 of its 14 deployed functions
 * and its own token read as cited. The deployed WASM is that repo's; the
 * source is the SDK example token it was built from. */
describe("whose contract: a token's trait impl is its source", () => {
	const { sep41Token: token } = fx;
	it("reads the functions of a trait impl named by path or with attribute arguments", () => {
		expect([...contractSource([token.source]).defined].sort()).toEqual(
			[
				"__constructor",
				"allowance",
				"approve",
				"balance",
				"burn",
				"burn_from",
				"decimals",
				"get_allowance",
				"mint",
				"name",
				"set_admin",
				"symbol",
				"transfer",
				"transfer_from",
			].sort(),
		);
		const older = `#[contractimpl]\nimpl token::Interface for Token {\n fn balance(e: Env, id: Address) -> i128 { 0 }\n fn transfer(e: Env, from: Address, to: Address, amount: i128) {}\n}`;
		expect([
			...contractSource([{ path: "src/contract.rs", text: older }]).defined,
		]).toEqual(["balance", "transfer"]);
	});
	it("the deployed token is its repo's own: source-matched", async () => {
		const chain = mainnet();
		chain.real(token);
		chain.serve();
		expect(
			await verifyMainnetContract(
				`Contract: ${token.id}`,
				token.deployedBy,
				undefined,
				token.id,
				{ ...contractSource([token.source]), unread: false, isFork: false },
			),
		).toEqual({ id: token.id, basis: "source-matched" });
	});
});

/** An independent audit of the rule (2026-11-11) broke it these ways. */
describe("whose contract: what the audit broke", () => {
	const { soroswapFactory: soroswap } = fx;
	const factory: SourceRead = {
		...contractSource([soroswap.owner.source]),
		unread: false,
	};
	const own = (extra: Partial<SourceRead> = {}) => ({
		defined: new Set<string>(),
		defaults: [],
		unread: false,
		isFork: false,
		...extra,
	});
	/** The real factory WASM, its build naming `repo` in SEP-55. */
	const claiming = (repo: string) => {
		const leb = (n: number): number[] =>
			n < 0x80 ? [n] : [(n & 0x7f) | 0x80, ...leb(n >>> 7)];
		const meta = xdr.ScMetaEntry.scMetaV0(
			new xdr.ScMetaV0({ key: "source_repo", val: `github:${repo}` }),
		).toXDR();
		const name = Buffer.from("contractmetav0");
		const body = Buffer.concat([Buffer.from(leb(name.length)), name, meta]);
		return Buffer.concat([
			xdr.LedgerEntryData.fromXDR(soroswap.codeXdr, "base64")
				.contractCode()
				.code(),
			Buffer.from([0, ...leb(body.length)]),
			body,
		]);
	};
	const ghAnswering =
		(routes: Record<string, unknown>) =>
		async (url: string): Promise<Response> =>
			url in routes
				? Response.json(routes[url])
				: Response.json({ message: "Not Found" }, { status: 404 });

	it("a same-owner fork of the contract's source defines nothing of its own", async () => {
		// acme/vault cites a Blend pool and links acme/blend-contracts-v2, its
		// fork of Blend, which defines every pool function.
		const r = await readContractFns(
			ghAnswering({
				"/repos/acme/blend-contracts-v2": {
					full_name: "acme/blend-contracts-v2",
					default_branch: "main",
					fork: true,
				},
			}),
			"acme/blend-contracts-v2",
			{ api: 0, raw: 0 },
		);
		expect(r).toEqual({ defined: new Set(), defaults: [], unread: false });
	});

	it("an id attested to another owner's repo is cited without reading a sibling", async () => {
		const bytes = claiming("soroswap/core");
		const chain = mainnet();
		chain.code(soroswap.id, bytes);
		chain.attest(
			"soroswap/core",
			createHash("sha256").update(bytes).digest("hex"),
		);
		chain.serve();
		let reads = 0;
		expect(
			await verifyMainnetContract(
				soroswap.citedBy.readme,
				"acme/vault",
				undefined,
				null,
				{
					...own(),
					siblings: {
						pointed: ["acme/core"],
						opaque: false,
						read: async () => {
							reads++;
							return factory;
						},
					},
				},
			),
		).toEqual({ id: soroswap.id, basis: "cited" });
		expect(reads).toBe(0);
	});

	it("a source read that was not whole cannot say cited: could not check", async () => {
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await verifyMainnetContract(
				soroswap.citedBy.readme,
				"acme/app",
				undefined,
				null,
				own({ unread: true }),
			),
		).toBe(CONTRACT_UNREAD);
		// A partial read that still matches is an answer.
		expect(
			await verifyMainnetContract(
				soroswap.owner.readme,
				soroswap.owner.repo,
				undefined,
				null,
				own({ defined: factory.defined, unread: true }),
			),
		).toEqual({ id: soroswap.id, basis: "source-matched" });
	});

	it("a sibling read marks an unreadable file or a truncated tree as not whole", async () => {
		vi.stubGlobal("fetch", async () => new Response("", { status: 404 }));
		const meta = {
			"/repos/acme/core": {
				full_name: "acme/core",
				default_branch: "main",
				fork: false,
			},
		};
		const file = { path: "src/lib.rs", type: "blob", sha: "a1", size: 1_000 };
		const unreadable = await readContractFns(
			ghAnswering({
				...meta,
				"/repos/acme/core/git/trees/main?recursive=1": { tree: [file] },
			}),
			"acme/core",
			{ api: 0, raw: 0 },
		);
		expect(unreadable).toMatchObject({ unread: true });
		const truncated = await readContractFns(
			ghAnswering({
				...meta,
				"/repos/acme/core/git/trees/main?recursive=1": {
					tree: [],
					truncated: true,
				},
			}),
			"acme/core",
			{ api: 0, raw: 0 },
		);
		expect(truncated).toMatchObject({ unread: true });
		// A file over fetchBlob's 400 KB cap is generated, not source: it is
		// never selected, so it cannot leave every check unread.
		const oversize = await readContractFns(
			ghAnswering({
				...meta,
				"/repos/acme/core/git/trees/main?recursive=1": {
					tree: [{ ...file, path: "src/bindings.rs", size: 500_000 }],
				},
			}),
			"acme/core",
			{ api: 0, raw: 0 },
		);
		expect(oversize).toEqual({
			defined: new Set(),
			defaults: [],
			unread: false,
		});
	});

	it("trait impls that take the trait's defaults leave the functions unnamed: published", async () => {
		const read = (text: string) =>
			contractSource([{ path: "src/contract.rs", text }]);
		// OpenZeppelin's fungible token: the block names no function.
		expect(
			read(
				"#[default_impl]\n#[contractimpl]\nimpl FungibleToken for Token {\n    type ContractType = Base;\n}",
			).defaults,
		).toEqual([new Set()]);
		expect(
			read(
				"#[contractimpl]\nimpl C {\n    pub fn mint(e: Env) {}\n}\n#[contractimpl(contracttrait)]\nimpl Pausable for C {}",
			).defaults,
		).toEqual([new Set(["mint"])]);
		// Another attribute before `impl`, and a trait with generics.
		expect([
			...read(
				"#[contractimpl]\n#[allow(unused)]\nimpl C {\n    pub fn a(e: Env) {}\n}\n#[contractimpl]\nimpl Foo<Bar> for C {\n    fn b(e: Env) {}\n}",
			).defined,
		]).toEqual(["a", "b"]);
		const chain = mainnet();
		chain.real(soroswap);
		chain.serve();
		expect(
			await verifyMainnetContract(
				soroswap.citedBy.readme,
				"acme/token",
				undefined,
				null,
				own({ defaults: [new Set(["create_pair"])] }),
			),
		).toEqual({ id: soroswap.id, basis: "published" });
		// A defaults contract naming a function the WASM lacks is another
		// contract: Eras256/Nirium's account contract beside the DeFindex
		// vault it cites.
		expect(
			await verifyMainnetContract(
				soroswap.citedBy.readme,
				"acme/token",
				undefined,
				null,
				own({ defaults: [new Set(["__check_auth", "create_pair"])] }),
			),
		).toEqual({ id: soroswap.id, basis: "cited" });
	});

	it("mock contracts and test utilities are not the repo's source", () => {
		const mock = (name: string) =>
			`#[contractimpl]\nimpl Mock {\n    pub fn ${name}(e: Env) {}\n}`;
		expect([
			...contractSource([
				{
					path: "src/lib.rs",
					text: `#[contractimpl]\nimpl Real {\n    pub fn real(e: Env) {}\n}\n#[cfg(test)]\nmod test {\n    ${mock("inline_mock")}\n}`,
				},
				{ path: "contracts/mock-pool/src/lib.rs", text: mock("pool_mock") },
				{ path: "src/testutils.rs", text: mock("util_mock") },
				{ path: "src/mock_pool.rs", text: mock("file_mock") },
				{ path: "contracts/pool-mock/src/lib.rs", text: mock("suffix_mock") },
				{ path: "contracts/mockoracle/src/lib.rs", text: mock("oracle_mock") },
				{
					path: "src/contract.rs",
					text: `#[cfg(any(test, feature = "testutils"))]\nmod testutils {\n    ${mock("feature_mock")}\n}`,
				},
			]).defined,
		]).toEqual(["real"]);
	});

	it("a WASM exporting fewer than four functions matches only when every one is defined", () => {
		expect(
			sourceMatches(["initialize", "execute"], new Set(["initialize"])),
		).toBe(false);
		expect(
			sourceMatches(
				["initialize", "execute"],
				new Set(["initialize", "execute"]),
			),
		).toBe(true);
		expect(sourceMatches(["a", "b", "c", "d"], new Set(["a", "b"]))).toBe(true);
	});

	it("a gist or an owner's .github repo is no sibling", () => {
		expect(
			sameOwnerLinks(
				"acme/app",
				"see https://gist.github.com/acme/abc123 and https://github.com/acme/.github and https://www.github.com/acme/contracts",
			),
		).toEqual(["acme/contracts"]);
	});
});
