import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Payload's JWT strategy resolves a token from any auth collection, so a
// partner token sets req.user exactly like an admin token. The fake maps the
// Authorization header the way Payload would: an admin JWT to a `users` user,
// a partner JWT to a `partner-accounts` user, anything else to nobody.
let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const userFor = (h: Headers) => {
	const a = h.get("authorization");
	if (a === "Bearer admin-jwt") return { collection: "users" };
	if (a === "Bearer partner-jwt") return { collection: "partner-accounts" };
	return null;
};
const writes = vi.fn();
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("payload", () => ({
	getPayload: vi.fn(async () => ({
		auth: async ({ headers }: { headers: Headers }) => ({
			user: userFor(headers),
		}),
		find: async () => ({ docs: [], totalDocs: 0 }),
		findByID: async () => ({ id: "f1", name: "feed", enabled: true }),
		create: async (a: unknown) => writes("create", a),
		update: async (a: unknown) => writes("update", a),
		jobs: {
			queue: async () => ({ id: "j1", queue: "default" }),
			run: async () => writes("run"),
		},
	})),
}));
vi.mock("@/lib/integrations/stellar-passport", () => ({
	fetchAllBuilders: async () => [],
	fetchBuilder: async () => null,
	transformBuilderForPayload: (b: unknown) => b,
}));
vi.mock("simple-git", () => ({
	simpleGit: () => {
		throw new Error("no network in tests");
	},
}));

// Lumenloop reads a local checkout when LUMENLOOP_PATH exists; an empty one
// keeps the allowed path offline.
const lumenloopDir = mkdtempSync(join(tmpdir(), "lumenloop-"));
mkdirSync(join(lumenloopDir, "projects"));
process.env.LUMENLOOP_PATH = lumenloopDir;

const CRON = "c".repeat(40);

type Call = () => Promise<Response>;
const routes: Record<string, Call> = {
	"sync/builders (POST)": async () => {
		const { POST } = await import("../builders/route");
		return POST(new NextRequest("https://x.test/api/sync/builders"));
	},
	"sync/lumenloop": async () => {
		const { POST } = await import("../lumenloop/route");
		return POST(new Request("https://x.test/api/sync/lumenloop"));
	},
	"sync/rss": async () => {
		const { POST } = await import("../rss/route");
		return POST();
	},
	"sync/rss/[id]": async () => {
		const { POST } = await import("../rss/[id]/route");
		return POST(new Request("https://x.test/api/sync/rss/f1"), {
			params: Promise.resolve({ id: "f1" }),
		});
	},
};
const as = (auth: string | null) => {
	requestHeaders = new Headers(auth ? { authorization: auth } : {});
};

beforeEach(() => {
	writes.mockClear();
	process.env.CRON_SECRET = CRON;
	delete process.env.SYNC_API_KEY;
});

describe.each(Object.keys(routes))("/api/%s", (name) => {
	const run = routes[name];

	it("denies a request with no auth", async () => {
		as(null);
		expect((await run()).status).toBe(401);
	});

	it("denies a signed-in partner", async () => {
		as("Bearer partner-jwt");
		expect((await run()).status).toBe(401);
		expect(writes).not.toHaveBeenCalled();
	});

	it("allows an admin session (Payload JWT as a Bearer token)", async () => {
		as("Bearer admin-jwt");
		expect((await run()).status).toBe(200);
	});
});

describe("/api/sync/builders env bearer", () => {
	const get = async () => {
		const { GET } = await import("../builders/route");
		return GET(new NextRequest("https://x.test/api/sync/builders"));
	};

	it("keeps the CRON_SECRET bearer that the daily cron sends", async () => {
		as(`Bearer ${CRON}`);
		expect((await get()).status).toBe(200);
	});

	it("keeps SYNC_API_KEY when CRON_SECRET is unset", async () => {
		delete process.env.CRON_SECRET;
		process.env.SYNC_API_KEY = "k".repeat(40);
		as(`Bearer ${"k".repeat(40)}`);
		expect((await get()).status).toBe(200);
	});

	it("denies a wrong bearer", async () => {
		as(`Bearer ${CRON}x`);
		expect((await get()).status).toBe(401);
	});

	it("denies a partner on GET too", async () => {
		as("Bearer partner-jwt");
		expect((await get()).status).toBe(401);
	});

	it("denies any bearer when neither env value is set", async () => {
		delete process.env.CRON_SECRET;
		as("Bearer undefined");
		expect((await get()).status).toBe(401);
	});
});
