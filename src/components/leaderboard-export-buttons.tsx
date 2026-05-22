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
	const [skillCopied, setSkillCopied] = useState(false);

	// Skill content is inlined as a JS constant (no fetch, no Safari
	// user-activation timing issues, no async before writeText).
	const handleSkillCopy = () => {
		if (!navigator.clipboard?.writeText) {
			// Insecure context or ancient browser — fall back to opening the
			// hosted file so the user can copy manually.
			window.open("/skills/stellar-developer-activity.md", "_blank");
			return;
		}
		navigator.clipboard
			.writeText(STELLAR_DEVELOPER_ACTIVITY_SKILL)
			.then(() => {
				setSkillCopied(true);
				setTimeout(() => setSkillCopied(false), 2000);
			})
			.catch((err) => {
				console.error("Skill copy failed", err);
				window.open("/skills/stellar-developer-activity.md", "_blank");
			});
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
				onClick={handleSkillCopy}
				className={baseBtn}
				title="Copy the Claude / AI agent skill manifest to your clipboard"
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
