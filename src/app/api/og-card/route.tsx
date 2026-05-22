/**
 * Server-side 1200×675 PNG snapshot of Stellar's developer-activity
 * dashboard, rendered via Next.js's ImageResponse (Satori under the hood).
 *
 * Replaces the previous client-side html-to-image flow, which had three
 * unfixable issues: (1) fetch-failures in production, (2) chart flicker on
 * the on-page chart from html-to-image's getComputedStyle DOM walk, and
 * (3) browser-specific clipboard / capture timing bugs.
 *
 * GET /api/og-card           → PNG (inline)
 * GET /api/og-card?download=1 → PNG (Content-Disposition: attachment)
 */

import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ecData from "@/data/electric-capital-stellar.json";

export const runtime = "nodejs";

/** Read the Stellar PNG from /public at module load, embed as data URI.
 *  Satori (ImageResponse) doesn't render `<img src="/foo.png">` unless
 *  the src is a fully-resolved URL or data URI. Reading once at module
 *  init keeps the per-request render fast. */
const STELLAR_LOGO_DATA_URI = (() => {
	try {
		const buf = readFileSync(
			join(process.cwd(), "public", "stellar-xlm-logo.png"),
		);
		return `data:image/png;base64,${buf.toString("base64")}`;
	} catch {
		return null;
	}
})();

const STELLAR_GOLD = "#FDDA24";
const BG = "#0a0a0a";
const CARD_BG = "#171717";
const BORDER = "rgba(255,255,255,0.06)";
const FG = "#E5E5E5";
const MUTED = "#A3A3A3";

interface Series {
	date: string;
	mad: number;
}

interface Peer {
	id: number;
	name: string;
	current: number;
	series: Series[];
}

function deltaPct(current: number, previous: number): number {
	if (!previous) return 0;
	return Math.round(((current - previous) / previous) * 100);
}

