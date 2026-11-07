// @vitest-environment node

/**
 * Builder profiles are served only when public. The visibility field allows
 * public and private, so the old `not_equals: "hidden"` filter listed private
 * profiles on /builders and showed them at /builders/<login>; the home page's
 * Top Builders read Passport with no filter at all.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;
const profile = (login: string, visibility: string): Doc => ({
	id: login,
	github_username: login,
	display_name: `Name ${login}`,
	visibility,
	projects: [],
	stats: { totalCommits30d: 3 },
});
const state = {
	mirror: [profile("pubdev", "public"), profile("privdev", "private")],
	passport: [profile("pubdev", "public"), profile("privdev", "private")],
};

type Where = Record<string, unknown>;
const matches = (d: Doc, w: Where | undefined): boolean =>
	Object.entries(w ?? {}).every(([k, c]) => {
		if (k === "and") return (c as Where[]).every((x) => matches(d, x));
		if (k === "or") return (c as Where[]).some((x) => matches(d, x));
		const v = String(d[k] ?? "");
		const op = c as Record<string, unknown>;
		// Payload: exists means present, not null and not empty
		if ("exists" in op)
			return (d[k] != null && d[k] !== "") === Boolean(op.exists);
		if ("equals" in op) return v === String(op.equals);
		if ("not_equals" in op) return v !== String(op.not_equals);
		if ("like" in op)
			return v.toLowerCase().includes(String(op.like).toLowerCase());
		if ("in" in op)
			return (op.in as unknown[]).some((x) =>
				x instanceof RegExp ? x.test(v) : String(x) === v,
			);
		throw new Error(`unsupported where on ${k}: ${JSON.stringify(c)}`);
	});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: { collection: string; where?: Where }) => {
			const rows = args.collection === "builders" ? state.mirror : [];
			const docs = rows.filter((d) => matches(d, args.where));
			return { docs, totalDocs: docs.length, hasNextPage: false };
		},
	})),
}));
vi.mock("@/lib/integrations/stellar-passport", async (orig) => ({
	...(await orig<typeof import("@/lib/integrations/stellar-passport")>()),
	fetchAllBuilders: vi.fn(async () => state.passport),
}));

describe("only public builder profiles are served", () => {
	it("/builders lists and counts public profiles only", async () => {
		// the mirror alone: an empty fallback, so a failed mirror read cannot pass
		const passport = state.passport;
		state.passport = [];
		const { default: BuildersPage } = await import(
			"@/app/(frontend)/builders/page"
		);
		const html = renderToStaticMarkup(await BuildersPage());
		state.passport = passport;
		expect(html).toContain("/builders/pubdev");
		expect(html).not.toContain("privdev");
		expect(html).toContain("1 developers building on Stellar");
	});

	it("/builders falls back to Passport without its private profiles", async () => {
		const mirror = state.mirror;
		state.mirror = [];
		const { default: BuildersPage } = await import(
			"@/app/(frontend)/builders/page"
		);
		const html = renderToStaticMarkup(await BuildersPage());
		state.mirror = mirror;
		expect(html).toContain("/builders/pubdev");
		expect(html).not.toContain("privdev");
	});

	it("/builders/<login> does not show a private profile", async () => {
		const { generateMetadata } = await import(
			"@/app/(frontend)/builders/[username]/page"
		);
		const meta = (username: string) =>
			generateMetadata({ params: Promise.resolve({ username }) });
		expect((await meta("privdev")).title).toBe("Builder Not Found");
		expect(String((await meta("pubdev")).title)).toContain("Name pubdev");
	});

	it("Payload's REST and GraphQL read public profiles only, unless an admin asks", async () => {
		// /api/builders/<id>, /api/builders/count and /api/graphql answer anyone
		const { default: Builders } = await import("@/collections/Builders");
		const read = Builders.access?.read as (a: unknown) => unknown;
		const as = (user: unknown) => read({ req: { user } });
		const { PUBLIC_BUILDERS } = await import(
			"@/lib/integrations/stellar-passport"
		);
		expect(as(null)).toEqual(PUBLIC_BUILDERS);
		expect(as({ collection: "partner-accounts" })).toEqual(PUBLIC_BUILDERS);
		expect(as({ collection: "users" })).toBe(true);
	});

	it("the home page's Top Builders shows public profiles only", async () => {
		const { default: TopBuildersSection } = await import(
			"@/components/top-builders-section"
		);
		const html = renderToStaticMarkup(await TopBuildersSection());
		expect(html).toContain("pubdev");
		expect(html).not.toContain("privdev");
	});
});
