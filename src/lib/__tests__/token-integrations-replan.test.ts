// @vitest-environment node
/**
 * An execute leaves nothing to re-plan. Run 45481876157 (2026-11-24)
 * executed, then --replan, from that run's own cache, planned 12 writes.
 * The re-plan read two inputs the execute had not:
 *
 * 1. The holder sweep's candidates include the contract each live stored
 *    holder row was read at, taken from the store. The re-plan read the store
 *    the execute had just written: Blend's old USDC contract (its row's best
 *    pool until the execute moved it) dropped out, the balance keys shifted
 *    by one (130079 to 130078), and every chunked balance read after the
 *    shift missed the cache. Ten USDC holder rows re-planned on partial reads.
 * 2. A read that failed was read again later in the run: an Aquarius pool's
 *    activity failed in the pool pass and was cached when the holder sweep
 *    read the same page, so the re-plan counted events the execute had not
 *    (the XLM and XRF Aquarius rows: poolsByTier, events90d).
 *
 * Each case plans, applies the plan to an in-memory store, re-plans from the
 * same cache, and requires 0 writes.
 */
import { describe, expect, it } from "vitest";
import {
	aggregate,
	type Edge,
	type IntegrationRow,
	plannedWrites,
	planWrites,
	priorHolderContracts,
	type RunCache,
	readOnce,
	type StoredRow,
	type WritePlan,
} from "../token-integrations";

const RUN = "2026-11-24T20:32:57Z";
const CUT = new Date(Date.parse(RUN) - 90 * 86_400_000)
	.toISOString()
	.replace(/\.\d+Z$/, "Z");
const USDC = "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75";
const XLM = "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA";
const c = (ch: string) => `C${ch.repeat(55)}`;

function edge(p: Partial<Edge> & Pick<Edge, "token" | "pool">): Edge {
	return {
		kind: "holder",
		venue: "holder",
		projectSlug: null,
		attributionBasis: "test",
		method: "holder sweep",
		source: `holders:${p.token}`,
		firstAt: null,
		firstBasis: "not read",
		lastSeenAt: null,
		events90d: 0,
		events90dBasis: "stellarindex /contracts events in window",
		balance: null,
		balanceUsd: null,
		balanceBasis: "SAC Balance entry",
		depthUsd: null,
		depthBasis: "this holding only",
		tier: "available",
		tierBasis: "",
		evidenceUrl: "https://example.invalid",
		readAt: RUN,
		...p,
	};
}

/** The store as a DB hands it back: the written fields, plus an id. */
const asStored = (r: IntegrationRow, id = r.key): StoredRow => ({
	...JSON.parse(JSON.stringify(r)),
	id,
});
function apply(p: WritePlan, stored: StoredRow[]): StoredRow[] {
	const next = new Map(stored.map((s) => [s.key, s]));
	for (const r of p.create) next.set(r.key, asStored(r));
	for (const u of p.update) next.set(u.row.key, asStored(u.row, u.id));
	for (const e of p.end)
		next.set(e.key, { ...(next.get(e.key) as StoredRow), ...e.data });
	return [...next.values()];
}
const memory = (m: Map<string, unknown>): RunCache => ({
	get: (kind, key) => m.get(`${kind}|${key}`),
	set: (kind, key, v) => m.set(`${kind}|${key}`, v),
});
const judged = (checked: Set<string>) => (s: StoredRow) =>
	checked.has(String(s.source))
		? null
		: `could-not-check: ${s.source} was not read completely this run`;

