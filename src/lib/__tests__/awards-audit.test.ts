// @vitest-environment node

/**
 * Pins from the 2026-09-22 audit of the anonymous relay design. Each test
 * names a defect that was live, or a claim the code made and did not enforce.
 */
import {
	Account,
	Keypair,
	Memo,
	Operation,
	TransactionBuilder,
} from "@stellar/stellar-sdk";
import type { Payload } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	AUTHORIZATION_KEY,
	authorizationDigest,
	type BallotNominee,
	type BallotRound,
	buildAuthorizationTx,
	tallyRound,
	validateSelections,
	verifyAuthorization,
} from "../awards/ballot";
import { planReconcile, summarizeReconcile } from "../awards/mirror";
import {
	readFirstBallotFor,
	reserveBallot,
	settlePendingBallot,
} from "../awards/record";
import {
	AWARDS_NETWORK_PASSPHRASE,
	fetchLatestBallotOp,
	submitFromRelay,
} from "../awards/stellar";

vi.mock("@/lib/payload-client", () => ({ getPayloadSafe: vi.fn() }));

afterEach(() => {
	vi.unstubAllGlobals();
	vi.mocked(getPayloadSafe).mockReset();
	delete process.env.AWARDS_RELAY_SECRET;
});

const round = {
	slug: "i3-2026",
	status: "open",
	ballotMode: "one-per-category",
	picksPerCategory: 1,
	categories: [{ key: "impact", name: "Impact", tagline: null }],
	opensAt: null,
	closesAt: null,
} as unknown as BallotRound;
const nominees: BallotNominee[] = [
	{ category: "impact", slug: "decaf", name: "Decaf" },
];
const picks = { impact: ["decaf"] };
const voter = Keypair.random();
const whitelist = new Set([voter.publicKey()]);
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

/** An authorization built by hand — the builder is not the only author. */
function handMade(base: string, maxTime: number): string {
	const tx = new TransactionBuilder(new Account(voter.publicKey(), base), {
		fee: "10000",
		networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
		memo: Memo.hash(authorizationDigest(round.slug, picks)),
		timebounds: { minTime: 0, maxTime },
	})
		.addOperation(
			Operation.manageData({ name: AUTHORIZATION_KEY, value: round.slug }),
		)
		.build();
	tx.sign(voter);
	return tx.toXDR();
}
const nowSec = () => Math.floor(Date.now() / 1000);

describe("verifyAuthorization — the claims it makes are enforced", () => {
	it("refuses an authorization that lasts longer than the ten minutes it is given", () => {
		const v = verifyAuthorization(handMade("99", 4_102_444_800), {
			round,
			whitelist,
			selections: picks,
			sequence: "100",
		});
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.errors.join()).toMatch(/longer than the ten minutes/);
	});

	it("still accepts the builder's own output, at the last second of its window", () => {
		const built = buildAuthorizationTx({
			round,
			address: voter.publicKey(),
			sequence: "100",
			selections: picks,
		});
		built.sign(voter);
		const v = verifyAuthorization(built.toXDR(), {
			round,
			whitelist,
			selections: picks,
			sequence: "100",
			now: new Date((nowSec() + 599) * 1000),
		});
		expect(v).toEqual({ ok: true, source: voter.publicKey() });
	});

	it("for an account with no chain footprint, accepts only sequence 1", () => {
		// what the builder makes for an unfunded voter
		const built = buildAuthorizationTx({
			round,
			address: voter.publicKey(),
			sequence: null,
			selections: picks,
		});
		built.sign(voter);
		expect(built.sequence).toBe("1");
		expect(
			verifyAuthorization(built.toXDR(), {
				round,
				whitelist,
				selections: picks,
				sequence: null,
			}).ok,
		).toBe(true);
		// a submittable-looking tx at some high sequence is not
		const v = verifyAuthorization(handMade("5000", nowSec() + 300), {
			round,
			whitelist,
			selections: picks,
			sequence: null,
		});
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.errors.join()).toMatch(/sequence 1/);
	});
});

describe("validateSelections — the key budget is the relay's", () => {
	it("refuses a category whose RELAY key exceeds 64 bytes even though the old voter-account key fit", () => {
		// i3.i3-2026.<cat> = 57 bytes (fit); i3.i3-2026.<8-hex id>.<cat> = 66
		const cat = "c".repeat(46);
		const r = {
			...round,
			categories: [{ key: cat, name: "Long", tagline: null }],
		} as BallotRound;
		const v = validateSelections(r, [{ category: cat, slug: "x", name: "X" }], {
			[cat]: "x",
		});
		expect(v.ok).toBe(false);
		if (!v.ok) expect(v.errors.join()).toMatch(/64 bytes/);
	});
});

