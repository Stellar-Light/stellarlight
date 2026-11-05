/** Re-check 2026-11-05: the admin relevance scorer gave Benji and WisdomTree
 * TVL points from figures hard-coded in March 2026 (625,861,896 and
 * 20,000,000: +35 and +25) and wrote relevanceScore, which the directory
 * sorts by. TVL points come only from a DefiLlama reading. */
import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";

vi.mock("@payload-config", () => ({ default: {} }));
vi.mock("@/lib/admin-auth", () => ({
	isAdminRequest: vi.fn(async () => true),
}));
const project = (id: string, name: string) => ({
	id,
	name,
	status: "Live",
	relevanceScore: 0,
});
const find = vi.fn(async (args: { collection: string }) => ({
	docs:
		args.collection === "projects"
			? [
					project("1", "Benji"),
					project("2", "WisdomTree"),
					project("3", "Control"),
				]
			: [],
	hasNextPage: false,
}));
const update = vi.fn();
vi.mock("payload", () => ({
	getPayload: vi.fn(async () => ({ find, update })),
}));
// DefiLlama lists none of the three: no TVL reading for any of them.
vi.stubGlobal(
	"fetch",
	vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
);

const { POST } = await import("@/app/api/admin/score-projects/route");

it("Benji and WisdomTree score what an identical project with no TVL reading scores", async () => {
	const res = await POST(
		new NextRequest("https://stellarlight.xyz/api/admin/score-projects?dry=1", {
			method: "POST",
		}),
	);
	const body = await res.json();
	const to = Object.fromEntries(
		(body.scores as Array<{ name: string; to: number }>).map((s) => [
			s.name,
			s.to,
		]),
	);
	expect(to.Control).toBeGreaterThan(0);
	expect(to.Benji).toBe(to.Control);
	expect(to.WisdomTree).toBe(to.Control);
	expect(update).not.toHaveBeenCalled(); // a dry run writes nothing
});
