import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Who the session belongs to, per test. `users` is an admin; any other auth
// collection (the partner portal) also sets req.user and must be denied.
let sessionUser: { collection: string } | null = null;
const authSpy = vi.fn(async () => ({ user: sessionUser }));

vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ auth: authSpy })),
}));

// The handlers' own Payload: empty collections, and every write recorded so a
// denied request can be shown to write nothing.
const writes = vi.fn();
vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("payload", () => ({
	getPayload: vi.fn(async () => ({
		find: async () => ({ docs: [], totalDocs: 0, hasNextPage: false }),
		update: async (a: unknown) => writes("update", a),
		delete: async (a: unknown) => writes("delete", a),
		create: async (a: unknown) => writes("create", a),
	})),
}));

// The retired query values, assembled at runtime so the literals are not
// committed again. Each route used to accept `?secret=<prefix>123`.
const ROUTES: Record<string, string> = {
	"cleanup-projects": "cleanup",
	"fix-descriptions": "fixdesc",
	"fix-entities": "entity",
	"score-projects": "tag",
	"tag-projects": "tag",
};
const retired = (route: string) => `${ROUTES[route]}${100 + 23}`;

const GOOD_SECRET = "s".repeat(40);

type Handler = (req: NextRequest) => Promise<Response>;
const load = async (route: string) =>
	(await import(`../${route}/route`)) as Record<string, Handler | undefined>;

const call = async (
	route: string,
	{ qs = "", headers = {} }: { qs?: string; headers?: Record<string, string> },
) => {
	const mod = await load(route);
	const req = new NextRequest(`https://x.test/api/admin/${route}?dry=1${qs}`, {
		method: "POST",
		headers,
	});
	// A missing POST export is a failure, not a pass.
	expect(typeof mod.POST).toBe("function");
	return (mod.POST as Handler)(req);
};

beforeEach(() => {
	sessionUser = null;
	writes.mockClear();
	authSpy.mockClear();
	delete process.env.ADMIN_ROUTE_SECRET;
});
afterEach(() => {
	delete process.env.ADMIN_ROUTE_SECRET;
});

describe.each(Object.keys(ROUTES))("/api/admin/%s", (route) => {
	it("no longer serves GET, so a link cannot trigger a write", async () => {
		const mod = await load(route);
		expect(mod.GET).toBeUndefined();
	});

	it("denies a request with no auth", async () => {
		const res = await call(route, {});
		expect(res.status).toBe(401);
		expect(writes).not.toHaveBeenCalled();
	});

	it("denies the retired query secret", async () => {
		const res = await call(route, { qs: `&secret=${retired(route)}` });
		expect(res.status).toBe(401);
	});

	it("denies the env secret when it arrives in the query string", async () => {
		process.env.ADMIN_ROUTE_SECRET = GOOD_SECRET;
		const res = await call(route, { qs: `&secret=${GOOD_SECRET}` });
		expect(res.status).toBe(401);
	});

	it("denies a signed-in partner", async () => {
		sessionUser = { collection: "partner-accounts" };
		const res = await call(route, {});
		expect(res.status).toBe(401);
		expect(writes).not.toHaveBeenCalled();
	});

	it("allows an admin session", async () => {
		sessionUser = { collection: "users" };
		const res = await call(route, {});
		expect(res.status).toBe(200);
	});

	it("allows the env secret in the header when it is set", async () => {
		process.env.ADMIN_ROUTE_SECRET = GOOD_SECRET;
		const res = await call(route, {
			headers: { "x-admin-secret": GOOD_SECRET },
		});
		expect(res.status).toBe(200);
	});

	it("denies the header when the env secret is unset", async () => {
		const res = await call(route, {
			headers: { "x-admin-secret": GOOD_SECRET },
		});
		expect(res.status).toBe(401);
	});

	it("denies a wrong header value", async () => {
		process.env.ADMIN_ROUTE_SECRET = GOOD_SECRET;
		const res = await call(route, {
			headers: { "x-admin-secret": `${GOOD_SECRET}x` },
		});
		expect(res.status).toBe(401);
	});
});

describe("isAdminRequest", () => {
	it("compares the header in constant time", async () => {
		const tse = vi.spyOn(crypto, "timingSafeEqual");
		process.env.ADMIN_ROUTE_SECRET = GOOD_SECRET;
		const { isAdminRequest } = await import("@/lib/admin-auth");
		expect(
			await isAdminRequest(new Headers({ "x-admin-secret": "wrong" })),
		).toBe(false);
		expect(tse).toHaveBeenCalledTimes(1);
		tse.mockRestore();
	});

	it("treats a short env secret as unset", async () => {
		process.env.ADMIN_ROUTE_SECRET = "short";
		const { isAdminRequest } = await import("@/lib/admin-auth");
		expect(
			await isAdminRequest(new Headers({ "x-admin-secret": "short" })),
		).toBe(false);
	});

	it("denies when Payload cannot load or auth throws", async () => {
		const { getPayloadSafe } = await import("@/lib/payload-client");
		const { isAdminRequest } = await import("@/lib/admin-auth");
		vi.mocked(getPayloadSafe).mockResolvedValueOnce(null);
		expect(await isAdminRequest(new Headers())).toBe(false);
		authSpy.mockRejectedValueOnce(new Error("bad token"));
		sessionUser = { collection: "users" };
		expect(await isAdminRequest(new Headers())).toBe(false);
	});
});
