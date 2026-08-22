import type { Metadata } from "next";
import {
	type CoinView,
	StablecoinExplorer,
} from "@/components/stablecoin-explorer";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	docToEntry,
	fetchFeedEntries,
	mergeNews,
	NEWS_SOURCES,
	type NewsItem,
} from "@/lib/stablecoin-news";
import {
	issuerLeaderboard,
	pivotByToken,
	type TokenSnapshot,
	totalPerDay,
} from "@/lib/stablecoin-series";
import { aggregateDaily, type SnapshotPoint } from "@/lib/stablecoin-view";
import { type StoreRow, storeRowToApi } from "@/lib/stablecoins";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Stellar Stablecoins | Stellar Light",
	description:
		"Every tracked Stellar stablecoin — supply, holders, market cap, issuer and peg, measured every six hours and dated.",
};

export default async function StablecoinsPage() {
	const payload = await getPayloadSafe();
	let coins: CoinView[] = [];
	let rawSnapshots: unknown[] = [];
	let news: NewsItem[] = [];
	let series = {
		points: [] as ReturnType<typeof aggregateDaily>["points"],
		droppedLowCoverage: 0,
	};

	if (payload) {
		const [current, snaps] = await Promise.all([
			payload.find({ collection: "stablecoins", limit: 200, depth: 0 }),
			payload.find({
				collection: "stablecoin-snapshots",
				// The whole series, newest first so a cap can never drop the
				// current days (2026-08-22: the imported Replit history made the
				// table 3,700 rows; at 20 assets/day a flat 5,000 ran out in
				// two months). 20,000 ≈ 2.7 years at today's roster.
				limit: 20000,
				depth: 0,
				sort: "-day",
				select: {
					day: true,
					assetId: true,
					code: true,
					marketCapUSD: true,
					holders: true,
					supply: true,
				},
			}),
		]);

		coins = (current.docs as StoreRow[])
			.filter((d) => !d.retiredAt)
			.map((d) => {
				const r = storeRowToApi(d);
				return {
					id: r.assetId ?? `${r.ticker}-${r.issuer?.slice(0, 8) ?? ""}`,
					ticker: r.ticker,
					name: r.name || r.ticker,
					company: r.company ?? "",
					issuerCode: r.issuer ?? "",
					issuerDomain: r.issuerDomain ?? "",
					country: r.country,
					peg: r.peg,
					assetType: r.assetType,
					logoUrl: d.logoUrl ?? null,
					// The explorer drew a peg flag for assets whose issuer serves no
					// usable logo (BRLT, ARST, PEN, MXNe, mZAR) — same rule here.
					useFlagIcon: !d.logoUrl,
					basis: r.basis,
					note: r.note,
					measuredAt: r.updatedAt,
					supplyRaw: r.supply,
					holdersRaw: r.holders,
					marketCapRaw: r.marketCapUSD,
					volumeRaw: r.volume24hUSD,
					priceRaw: r.priceUSD,
				} satisfies CoinView;
			})
			.filter((c) => c.ticker);

		// Stablecoin coverage for the dock: the live RSS window for freshness,
		// the ingested corpus for depth. Filtered by whether the piece is ABOUT
		// stablecoins — never by vector similarity, which returns the
		// consensus-protocol paper for the query "stablecoin".
		try {
			const [feed, found] = await Promise.all([
				fetchFeedEntries(),
				payload.find({
					collection: "research-docs",
					where: { source: { in: NEWS_SOURCES } },
					limit: 400,
					depth: 0,
					sort: "-publishedAt",
					select: {
						title: true,
						url: true,
						content: true,
						publishedAt: true,
					},
				}),
			]);
			const corpus = (found.docs as Parameters<typeof docToEntry>[0][])
				.map(docToEntry)
				.filter((e): e is NonNullable<typeof e> => e !== null);
			news = mergeNews(feed, corpus);
		} catch {
			// The dock is supplementary — never take the page down for it.
		}

		// Oldest first for everything downstream.
		const ordered = [...snaps.docs].sort((a, b) =>
			String((a as SnapshotPoint).day).localeCompare(
				String((b as SnapshotPoint).day),
			),
		);
		rawSnapshots = ordered;
		series = aggregateDaily(ordered as SnapshotPoint[]);
	}

	const totalMarketCap = coins.reduce((s, c) => s + (c.marketCapRaw ?? 0), 0);
	const totalHolders = coins.reduce((s, c) => s + (c.holdersRaw ?? 0), 0);
	const totalVolume24h = coins.reduce((s, c) => s + (c.volumeRaw ?? 0), 0);

	// The FULL daily series, oldest first. The explorer picks the window
	// (30D / 90D / All) client-side — the imported history reaches back to
	// 2025-11-28 and a fixed 30-day slice here hid all of it.
	const allDays = series.points;

	// Per-token series for the four analytics panels, plus the leaderboard.
	// The leaderboard needs no history, so it is useful from the first run.
	const snapDocs = (rawSnapshots ?? []) as TokenSnapshot[];
	const marketCapByToken = pivotByToken(snapDocs, "marketCapUSD");
	const holdersByToken = pivotByToken(snapDocs, "holders");
	const totalHoldersSeries = totalPerDay(snapDocs, "holders");
	// Per-token supply — the issuer drawer's 30-day supply-change chart.
	const supplyByToken = pivotByToken(snapDocs, "supply");
	const issuers = issuerLeaderboard(coins);

	return (
		<div className="min-h-screen bg-background pt-16">
			<StablecoinExplorer
				coins={coins}
				marketCapSeries={allDays.map((p) => ({
					date: p.date,
					value: p.marketCapUSD,
				}))}
				holdersSeries={allDays.map((p) => ({
					date: p.date,
					value: p.holders,
				}))}
				totalMarketCap={totalMarketCap}
				totalVolume24h={totalVolume24h}
				totalHolders={totalHolders}
				marketCapByToken={marketCapByToken}
				holdersByToken={holdersByToken}
				totalHoldersSeries={totalHoldersSeries}
				supplyByToken={supplyByToken}
				issuers={issuers}
				news={news}
			/>
		</div>
	);
}
