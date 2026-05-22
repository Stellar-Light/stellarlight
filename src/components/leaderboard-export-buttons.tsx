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

			// Temporarily move the card on-screen so html-to-image gets correct
			// bounding-rect dimensions. Capturing an element positioned off-
			// screen (left: 100vw) was producing cropped PNGs because the
			// browser's getBoundingClientRect() clamped against the document
			// width in some cases. Restoring position after capture means the
			// user sees at most a single frame's flicker.
			const saved = {
				position: target.style.position,
				top: target.style.top,
				left: target.style.left,
				zIndex: target.style.zIndex,
				opacity: target.style.opacity,
			};
			target.style.position = "fixed";
			target.style.top = "0";
			target.style.left = "0";
			target.style.zIndex = "-1";
			target.style.opacity = "1";

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
				style: { transform: "none" },
				skipFonts: false,
			});

			// Restore off-screen state.
			target.style.position = saved.position;
			target.style.top = saved.top;
			target.style.left = saved.left;
			target.style.zIndex = saved.zIndex;
			target.style.opacity = saved.opacity;

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
