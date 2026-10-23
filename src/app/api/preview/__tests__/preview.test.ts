import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The preview route turns on Next draft mode, which shows unpublished blog
// posts. It used to take Payload's JWT signing secret in the query string;
// it now takes the editor's admin session instead.
let sessionUser: { collection: string } | null = null;
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		auth: async () => ({ user: sessionUser }),
	})),
}));
const enable = vi.fn();
vi.mock("next/headers", () => ({
	draftMode: async () => ({ enable, disable: vi.fn() }),
}));
vi.mock("next/navigation", () => ({
	redirect: (to: string) =>
		new Response(null, { status: 307, headers: { location: to } }),
}));

const SIGNING = "p".repeat(40);

const get = async (qs: string) => {
	const { GET } = await import("../route");
	const res = await GET(new NextRequest(`https://x.test/api/preview?${qs}`));
	return res ?? new Response(null, { status: 307 });
};

beforeEach(() => {
	sessionUser = null;
	enable.mockClear();
	process.env.PAYLOAD_SECRET = SIGNING;
	delete process.env.ADMIN_ROUTE_SECRET;
});

describe("/api/preview", () => {
	it("denies the old style request that carries the signing secret", async () => {
		const res = await get(`secret=${SIGNING}&slug=post`);
		expect(res.status).toBe(401);
		expect(enable).not.toHaveBeenCalled();
	});

	it("denies a request with no auth", async () => {
		expect((await get("slug=post")).status).toBe(401);
		expect(enable).not.toHaveBeenCalled();
	});

	it("denies a signed-in partner", async () => {
		sessionUser = { collection: "partner-accounts" };
		expect((await get("slug=post")).status).toBe(401);
		expect(enable).not.toHaveBeenCalled();
	});

	it("allows an admin session and turns on draft mode", async () => {
		sessionUser = { collection: "users" };
		await get("slug=post");
		expect(enable).toHaveBeenCalledTimes(1);
	});

	it("still asks for a slug", async () => {
		sessionUser = { collection: "users" };
		expect((await get("")).status).toBe(400);
	});
});

describe("Blog preview URL", () => {
	it("never carries a secret", async () => {
		const { Blog } = await import("@/collections/Blog");
		const preview = Blog.admin?.preview as (doc: unknown) => string | null;
		const url = preview({ slug: "post" }) ?? "";
		expect(url).toContain("/api/preview?slug=post");
		expect(url).not.toContain("secret");
		expect(url).not.toContain(SIGNING);
	});
});
