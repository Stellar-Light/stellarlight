"use client";

import { useState } from "react";
import { FileJson, ImageDown, Loader2, Sparkles } from "lucide-react";

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

			// Briefly move the card to top:0/left:0 with visibility:hidden so
			// html-to-image gets a correct bounding rect AND the chart's
			// ResizeObserver has definitely fired with the right dimensions.
			// `visibility: hidden` keeps it invisible to the user. We override
			// `visibility: visible` on the cloned snapshot via the `style`
			// option so the captured PNG renders fully.
			const saved = {
				left: target.style.left,
				visibility: target.style.visibility,
			};
			target.style.left = "0px";
			target.style.visibility = "hidden";

			// Two animation frames + a tick to let any pending layout settle.
			await new Promise((r) =>
				requestAnimationFrame(() => requestAnimationFrame(() => r(null))),
			);
			await new Promise((r) => setTimeout(r, 100));

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
				// Override the cloned root's styles so the snapshot renders
				// fully visible even though the source on the page is hidden.
				style: { transform: "none", visibility: "visible" },
				// If any image fails to inline (shouldn't happen now that the
				// only <img> uses a data URI, but defensive), substitute a 1×1
				// transparent pixel rather than aborting the whole capture.
				imagePlaceholder:
					"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEUAAACnej3aAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=",
			});

			// Restore off-screen position.
			target.style.left = saved.left;
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
				href="/skills/stellar-developer-activity.md"
				target="_blank"
				rel="noopener noreferrer"
				className={baseBtn}
				title="Open the Claude / AI agent skill manifest for Stellar developer activity"
			>
				<Sparkles className="w-3.5 h-3.5" />
				Skill
			</a>
		</div>
	);
}
