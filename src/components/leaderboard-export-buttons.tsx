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
			// Dynamic import keeps html-to-image out of the initial bundle —
			// it's only needed when the user actually clicks the button.
			const { toPng } = await import("html-to-image");
			const dataUrl = await toPng(target, {
				cacheBust: true,
				backgroundColor: "#0a0a0a",
				pixelRatio: 2,
				// Skip lucide icons with currentColor + foreignObject quirks if
				// any element fails to render — keep going rather than throwing.
				skipFonts: false,
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
				title="Download the dev-activity dashboard as a PNG image"
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