/** Build an SVG path string for the MAD time series, fit inside box. */
function buildChartPaths(
	series: Series[],
	w: number,
	h: number,
): { line: string; area: string; max: number } {
	if (series.length < 2) return { line: "", area: "", max: 0 };
	const values = series.map((p) => p.mad);
	const min = Math.min(...values);
	const max = Math.max(...values);
	const range = Math.max(max - min, 1);
	const stepX = w / (series.length - 1);

	const points = series.map((p, i) => {
		const x = i * stepX;
		const y = h - ((p.mad - min) / range) * h * 0.9 - h * 0.05;
		return [x, y] as const;
	});

	const line = points
		.map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0].toFixed(1)} ${pt[1].toFixed(1)}`)
		.join(" ");
	const area = `${line} L ${w.toFixed(1)} ${h.toFixed(1)} L 0 ${h.toFixed(1)} Z`;
	return { line, area, max };
}

function StatBlock({ label, value }: { label: string; value: string }) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				flex: 1,
				background: CARD_BG,
				border: `1px solid ${BORDER}`,
				borderRadius: 14,
				padding: "20px 22px",
			}}
		>
			<div
				style={{
					fontSize: 14,
					letterSpacing: "0.06em",
					textTransform: "uppercase",
					color: MUTED,
					marginBottom: 8,
				}}
			>
				{label}
			</div>
			<div
				style={{
					fontSize: 34,
					fontWeight: 700,
					color: FG,
				}}
			>
				{value}
			</div>
		</div>
	);
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const isDownload = sp.get("download") === "1";

	const d = ecData as {
		asOf: string;
		mad: {
			total: number;
			oneYearAgo: number;
		};
		commits28d: { total: number };
		tenure: { fullTime: number };
		series365d: Series[];
		peers: Peer[];
	};

	const yoyPct = deltaPct(d.mad.total, d.mad.oneYearAgo);
	const yoyStr = `${yoyPct >= 0 ? "+" : ""}${yoyPct}%`;

	// Rank Stellar among Stellar + peers.
	const ranked = [
		{ name: "Stellar", current: d.mad.total },
		...d.peers.map((p) => ({ name: p.name, current: p.current })),
	].sort((a, b) => b.current - a.current);
	const stellarRank = ranked.findIndex((e) => e.name === "Stellar") + 1;

	// Chart geometry inside the card. Card is 1600×900 with 64px padding.
	const chartW = 1472;
	const chartH = 320;
	const { line, area } = buildChartPaths(d.series365d, chartW, chartH);

	const dateLabel = (() => {
		try {
			return new Date(d.asOf).toLocaleDateString("en-US", {
				month: "long",
				day: "numeric",
				year: "numeric",
			});
		} catch {
			return d.asOf;
		}
	})();

	let img: ImageResponse;
	try {
		img = new ImageResponse(
			(
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						width: 1600,
						height: 900,
						background: BG,
						color: FG,
						fontFamily: "system-ui, -apple-system, sans-serif",
						padding: 64,
						border: `1px solid ${BORDER}`,
					}}
				>
					{/* Header */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginBottom: 20,
						}}
					>
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 12,
							}}
						>
							{STELLAR_LOGO_DATA_URI ? (
								<img
									src={STELLAR_LOGO_DATA_URI}
									width={42}
									height={42}
									style={{ filter: "invert(1)" }}
									alt=""
								/>
							) : null}
							<div
								style={{
									fontSize: 30,
									fontWeight: 600,
									color: FG,
									letterSpacing: "-0.01em",
								}}
							>
								Stellar Developer Activity
							</div>
						</div>
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								alignItems: "flex-end",
								fontSize: 16,
								color: "#737373",
								gap: 6,
							}}
						>
							<span>{dateLabel}</span>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
								}}
							>
								{/* Electric Capital lightning bolt mark */}
								<svg
									width="18"
									height="18"
									viewBox="0 0 100 100"
									xmlns="http://www.w3.org/2000/svg"
								>
									<rect width="100" height="100" rx="10" fill="#00BFE9" />
									<path
										d="M55 12 L24 56 H44 L37 88 L74 40 H52 L62 12 Z"
										fill="#FFFFFF"
									/>
								</svg>
								<span>Source: Electric Capital</span>
							</div>
						</div>
					</div>

					{/* Stats row */}
					<div
						style={{
							display: "flex",
							gap: 14,
							marginBottom: 20,
						}}
					>
						<StatBlock
							label="Active devs (28d)"
							value={d.mad.total.toLocaleString()}
						/>
						<StatBlock
							label="Commits (28d)"
							value={d.commits28d.total.toLocaleString()}
						/>
						<StatBlock label="YoY growth" value={yoyStr} />
						<StatBlock
							label="Full-time devs"
							value={d.tenure.fullTime.toLocaleString()}
						/>
					</div>

					{/* Chart section */}
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							flex: 1,
						}}
					>
						<div
							style={{
								fontSize: 14,
								letterSpacing: "0.06em",
								textTransform: "uppercase",
								color: MUTED,
								marginBottom: 6,
							}}
						>
							Monthly active devs over the last year
						</div>
						<svg
							width={chartW}
							height={chartH}
							viewBox={`0 0 ${chartW} ${chartH}`}
							xmlns="http://www.w3.org/2000/svg"
							style={{ display: "block" }}
						>
							<defs>
								<linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
									<stop
										offset="0%"
										stopColor={STELLAR_GOLD}
										stopOpacity="0.4"
									/>
									<stop
										offset="100%"
										stopColor={STELLAR_GOLD}
										stopOpacity="0.02"
									/>
								</linearGradient>
							</defs>
							<path d={area} fill="url(#g)" />
							<path
								d={line}
								stroke={STELLAR_GOLD}
								strokeWidth="2.5"
								fill="none"
								strokeLinejoin="round"
							/>
						</svg>
					</div>

					{/* Footer */}
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							marginTop: 20,
							paddingTop: 20,
							borderTop: `1px solid ${BORDER}`,
							fontSize: 17,
							color: MUTED,
						}}
					>
						<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
							{STELLAR_LOGO_DATA_URI ? (
								<img
									src={STELLAR_LOGO_DATA_URI}
									width={18}
									height={18}
									style={{ filter: "invert(1)" }}
									alt=""
								/>
							) : null}
							<span>
								Stellar ranks{" "}
								<span style={{ color: STELLAR_GOLD, fontWeight: 600 }}>
									#{stellarRank}
								</span>{" "}
								of {ranked.length} tracked L1s by active devs
							</span>
						</div>
						<span style={{ color: FG, fontWeight: 600 }}>
							stellarlight.xyz
						</span>
					</div>
				</div>
			),
			{
				width: 1600,
				height: 900,
			},
		);
	} catch (err) {
		console.error("og-card render failed", err);
		return NextResponse.json({ error: "render failed" }, { status: 500 });
	}

	// ImageResponse extends Response; we want to add a download header when
	// requested and keep edge-cacheable defaults otherwise.
	const headers = new Headers(img.headers);
	if (isDownload) {
		const date = new Date().toISOString().slice(0, 10);
		headers.set(
			"Content-Disposition",
			`attachment; filename="stellar-dev-activity-${date}.png"`,
		);
	}
	headers.set(
		"Cache-Control",
		"public, s-maxage=300, stale-while-revalidate=600",
	);
	return new NextResponse(img.body, { headers, status: 200 });
}