describe("tallyRound — turnout denominator", () => {
	it("is the whitelist when given, not the ballot list", () => {
		expect(tallyRound(round, nominees, [], 98).turnout).toEqual({
			voted: 0,
			whitelisted: 98,
		});
		expect(tallyRound(round, nominees, []).turnout.whitelisted).toBe(0);
	});
});

describe("planReconcile — pre-relay rows are counted, not dropped", () => {
	it("reports a row with no ballot id as legacy and keeps it out of the reset heuristic", () => {
		const actions = planReconcile(
			[
				{
					address: "GA1",
					ballotId: null,
					selections: picks,
					confirmed: true,
				},
			],
			new Map(),
		);
		expect(actions).toEqual([{ kind: "legacy", address: "GA1" }]);
		const s = summarizeReconcile(actions);
		expect(s.counts.legacy).toBe(1);
		expect(s.resetSuspected).toBe(false);
	});
});

describe("fetchLatestBallotOp — walks past the first 200 ops", () => {
	const page = (records: unknown[], next: string | null) =>
		new Response(
			JSON.stringify({
				_embedded: { records },
				_links: next ? { next: { href: next } } : {},
			}),
			{ status: 200 },
		);
	const filler = Array.from({ length: 200 }, (_, i) => ({
		type: "manage_data",
		name: `i3.r.other${i}.impact`,
		transaction_hash: "x",
		created_at: "2026-01-01T00:00:00Z",
		transaction_successful: true,
	}));

	it("finds a ballot on the second page", async () => {
		const f = vi.fn(async (url: string) =>
			url.includes("cursor=2")
				? page(
						[
							{
								type: "manage_data",
								name: "i3.r.abcd1234.impact",
								transaction_hash: "found",
								created_at: "2026-01-01T00:00:01Z",
								transaction_successful: true,
							},
						],
						null,
					)
				: page(filler, "https://horizon.test/next?cursor=2"),
		);
		vi.stubGlobal("fetch", f);
		expect(await fetchLatestBallotOp("GREL", "i3.r.abcd1234.")).toEqual({
			txHash: "found",
			at: "2026-01-01T00:00:01Z",
		});
		expect(f).toHaveBeenCalledTimes(2);
	});

	it("is bounded", async () => {
		const g = vi.fn(async () => page(filler, "https://horizon.test/next"));
		vi.stubGlobal("fetch", g);
		expect(
			await fetchLatestBallotOp("GREL", "i3.r.nope.", { maxPages: 3 }),
		).toBeNull();
		expect(g).toHaveBeenCalledTimes(3);
	});
});

