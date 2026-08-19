import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StablecoinHistoryChart } from "@/components/stablecoin-history-chart";
import { Card, CardContent } from "@/components/ui/card";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	formatCount,
	formatPct,
	formatSupply,
	formatUSD,
	pegFlag,
} from "@/lib/stablecoin-view";
import { type StoreRow, storeRowToApi } from "@/lib/stablecoins";

export const dynamic = "force-dynamic";

type Params = Promise<{ assetId: string }>;

async function load(assetId: string) {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	const found = await payload.find({
		collection: "stablecoins",
		where: { assetId: { equals: assetId } },
		limit: 1,
		depth: 0,
	});
	const doc = found.docs[0] as StoreRow | undefined;
	if (!doc) return null;
	const snaps = await payload.find({
		collection: "stablecoin-snapshots",
		where: { assetId: { equals: assetId } },
		limit: 400,
		depth: 0,
		sort: "day",
		select: { day: true, marketCapUSD: true, holders: true },
	});
	return {
		row: storeRowToApi(doc),
		history: (
			snaps.docs as Array<{ day: string; marketCapUSD?: number | null }>
		)
			.filter((s) => typeof s.marketCapUSD === "number")
			.map((s) => ({ date: s.day, value: s.marketCapUSD as number })),
	};
}

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { assetId } = await params;
	const data = await load(assetId);
	if (!data) return { title: "Stablecoin not found | Stellar Light" };
	const { row } = data;
	return {
		title: `${row.ticker} — ${row.company ?? "Stellar stablecoin"} | Stellar Light`,
		description: `${row.ticker}, issued by ${row.company ?? "an unnamed issuer"} and pegged to ${row.peg ?? "an unstated currency"}. Market cap, supply, holders and issuer details, measured every six hours.`,
	};
}

/** A labelled figure. Renders an em dash for missing — never a zero. */
function Metric({
	label,
	value,
	hint,
}: {
	label: string;
	value: string;
	hint?: string;
}) {
	return (
		<div className="rounded-lg bg-background/50 border border-border/50 p-4">
			<p className="text-xs text-muted-foreground mb-1">{label}</p>
			<p className="text-lg font-semibold text-foreground tabular-nums">
				{value}
			</p>
			{hint && (
				<p className="text-[11px] text-muted-foreground/70 mt-1">{hint}</p>
			)}
		</div>
	);
}

function Row({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between gap-4 py-2.5 border-b border-border/30 last:border-0">
			<span className="text-sm text-muted-foreground flex-shrink-0">
				{label}
			</span>
			<span className="text-sm text-foreground text-right min-w-0 break-words">
				{children}
			</span>
		</div>
	);
}

