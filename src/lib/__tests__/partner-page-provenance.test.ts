// @vitest-environment node

/**
 * /partners/<slug> says "verified" only for what a recorded check verified
 * (#1909). The Bitso and Honey Coin pages showed "stellar.toml verified" and
 * "Verified from this partner's stellar.toml (SEP-1)" over curated
 * capabilities: both records hold no stellar.toml source URL and no fetch
 * date, and the page keyed both labels on the capabilities being present.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";

let current: Record<string, unknown> = {};
/** What the directory's unpinned listing read returns. */
let listing: Record<string, unknown>[] = [];
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		// The profile's own read pins its slug; the related-partner and
		// matching-project reads find nothing.
		find: async ({
			collection,
			where,
		}: {
			collection: string;
			where: unknown;
		}) => {
			if (collection !== "partner-accounts") return { docs: [] };
			const w = JSON.stringify(where);
			if (w.includes(`{"equals":"${current.slug}"}`))
				return { docs: [current] };
			return { docs: w.includes('"slug"') ? [] : listing };
		},
	})),
}));

const anchor = (over: Record<string, unknown>) => ({
	slug: "anchor-x",
	name: "Anchor X",
	partnerType: "anchor",
	status: "published",
	tagline: "Fiat ramp",
	freshnessStatus: "aging",
	regions: ["latam"],
	sectors: ["payments"],
	assets: [{ code: "USDC" }],
	seps: [],
	rampTypes: ["on-ramp", "off-ramp"],
	tomlSourceUrl: null,
	tomlFetchedAt: null,
	...over,
});
const render = async (doc: Record<string, unknown>) => {
	current = doc;
	const { default: Page } = await import(
		"@/app/(frontend)/partners/[slug]/page"
	);
	return renderToStaticMarkup(
		await Page({ params: Promise.resolve({ slug: String(doc.slug) }) }),
	);
};
const BADGE = "stellar.toml verified";

// Heavy modules: import them once, with room for a loaded machine, so no
// single test pays the cold import inside its 5 s limit.
beforeAll(async () => {
	await import("@/app/(frontend)/partners/[slug]/page");
	await import("@/app/(frontend)/partners/page");
}, 60_000);
const TOML_HEADING = "stellar.toml (SEP-1)";

describe("partner page verification labels", () => {
	it("labels curated capabilities as curated when no fetch is recorded", async () => {
		const html = await render(anchor({}));
		expect(html).not.toContain(BADGE);
		expect(html).not.toContain(TOML_HEADING);
		expect(html).toContain("Curated by Stellar Light");
		// The curated claim is still shown, under its own label.
		expect(html).toContain("USDC");
	});

	it.each([
		[
			"a source URL but no fetch date",
			{ tomlSourceUrl: "https://x.example/.well-known/stellar.toml" },
		],
		["a fetch date but no source URL", { tomlFetchedAt: "2026-09-29" }],
	])("never verifies on %s", async (_, over) => {
		const html = await render(anchor(over));
		expect(html).not.toContain(BADGE);
		expect(html).not.toContain(TOML_HEADING);
	});

	it("verifies from stellar.toml when the fetch is recorded, and keeps ramps apart", async () => {
		const html = await render(
			anchor({
				seps: ["sep-24"],
				tomlSourceUrl: "https://x.example/.well-known/stellar.toml",
				tomlFetchedAt: "2026-09-29",
			}),
		);
		expect(html).toContain(BADGE);
		expect(html).toContain(TOML_HEADING);
		expect(html).toContain("read 2026-09-29");
		expect(html).toContain("Ramp directions as recorded");
		expect(html).not.toContain("Curated by Stellar Light");
	});

	it("labels curated compliance facts as curated, not verified", async () => {
		const html = await render(
			anchor({ compliance: { kycRequired: true, currencies: "MXN, USD" } }),
		);
		expect(html).toContain("Compliance &amp; corridors");
		expect(html).not.toMatch(/Verified from the partner/);
		expect(html).toContain("Curated from the partner&#x27;s own disclosures");
	});
});

describe("partner directory cards", () => {
	it("show asset chips only for a recorded stellar.toml read", async () => {
		listing = [
			anchor({
				slug: "anchor-curated",
				contactEmail: "a@curated.example",
				assets: [{ code: "CURATEDCOIN" }],
			}),
			anchor({
				slug: "anchor-half",
				contactEmail: "a@half.example",
				assets: [{ code: "HALFCOIN" }],
				tomlFetchedAt: "2026-09-29",
			}),
			anchor({
				slug: "anchor-read",
				contactEmail: "a@read.example",
				assets: [{ code: "TOMLCOIN" }],
				tomlSourceUrl: "https://read.example/.well-known/stellar.toml",
				tomlFetchedAt: "2026-09-29",
			}),
		];
		const { default: Directory } = await import(
			"@/app/(frontend)/partners/page"
		);
		const html = renderToStaticMarkup(await Directory());
		expect(html).toContain("anchor-read");
		expect(html).toContain("TOMLCOIN");
		expect(html).not.toContain("CURATEDCOIN");
		expect(html).not.toContain("HALFCOIN");
		listing = [];
	});
});