describe("submitFromRelay — no verdict is not a refusal", () => {
	const relay = Keypair.random();
	function fetchScript(
		script: Array<(url: string, init?: RequestInit) => Response | null>,
	) {
		let i = 0;
		return vi.fn(async (url: string, init?: RequestInit) => {
			for (; i < script.length; i++) {
				const r = script[i](url, init);
				if (r) {
					i++;
					return r;
				}
			}
			throw new Error(`unexpected fetch: ${url}`);
		});
	}
	const account = (sequence: string) => (url: string) =>
		url.includes("/accounts/")
			? new Response(JSON.stringify({ sequence, data: {}, signers: [] }), {
					status: 200,
				})
			: null;
	const post =
		(body: object, status: number) => (url: string, init?: RequestInit) =>
			url.endsWith("/transactions_async") && init?.method === "POST"
				? new Response(JSON.stringify(body), { status })
				: null;
	const lookup = (status: number) => (url: string, init?: RequestInit) =>
		/\/transactions\/[0-9a-f]{64}$/.test(url) && init?.method !== "POST"
			? new Response("{}", { status })
			: null;
	const queued = { tx_status: "PENDING", hash: "h" };
	const fast = { pollMs: 0, backoffMs: () => 0, busyWaitMs: 0 };
	const build = (a: Account) =>
		new TransactionBuilder(a, {
			fee: "10000",
			networkPassphrase: AWARDS_NETWORK_PASSPHRASE,
		})
			.addOperation(Operation.manageData({ name: "k", value: "v" }))
			.setTimeout(60)
			.build();

	it("reports a queued-but-unseen write as PENDING with the hash while the sequence is still ours", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		vi.stubGlobal(
			"fetch",
			fetchScript([
				account("100"),
				post(queued, 201),
				lookup(404),
				account("100"), // not consumed: it may still land
			]),
		);
		const r = await submitFromRelay(build, fast);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.pending).toBe(true);
			expect(r.hash).toMatch(/^[0-9a-f]{64}$/);
		}
	});

	it("turns a no-verdict 5xx into success when the poll finds the transaction", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		vi.stubGlobal(
			"fetch",
			fetchScript([
				account("100"),
				post({ title: "Timeout" }, 504),
				lookup(200),
			]),
		);
		const r = await submitFromRelay(build, fast);
		expect(r.ok).toBe(true);
	});

	it("retries fresh when a concurrent write took the sequence, instead of holding the voter", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		const f = fetchScript([
			account("100"),
			post(queued, 201),
			lookup(404),
			account("101"), // consumed by the other instance: ours can never land
			account("101"),
			post(queued, 201),
			lookup(200),
		]);
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(build, fast);
		expect(r).toMatchObject({ ok: true, attempts: 2 });
		expect(f).toHaveBeenCalledTimes(7);
	});

	it("waits out a queued write from another instance (TRY_AGAIN_LATER) and lands on the next sequence", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		const f = fetchScript([
			account("100"),
			post({ tx_status: "TRY_AGAIN_LATER" }, 503),
			account("101"), // the other instance's write applied
			account("101"),
			post(queued, 201),
			lookup(200),
		]);
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(build, fast);
		expect(r).toMatchObject({ ok: true, attempts: 2 });
		expect(f).toHaveBeenCalledTimes(6);
	});

	it("does not call a 4xx pending: the bytes were refused", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		vi.stubGlobal("fetch", fetchScript([account("100"), post({}, 429)]));
		const r = await submitFromRelay(build, fast);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.pending).toBeUndefined();
	});

	it("refuses to write past Stellar's 1,000-subentry cap instead of failing mid-round", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		const f = fetchScript([
			(url: string) =>
				url.includes("/accounts/")
					? new Response(
							JSON.stringify({
								sequence: "100",
								data: {},
								signers: [],
								subentry_count: 1000, // full: even one more entry is over
							}),
							{ status: 200 },
						)
					: null,
		]);
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(build, fast);
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.resultCodes).toContain("relay_full");
			expect(r.error).toMatch(/1000-subentry/);
		}
		expect(f).toHaveBeenCalledTimes(1);
	});

	it("reports a build that throws instead of letting it escape", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		const f = fetchScript([account("100")]);
		vi.stubGlobal("fetch", f);
		const r = await submitFromRelay(() => {
			throw new Error("name must be a string, up to 64 characters");
		});
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toMatch(/could not build/);
		expect(f).toHaveBeenCalledTimes(1);
	});

	it("serialises concurrent writes within one instance", async () => {
		process.env.AWARDS_RELAY_SECRET = relay.secret();
		// interleaved, the second call's account read would hit the first
		// call's submit entry and the script would throw
		const f = fetchScript([
			account("100"),
			post(queued, 201),
			lookup(200),
			account("101"),
			post(queued, 201),
			lookup(200),
		]);
		vi.stubGlobal("fetch", f);
		const [x, y] = await Promise.all([
			submitFromRelay(build, fast),
			submitFromRelay(build, fast),
		]);
		expect(x.ok && y.ok).toBe(true);
		expect(f).toHaveBeenCalledTimes(6);
	});
});