describe("an execute leaves nothing to re-plan (run 45481876157)", () => {
	it("a holder whose best pool the execute moved: the re-plan sweeps what the execute swept", () => {
		const [ALLBRIDGE, BLEND, BLEND_OLD, BLNT, YIELDBLOX] = [
			c("D"),
			c("E"),
			c("F"),
			c("G"),
			c("H"),
		];
		const SPENT = c("X");
		const EMPTIED = c("U"); // a token swept only because the store holds a row
		const owner: Record<string, string> = {
			[ALLBRIDGE]: "allbridge",
			[BLEND]: "blend",
			[BLEND_OLD]: "blend",
			[BLNT]: "blnt",
			[YIELDBLOX]: "yieldblox",
			[SPENT]: "spent",
		};
		// what the run's capped candidate lists find: Blend's old contract is
		// not among them, only the store names it
		const found: Record<string, string[]> = {
			[USDC]: [ALLBRIDGE, BLEND, BLNT, YIELDBLOX],
		};
		const chain: Record<string, string> = {
			[`${USDC}|${ALLBRIDGE}`]: "215.773324",
			[`${USDC}|${BLEND}`]: "9750.399576",
			[`${USDC}|${BLEND_OLD}`]: "5944.4667",
			[`${USDC}|${BLNT}`]: "8014.2144982",
			[`${USDC}|${YIELDBLOX}`]: "203.7437559",
			[`${EMPTIED}|${SPENT}`]: "0",
		};
		const holding = (token: string, pool: string, balance: string) =>
			edge({
				token,
				pool,
				projectSlug: owner[pool],
				balance,
				balanceUsd: Number(balance),
				depthUsd: Number(balance),
				tier: Number(balance) >= 1000 ? "used" : "available",
			});
		// The script's holder sweep, as wired: candidates are what the run found
		// plus what the stored rows name; balances are read two keys per call,
		// each call cached by its key list (entries()); --replan reads only the
		// cache, and a missed call is could-not-check for its tokens.
		const plan = (
			stored: StoredRow[],
			cache: Map<string, unknown>,
			replan: boolean,
		) => {
			const prior = priorHolderContracts(stored, memory(cache));
			const tokens = [...new Set([USDC, ...prior.keys()])];
			const pairs = tokens.flatMap((t) =>
				[...new Set([...(found[t] ?? []), ...(prior.get(t) ?? [])])]
					.sort()
					.map((h) => `${t}|${h}`),
			);
			const got = new Map<string, string>();
			const failed = new Set<string>();
			for (let i = 0; i < pairs.length; i += 2) {
				const chunk = pairs.slice(i, i + 2);
				const key = `rpc|entries:${chunk.join(",")}`;
				let read = cache.get(key) as Array<[string, string]> | undefined;
				if (!read && !replan) {
					read = chunk.map((p) => [p, chain[p] ?? "0"]);
					cache.set(key, read);
				}
				if (!read) for (const p of chunk) failed.add(p.split("|")[0]);
				else for (const [p, b] of read) got.set(p, b);
			}
			const edges = [...got]
				.filter(([, b]) => b !== "0")
				.map(([p, b]) => holding(p.split("|")[0], p.split("|")[1], b));
			const checked = new Set(
				tokens.filter((t) => !failed.has(t)).map((t) => `holders:${t}`),
			);
			return planWrites(
				aggregate(edges, new Map()),
				stored,
				judged(checked),
				RUN,
			);
		};

		// the store before the run: Blend's row read at its old contract, and a
		// row on a token whose one holder has since emptied
		const before = aggregate(
			[
				holding(USDC, BLEND_OLD, "9000"),
				edge({
					token: EMPTIED,
					pool: SPENT,
					projectSlug: "spent",
					balance: "5",
				}),
			],
			new Map(),
		).map((r) => asStored(r));
		const cache = new Map<string, unknown>();
		const execute = plan(before, cache, false);
		const moved = execute.update.find((u) => u.row.projectSlug === "blend");
		expect(moved?.row).toMatchObject({ bestPool: BLEND, pools: 2 });
		expect(moved?.changed).toContain("bestPool");
		expect(execute.end.map((e) => e.key)).toEqual([
			`${EMPTIED}|holder|holder|spent`,
		]);

		const replan = plan(apply(execute, before), cache, true);
		expect(replan.update.map((u) => `${u.row.key}: ${u.changed}`)).toEqual([]);
		expect(plannedWrites(replan)).toBe(0);
	});

	it("a read that failed is the run's answer: a later read of it and the re-plan see the same", async () => {
		const FLAKY = c("Q"); // XLM/XRF-like pool: the pool pass's read fails
		const EDGE = c("R"); // events on both sides of the window's edge
		const page = (pool: string) => `/contracts/${pool}?limit=500`;
		const at = (offsetSec: number) =>
			new Date(Date.parse(CUT) + offsetSec * 1000)
				.toISOString()
				.replace(/\.\d+Z$/, "Z");
		const calls = new Map<string, number>();
		// the index answers the second time it is asked for the flaky page
		const net = (url: string) => async () => {
			calls.set(url, (calls.get(url) ?? 0) + 1);
			if (url === page(FLAKY) && calls.get(url) === 1) return null;
			return url === page(EDGE)
				? [{ close_time: at(5) }, { close_time: at(0) }, { close_time: at(-1) }]
				: Array.from({ length: 12 }, () => ({ close_time: at(86_400) }));
		};
		const events = (evs: Array<{ close_time: string }> | null) =>
			evs === null ? null : evs.filter((e) => e.close_time >= CUT).length;
		const plan = async (
			stored: StoredRow[],
			cache: Map<string, unknown>,
			replan: boolean,
		) => {
			const read = (url: string) =>
				readOnce(memory(cache), "http", url, replan, net(url), null);
			const pool = (p: string, n: number | null) =>
				edge({
					token: XLM,
					pool: p,
					kind: "dex_pool",
					venue: "aquarius",
					projectSlug: "aquarius",
					source: "registry:aquarius",
					events90d: n,
					events90dBasis:
						n === null
							? "could-not-check (http error)"
							: "stellarindex /contracts events in window",
					tier: n === null ? "unrated" : n >= 10 ? "used" : "available",
				});
			// the pool pass, then the holder sweep reading the same pages again
			const edges = [
				pool(FLAKY, events(await read(page(FLAKY)))),
				pool(EDGE, events(await read(page(EDGE)))),
			];
			await read(page(FLAKY));
			await read(page(EDGE));
			return planWrites(
				aggregate(edges, new Map()),
				stored,
				judged(new Set(["registry:aquarius"])),
				RUN,
			);
		};

		const cache = new Map<string, unknown>();
		const execute = await plan([], cache, false);
		expect(execute.create[0]).toMatchObject({
			events90d: 2, // the edge pool's events at and after the cut, not the one before
			poolsByTier: { unrated: 1, available: 1 },
		});
		// one answer per read per run: the failed page was not asked again
		expect(calls.get(page(FLAKY))).toBe(1);

		const replan = await plan(apply(execute, []), cache, true);
		expect(replan.update.map((u) => `${u.row.key}: ${u.changed}`)).toEqual([]);
		expect(plannedWrites(replan)).toBe(0);
	});
});