export default async function StablecoinDetailPage({
	params,
}: {
	params: Params;
}) {
	const { assetId } = await params;
	const data = await load(assetId);
	if (!data) notFound();
	const { row, history } = data;

	const measuredLabel = row.updatedAt
		? `${new Date(row.updatedAt).toLocaleString("en-US", {
				dateStyle: "medium",
				timeStyle: "short",
				timeZone: "UTC",
			})} UTC`
		: "—";

	return (
		<div className="min-h-screen relative">
			<main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/stablecoins"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">All stablecoins</span>
				</Link>

				<div className="mb-8">
					<div className="flex items-center gap-3 flex-wrap mb-2">
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
							{row.ticker}
						</h1>
						<span className="text-xs font-medium px-2 py-1 rounded-md bg-white/[0.04] text-muted-foreground border border-border/50">
							{pegFlag(row.peg)} {row.peg ?? "—"}
						</span>
						{row.assetType && (
							<span className="text-xs font-medium px-2 py-1 rounded-md bg-white/[0.04] text-muted-foreground border border-border/50">
								{row.assetType}
							</span>
						)}
					</div>
					<p className="text-sm text-muted-foreground">
						Issued by {row.company ?? "an unnamed issuer"}
					</p>
				</div>

				{row.basis !== "live" && (
					<Card className="border border-border/50 bg-card mb-6">
						<CardContent className="py-4">
							<p className="text-sm text-foreground">
								{row.basis === "curated-static"
									? "These figures are hand-checked, not a live measurement."
									: "This asset could not be measured in the latest cycle."}
							</p>
							{row.note && (
								<p className="text-xs text-muted-foreground mt-1">{row.note}</p>
							)}
							<p className="text-xs text-muted-foreground mt-1">
								The row is kept deliberately — its absence would read as a
								delisting, which is not what an unsuccessful measurement means.
							</p>
						</CardContent>
					</Card>
				)}

				<div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
					<Metric
						label="Market cap"
						value={formatUSD(row.marketCapUSD)}
						hint="comparable across assets"
					/>
					<Metric
						label="Supply"
						value={formatSupply(row.supply, row.peg)}
						hint={row.peg ? `in ${row.peg}, not USD` : undefined}
					/>
					<Metric
						label="Holders"
						value={formatCount(row.holders)}
						hint="trustlines"
					/>
					<Metric
						label="7-day supply"
						value={formatPct(row.supplyChange7d)}
						hint="from our own series"
					/>
				</div>

				<div className="mb-8">
					<StablecoinHistoryChart
						title="Market cap"
						headline={formatUSD(row.marketCapUSD)}
						caption={`measured ${measuredLabel}`}
						subject={`${row.ticker}'s market cap`}
						format="usd"
						points={history}
					/>
				</div>

				<Card className="border border-border/50 bg-card mb-6">
					<CardContent className="py-5">
						<h2 className="text-base font-semibold text-foreground mb-3">
							Issuer
						</h2>
						<Row label="Company">{row.company ?? "—"}</Row>
						<Row label="Home domain">
							{row.issuerDomain ? (
								<a
									href={`https://${row.issuerDomain}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 underline hover:text-white"
								>
									{row.issuerDomain}
									<ExternalLink className="w-3 h-3" />
								</a>
							) : (
								"—"
							)}
						</Row>
						<Row label="Issuer account">
							<code className="text-[11px] font-mono break-all text-muted-foreground">
								{row.issuer ?? "—"}
							</code>
						</Row>
						<Row label="Asset ID">
							<code className="text-[11px] font-mono text-muted-foreground">
								{row.assetId ?? "—"}
							</code>
						</Row>
					</CardContent>
				</Card>

				<Card className="border border-border/50 bg-card mb-6">
					<CardContent className="py-5">
						<h2 className="text-base font-semibold text-foreground mb-3">
							Provenance
						</h2>
						<Row label="Basis">{row.basis ?? "—"}</Row>
						<Row label="Measured at">{measuredLabel}</Row>
						<Row label="Price used">
							{row.priceUSD == null
								? "—"
								: `$${row.priceUSD.toLocaleString("en-US", { maximumFractionDigits: 6 })} per ${row.ticker}`}
						</Row>
						<Row label="Unit price basis">
							{row.peg === "USD"
								? "USD peg, taken as 1.00"
								: `live ${row.peg ?? "peg"}/USD rate`}
						</Row>
					</CardContent>
				</Card>

				{row.issuer && (
					<Card className="border border-border/50 bg-card mb-6">
						<CardContent className="py-5">
							<h2 className="text-base font-semibold text-foreground mb-3">
								Verify independently
							</h2>
							<div className="flex flex-wrap gap-2">
								<a
									href={`https://stellar.expert/explorer/public/asset/${row.ticker}-${row.issuer}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-white/[0.04] border border-border/50 hover:bg-white/[0.07] transition-colors"
								>
									Stellar Expert <ExternalLink className="w-3 h-3" />
								</a>
								<a
									href={`https://horizon.stellar.org/accounts/${row.issuer}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-white/[0.04] border border-border/50 hover:bg-white/[0.07] transition-colors"
								>
									Horizon account <ExternalLink className="w-3 h-3" />
								</a>
								{row.issuerDomain && (
									<a
										href={`https://${row.issuerDomain}/.well-known/stellar.toml`}
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-white/[0.04] border border-border/50 hover:bg-white/[0.07] transition-colors"
									>
										stellar.toml <ExternalLink className="w-3 h-3" />
									</a>
								)}
							</div>
						</CardContent>
					</Card>
				)}

				<p className="text-xs text-muted-foreground leading-relaxed">
					A stablecoin&apos;s identity is its code <em>and</em> its issuer — two
					live assets can share a ticker, so {row.ticker} here means
					specifically the asset issued by{" "}
					<code className="font-mono">{row.issuer?.slice(0, 8)}…</code>. An em
					dash means not measured, never zero.
				</p>
			</main>
		</div>
	);
}
