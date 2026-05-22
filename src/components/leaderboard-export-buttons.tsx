"use client";

import { useState } from "react";
import { Download, FileJson, FileText, ImageDown, Loader2 } from "lucide-react";

interface Props {
	sort: string;
	range: string;
	category: string | null;
	/** DOM id of the element to snapshot for the PNG export */
	snapshotTargetId: string;
}

function qs(sort: string, range: string, category: string | null, extra?: Record<string, string>): string {
	const sp = new URLSearchParams();
	sp.set("sort", sort);
	sp.set("range", range);
	if (category) sp.set("category", category);
	for (const [k, v] of Object.entries(extra ?? {})) sp.set(k, v);
	return sp.toString();
}

export function LeaderboardExportButtons({
	sort,
	range,
	category,
	snapshotTargetId,
}: Props) {
	const [pngBusy, setPngBusy] = useState(false);

	const handlePng = async () => {
		const target = document.getElementById(snapshotTargetId);
		if (!target) return;
		setPngBusy(true);
		try {
			const { toPng } = await import("html-to-image");

			// The shareable card is permanently parked off-screen at
			// left: -2000px (see EcosystemShareableCard). We don't touch
			// its style here — that previously caused forced reflows which
			// flickered the on-page chart's ResizeObserver. html-to-image
			// captures using the explicit width/height options below rather
			// than the off-screen bounding rect.
			//
			// One RAF + tick to ensure any pending paint / font load has
			// settled before we walk the DOM.
			await new Promise((r) =>
				requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
			);

			const dataUrl = await toPng(target, {
				// cacheBust appends ?cacheBust=... query strings — fine locally
				// but some production CDNs return CORS errors on those URLs.
				// Disabling avoids the entire class of fetch failures since
				// our card now uses an inline data URI for the Stellar logo.
				cacheBust: false,
				backgroundColor: "#0a0a0a",
				pixelRatio: 2,
				width: 1200,
				height: 675,
				canvasWidth: 1200,
				canvasHeight: 675,
				style: { transform: "none" },
				// skipFonts: true skips html-to-image's fontEmbedCSS step,
				// which otherwise tries to fetch every CSS @font-face rule on
				// the page and inline it. Production deploys often serve fonts
				// with strict CORS / from cross-origin CDNs, which makes that
				// fetch fail and crashes the whole capture. Our card uses only
				// system fonts (-apple-system, BlinkMacSystemFont, …) so we
				// don't need any external font embedding.
				skipFonts: true,
				// If any image fails to inline (shouldn't happen now that the
				// only <img> uses a data URI, but defensive), substitute a 1×1
				// transparent pixel rather than aborting the whole capture.
				imagePlaceholder:
					"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=",
			});

			const link = document.createElement("a");
			const date = new Date().toISOString().slice(0, 10);
			link.download = `stellar-dev-activity-${date}.png`;
			link.href = dataUrl;
			document.body.appendChild(link);
			link.click();
			link.remove();
		} catch (err) {
			console.error("PNG export failed", err);
		} finally {
			setPngBusy(false);
		}
	};

	const baseBtn =
		"inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/50 bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors";

	return (
		<div className="flex items-center gap-2">
			<button
				type="button"
				onClick={handlePng}
				disabled={pngBusy}
				className={`${baseBtn} disabled:opacity-50`}
				title="Download a Twitter-friendly snapshot (1200×675) of Stellar's dev activity"
			>
				{pngBusy ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
				) : (
					<ImageDown className="w-3.5 h-3.5" />
				)}
				PNG
			</button>
			<a
				href={`/api/leaderboard?${qs(sort, range, category)}`}
				target="_blank"
				rel="noopener noreferrer"
				className={baseBtn}
				title="Open the leaderboard as JSON"
			>
				<FileJson className="w-3.5 h-3.5" />
				JSON
			</a>
			<a
				href={`/api/leaderboard?${qs(sort, range, category, { format: "csv" })}`}
				className={baseBtn}
				title="Download the leaderboard as a CSV"
			>
				<FileText className="w-3.5 h-3.5" />
				CSV
			</a>
		</div>
	);
}
