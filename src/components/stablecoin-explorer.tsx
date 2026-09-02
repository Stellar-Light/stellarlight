"use client";

/**
 * The Stellar Stablecoins explorer, ported from the Replit-hosted app it
 * replaces — same layout, same interactions, same copy. What changed is where
 * the numbers come from: our own `stablecoins` collection instead of that
 * host's Postgres, so every row also carries `basis` (live | curated-static |
 * unmeasured) and an estimate can be labelled rather than passed off as a
 * live measurement.
 *
 * All state lives here (search, view mode, sort, filters, paging, selection)
 * exactly as it did there; the server component just hands over the rows.
 */

import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Check,
	ChevronDown,
	Copy,
	ExternalLink,
	Grid as GridIcon,
	Search,
	Share2,
	Table as TableIcon,
	X,
} from "lucide-react";
import {
	AnimatePresence,
	motion,
	useMotionValue,
	useSpring,
} from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bar } from "@/components/charts/bar";
import { BarChart } from "@/components/charts/bar-chart";
import { ChartTooltip } from "@/components/charts/tooltip";
import { StablecoinCharts } from "@/components/stablecoin-charts";
import {
	ISSUER_LOGOS,
	IssuerLogo,
	TOKEN_LOGOS,
	VenueLogo,
} from "@/components/stablecoin-logos";
import { StablecoinNewsDock } from "@/components/stablecoin-news-dock";
import { StablecoinSpotlight } from "@/components/stablecoin-spotlight";
import { Card, CardContent } from "@/components/ui/card";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { NewsItem } from "@/lib/stablecoin-news";
import type { IssuerLeader, SeriesRow } from "@/lib/stablecoin-series";
import {
	COUNTRY_INFO,
	countryInfo,
	displayHolders,
	displayHoldersCompact,
	displayPrice,
	displaySupply,
	displayUSD,
} from "@/lib/stablecoin-view";

export interface CoinView {
	id: string;
	ticker: string;
	name: string;
	company: string;
	issuerCode: string;
	issuerDomain: string;
	country: string | null;
	peg: string | null;
	assetType: string | null;
	logoUrl: string | null;
	useFlagIcon: boolean;
	basis: string | null;
	note: string | null;
	measuredAt: string | null;
	supplyRaw: number | null;
	holdersRaw: number | null;
	marketCapRaw: number | null;
	volumeRaw: number | null;
	priceRaw: number | null;
}

interface BlendPoolRow {
	poolId: string;
	poolName: string;
	poolUrl: string;
	supplyAPY: number | null;
	borrowAPY: number | null;
}

interface DefiContext {
	contract: string | null;
	blend: BlendPoolRow | null;
	/** Every Blend pool that lists the asset, deepest first. */
	blendPools?: BlendPoolRow[];
	liquidity: {
		poolCount: number;
		assetPooled: number;
		assetPooledUSD: number | null;
		topPools: Array<{
			id: string;
			counterAsset: string;
			assetAmount: number;
			trustlines: number;
		}>;
		capped: boolean;
	} | null;
	tradeLinks: Array<{ name: string; url: string }>;
	venues?: {
		venues: Array<{
			name: string;
			poolCount: number;
			measuredPools: number;
			assetPooled: number;
			assetPooledUSD: number | null;
			largest: { counter: string; assetAmount: number } | null;
			url: string;
		}>;
		unreadable: string[];
		notIndexed: string[];
	};
}

export interface DayPoint {
	date: string;
	value: number;
}

interface Props {
	coins: CoinView[];
	marketCapSeries: DayPoint[];
	holdersSeries: DayPoint[];
	totalMarketCap: number;
	totalVolume24h: number;
	totalHolders: number;
	/** Per-token daily series behind the four analytics panels. */
	marketCapByToken: SeriesRow[];
	holdersByToken: SeriesRow[];
	totalHoldersSeries: SeriesRow[];
	/** Per-token daily supply — the issuer drawer's 30-day history. */
	supplyByToken: SeriesRow[];
	issuers: IssuerLeader[];
	news: NewsItem[];
}

const COUNTRY_FALLBACK = COUNTRY_INFO.Global;
const ITEMS_PER_PAGE = 10;
const ACCENT = "hsl(45, 80%, 55%)";

/** Spring-animated figure, as the overview tiles had. */
function AnimatedNumber({
	value,
	format,
}: {
	value: number;
	format: (v: number) => string;
}) {
	const mv = useMotionValue(value);
	const spring = useSpring(mv, {
		stiffness: 110,
		damping: 22,
		restDelta: 0.001,
	});
	const [display, setDisplay] = useState(() => format(value));
	const formatRef = useRef(format);
	formatRef.current = format;
	useEffect(() => {
		mv.set(value);
	}, [value, mv]);
	useEffect(
		() => spring.on("change", (v) => setDisplay(formatRef.current(v))),
		[spring],
	);
	return <>{display}</>;
}

const ICON_BG = [
	"bg-blue-500",
	"bg-emerald-500",
	"bg-violet-500",
	"bg-amber-500",
	"bg-rose-500",
	"bg-cyan-500",
];
function bgFor(letter: string) {
	return ICON_BG[letter.charCodeAt(0) % ICON_BG.length];
}

const SIZES = {
	sm: "w-8 h-8",
	md: "w-10 h-10",
	lg: "w-12 h-12",
	xl: "w-16 h-16",
} as const;
const TEXT = {
	sm: "text-sm",
	md: "text-base",
	lg: "text-lg",
	xl: "text-2xl",
} as const;

function CoinIcon({
	coin,
	size = "md",
	failed,
	onFail,
}: {
	coin: CoinView;
	size?: keyof typeof SIZES;
	failed: Set<string>;
	onFail: (id: string) => void;
}) {
	// Same order the explorer used: the issuer's own logo, then the peg's flag
	// for the assets that never had one (BRLT, ARST, PEN, MXNe, mZAR), then a
	// letter tile so a row is never iconless.
	// 2026-08-22: USDC and PYUSD showed letter tiles because Circle and Paxos
	// serve no usable image in their stellar.toml — the explorer shipped these
	// marks as local assets, so they are the second and third rungs here.
	const bundled =
		(failed.has(coin.id) ? null : coin.logoUrl) ??
		TOKEN_LOGOS[coin.ticker] ??
		ISSUER_LOGOS[coin.company] ??
		null;
	if (bundled)
		return (
			<div
				className={`${SIZES[size]} rounded-full overflow-hidden bg-white/5 border border-white/10`}
			>
				{/* biome-ignore lint/performance/noImgElement: issuer-hosted logo from their stellar.toml */}
				<img
					src={bundled}
					alt={coin.ticker}
					className="w-full h-full object-cover"
					onError={() => onFail(coin.id)}
				/>
			</div>
		);
	const info = countryInfo(coin.country, coin.peg);
	if (coin.useFlagIcon && info !== COUNTRY_FALLBACK)
		return (
			<div
				className={`${SIZES[size]} rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center`}
			>
				{/* biome-ignore lint/performance/noImgElement: remote flag sprite, not a next/image domain */}
				<img
					src={info.flag}
					alt={coin.ticker}
					className="w-2/3 h-2/3 object-cover"
				/>
			</div>
		);
	const first = coin.ticker.charAt(0);
	return (
		<div
			className={`${SIZES[size]} rounded-full ${bgFor(first)} flex items-center justify-center ${TEXT[size]} font-bold text-white`}
		>
			{first}
		</div>
	);
}

