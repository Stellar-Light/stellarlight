/**
 * Two served-row defects a consumer found (Raven, 2026-11):
 *
 * - sls-122: q=wallet served one record twice. Its Draft lineage shadow
 *   (coca-wallet, canonical coca) ranked on a later page, and the page-side
 *   fold swapped it for a canonical an earlier page had already served:
 *   196 rows walked under a total of 195.
 * - A Draft row is admin-only, yet resolve, verify and the changes feed read
 *   the whole collection: resolve answered q=eurc as found, status Draft.
 *
 * Lives in src/lib so CI runs it; it drives the real routes with Payload
 * mocked, and the mock honours the read's `where` the way the database does.
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/embed", () => ({ embed: vi.fn(async () => null) }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));

type Doc = Record<string, unknown>;
const project = (slug: string, over: Doc = {}): Doc => ({
	id: slug,
	name: slug,
	slug,
	category: "User-Facing App",
	shortDescription: "A self-custody wallet for Stellar.",
	status: "Live",
	types: ["Wallet"],
	updatedAt: "2026-11-22T12:00:00.000Z",
	statusAsOf: "2026-11-22T12:00:00.000Z",
	...over,
});
const ROWS: Doc[] = [
	project("coca", { name: "Coca", scfAwarded: true }),
	project("alpha-wallet"),
	project("beta-wallet"),
	project("gamma-wallet"),
	// The Draft shadow: indexed so its name keeps matching, never served.
	project("coca-wallet", {
		name: "COCA Wallet",
		status: "Draft",
		canonicalSlug: "coca",
		shortDescription: "Wallet.",
	}),
	project("eurc", { name: "EURC", status: "Draft", types: [] }),
];

/** The subset of Payload's query language these routes send. */
const matches = (d: Doc, w: unknown): boolean => {
	if (!w || typeof w !== "object") return true;
	return Object.entries(w as Record<string, unknown>).every(([k, c]) => {
		if (k === "and") return (c as unknown[]).every((x) => matches(d, x));
		if (k === "or") return (c as unknown[]).some((x) => matches(d, x));
		const v = k
			.split(".")
			.reduce<unknown>((o, part) => (o as Doc | undefined)?.[part], d);
		const op = c as Record<string, unknown>;
		if ("equals" in op) return v === op.equals;
		if ("not_equals" in op) return v !== op.not_equals;
		if ("in" in op) return (op.in as unknown[]).includes(v);
		if ("exists" in op) return (v != null && v !== "") === Boolean(op.exists);
		if ("greater_than" in op) return String(v ?? "") > String(op.greater_than);
		if ("contains" in op || "like" in op) return true;
		return true;
	});
};
const finds: Array<{ collection: string; where?: unknown }> = [];
/** Make the page fold's read of canonicals fail (a timeout, say). */
let failCanonicalRead = false;
const isCanonicalRead = (where: unknown) =>
	JSON.stringify(where ?? {}).includes('"slug":{"in"');
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		db: {
			connection: {
				db: {
					collection: () => ({
						aggregate: () => ({ toArray: async () => [] }),
					}),
				},
			},
		},
		find: vi.fn(async (args: { collection: string; where?: unknown }) => {
			finds.push(args);
			if (args.collection !== "projects") return { docs: [], totalDocs: 0 };
			if (failCanonicalRead && isCanonicalRead(args.where))
				throw new Error("read timed out");
			const docs = ROWS.filter((r) => matches(r, args.where));
			return { docs, totalDocs: docs.length };
		}),
	})),
}));

async function get(route: string, qs: string) {
	vi.resetModules();
	const { GET } = await import(`../../app/api/${route}/route`);
	const pending = GET(new NextRequest(`https://x.test/api/${route}?${qs}`));
	await vi.advanceTimersByTimeAsync(10_000);
	const res = await pending;
	return { status: res.status, body: await res.json() };
}

describe("one row per record, and no Draft row on a public surface", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv("VOYAGE_API_KEY", "");
		finds.length = 0;
		failCanonicalRead = false;
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("a paged walk serves each record once, and total is what the walk finds", async () => {
		const walked: string[] = [];
		let total = 0;
		for (let offset = 0; offset < 10; offset++) {
			const { body } = await get(
				"projects/search",
				`q=wallet&limit=1&offset=${offset}`,
			);
			total = body.meta.counts.total;
			if (!body.projects.length) break;
			walked.push(...body.projects.map((p: { slug: string }) => p.slug));
		}
		expect(walked.filter((s) => s === "coca")).toHaveLength(1);
		expect(new Set(walked).size).toBe(walked.length);
		expect(walked).toHaveLength(total);
		expect(walked).not.toContain("coca-wallet");
	});

	it("a shadow that outranks its canonical still serves the record when the fold cannot read", async () => {
		failCanonicalRead = true;
		// The shadow's exact name puts it first; its canonical matches too.
		const { body } = await get("projects/search", "q=coca+wallet&limit=10");
		const slugs = body.projects.map((p: { slug: string }) => p.slug);
		expect(slugs).toContain("coca");
		expect(slugs.filter((s: string) => s === "coca")).toHaveLength(1);
		expect(slugs).not.toContain("coca-wallet");
	});

	it("resolve does not answer found for a Draft row, but an old name still leads on", async () => {
		const { body } = await get("projects/resolve", "q=eurc");
		expect(body.found).toBe(false);
		const { body: live } = await get("projects/resolve", "q=coca");
		expect(live.found).toBe(true);
		const { body: old } = await get("projects/resolve", "q=coca-wallet");
		expect(old.found).toBe(true);
		expect(old.current.slug).toBe("coca");
	});

	it("the changes feed lists no Draft row and counts none", async () => {
		const { body } = await get(
			"changes",
			"since=2026-11-20T00:00:00Z&surfaces=projects",
		);
		const slugs = JSON.stringify(body);
		expect(slugs).not.toContain('"eurc"');
		expect(slugs).not.toContain('"coca-wallet"');
		const projectReads = finds.filter((f) => f.collection === "projects");
		expect(projectReads.length).toBeGreaterThan(0);
		for (const f of projectReads)
			expect(JSON.stringify(f.where)).toContain('"status":{"in":');
	});
});
