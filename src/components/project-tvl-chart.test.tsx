// @vitest-environment jsdom

/**
 * Re-check 2026-11-05: /api/defillama/protocol/{slug} serves null for a
 * figure, change or history it did not read, and the project page's TVL card
 * called .map and .toFixed on those nulls. With no error boundary that blanked
 * /project/wisdomtree always, and /project/benji when its Horizon read fails.
 * Each null shape renders: no history means no chart, and a null figure or
 * change reads Unavailable.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectTVLChart } from "./project-tvl-chart";

// visx measures its parent with ResizeObserver; the card is what is tested.
vi.mock("@/components/charts/area-chart", () => ({
	AreaChart: () => <div data-testid="tvl-chart" />,
}));
vi.mock("@/components/charts/area", () => ({ Area: () => null }));
vi.mock("@/components/charts/grid", () => ({ Grid: () => null }));
vi.mock("@/components/charts/x-axis", () => ({ XAxis: () => null }));
vi.mock("@/components/charts/tooltip", () => ({ ChartTooltip: () => null }));

const base = {
	found: true,
	logo: null,
	category: "RWA",
	change7d: null,
	asOf: null,
};
const series = [
	{ date: 1_761_955_200_000, tvl: 120_000_000 },
	{ date: 1_762_041_600_000, tvl: 129_334_939 },
];

function renderWith(status: number, body: unknown) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(JSON.stringify(body), { status })),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={client}>
			<ProjectTVLChart projectSlug="x" />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("the project TVL card renders every shape the route serves", () => {
	it("Benji from Horizon: the figure, its date, its source and how it is counted", async () => {
		renderWith(200, {
			...base,
			name: "Benji (Franklin Templeton FOBXX)",
			slug: "benji",
			currentTVL: 1_150_573_431.9,
			change1d: null,
			change7d: null,
			historicalTVL: null,
			asOf: "2026-11-07T12:00:00.000Z",
			sourceUrl:
				"https://horizon.stellar.org/assets?asset_code=BENJI&asset_issuer=GBHNGLLIE3KWGKCHIKMHJ5HVZHYIK7WTBE4QF5PLAKL4CJGSEU7HZIW5",
			method: "Stellar token supply at $1.00 per share",
		});
		expect(await screen.findByText("$1.15B")).toBeTruthy();
		expect(screen.queryByTestId("tvl-chart")).toBeNull();
		expect(
			screen.getByRole("link", { name: "horizon.stellar.org" }),
		).toBeTruthy();
		expect(
			screen.getByText(/Stellar token supply at \$1\.00 per share/),
		).toBeTruthy();
	});

	it("WisdomTree (no figure on record): Unavailable, its own source named", async () => {
		renderWith(200, {
			...base,
			name: "WisdomTree",
			slug: "wisdomtree",
			currentTVL: null,
			change1d: null,
			historicalTVL: null,
			sourceUrl: "https://www.wisdomtree.com/investments/digital-funds",
		});
		expect(await screen.findByText("Unavailable")).toBeTruthy();
		expect(screen.getByRole("link", { name: "wisdomtree.com" })).toBeTruthy();
	});

	it("a DefiLlama series with no Stellar figure or 24h change: chart, Unavailable twice", async () => {
		renderWith(200, {
			...base,
			category: "Lending",
			name: "Quiet",
			slug: "quiet",
			currentTVL: null,
			change1d: null,
			change7d: -2,
			historicalTVL: series,
			asOf: "2025-11-02T00:00:00.000Z",
		});
		expect(await screen.findByTestId("tvl-chart")).toBeTruthy();
		expect(screen.getAllByText("Unavailable")).toHaveLength(2);
		expect(screen.getByText("-2.00%")).toBeTruthy();
		// No source page: DefiLlama is named, never linked to a page built
		// from the slug (#1912: that page could be another protocol's).
		expect(screen.getByText(/Data from DeFi Llama/)).toBeTruthy();
		expect(screen.queryByRole("link")).toBeNull();
	});

	// #1912 (2026-11-11): the card is the project's own row, as its API row
	// serves it.
	it("a linked row with no Stellar figure reads No figure with its dated reason, never Unavailable or 0", async () => {
		const why =
			"DefiLlama lists spiko but publishes no Stellar TVL figure for it (checked 2026-11-11).";
		renderWith(200, {
			...base,
			name: "Spiko",
			slug: "spiko",
			currentTVL: null,
			change1d: null,
			historicalTVL: [],
			asOf: "2026-11-11T22:47:04.000Z",
			stale: null,
			unavailable: why,
			sourceUrl: "https://defillama.com/protocol/spiko",
		});
		expect(await screen.findByText("No figure")).toBeTruthy();
		expect(screen.getByText(why)).toBeTruthy();
		expect(screen.queryByText("Unavailable")).toBeNull();
		expect(screen.queryByText(/\$0/)).toBeNull();
		expect(screen.getByRole("link", { name: "defillama.com" })).toBeTruthy();
	});

	it("an old row figure says it is older than 14 days", async () => {
		renderWith(200, {
			...base,
			name: "Sentora",
			slug: "sentora",
			currentTVL: 10_393_904,
			change1d: null,
			historicalTVL: null,
			asOf: "2026-08-10T06:16:01.283Z",
			stale: true,
			unavailable: null,
			sourceUrl: "https://defillama.com/protocol/stellar-defi-hub",
		});
		expect(await screen.findByText("$10.39M")).toBeTruthy();
		expect(
			screen.getByText("as of 2026-08-10, older than 14 days"),
		).toBeTruthy();
	});

	it("a multi-protocol row names its sum and its page; a weekly figure shows no change tiles", async () => {
		renderWith(200, {
			...base,
			name: "Blend",
			slug: "blend",
			currentTVL: 115_148_044,
			change1d: null,
			change7d: null,
			historicalTVL: series,
			asOf: "2026-11-09T13:44:29.805Z",
			stale: false,
			unavailable: null,
			sourceUrl: "https://defillama.com/protocol/blend",
			method:
				"the sum of 4 DefiLlama protocols: blend-pools, blend-pools-v2, blend-backstop, blend-backstop-v2",
		});
		expect(await screen.findByText("$115.15M")).toBeTruthy();
		expect(screen.getByTestId("tvl-chart")).toBeTruthy();
		expect(screen.queryByText("24h Change")).toBeNull();
		expect(screen.queryByText("Unavailable")).toBeNull();
		expect(screen.getByText(/the sum of 4 DefiLlama protocols/)).toBeTruthy();
		expect(screen.getByRole("link", { name: "defillama.com" })).toBeTruthy();
	});

	it("a full reading shows its figure, its changes and the date it was read", async () => {
		renderWith(200, {
			...base,
			category: "Lending",
			name: "Blend",
			slug: "blend-pools",
			currentTVL: 129_334_939,
			change1d: 1.5,
			change7d: -2,
			historicalTVL: series,
			asOf: "2025-11-02T00:00:00.000Z",
		});
		expect(await screen.findByText("$129.33M")).toBeTruthy();
		expect(screen.getByText("as of 2025-11-02")).toBeTruthy();
		expect(screen.getByText("+1.50%")).toBeTruthy();
		expect(screen.queryByText("Unavailable")).toBeNull();
	});

	it("a failed source read (503) hides the card", async () => {
		const { container } = renderWith(503, { error: "TVL source read failed" });
		await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
		expect(container.textContent).toBe("");
	});
});
