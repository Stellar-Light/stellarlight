/**
 * GET /api/verify resolves its subject through the same resolver as
 * /api/projects/resolve. A Draft row is admin-only: verify must not answer
 * about one, and must still follow an old name to its published record.
 * Lives in src/lib so CI runs it; Payload is mocked and honours `where`.
 */
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@payload-config", () => ({ default: {} }));

type Doc = Record<string, unknown>;
const ROWS: Doc[] = [
	{ id: "1", slug: "coca", name: "Coca", status: "Live" },
	{
		id: "2",
		slug: "coca-wallet",
		name: "COCA Wallet",
		status: "Draft",
		canonicalSlug: "coca",
	},
	{ id: "3", slug: "eurc", name: "EURC", status: "Draft" },
];
const matches = (d: Doc, w: unknown): boolean => {
	if (!w || typeof w !== "object") return true;
	return Object.entries(w as Record<string, unknown>).every(([k, c]) => {
		if (k === "and") return (c as unknown[]).every((x) => matches(d, x));
		if (k === "or") return (c as unknown[]).some((x) => matches(d, x));
		const v = d[k];
		const op = c as Record<string, unknown>;
		if ("equals" in op) return v === op.equals;
		if ("in" in op) return (op.in as unknown[]).includes(v);
		if ("exists" in op) return (v != null && v !== "") === Boolean(op.exists);
		return true;
	});
};
vi.mock("payload", () => ({
	getPayload: vi.fn(async () => ({
		find: vi.fn(async (args: { collection: string; where?: unknown }) => {
			const docs =
				args.collection === "projects"
					? ROWS.filter((r) => matches(r, args.where))
					: [];
			return { docs, totalDocs: docs.length };
		}),
	})),
}));

async function verify(qs: string) {
	vi.resetModules();
	const { GET } = await import("../../app/api/verify/route");
	const res = await GET(new NextRequest(`https://x.test/api/verify?${qs}`));
	return res.json();
}

describe("verify reads no Draft row", () => {
	it("a Draft subject is unresolved", async () => {
		const body = await verify("type=live&subject=eurc");
		expect(body.verdict).toBe("unresolved");
	});

	it("an old name is verified against the record it was merged into", async () => {
		const body = await verify("type=live&subject=coca-wallet");
		expect(body.verdict).not.toBe("unresolved");
		expect(JSON.stringify(body)).toContain('"coca"');
	});
});
