"use client";

import { useState } from "react";
import { Check, FileJson, ImageDown, Sparkles } from "lucide-react";
import { STELLAR_DEVELOPER_ACTIVITY_SKILL } from "@/lib/stellar-developer-activity-skill";

interface Props {
	sort: string;
	range: string;
	category: string | null;
	/** Legacy — no longer used. Kept so the page doesn't break if it still
	 * passes the prop. PNG now renders server-side via /api/og-card. */
	snapshotTargetId?: string;
}

function qs(
	sort: string,
	range: string,
	category: string | null,
	extra?: Record<string, string>,
): string {
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
}: Props) {
	const [skillDone, setSkillDone] = useState(false);

	// Skill button does two things in parallel:
	// 1. ALWAYS triggers a download of stellar-developer-activity.md — the
	//    user can attach this file to Claude/ChatGPT, drop it into a project's
	//    .claude/skills/ folder, or read it locally. This works in every
	//    browser, no permissions needed.
	// 2. ATTEMPTS to also write the markdown to the clipboard, so the user
	//    can immediately paste it into a chat. This is best-effort — if the
	//    browser rejects (insecure context, permissions, etc.) the user
	//    still has the downloaded file.
	const handleSkill = () => {
		// Best-effort clipboard write — synchronous call to preserve user
		// activation, no await beforehand, silent on failure.
		if (navigator.clipboard?.writeText) {
			navigator.clipboard
				.writeText(STELLAR_DEVELOPER_ACTIVITY_SKILL)
				.catch(() => {
					/* clipboard rejected — download still happens below */
				});
		}

		// Always trigger the file download.
		const blob = new Blob([STELLAR_DEVELOPER_ACTIVITY_SKILL], {
			type: "text/markdown;charset=utf-8",
		});
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.download = "stellar-developer-activity.md";
		link.href = url;
		document.body.appendChild(link);
		link.click();
		link.remove();
		URL.revokeObjectURL(url);

		setSkillDone(true);
		setTimeout(() => setSkillDone(false), 2000);
	};

	const baseBtn =
		"inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border/50 bg-card text-xs text-muted-foreground hover:text-foreground hover:bg-white/[0.04] transition-colors";

	return (
		<div className="flex items-center gap-2">
			{/* PNG: server-rendered via /api/og-card. download=1 triggers
			    the file-download Content-Disposition header. */}
			<a
				href="/api/og-card?download=1"
				className={baseBtn}
				title="Download a Twitter-friendly 1200×675 snapshot of Stellar's dev activity"
			>
				<ImageDown className="w-3.5 h-3.5" />
				PNG
			</a>
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
				onClick={handleSkill}
				className={baseBtn}
				title="Download stellar-developer-activity.md (also copied to clipboard). Attach to Claude/ChatGPT or drop into .claude/skills/ to give an AI agent native access to Stellar dev data."
			>
				{skillDone ? (
					<>
						<Check className="w-3.5 h-3.5 text-emerald-400" />
						Got it
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