/** Only shown when a row is NOT a live measurement — the one thing the old explorer couldn't tell you. */
function BasisTag({ basis }: { basis: string | null }) {
	if (!basis || basis === "live") return null;
	return (
		<span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/[0.06] text-[#A3A3A3] border border-[#2F2F2F] whitespace-nowrap">
			{basis === "curated-static" ? "Hand-checked" : "Not measured"}
		</span>
	);
}

export function StablecoinExplorer({
	coins,
	marketCapSeries,
	holdersSeries,
	totalMarketCap,
	totalVolume24h,
	totalHolders,
	marketCapByToken,
	holdersByToken,
	totalHoldersSeries,
	supplyByToken,
	issuers,
	news,
}: Props) {
	const [searchQuery, setSearchQuery] = useState("");
	const [viewMode, setViewMode] = useState<"table" | "grid">("table");
	const [selectedAsset, setSelectedAsset] = useState("all");
	const [sortField, setSortField] = useState<"supply" | "holders" | null>(null);
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
	const [selectedCoin, setSelectedCoin] = useState<CoinView | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [failedIcons, setFailedIcons] = useState<Set<string>>(new Set());
	const [currentPage, setCurrentPage] = useState(1);
	const [hoveredMcap, setHoveredMcap] = useState<number | null>(null);
	const [hoveredHolders, setHoveredHolders] = useState<number | null>(null);
	// Activity window. 30D by default (owner call, 2026-09-02): the recent
	// month is what a reader checks first, and "All" compresses ten months of
	// bars until a week's movement is invisible. The full history is one click
	// away and still reaches back to 2025-11-28.
	const [range, setRange] = useState<"30D" | "90D" | "ALL">("30D");
	// Push/pull on the range toggle: widening the window pushes the old bars
	// left and pulls the new ones in from the right; narrowing goes the other
	// way, so a range switch reads as movement through time, not a repaint.
	const RANGE_ORDER = ["30D", "90D", "ALL"] as const;
	const prevRange = useRef(range);
	const rangeDir =
		RANGE_ORDER.indexOf(range) >= RANGE_ORDER.indexOf(prevRange.current)
			? 1
			: -1;
	useEffect(() => {
		prevRange.current = range;
	}, [range]);
	const win = (series: DayPoint[]) =>
		range === "ALL" ? series : series.slice(-(range === "90D" ? 90 : 30));
	const [assetDrawerOpen, setAssetDrawerOpen] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const [priceDisplay, setPriceDisplay] = useState<"usd" | "native">("usd");
	const [selectedIssuer, setSelectedIssuer] = useState<IssuerLeader | null>(
		null,
	);
	const [issuerToken, setIssuerToken] = useState<string>("all");
	// A new issuer starts on its aggregate, never on the last one's token.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the issuer only
	useEffect(() => {
		setIssuerToken("all");
	}, [selectedIssuer?.company]);
	const [defi, setDefi] = useState<DefiContext | null>(null);
	const [defiLoading, setDefiLoading] = useState(false);

	// A toast is the only confirmation a copy gives — without it the click
	// looks like it did nothing.
	const say = (msg: string) => {
		setToast(msg);
		setTimeout(() => setToast(null), 2200);
	};

	const currencies = useMemo(
		() =>
			[...new Set(coins.map((c) => c.peg).filter(Boolean))].sort() as string[],
		[coins],
	);

	const filtered = useMemo(() => {
		const q = searchQuery.trim().toLowerCase();
		return coins.filter((c) => {
			if (selectedAsset !== "all" && c.peg !== selectedAsset) return false;
			if (!q) return true;
			return [c.ticker, c.name, c.company, c.issuerDomain]
				.filter(Boolean)
				.some((v) => v.toLowerCase().includes(q));
		});
	}, [coins, searchQuery, selectedAsset]);

	const sorted = useMemo(() => {
		const rows = [...filtered];
		if (!sortField)
			// Default order is USD market cap — the only cross-currency comparable.
			return rows.sort(
				(a, b) => (b.marketCapRaw ?? -1) - (a.marketCapRaw ?? -1),
			);
		const key = sortField === "supply" ? "supplyRaw" : "holdersRaw";
		return rows.sort((a, b) => {
			const av = a[key];
			const bv = b[key];
			// Nulls last in both directions — "not measured" is not "smallest".
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			return sortDirection === "asc" ? av - bv : bv - av;
		});
	}, [filtered, sortField, sortDirection]);

	const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);
	const paged = useMemo(
		() =>
			viewMode === "table"
				? sorted.slice(
						(currentPage - 1) * ITEMS_PER_PAGE,
						currentPage * ITEMS_PER_PAGE,
					)
				: sorted,
		[sorted, currentPage, viewMode],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: reset paging when the result set changes
	useEffect(() => setCurrentPage(1), [searchQuery, selectedAsset, sortField]);

	const handleSort = (field: "supply" | "holders") => {
		if (sortField === field)
			setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
		else {
			setSortField(field);
			setSortDirection("desc");
		}
	};

	const copyIssuer = async (coin: CoinView, e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await navigator.clipboard.writeText(coin.issuerCode);
			setCopiedId(coin.id);
			say(`${coin.ticker} issuer address copied`);
			setTimeout(() => setCopiedId(null), 1500);
		} catch {
			say("Clipboard blocked — the address is shown in full on the row");
		}
	};

	const onFail = (id: string) =>
		setFailedIcons((prev) => new Set(prev).add(id));

	// Selecting a coin puts it in the URL and closing takes it out, so a
	// drawer can be linked to — the explorer's share behaviour.
	const selectCoin = (coin: CoinView) => {
		setSelectedCoin(coin);
		setPriceDisplay("usd");
		window.history.replaceState(
			{},
			"",
			`${window.location.pathname}?coin=${coin.ticker}`,
		);
	};
	const closeDrawer = () => {
		setSelectedCoin(null);
		window.history.replaceState({}, "", window.location.pathname);
	};
	const shareCoin = async (coin: CoinView) => {
		const url = `${window.location.origin}${window.location.pathname}?coin=${coin.ticker}`;
		try {
			if (navigator.share) await navigator.share({ title: coin.ticker, url });
			else {
				await navigator.clipboard.writeText(url);
				say("Link copied to clipboard");
			}
		} catch {
			/* the user dismissed the share sheet */
		}
	};

	// DeFi context is fetched per asset, not bundled into the page — it hits
	// Horizon and would otherwise slow the first paint for everyone.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the asset only
	useEffect(() => {
		if (!selectedCoin) {
			setDefi(null);
			return;
		}
		let live = true;
		setDefiLoading(true);
		const q = new URLSearchParams({
			code: selectedCoin.ticker,
			issuer: selectedCoin.issuerCode,
			...(selectedCoin.priceRaw != null
				? { price: String(selectedCoin.priceRaw) }
				: {}),
		});
		fetch(`/api/stablecoins/defi?${q}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((d) => live && setDefi(d))
			.catch(() => live && setDefi(null))
			.finally(() => live && setDefiLoading(false));
		return () => {
			live = false;
		};
	}, [selectedCoin?.id]);

	// Open the drawer named by ?coin= on first paint.
	// biome-ignore lint/correctness/useExhaustiveDependencies: first-paint deep link only
	useEffect(() => {
		const want = new URLSearchParams(window.location.search).get("coin");
		if (!want) return;
		const hit = coins.find(
			(c) => c.ticker.toLowerCase() === want.toLowerCase(),
		);
		if (hit) setSelectedCoin(hit);
	}, [coins]);

	const top10 = useMemo(
		() =>
			[...coins]
				.sort((a, b) => (b.marketCapRaw ?? -1) - (a.marketCapRaw ?? -1))
				.slice(0, 10),
		[coins],
	);

	const fmtUSD = (v: number) =>
		v >= 1e9
			? `$${(v / 1e9).toFixed(2)}B`
			: v >= 1e6
				? `$${(v / 1e6).toFixed(2)}M`
				: v >= 1e3
					? `$${(v / 1e3).toFixed(2)}K`
					: `$${v.toFixed(2)}`;
	const fmtHolders = (v: number) =>
		v >= 1e6
			? `${(v / 1e6).toFixed(2)}M`
			: v >= 1e3
				? `${(v / 1e3).toFixed(1)}K`
				: Math.round(v).toLocaleString();

	return (
		<div className="container mx-auto p-6 space-y-6 max-w-7xl">
			{/* ── Hero + top-stablecoins rail ─────────────────────────────── */}
			<div className="mb-12 mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
				<div>
					<h1 className="reveal-wipe text-5xl md:text-6xl font-semibold text-[#E5E5E5] leading-tight">
						Stellar Stablecoins
					</h1>
					<p
						className="reveal-wipe text-3xl md:text-4xl italic text-[#666666] font-light mt-1 mb-4"
						style={{ animationDelay: "260ms" }}
					>
						transacting globally.
					</p>
					<p className="text-lg text-[#A3A3A3] max-w-xl mb-6">
						Explore {coins.length} verified stablecoins. Every figure dated, and
						labelled with how it was measured.
					</p>
					<a href="#explore">
						<button
							type="button"
							className="px-5 py-2.5 bg-white text-[#171717] font-medium text-sm rounded-lg hover:bg-[#E5E5E5] transition-colors"
						>
							Explore Stablecoins
						</button>
					</a>
				</div>

				<div className="relative h-64 lg:h-80 overflow-hidden rounded-xl bg-[#1A1A1A] border border-[#2F2F2F]">
					<div className="sticky top-0 z-10 bg-[#1A1A1A] border-b border-[#2F2F2F] px-4 py-2">
						<span className="text-xs text-[#A3A3A3] uppercase tracking-wider font-medium">
							Top Stablecoins
						</span>
					</div>
					<div className="absolute inset-0 top-9 overflow-hidden">
						<div className="animate-scroll-up motion-reduce:animate-none">
							{[0, 1].map((loop) => (
								<div key={`loop-${loop}`}>
									{top10.map((coin) => (
										<button
											type="button"
											key={`s-${loop}-${coin.id}`}
											className="w-full flex items-center justify-between px-4 py-3 border-b border-[#252525] hover:bg-[#222222] transition-colors cursor-pointer text-left"
											onClick={() => selectCoin(coin)}
										>
											<div className="flex items-center gap-3">
												<CoinIcon
													coin={coin}
													size="sm"
													failed={failedIcons}
													onFail={onFail}
												/>
												<span className="text-sm font-medium text-[#E5E5E5]">
													{coin.ticker}
												</span>
											</div>
											<span className="text-xs text-[#666666] truncate max-w-[120px]">
												{coin.company || "—"}
											</span>
										</button>
									))}
								</div>
							))}
						</div>
					</div>
					<div className="absolute top-9 left-0 right-0 h-6 bg-gradient-to-b from-[#1A1A1A] to-transparent pointer-events-none z-[5]" />
					<div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-[#1A1A1A] to-transparent pointer-events-none z-[5]" />
				</div>
			</div>

			{/* ── Spotlight: USDT0's launch, from its own measured row ── */}
			{(() => {
				const row = coins.find((c) => c.ticker === "USDT0");
				if (!row || row.holdersRaw == null || row.supplyRaw == null)
					return null;
				return (
					<StablecoinSpotlight
						ticker="USDT0"
						lead="Now tracking USDT0"
						body="Tether's omnichain USDT went live on Stellar on 2 September 2026, and already holds"
						highlight={`${displaySupply(row.supplyRaw)} USDT0 across ${row.holdersRaw.toLocaleString("en-US")} holders`}
						href={`/stablecoins/${row.id}`}
					/>
				);
			})()}

			{/* ── Overview tiles ──────────────────────────────────────────── */}
			<div className="mb-8">
				<h2 className="text-lg font-semibold mb-4">Stablecoin Overview</h2>
				<div className="stagger-in grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
					<Card>
						<CardContent className="p-6">
							<div className="text-sm text-muted-foreground mb-2">
								Total Market Cap
							</div>
							<div className="text-3xl font-semibold tabular-nums">
								{displayUSD(totalMarketCap)}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-6">
							<div className="text-sm text-muted-foreground mb-2">
								24h DEX volume
							</div>
							<div className="text-3xl font-semibold tabular-nums">
								{totalVolume24h > 0 ? displayUSD(totalVolume24h) : "N/A"}
							</div>
							{/* Stellar Expert reports traded volume, not payments: this is
							    a 7-day trade average, and it is ~99% USDC. Transfer volume
							    (what a payments dashboard means by "volume") is an order of
							    magnitude larger and we do not measure it — so the label
							    says which one this is rather than inviting the comparison. */}
							<div className="text-[11px] text-muted-foreground mt-1">
								Traded on-chain, 7-day average
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-6">
							<div className="text-sm text-muted-foreground mb-2">
								Total Holders
							</div>
							<div className="text-3xl font-semibold tabular-nums">
								{displayHoldersCompact(totalHolders)}
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardContent className="p-6">
							<div className="text-sm text-muted-foreground mb-2">
								Tracked Stablecoins
							</div>
							<div className="text-3xl font-semibold tabular-nums">
								{coins.length}
							</div>
						</CardContent>
					</Card>
				</div>
			</div>

			{/* ── Activity bars ───────────────────────────────────────────── */}
			<div className="mb-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
				{(
					[
						{
							title: "Total Market Cap",
							data: win(marketCapSeries),
							current: totalMarketCap,
							hovered: hoveredMcap,
							setHovered: setHoveredMcap,
							format: fmtUSD,
							label: "Market Cap",
						},
						{
							title: "Total Holders",
							data: win(holdersSeries),
							current: totalHolders,
							hovered: hoveredHolders,
							setHovered: setHoveredHolders,
							format: fmtHolders,
							label: "Holders",
						},
					] as const
				).map((c) => (
					<div
						key={c.title}
						className="bg-card border border-border rounded-xl p-5"
					>
						<div className="flex items-center justify-between mb-1">
							<h3 className="text-base font-semibold tracking-tight">
								{c.title}
							</h3>
							<div className="flex items-center gap-1 text-[11px]">
								{(["30D", "90D", "ALL"] as const).map((r) => (
									<button
										key={r}
										type="button"
										onClick={() => setRange(r)}
										className={`px-2 py-0.5 rounded-md transition-colors ${
											range === r
												? "bg-white/[0.08] text-foreground"
												: "text-muted-foreground hover:text-foreground"
										}`}
									>
										{r === "ALL" ? "All" : r}
									</button>
								))}
							</div>
						</div>
						<div className="flex items-baseline gap-2 mb-4">
							<span className="text-2xl font-semibold text-[#E5E5E5] tabular-nums">
								<AnimatedNumber
									value={c.hovered ?? c.current}
									format={c.format}
								/>
							</span>
						</div>
						{c.data.length === 0 ? (
							<div className="h-20 flex items-center justify-center text-xs text-muted-foreground">
								Collecting data...
							</div>
						) : (
							<AnimatePresence mode="popLayout" initial={false}>
								<motion.div
									key={range}
									initial={{ x: 24 * rangeDir, opacity: 0 }}
									animate={{ x: 0, opacity: 1 }}
									exit={{ x: -24 * rangeDir, opacity: 0 }}
									transition={{ duration: 0.22, ease: [0.15, 0.85, 0.3, 1] }}
								>
									<BarChart
										data={c.data as unknown as Record<string, unknown>[]}
										xDataKey="date"
										aspectRatio="unset"
										className="h-20"
										margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
										animationDuration={800}
										barGap={0.08}
										onHover={(d) =>
											c.setHovered(d ? (d.value as number) : null)
										}
									>
										<Bar
											dataKey="value"
											fill={ACCENT}
											lineCap="round"
											fadedOpacity={0.35}
										/>
										<ChartTooltip
											showDatePill={false}
											showDots={false}
											rows={(p) => [
												{
													color: ACCENT,
													label: c.label,
													value: c.format(p.value as number),
												},
												{
													color: "transparent",
													label: "Date",
													value: p.date as string,
												},
											]}
										/>
									</BarChart>
								</motion.div>
							</AnimatePresence>
						)}
					</div>
				))}
			</div>

			{/* ── Analytics ───────────────────────────────────────────────── */}
			<div className="mb-8">
				<StablecoinCharts
					onIssuerClick={setSelectedIssuer}
					marketCapByToken={marketCapByToken}
					holdersByToken={holdersByToken}
					totalHolders={totalHoldersSeries}
					issuers={issuers}
				/>
			</div>

			{/* ── Explore ─────────────────────────────────────────────────── */}
			<div className="mb-6" id="explore">
				<h2 className="text-2xl font-semibold mb-1">Explore Stablecoin</h2>
				<p className="text-sm text-muted-foreground">
					{sorted.length} stablecoins tracked
				</p>
			</div>

			<div className="mb-8 flex flex-col sm:flex-row gap-3 sm:items-center">
				<div className="relative flex-1">
					<Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
					<input
						type="text"
						placeholder="Search stablecoins..."
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						className="w-full h-11 pl-12 pr-10 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={() => setSearchQuery("")}
							className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
							aria-label="Clear search"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>

				<div className="flex gap-3 items-center">
					<div className="h-11 px-2 rounded-xl border border-border bg-card flex items-center gap-1">
						<button
							type="button"
							onClick={() => setViewMode("table")}
							className={`h-9 px-2.5 rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
								viewMode === "table"
									? "bg-white/10 text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<TableIcon className="h-4 w-4" />
							<span className="text-xs">Table</span>
						</button>
						<button
							type="button"
							onClick={() => setViewMode("grid")}
							className={`h-9 px-2.5 rounded-lg transition-all duration-150 flex items-center gap-1.5 ${
								viewMode === "grid"
									? "bg-white/10 text-foreground"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<GridIcon className="h-4 w-4" />
							<span className="text-xs">Grid</span>
						</button>
					</div>

					{/* Desktop currency dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger className="hidden sm:flex h-11 px-4 min-w-[150px] bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 items-center gap-2">
							<span className="flex-1 text-left text-sm truncate">
								{selectedAsset === "all" ? "All Assets" : selectedAsset}
							</span>
							<ChevronDown className="w-4 h-4 flex-shrink-0" />
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-[180px] max-h-[400px] overflow-y-auto">
							<DropdownMenuItem onClick={() => setSelectedAsset("all")}>
								All Assets
							</DropdownMenuItem>
							{currencies.map((c) => (
								<DropdownMenuItem key={c} onClick={() => setSelectedAsset(c)}>
									{c}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					{/* Mobile currency drawer */}
					<button
						type="button"
						onClick={() => setAssetDrawerOpen(true)}
						className="sm:hidden h-11 px-4 flex-1 bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2"
					>
						<span className="flex-1 text-left text-sm truncate">
							{selectedAsset === "all" ? "All Assets" : selectedAsset}
						</span>
						<ChevronDown className="w-4 h-4 flex-shrink-0" />
					</button>
				</div>
			</div>

			<Drawer open={assetDrawerOpen} onOpenChange={setAssetDrawerOpen}>
				<DrawerContent className="max-h-[85vh]">
					<DrawerHeader className="pb-2">
						<DrawerTitle>Select Asset</DrawerTitle>
						<DrawerDescription>
							Choose which currency to filter by
						</DrawerDescription>
					</DrawerHeader>
					<div className="px-4 pb-6 space-y-1 overflow-y-auto max-h-[60vh]">
						{["all", ...currencies].map((c) => (
							<button
								type="button"
								key={c}
								onClick={() => {
									setSelectedAsset(c);
									setAssetDrawerOpen(false);
								}}
								className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-150 ${
									selectedAsset === c
										? "bg-white/10 text-foreground"
										: "text-foreground hover:bg-white/5"
								}`}
							>
								{c === "all" ? "All Assets" : c}
							</button>
						))}
					</div>
				</DrawerContent>
			</Drawer>

			{/* ── Table / grid ────────────────────────────────────────────── */}
			{sorted.length === 0 ? (
				<Card>
					<CardContent className="py-16 text-center text-muted-foreground">
						No stablecoin matches “{searchQuery}”
						{selectedAsset !== "all" ? ` in ${selectedAsset}` : ""}.
					</CardContent>
				</Card>
			) : viewMode === "table" ? (
				<div className="border rounded-xl overflow-hidden bg-card">
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead className="min-w-[250px]">ASSET</TableHead>
									<TableHead className="min-w-[200px]">ISSUER</TableHead>
									<TableHead className="min-w-[120px]">
										<button
											type="button"
											onClick={() => handleSort("supply")}
											className={`flex items-center gap-1 hover:text-foreground transition-colors ${
												sortField === "supply"
													? "text-foreground"
													: "text-muted-foreground"
											}`}
										>
											SUPPLY
											{sortField === "supply" ? (
												sortDirection === "asc" ? (
													<ArrowUp className="h-3 w-3" />
												) : (
													<ArrowDown className="h-3 w-3" />
												)
											) : (
												<ArrowUpDown className="h-3 w-3" />
											)}
										</button>
									</TableHead>
									<TableHead className="min-w-[120px]">
										<button
											type="button"
											onClick={() => handleSort("holders")}
											className={`flex items-center gap-1 hover:text-foreground transition-colors ${
												sortField === "holders"
													? "text-foreground"
													: "text-muted-foreground"
											}`}
										>
											HOLDERS
											{sortField === "holders" ? (
												sortDirection === "asc" ? (
													<ArrowUp className="h-3 w-3" />
												) : (
													<ArrowDown className="h-3 w-3" />
												)
											) : (
												<ArrowUpDown className="h-3 w-3" />
											)}
										</button>
									</TableHead>
									<TableHead className="min-w-[120px]">MARKET CAP</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody className="stagger-in">
								{paged.map((coin) => (
									<TableRow
										key={coin.id}
										onClick={() => selectCoin(coin)}
										className="cursor-pointer"
									>
										<TableCell>
											<div className="flex items-center gap-3">
												<div className="flex-shrink-0">
													<CoinIcon
														coin={coin}
														failed={failedIcons}
														onFail={onFail}
													/>
												</div>
												<div>
													<div className="font-medium flex items-center gap-2">
														{coin.name}
														<BasisTag basis={coin.basis} />
													</div>
													<div className="text-sm text-muted-foreground">
														{coin.company}
													</div>
												</div>
											</div>
										</TableCell>
										<TableCell>
											<div>
												<button
													type="button"
													className="font-medium flex items-center gap-2 cursor-pointer hover:text-foreground"
													onClick={(e) => copyIssuer(coin, e)}
												>
													<span className="truncate font-mono text-xs">
														{coin.issuerCode.slice(0, 4)}…
														{coin.issuerCode.slice(-4)}
													</span>
													{copiedId === coin.id ? (
														<Check className="h-3 w-3 text-green-500 flex-shrink-0" />
													) : (
														<Copy className="h-3 w-3 text-muted-foreground flex-shrink-0" />
													)}
												</button>
												<div className="text-sm text-muted-foreground">
													{coin.issuerDomain}
												</div>
											</div>
										</TableCell>
										<TableCell className="font-medium tabular-nums">
											{displaySupply(coin.supplyRaw)}
										</TableCell>
										<TableCell className="font-medium tabular-nums">
											{displayHolders(coin.holdersRaw)}
										</TableCell>
										<TableCell className="font-medium tabular-nums">
											{displayUSD(coin.marketCapRaw)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>

						{totalPages > 1 && (
							<div className="flex items-center justify-between px-4 py-3 border-t bg-card/50 flex-wrap gap-3">
								<div className="text-sm text-muted-foreground">
									Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
									{Math.min(currentPage * ITEMS_PER_PAGE, sorted.length)} of{" "}
									{sorted.length} results
								</div>
								<div className="flex items-center gap-1">
									{Array.from({ length: totalPages }, (_, i) => i + 1).map(
										(page) => (
											<button
												type="button"
												key={page}
												onClick={() => setCurrentPage(page)}
												className={`min-w-[40px] h-9 px-3 rounded-lg text-sm transition-all duration-150 ${
													currentPage === page
														? "bg-white/10 text-foreground"
														: "bg-muted text-foreground hover:bg-muted/80"
												}`}
											>
												{page}
											</button>
										),
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			) : (
				<div className="stagger-in grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{paged.map((coin) => {
						const info = countryInfo(coin.country, coin.peg);
						return (
							<Card
								key={coin.id}
								onClick={() => selectCoin(coin)}
								className="cursor-pointer hover:bg-muted/50 transition-colors"
							>
								<CardContent className="p-6 space-y-4">
									<div className="flex items-center gap-3">
										<div className="flex-shrink-0">
											<CoinIcon
												coin={coin}
												size="lg"
												failed={failedIcons}
												onFail={onFail}
											/>
										</div>
										<div className="flex-1 min-w-0">
											<div className="font-semibold text-lg flex items-center gap-2">
												{coin.name}
												<BasisTag basis={coin.basis} />
											</div>
											<div className="text-sm text-muted-foreground flex items-center gap-1">
												{/* biome-ignore lint/performance/noImgElement: remote flag sprite */}
												<img
													src={info.flag}
													alt={info.label}
													className="w-4 h-3"
												/>
												{coin.company}
											</div>
										</div>
									</div>
									<div className="space-y-2">
										{(
											[
												["Supply", displaySupply(coin.supplyRaw)],
												["Holders", displayHolders(coin.holdersRaw)],
												["Market Cap", displayUSD(coin.marketCapRaw)],
											] as const
										).map(([k, v]) => (
											<div
												key={k}
												className="flex justify-between items-center"
											>
												<span className="text-sm text-muted-foreground">
													{k}
												</span>
												<span className="font-medium tabular-nums">{v}</span>
											</div>
										))}
									</div>
									<div className="pt-2 border-t">
										<div className="text-xs text-muted-foreground">Issuer</div>
										<button
											type="button"
											className="font-mono text-xs flex items-center gap-2 mt-1 cursor-pointer hover:text-foreground"
											onClick={(e) => copyIssuer(coin, e)}
										>
											<span>
												{coin.issuerCode.slice(0, 4)}…
												{coin.issuerCode.slice(-4)}
											</span>
											{copiedId === coin.id ? (
												<Check className="h-3 w-3 text-green-500" />
											) : (
												<Copy className="h-3 w-3" />
											)}
										</button>
									</div>
								</CardContent>
							</Card>
						);
					})}
				</div>
			)}

			<StablecoinNewsDock news={news} />

			{/* Copy/share confirmation. Fixed above the drawer so it is visible
			    whether the click came from a row or from inside the detail. */}
			{toast && (
				<div
					role="status"
					aria-live="polite"
					className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-lg bg-[#262626] border border-[#2F2F2F] text-sm text-[#E5E5E5] shadow-lg"
				>
					{toast}
				</div>
			)}

			{/* ── Issuer detail ───────────────────────────────────────────── */}
			<Drawer
				open={!!selectedIssuer}
				onOpenChange={(o) => !o && setSelectedIssuer(null)}
			>
				<DrawerContent className="max-h-[92vh]">
					{selectedIssuer && (
						<div className="w-full max-w-5xl mx-auto">
							<DrawerHeader>
								<div className="flex items-start justify-between gap-4 w-full">
									<div className="text-left flex items-start gap-4">
										<IssuerLogo
											company={selectedIssuer.company}
											domain={selectedIssuer.domain}
											size="lg"
										/>
										<div>
											<DrawerTitle className="text-3xl">
												{selectedIssuer.company}
											</DrawerTitle>
											<DrawerDescription className="mt-1">
												{selectedIssuer.tokens.length} asset
												{selectedIssuer.tokens.length === 1 ? "" : "s"} ·{" "}
												{displayUSD(selectedIssuer.totalMarketCapUSD)}
												market cap
											</DrawerDescription>
											{(() => {
												const first = coins.find(
													(c) => c.company === selectedIssuer.company,
												);
												const domain =
													selectedIssuer.domain || first?.issuerDomain;
												const country = first?.country;
												if (!domain && !country) return null;
												return (
													<div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
														{domain && (
															<a
																href={`https://${domain}`}
																target="_blank"
																rel="noopener noreferrer"
																className="hover:text-foreground underline-offset-2 hover:underline"
															>
																{domain}
															</a>
														)}
														{country && <span>{country}</span>}
													</div>
												);
											})()}
										</div>
									</div>
									<button
										type="button"
										onClick={() => setSelectedIssuer(null)}
										className="p-2 rounded-lg text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/[0.06] transition-colors flex-shrink-0"
										aria-label="Close"
									>
										<X className="w-5 h-5" />
									</button>
								</div>
							</DrawerHeader>

							<div
								key={selectedIssuer.company}
								className="push-in p-6 space-y-6 overflow-y-auto"
							>
								{selectedIssuer.hasEstimate && (
									<div className="rounded-lg border border-[#2F2F2F] bg-[#1A1A1A] p-4 text-sm text-[#A3A3A3]">
										This total includes at least one asset whose figures are
										hand-checked rather than measured this cycle. The per-asset
										rows below say which.
									</div>
								)}

								{(() => {
									// 30-day supply history for this issuer (or one of its
									// tokens): sum the per-token daily supply series.
									const tokens = selectedIssuer.tokens;
									const pick = issuerToken === "all" ? tokens : [issuerToken];
									const rows = supplyByToken
										.slice(-31)
										.map((r) => {
											let total = 0;
											let counted = 0;
											for (const t of pick)
												if (typeof r[t] === "number") {
													total += r[t] as number;
													counted++;
												}
											return { date: String(r._date), value: total, counted };
										})
										.filter((r) => r.counted > 0);
									const first = rows[0]?.value ?? null;
									const last = rows[rows.length - 1]?.value ?? null;
									const change =
										first !== null && last !== null ? last - first : null;
									return (
										<div className="bg-muted rounded-lg p-4">
											<div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
												<div>
													<div className="text-sm font-medium">
														Supply · last 30 days
													</div>
													<div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
														{last !== null ? displaySupply(last) : "—"}
														{change !== null && (
															<span
																className={
																	change >= 0
																		? "text-emerald-400 ml-2"
																		: "text-red-400 ml-2"
																}
															>
																{change >= 0 ? "+" : "−"}
																{displaySupply(Math.abs(change))} over the
																window
															</span>
														)}
													</div>
												</div>
												{tokens.length > 1 && (
													<div className="flex items-center gap-1 text-[11px]">
														{["all", ...tokens].map((t) => (
															<button
																key={t}
																type="button"
																onClick={() => setIssuerToken(t)}
																className={`px-2 py-0.5 rounded-md transition-colors ${
																	issuerToken === t
																		? "bg-white/[0.08] text-foreground"
																		: "text-muted-foreground hover:text-foreground"
																}`}
															>
																{t === "all" ? "All" : t}
															</button>
														))}
													</div>
												)}
											</div>
											{rows.length < 2 ? (
												<p className="text-xs text-muted-foreground">
													Not enough daily points yet to draw a history.
												</p>
											) : (
												<BarChart
													data={rows as unknown as Record<string, unknown>[]}
													xDataKey="date"
													aspectRatio="unset"
													className="h-20"
													margin={{ top: 2, right: 2, bottom: 2, left: 2 }}
													animationDuration={600}
													barGap={0.08}
												>
													<Bar
														dataKey="value"
														fill={ACCENT}
														lineCap="round"
														fadedOpacity={0.35}
													/>
													<ChartTooltip
														showDatePill={false}
														showDots={false}
														rows={(p) => [
															{
																color: ACCENT,
																label: "Supply",
																value: displaySupply(p.value as number),
															},
															{
																color: "transparent",
																label: "Date",
																value: p.date as string,
															},
														]}
													/>
												</BarChart>
											)}
										</div>
									);
								})()}

								<div>
									<h3 className="text-lg font-semibold mb-4">Assets</h3>
									<div className="space-y-2">
										{coins
											.filter((c) => c.company === selectedIssuer.company)
											.sort(
												(a, b) =>
													(b.marketCapRaw ?? -1) - (a.marketCapRaw ?? -1),
											)
											.map((c) => (
												<button
													type="button"
													key={c.id}
													onClick={() => {
														setSelectedIssuer(null);
														selectCoin(c);
													}}
													className="w-full text-left flex items-center gap-3 p-3 rounded-lg bg-muted hover:bg-muted/70 transition-colors"
												>
													<CoinIcon
														coin={c}
														failed={failedIcons}
														onFail={onFail}
													/>
													<div className="flex-1 min-w-0">
														<div className="font-medium flex items-center gap-2">
															{c.ticker}
															<BasisTag basis={c.basis} />
														</div>
														<div className="text-xs text-muted-foreground">
															{displaySupply(c.supplyRaw)} ·{" "}
															{displayHolders(c.holdersRaw)} holders
														</div>
													</div>
													<div className="text-right text-sm font-semibold tabular-nums">
														{displayUSD(c.marketCapRaw)}
													</div>
												</button>
											))}
									</div>
								</div>

								<p className="text-xs text-muted-foreground leading-relaxed">
									Totals sum USD market cap, the only figure comparable across
									currencies — adding raw supply would treat pesos and dollars
									as the same unit. Select an asset for its issuer account, DeFi
									context and history.
								</p>
							</div>
						</div>
					)}
				</DrawerContent>
			</Drawer>

			{/* ── Detail ──────────────────────────────────────────────────── */}
			<Drawer open={!!selectedCoin} onOpenChange={(o) => !o && closeDrawer()}>
				<DrawerContent className="max-h-[92vh]">
					{selectedCoin && (
						<>
							<DrawerHeader className="w-full max-w-5xl mx-auto">
								<div className="flex items-start justify-between gap-4 w-full">
									<div className="flex items-center gap-4 min-w-0">
										<CoinIcon
											coin={selectedCoin}
											size="xl"
											failed={failedIcons}
											onFail={onFail}
										/>
										<div className="min-w-0 text-left">
											<DrawerTitle className="text-3xl flex items-center gap-3">
												{selectedCoin.name}
												<BasisTag basis={selectedCoin.basis} />
											</DrawerTitle>
											<DrawerDescription className="flex items-center gap-2 mt-1">
												{/* biome-ignore lint/performance/noImgElement: remote flag sprite */}
												<img
													src={
														countryInfo(selectedCoin.country, selectedCoin.peg)
															.flag
													}
													alt=""
													className="w-4 h-3"
												/>
												{selectedCoin.company}
												{selectedCoin.assetType
													? ` · ${selectedCoin.assetType}`
													: ""}
											</DrawerDescription>
										</div>
									</div>
									<div className="flex items-center gap-2 flex-shrink-0">
										<button
											type="button"
											onClick={() => shareCoin(selectedCoin)}
											className="p-2 rounded-lg text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/[0.06] transition-colors"
											aria-label="Share this asset"
										>
											<Share2 className="w-5 h-5" />
										</button>
										<button
											type="button"
											onClick={closeDrawer}
											className="p-2 rounded-lg text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/[0.06] transition-colors"
											aria-label="Close"
										>
											<X className="w-5 h-5" />
										</button>
									</div>
								</div>
							</DrawerHeader>

							<div
								key={selectedCoin.id}
								className="push-in w-full max-w-5xl mx-auto p-6 space-y-6 overflow-y-auto"
							>
								{selectedCoin.basis !== "live" && selectedCoin.note && (
									<div className="rounded-lg border border-[#2F2F2F] bg-[#1A1A1A] p-4 text-sm text-[#A3A3A3]">
										{selectedCoin.note}
									</div>
								)}

								<div>
									<div className="flex items-center justify-between mb-4">
										<h3 className="text-lg font-semibold">Key Metrics</h3>
										{selectedCoin.peg && selectedCoin.peg !== "USD" && (
											<div className="flex gap-1 bg-muted rounded-lg p-1">
												{(["usd", "native"] as const).map((mode) => (
													<button
														key={mode}
														type="button"
														onClick={() => setPriceDisplay(mode)}
														className={`px-3 py-1 text-xs rounded transition-all ${
															priceDisplay === mode
																? "bg-background text-foreground shadow-sm"
																: "text-muted-foreground hover:text-foreground"
														}`}
													>
														{mode === "usd" ? "USD" : selectedCoin.peg}
													</button>
												))}
											</div>
										)}
									</div>
									<div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
										{(
											[
												[
													"Current Price",
													priceDisplay === "usd"
														? displayPrice(selectedCoin.priceRaw)
														: `1.00 ${selectedCoin.peg}`,
												],
												[
													"24h Volume",
													selectedCoin.volumeRaw
														? displayUSD(selectedCoin.volumeRaw)
														: "N/A",
												],
												["Total Supply", displaySupply(selectedCoin.supplyRaw)],
												["Holders", displayHolders(selectedCoin.holdersRaw)],
												["Market Cap", displayUSD(selectedCoin.marketCapRaw)],
												["Pegged To", selectedCoin.peg ?? "N/A"],
											] as const
										).map(([k, v]) => (
											<div
												key={k}
												className="bg-muted rounded-lg p-4 space-y-1"
											>
												<div className="text-sm text-muted-foreground">{k}</div>
												<div className="text-xl font-semibold tabular-nums">
													{v}
												</div>
											</div>
										))}
									</div>
								</div>

								<div>
									<h3 className="text-lg font-semibold mb-4">
										Issuer Information
									</h3>
									<div className="bg-muted rounded-lg p-4 space-y-3">
										<div>
											<div className="text-sm text-muted-foreground mb-1">
												Issuer Address
											</div>
											<button
												type="button"
												className="font-mono text-sm flex items-start gap-2 cursor-pointer hover:text-foreground text-left"
												onClick={(e) => copyIssuer(selectedCoin, e)}
											>
												<span className="break-all">
													{selectedCoin.issuerCode}
												</span>
												{copiedId === selectedCoin.id ? (
													<Check className="h-4 w-4 text-green-500 flex-shrink-0" />
												) : (
													<Copy className="h-4 w-4 flex-shrink-0" />
												)}
											</button>
										</div>
										<div>
											<div className="text-sm text-muted-foreground mb-1">
												Home Domain
											</div>
											<div className="text-sm">
												{selectedCoin.issuerDomain || "—"}
											</div>
										</div>
										<div>
											<div className="text-sm text-muted-foreground mb-1">
												Country
											</div>
											<div className="text-sm flex items-center gap-2">
												{/* biome-ignore lint/performance/noImgElement: remote flag sprite */}
												<img
													src={
														countryInfo(selectedCoin.country, selectedCoin.peg)
															.flag
													}
													alt=""
													className="w-5 h-4"
												/>
												{
													countryInfo(selectedCoin.country, selectedCoin.peg)
														.label
												}
											</div>
										</div>
										<div>
											<div className="text-sm text-muted-foreground mb-1">
												Measured
											</div>
											<div className="text-sm">
												{selectedCoin.measuredAt
													? `${new Date(selectedCoin.measuredAt).toLocaleString(
															"en-US",
															{
																dateStyle: "medium",
																timeStyle: "short",
																timeZone: "UTC",
															},
														)} UTC · ${selectedCoin.basis}`
													: "—"}
											</div>
										</div>
									</div>
								</div>

								<div>
									<h3 className="text-lg font-semibold mb-4">DeFi</h3>
									{defiLoading && !defi ? (
										<div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
											Loading…
										</div>
									) : (
										<div className="space-y-3">
											{(
												defi?.blendPools ?? (defi?.blend ? [defi.blend] : [])
											).map((pool) => (
												<a
													key={pool.poolId}
													href={pool.poolUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-3 p-4 bg-muted rounded-lg hover:bg-muted/80 transition-colors"
												>
													<VenueLogo name={pool.poolName} />
													<div className="flex-1 min-w-0">
														<div className="flex items-center gap-2 flex-wrap">
															<span className="text-sm font-medium">
																Lend {selectedCoin.ticker} on Blend
															</span>
															{/* A null APY is "we could not read the pool",
															    never 0% — the badge is simply absent. */}
															{pool.supplyAPY != null && (
																<span className="text-xs font-medium tabular-nums px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400">
																	{pool.supplyAPY.toFixed(2)}% APY
																</span>
															)}
														</div>
														<p className="text-xs text-muted-foreground mt-0.5">
															{pool.poolName}
															{pool.supplyAPY == null
																? " · rates unreadable right now"
																: pool.borrowAPY == null
																	? ""
																	: ` · Borrow APY: ${pool.borrowAPY.toFixed(2)}%`}
														</p>
													</div>
													<ExternalLink className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
												</a>
											))}

											<div className="bg-muted rounded-lg p-4">
												<div className="text-sm font-medium mb-4">
													Liquidity Pools
												</div>
												{/* The gate is the VENUE total, not Horizon's classic
												    pool count. Gating on Horizon told a USDT0 reader
												    "no pool holds this asset" while a Soroban venue
												    held 2.5M of it and the asset's own page linked
												    that pool — Horizon indexes classic AMM pools only,
												    and cannot see a contract pool. */}
												{defi?.liquidity == null &&
												(defi?.venues?.venues ?? []).length === 0 ? (
													<p className="text-xs text-muted-foreground">
														Horizon&apos;s pool index was unreachable. That
														means we could not look — not that{" "}
														{selectedCoin.ticker} has no pools.
													</p>
												) : (defi?.venues?.venues ?? []).every(
														(v) => v.poolCount === 0,
													) && (defi?.liquidity?.poolCount ?? 0) === 0 ? (
													<p className="text-xs text-muted-foreground">
														No pool we index — classic AMM, Aquarius, Soroswap
														or Sushi — currently holds this asset.
													</p>
												) : (
													<>
														{(() => {
															const v = defi?.venues;
															const rows = v?.venues ?? [];
															const pooled = rows.reduce(
																(x, r) => x + r.assetPooled,
																0,
															);
															const pooledUSD = rows.every(
																(r) => r.assetPooledUSD === null,
															)
																? null
																: rows.reduce(
																		(x, r) => x + (r.assetPooledUSD ?? 0),
																		0,
																	);
															const pools = rows.reduce(
																(x, r) => x + r.poolCount,
																0,
															);
															return (
																<>
																	<div className="grid grid-cols-3 gap-4 pb-4 mb-3 border-b border-border">
																		<div>
																			<div className="text-xs text-muted-foreground mb-1">
																				Total Value Locked
																			</div>
																			<div className="text-xl font-semibold tabular-nums">
																				{displayUSD(pooledUSD)}
																			</div>
																		</div>
																		<div>
																			<div className="text-xs text-muted-foreground mb-1">
																				Total Pools
																			</div>
																			<div className="text-xl font-semibold tabular-nums">
																				{pools}
																			</div>
																		</div>
																		<div>
																			<div className="text-xs text-muted-foreground mb-1">
																				Pooled
																			</div>
																			<div className="text-xl font-semibold tabular-nums">
																				{displaySupply(pooled)}{" "}
																				<span className="text-sm font-normal text-muted-foreground">
																					{selectedCoin.ticker}
																				</span>
																			</div>
																		</div>
																	</div>
																	<div className="space-y-2">
																		{rows.map((r) => (
																			<a
																				key={r.name}
																				href={r.url}
																				target="_blank"
																				rel="noopener noreferrer"
																				className="flex items-center justify-between gap-3 text-sm rounded-md px-2 py-2 -mx-2 hover:bg-white/[0.04] transition-colors"
																			>
																				<div className="flex items-center gap-2.5 min-w-0">
																					<VenueLogo name={r.name} />
																					<span className="font-medium">
																						{r.name}
																					</span>
																					<span className="text-xs text-muted-foreground">
																						{r.poolCount} pool
																						{r.poolCount === 1 ? "" : "s"}
																						{r.measuredPools < r.poolCount
																							? ` · top ${r.measuredPools} measured`
																							: ""}
																						{r.largest
																							? ` · largest ${selectedCoin.ticker}/${r.largest.counter}`
																							: ""}
																					</span>
																				</div>
																				<div className="text-right tabular-nums flex-shrink-0">
																					<div>
																						{displaySupply(r.assetPooled)}
																					</div>
																					<div className="text-xs text-muted-foreground">
																						{displayUSD(r.assetPooledUSD)}
																					</div>
																				</div>
																			</a>
																		))}
																	</div>
																	{v &&
																		(v.unreadable.length > 0 ||
																			v.notIndexed.length > 0) && (
																			<p className="text-[11px] text-muted-foreground/70 mt-3">
																				{v.unreadable.length > 0 && (
																					<>
																						Could not read{" "}
																						{v.unreadable.join(", ")} right now
																						— not shown, not zero.{" "}
																					</>
																				)}
																				{v.notIndexed.length > 0 && (
																					<>
																						Not yet indexed:{" "}
																						{v.notIndexed.join(", ")}.
																					</>
																				)}
																			</p>
																		)}
																</>
															);
														})()}
														<p className="text-[11px] text-muted-foreground/70 mt-3 leading-relaxed">
															This is the {selectedCoin.ticker} side of each
															pool only — the other side is priced in tokens we
															do not measure, so doubling it would be a guess,
															not a measurement.
														</p>
													</>
												)}
											</div>

											{defi?.contract && (
												<div className="bg-muted rounded-lg p-4">
													<div className="text-xs text-muted-foreground mb-1">
														Asset Contract (SAC)
													</div>
													<div className="flex items-center gap-2">
														<button
															type="button"
															onClick={async () => {
																await navigator.clipboard.writeText(
																	defi.contract as string,
																);
																say("Contract ID copied to clipboard");
															}}
															className="font-mono text-sm hover:text-foreground flex items-center gap-2"
														>
															<span className="break-all">
																{defi.contract.slice(0, 8)}…
																{defi.contract.slice(-6)}
															</span>
															<Copy className="h-4 w-4 flex-shrink-0" />
														</button>
														<a
															href={`https://stellar.expert/explorer/public/contract/${defi.contract}`}
															target="_blank"
															rel="noopener noreferrer"
															className="text-muted-foreground hover:text-foreground"
														>
															<ExternalLink className="h-4 w-4" />
														</a>
													</div>
												</div>
											)}
										</div>
									)}
								</div>

								<div>
									<h3 className="text-lg font-semibold mb-4">External Links</h3>
									<div className="flex flex-wrap gap-2">
										<a
											href={`https://stellar.expert/explorer/public/asset/${selectedCoin.ticker}-${selectedCoin.issuerCode}`}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-white/[0.04] border border-border hover:bg-white/[0.07] transition-colors"
										>
											Stellar Expert <ExternalLink className="w-3 h-3" />
										</a>
										<a
											href={`https://horizon.stellar.org/accounts/${selectedCoin.issuerCode}`}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-white/[0.04] border border-border hover:bg-white/[0.07] transition-colors"
										>
											Horizon <ExternalLink className="w-3 h-3" />
										</a>
										{selectedCoin.issuerDomain && (
											<a
												href={`https://${selectedCoin.issuerDomain}`}
												target="_blank"
												rel="noopener noreferrer"
												className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg bg-white/[0.04] border border-border hover:bg-white/[0.07] transition-colors"
											>
												{selectedCoin.issuerDomain}{" "}
												<ExternalLink className="w-3 h-3" />
											</a>
										)}
									</div>
								</div>
							</div>
						</>
					)}
				</DrawerContent>
			</Drawer>
		</div>
	);
}
