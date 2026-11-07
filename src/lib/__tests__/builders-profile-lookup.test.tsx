// @vitest-environment node

/**
 * /builders/<login> shows that login's profile or none. The lookup was a
 * substring (`like`) and, with no exact login among the hits, showed the
 * first one: /builders/bob served bobby's profile and titled the page with
 * it, so the not-found branch was unreachable for any part of a login. A
 * login now matches whole and in any case, as GitHub matches it.
 */
import { describe, expect, it, vi } from "vitest";

type Doc = Record<string, unknown>;
const profiles: Doc[] = ["bobby", "Dana"].map((login) => ({
	id: login,
	github_username: login,
	display_name: `Name ${login}`,
	visibility: "public",
	projects: [],
}));
type Where = Record<string, unknown>;
const matches = (d: Doc, w: Where | undefined): boolean =>
	Object.entries(w ?? {}).every(([k, c]) => {
		if (k === "and") return (c as Where[]).every((x) => matches(d, x));
		if (k === "or") return (c as Where[]).some((x) => matches(d, x));
		const v = String(d[k] ?? "");
		const op = c as Record<string, unknown>;
		if ("exists" in op)
			return (d[k] != null && d[k] !== "") === Boolean(op.exists);
		if ("equals" in op) return v === String(op.equals);
		if ("in" in op)
			return (op.in as unknown[]).some((x) =>
				x instanceof RegExp ? x.test(v) : String(x) === v,
			);
		if ("like" in op)
			return v.toLowerCase().includes(String(op.like).toLowerCase());
		throw new Error(`unsupported where on ${k}: ${JSON.stringify(c)}`);
	});
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: {
			collection: string;
			where?: Where;
			limit?: number;
		}) => {
			const rows = args.collection === "builders" ? profiles : [];
			const hit = rows.filter((d) => matches(d, args.where));
			const docs = args.limit ? hit.slice(0, args.limit) : hit;
			return {
				docs,
				totalDocs: hit.length,
				hasNextPage: docs.length < hit.length,
			};
		},
	})),
}));

const page = () => import("@/app/(frontend)/builders/[username]/page");
const title = async (username: string) =>
	(
		await (
			await page()
		).generateMetadata({ params: Promise.resolve({ username }) })
	).title;

describe("/builders/<login> matches the whole login, in any case", () => {
	it("is not found for a part of another login", async () => {
		expect(await title("bob")).toBe("Builder Not Found");
		expect(await title("b")).toBe("Builder Not Found");
	});

	it("finds a login in any case, as GitHub does", async () => {
		expect(await title("bobby")).toBe("Name bobby | Stellar Builders");
		expect(await title("BOBBY")).toBe("Name bobby | Stellar Builders");
		expect(await title("dana")).toBe("Name Dana | Stellar Builders");
	});

	it("answers 404 rather than another person's page", async () => {
		const { default: BuilderProfilePage } = await page();
		await expect(
			BuilderProfilePage({ params: Promise.resolve({ username: "bob" }) }),
		).rejects.toMatchObject({ digest: expect.stringContaining("404") });
	});
});
