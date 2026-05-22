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

			// Capture without ever painting the card on-screen.
			//
			// Earlier we briefly moved the card to top:0/left:0/zIndex:-1 so
			// html-to-image would see a correctly-positioned bounding rect —
			// but z-index:-1 doesn't reliably hide it (the dark theme leaves
			// transparent regions where the card briefly peeks through). The
			// user reported a ~1s flash.
			//
			// New approach: move it to top:0/left:0 BUT also set
			// visibility:"hidden". `visibility:hidden` keeps the element in
			// layout (ResizeObserver fires, getBoundingClientRect works) but
			// never paints. We then override visibility to "visible" *only on
			// the cloned snapshot* via html-to-image's `style` option, so the
			// captured PNG renders normally while the user sees nothing.
			const saved = {
				position: target.style.position,
				top: target.style.top,
				left: target.style.left,
				zIndex: target.style.zIndex,
				visibility: target.style.visibility,
			};
			target.style.position = "fixed";
			target.style.top = "0";
			target.style.left = "0";
			target.style.zIndex = "-1";
			target.style.visibility = "hidden";

			// Two animation frames + a tick so the chart's ResizeObserver
			// has fired and any SVG paths are committed.
			await new Promise((r) =>
				requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
			);
			await new Promise((r) => setTimeout(r, 80));

			const dataUrl = await toPng(target, {
				cacheBust: true,
				backgroundColor: "#0a0a0a",
				pixelRatio: 2,
				width: 1200,
				height: 675,
				canvasWidth: 1200,
				canvasHeight: 675,
				// Override the cloned root's styles so the snapshot renders
				// fully visible even though the source on the page is hidden.
				style: { transform: "none", visibility: "visible" },
				skipFonts: false,
			});

			// Restore previous style values so the card returns to off-screen.
			target.style.position = saved.position;
			target.style.top = saved.top;
			target.style.left = saved.left;
			target.style.zIndex = saved.zIndex;
			target.style.visibility = saved.visibility;

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
