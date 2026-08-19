import { ArrowLeft, Coins } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { StablecoinFilters } from "@/components/stablecoin-filters";
import { StablecoinHistoryChart } from "@/components/stablecoin-history-chart";
import { Card, CardContent } from "@/components/ui/card";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	aggregateDaily,
	formatCount,
	formatPct,
	formatSupply,
	formatUSD,
	pegFlag,
	type SnapshotPoint,
} from "@/lib/stablecoin-view";
import {
	rankStablecoins,
	type StablecoinSort,
	type StoreRow,
	storeRowToApi,
} from "@/lib/stablecoins";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Stellar Stablecoins | Stellar Light",
	description:
		"Every tracked Stellar stablecoin ranked by USD market cap — supply, holders, issuer and peg, measured every six hours.",
};

type SearchParams = Promise<{ sort?: string; peg?: string }>;

const SORTS: StablecoinSort[] = ["marketcap", "supply", "holders", "volume"];
const SORT_OPTIONS = [
	{ value: "marketcap", label: "Market cap (USD)" },
	{ value: "holders", label: "Holders" },
	{ value: "volume", label: "24h volume" },
	{ value: "supply", label: "Supply (own peg)" },
];

/** Chip that makes an estimate visibly not a live measurement. */
function BasisChip({ basis }: { basis: string | null }) {
	if (!basis || basis === "live") return null;
	const label = basis === "curated-static" ? "hand-checked" : "not measured";
	return (
		<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border/50 whitespace-nowrap">
			{label}
		</span>
	);
}