describe("record — the reserve is atomic and a reservation is not a ballot", () => {
	type Row = Record<string, unknown>;
	function fake(opts: {
		ballots?: Row[];
		createThrows?: unknown;
		deleteThrows?: boolean;
	}) {
		const calls: string[] = [];
		const payload = {
			find: async ({ collection }: { collection: string }) =>
				collection === "award-rounds"
					? { docs: [{ id: "r1" }] }
					: { docs: opts.ballots ?? [] },
			create: async () => {
				calls.push("create");
				if (opts.createThrows) throw opts.createThrows;
				return { id: "b1" };
			},
			delete: async () => {
				calls.push("delete");
				if (opts.deleteThrows) throw new Error("nope");
			},
			findByID: async () => ({ history: [{ txHash: null }] }),
			update: async ({ data }: { data: { txHash: string } }) => {
				calls.push(`confirm:${data.txHash}`);
			},
		} as unknown as Payload;
		vi.mocked(getPayloadSafe).mockResolvedValue(payload);
		return calls;
	}
	const reserve = () =>
		reserveBallot({
			roundSlug: round.slug,
			address: voter.publicKey(),
			authorization: "AAAAAgAAAAB-test-authorization",
			ballotId: "abcd1234",
			selections: picks,
		});

	it("reads Mongo's duplicate-key error as already_voted", async () => {
		fake({ createThrows: { code: 11000, keyValue: { round: "r1" } } });
		expect(await reserve()).toEqual({ ok: false, reason: "already_voted" });
	});

	it("reads the ValidationError Payload's adapter wraps it in as already_voted", async () => {
		fake({
			createThrows: {
				name: "ValidationError",
				message: "The following field is invalid: round",
				data: { errors: [{ message: "Value must be unique", path: "round" }] },
			},
		});
		expect(await reserve()).toEqual({ ok: false, reason: "already_voted" });
	});

	it("keeps every other failure a database error", async () => {
		fake({ createThrows: new Error("socket hang up") });
		expect(await reserve()).toEqual({ ok: false, reason: "database error" });
	});

	const reserved: Row = {
		id: "b1",
		ballotId: "abcd1234",
		txHash: null,
		selections: picks,
		firstSubmittedAt: "2026-09-22T00:00:00.000Z",
		history: [{ txHash: null, selections: picks, ballotId: "abcd1234" }],
	};

	it("reports an unconfirmed reservation as pending, not as a vote", async () => {
		fake({ ballots: [reserved] });
		expect(await readFirstBallotFor(round.slug, voter.publicKey())).toEqual({
			voted: false,
			selections: {},
			pending: {
				id: "b1",
				ballotId: "abcd1234",
				reservedAt: "2026-09-22T00:00:00.000Z",
			},
		});
		fake({
			ballots: [
				{
					...reserved,
					txHash: "h",
					history: [{ txHash: "h", selections: picks }],
				},
			],
		});
		const confirmed = await readFirstBallotFor(round.slug, voter.publicKey());
		expect(confirmed?.voted).toBe(true);
		expect(confirmed?.pending).toBeNull();
	});

	const relayAccount = (data: Record<string, string>) => (url: string) =>
		url.includes("/accounts/") && !url.includes("/operations")
			? new Response(JSON.stringify({ sequence: "1", data, signers: [] }), {
					status: 200,
				})
			: null;
	const ops = (records: unknown[]) => (url: string) =>
		url.includes("/operations?")
			? new Response(JSON.stringify({ _embedded: { records }, _links: {} }), {
					status: 200,
				})
			: null;
	const stub = (
		...script: Array<(url: string, init?: RequestInit) => Response | null>
	) =>
		vi.stubGlobal(
			"fetch",
			vi.fn(async (url: string, init?: RequestInit) => {
				for (const s of script) {
					const r = s(url, init);
					if (r) return r;
				}
				throw new Error(`unexpected fetch: ${url}`);
			}),
		);
	const pending = (ageMs: number) => ({
		id: "b1",
		ballotId: "abcd1234",
		reservedAt: new Date(Date.now() - ageMs).toISOString(),
	});

	it("leaves a young reservation alone without touching the network", async () => {
		const calls = fake({});
		const f = vi.fn();
		vi.stubGlobal("fetch", f);
		expect(await settlePendingBallot(round.slug, pending(30_000), "GREL")).toBe(
			"in-flight",
		);
		expect(f).not.toHaveBeenCalled();
		expect(calls).toEqual([]);
	});

	it("releases a stale reservation the relay never wrote", async () => {
		const calls = fake({});
		stub(relayAccount({}));
		expect(
			await settlePendingBallot(round.slug, pending(10 * 60_000), "GREL"),
		).toBe("released");
		expect(calls).toEqual(["delete"]);
	});

	it("confirms a stale reservation the relay holds, with the op's hash", async () => {
		const calls = fake({});
		stub(
			relayAccount({ "i3.i3-2026.abcd1234.impact": b64("decaf") }),
			ops([
				{
					type: "manage_data",
					name: "i3.i3-2026.abcd1234.impact",
					transaction_hash: "deadbeef",
					created_at: "2026-09-22T00:01:00Z",
					transaction_successful: true,
				},
			]),
		);
		expect(
			await settlePendingBallot(round.slug, pending(10 * 60_000), "GREL"),
		).toBe("confirmed");
		expect(calls).toEqual(["confirm:deadbeef"]);
	});

	it("marks rather than abandons when the relay holds it but the hash is out of reach", async () => {
		const calls = fake({});
		stub(relayAccount({ "i3.i3-2026.abcd1234.impact": b64("decaf") }), ops([]));
		expect(
			await settlePendingBallot(round.slug, pending(10 * 60_000), "GREL"),
		).toBe("confirmed");
		expect(calls).toEqual(["confirm:relay:abcd1234"]);
	});

	it("answers unknown, not released, when the release itself fails", async () => {
		fake({ deleteThrows: true });
		stub(relayAccount({}));
		expect(
			await settlePendingBallot(round.slug, pending(10 * 60_000), "GREL"),
		).toBe("unknown");
	});
});
