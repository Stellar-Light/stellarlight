// @vitest-environment jsdom

/**
 * Review 2026-11-04: the homepage TVL cards invented figures when a read
 * failed. RWA TVL showed 1,688,000,000 (a March 2026 number) when
 * /api/rwa-tvl failed or sent no figure, and DeFi TVL showed $0 when the
 * DefiLlama read failed or had no Stellar row. Unknown is shown as unknown,
 * with the reading's date when there is one.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TVLStats from "./tvl-stats";

// The ticker animates with requestAnimationFrame; its target is the figure.
vi.mock("@/components/fancy/text/basic-number-ticker", () => ({
	default: ({ target }: { target: number }) => <span>{target}</span>,
}));

const json = (body: unknown, status = 200) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

function renderWith(byUrl: Record<string, () => Response>) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => byUrl[url]?.() ?? json({}, 404)),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<TVLStats />
		</QueryClientProvider>,
	);
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("TVL cards never show an invented figure", () => {
	it("failed reads show Unavailable on both cards", async () => {
		renderWith({
			"https://api.llama.fi/chains": () => json({ error: "down" }, 500),
			"https://api.llama.fi/protocols": () => json({ error: "down" }, 500),
			"/api/rwa-tvl": () => json({ error: "rwa.xyz read failed" }, 503),
		});
		expect(await screen.findAllByText("Unavailable")).toHaveLength(2);
		expect(document.body.textContent).not.toMatch(/1\.688|\$0(?![.\d])/);
	});

	it("reads that succeed without the figure show Unavailable too", async () => {
		renderWith({
			"https://api.llama.fi/chains": () => json([{ name: "Ethereum", tvl: 5 }]),
			"https://api.llama.fi/protocols": () => json([]),
			"/api/rwa-tvl": () => json({ topIssuers: [], totalAssets: 0 }),
		});
		expect(await screen.findAllByText("Unavailable")).toHaveLength(2);
	});

	it("a dated reading shows its figure and its date", async () => {
		renderWith({
			"https://api.llama.fi/chains": () =>
				json([{ name: "Stellar", tvl: 120_000_000 }]),
			"https://api.llama.fi/protocols": () => json([]),
			"/api/rwa-tvl": () =>
				json({
					tvl: 1_200_000_000,
					topIssuers: [],
					totalAssets: 3,
					asOf: "2026-11-04T10:00:00.000Z",
					cached: true,
				}),
		});
		expect(await screen.findByText("as of 2026-11-04")).toBeTruthy();
		expect(screen.queryAllByText("Unavailable")).toHaveLength(0);
	});
});