export default async function StablecoinsPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;
	const sort = (
		SORTS.includes(params.sort as StablecoinSort) ? params.sort : "marketcap"
	) as StablecoinSort;
	const pegParam = params.peg ? params.peg.toUpperCase() : null;

	const payload = await getPayloadSafe();
	let rows: ReturnType<typeof storeRowToApi>[] = [];
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
		rows = (current.docs as StoreRow[])
			.filter((d) => !d.retiredAt)
			.map(storeRowToApi)
			.filter((r) => r.ticker);
		series = aggregateDaily(snaps.docs as SnapshotPoint[]);
	}

	// Totals are over the WHOLE registry, not the filtered view — a headline
	// that moved when you picked a currency would be a different statement.
	const totalMcap = rows.reduce((s, r) => s + (r.marketCapUSD ?? 0), 0);
	const totalHolders = rows.reduce((s, r) => s + (r.holders ?? 0), 0);
	const asOf = rows.reduce<string | null>(
		(a, r) => (r.updatedAt && (!a || r.updatedAt > a) ? r.updatedAt : a),
		null,
	);
	const asOfLabel = asOf
		? new Date(asOf).toLocaleString("en-US", {
				dateStyle: "medium",
				timeStyle: "short",
				timeZone: "UTC",
			}) + " UTC"
		: "—";

	const pegOptions = [...new Set(rows.map((r) => r.peg).filter(Boolean))]
		.sort()
		.map((p) => ({
			value: p as string,
			label: `${pegFlag(p)} ${p}`.trim(),
		}));

	const visible = rankStablecoins(
		pegParam ? rows.filter((r) => r.peg?.toUpperCase() === pegParam) : rows,
		sort,
	);

	return (
		<div className="min-h-screen relative">
			<main className="max-w-5xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
						Stellar Stablecoins
					</h1>
					<p className="text-sm text-muted-foreground mt-2 max-w-2xl">
						{rows.length} hand-verified issuers, measured every six hours from
						Horizon, Stellar Expert and live peg rates. Ranked by USD market cap
						— the only figure comparable across currencies.
					</p>
				</div>

				<div className="grid gap-4 sm:grid-cols-2 mb-8">
					<StablecoinHistoryChart
						title="Total market cap"
						headline={formatUSD(totalMcap)}
						caption={`as of ${asOfLabel}`}
						subject="market cap"
						format={formatUSD}
						points={series.points.map((p) => ({
							date: p.date,
							value: p.marketCapUSD,
							assetsCounted: p.assetsCounted,
						}))}
					/>
					<StablecoinHistoryChart
						title="Total holders"
						headline={formatCount(totalHolders)}
						caption="trustlines across all tracked assets"
						subject="holders"
						format={formatCount}
						points={series.points.map((p) => ({
							date: p.date,
							value: p.holders,
							assetsCounted: p.assetsCounted,
						}))}
					/>
				</div>

				{series.droppedLowCoverage > 0 && (
					<p className="text-xs text-muted-foreground mb-6">
						{series.droppedLowCoverage} day
						{series.droppedLowCoverage === 1 ? " is" : "s are"} omitted from the
						charts because too few assets reported — a partial day would draw a
						measurement gap as if it were a market move.
					</p>
				)}

				<StablecoinFilters
					sort={sort}
					peg={pegParam}
					sortOptions={SORT_OPTIONS}
					pegOptions={pegOptions}
				/>

				{visible.length === 0 ? (
					<Card className="border border-border/50 bg-card">
						<CardContent className="py-16 text-center">
							<Coins className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
							<p className="text-muted-foreground">
								{rows.length === 0
									? "The stablecoin store is unreachable right now. This is an outage, not a claim that Stellar has no stablecoins."
									: `No tracked stablecoin is pegged to ${pegParam}.`}
							</p>
						</CardContent>
					</Card>
				) : (
					<>
						<div className="text-xs text-muted-foreground mb-3">
							{visible.length} asset{visible.length === 1 ? "" : "s"}
							{pegParam ? ` pegged to ${pegParam}` : ""}
						</div>
						<Card className="border border-border/50 bg-card shadow-sm overflow-hidden">
							<CardContent className="p-0">
								<div className="overflow-x-auto">
									<table className="w-full" style={{ tableLayout: "fixed" }}>
										<colgroup>
											<col className="w-10 sm:w-12" />
											<col />
											<col className="w-24 sm:w-28" />
											<col className="hidden md:table-column w-28" />
											<col className="hidden sm:table-column w-24" />
											<col className="hidden lg:table-column w-20" />
										</colgroup>
										<thead>
											<tr className="border-b border-border/50 text-left">
												<th className="px-3 sm:px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
													#
												</th>
												<th className="px-3 sm:px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
													Asset
												</th>
												<th className="px-3 sm:px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">
													Market cap
												</th>
												<th className="px-3 sm:px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden md:table-cell">
													Supply
												</th>
												<th className="px-3 sm:px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden sm:table-cell">
													Holders
												</th>
												<th className="px-3 sm:px-5 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right hidden lg:table-cell">
													7d
												</th>
											</tr>
										</thead>
										<tbody>
											{visible.map((r, idx) => (
												<tr
													key={r.assetId ?? `${r.ticker}-${idx}`}
													className="border-b border-border/30 last:border-0 hover:bg-white/[0.02] transition-colors"
												>
													<td className="px-3 sm:px-5 py-3.5 align-middle">
														<span className="text-sm tabular-nums text-muted-foreground">
															{idx + 1}
														</span>
													</td>
													<td className="px-3 sm:px-5 py-3.5">
														<Link
															href={`/stablecoins/${r.assetId}`}
															className="group block min-w-0"
														>
															<div className="flex items-center gap-2 min-w-0 mb-0.5">
																<span className="font-medium text-foreground group-hover:text-white transition-colors truncate">
																	{r.ticker}
																</span>
																<span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border/50 whitespace-nowrap">
																	{pegFlag(r.peg)} {r.peg ?? "—"}
																</span>
																<BasisChip basis={r.basis} />
															</div>
															<span className="text-xs text-muted-foreground truncate block">
																{r.company ?? r.issuerDomain ?? "—"}
															</span>
														</Link>
													</td>
													<td className="px-3 sm:px-5 py-3.5 text-right text-sm tabular-nums text-foreground">
														{formatUSD(r.marketCapUSD)}
													</td>
													<td className="px-3 sm:px-5 py-3.5 text-right text-sm tabular-nums text-muted-foreground hidden md:table-cell">
														{formatSupply(r.supply, r.peg)}
													</td>
													<td className="px-3 sm:px-5 py-3.5 text-right text-sm tabular-nums text-muted-foreground hidden sm:table-cell">
														{formatCount(r.holders)}
													</td>
													<td className="px-3 sm:px-5 py-3.5 text-right text-sm tabular-nums text-muted-foreground hidden lg:table-cell">
														{formatPct(r.supplyChange7d)}
													</td>
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</CardContent>
						</Card>

						<p className="text-xs text-muted-foreground mt-4 leading-relaxed">
							Market cap is supply × the peg&apos;s USD rate and is the only
							column comparable across rows — supply is denominated in each
							asset&apos;s own currency, so GYEN&apos;s figure is yen and
							ARST&apos;s is pesos. An em dash means not measured, never zero.
							Absence from this list means an asset is not tracked here, not
							that it is unissued on Stellar. Same data as{" "}
							<Link
								href="/api/stablecoins"
								className="underline hover:text-foreground"
							>
								/api/stablecoins
							</Link>
							.
						</p>
					</>
				)}
			</main>
		</div>
	);
}
