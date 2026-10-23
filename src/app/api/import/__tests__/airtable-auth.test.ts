import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// POST /api/import/airtable writes projects. It had no auth check at all; the
// admin panel button calls it with the admin session cookie.
let sessionUser: { collection: string } | null = null;
const writes = vi.fn();
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		auth: async () => ({ user: sessionUser }),
		find: async () => ({ docs: [], totalDocs: 0 }),
		create: async (a: unknown) => writes("create", a),
		update: async (a: unknown) => writes("update", a),
	})),
}));
const airtableSelect = vi.fn(() => ({ all: async () => [] }));
vi.mock("airtable", () => ({
	default: class {
		base() {
			return () => ({ select: airtableSelect });
		}
	},
}));

const post = async () => {
	const { POST } = await import("../airtable/route");
	return POST(
		new NextRequest("https://x.test/api/import/airtable", { method: "POST" }),
	);
};

beforeEach(() => {
	sessionUser = null;
	airtableSelect.mockClear();
	delete process.env.ADMIN_ROUTE_SECRET;
	process.env.AIRTABLE_API_KEY = "test-key";
	process.env.AIRTABLE_BASE_ID = "b";
	process.env.AIRTABLE_TABLE_ID = "t";
	process.env.AIRTABLE_VIEW_ID = "v";
});

describe("/api/import/airtable", () => {
	it("denies a request with no auth before touching Airtable", async () => {
		expect((await post()).status).toBe(401);
		expect(airtableSelect).not.toHaveBeenCalled();
	});

	it("denies a signed-in partner", async () => {
		sessionUser = { collection: "partner-accounts" };
		expect((await post()).status).toBe(401);
		expect(airtableSelect).not.toHaveBeenCalled();
	});

	it("allows an admin session", async () => {
		sessionUser = { collection: "users" };
		expect((await post()).status).toBe(200);
		expect(airtableSelect).toHaveBeenCalled();
	});
});
