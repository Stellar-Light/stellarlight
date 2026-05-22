"use client";

import { useState } from "react";
import { Check, FileJson, ImageDown, Loader2, Sparkles } from "lucide-react";

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
	const [skillCopied, setSkillCopied] = useState(false);

	const handleSkillCopy = async () => {
		try {
			const res = await fetch("/skills/stellar-developer-activity.md");
			const text = await res.text();
			await navigator.clipboard.writeText(text);
			setSkillCopied(true);
			setTimeout(() => setSkillCopied(false), 2000);
		} catch (err) {
			console.error("Skill copy failed", err);
			// Fall back to opening the file in a new tab if clipboard fails
			window.open("/skills/stellar-developer-activity.md", "_blank");
		}
	};

	const handlePng = async () => {
		const target = document.getElementById(snapshotTargetId);
		if (!target) return;
		setPngBusy(true);
		try {
			const { toPng } = await import("html-to-image");

			// This is the exact PR #74 working flow. Card is permanently at
			// `left: 100vw`; here we briefly move it to top:0/left:0 with
			// visibility:hidden so html-to-image gets a correct bounding rect
			// while the user sees nothing. The clone's visibility is
			// overridden to "visible" via the `style` option below so the
			// captured PNG renders fully.
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
				style: { transform: "none", visibility: "visible" },
				skipFonts: false,
			});

			// Restore previous style values so the card returns off-screen.
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
			<button
				type="button"
				onClick={handleSkillCopy}
				className={baseBtn}
				title="Copy the Claude / AI agent skill manifest to your clipboard — paste it into Claude or any LLM workflow"
			>
				{skillCopied ? (
					<>
						<Check className="w-3.5 h-3.5 text-emerald-400" />
						Copied
					</>
				) : (
					<>
						<Sparkles className="w-3.5 h-3.5" />
						Skill
					</>
				)}
			</button>
		</div>
	);
}
