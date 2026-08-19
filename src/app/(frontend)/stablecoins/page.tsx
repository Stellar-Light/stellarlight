import type { Metadata } from "next";
import {
	type CoinView,
	StablecoinExplorer,
} from "@/components/stablecoin-explorer";
import { getPayloadSafe } from "@/lib/payload-client";
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
	let series = {
		points: [] as ReturnType<typeof aggregateDaily>["points"],
		droppedLowCoverage: 0,
	};

	if (payload) {
		const [current, snaps] = await Promise.all([
			payload.find({ collection: "stablecoins", limit: 200, depth: 0 }),
			payload.find({
				collection: "stablecoin-snapshots",
				limit: 5000,
				depth: 0,
				sort: "day",
				select: {
					day: true,
					assetId: true,
					marketCapUSD: true,
					holders: true,
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

		series = aggregateDaily(snaps.docs as SnapshotPoint[]);
	}

	const totalMarketCap = coins.reduce((s, c) => s + (c.marketCapRaw ?? 0), 0);
	const totalHolders = coins.reduce((s, c) => s + (c.holdersRaw ?? 0), 0);
	const totalVolume24h = coins.reduce((s, c) => s + (c.volumeRaw ?? 0), 0);

	// Last 30 days, oldest first — the window the two activity charts label.
	const last30 = series.points.slice(-30);

	return (
		<div className="min-h-screen bg-background pt-16">
			<StablecoinExplorer
				coins={coins}
				marketCapSeries={last30.map((p) => ({
					date: p.date,
					value: p.marketCapUSD,
				}))}
				holdersSeries={last30.map((p) => ({
					date: p.date,
					value: p.holders,
				}))}
				totalMarketCap={totalMarketCap}
				totalVolume24h={totalVolume24h}
				totalHolders={totalHolders}
			/>
		</div>
	);
}
