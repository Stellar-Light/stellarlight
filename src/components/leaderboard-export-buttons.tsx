"use client";

import { Check, Copy, FileJson, ImageDown } from "lucide-react";
import { useState } from "react";
import { STELLAR_DEVELOPER_ACTIVITY_SKILL } from "@/lib/stellar-developer-activity-skill";

interface Props {
	sort: string;
	range: string;
	category: string | null;
	/** Legacy — no longer used. Kept so the page doesn't break if it still
	 * passes the prop. PNG now renders server-side via /api/og-card. */
	snapshotTargetId?: string;
}

/** Legacy execCommand-based copy. Returns true on success. */
function legacyCopy(text: string): boolean {
	try {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.top = "-1000px";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.focus();
		ta.select();
		const ok = document.execCommand("copy");
		ta.remove();
		return ok;
	} catch {
		return false;
	}
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

export function LeaderboardExportButtons({ sort, range, category }: Props) {
	const [skillCopied, setSkillCopied] = useState(false);

	/**
	 * Copy the skill markdown to clipboard. Three-tier fallback:
	 *
	 *   1. navigator.clipboard.writeText (modern Async Clipboard API).
	 *      Called synchronously here — no awaited fetches beforehand —
	 *      so user activation is preserved on Safari.
	 *   2. document.execCommand("copy") via a temporary textarea
	 *      (legacy but widely supported, works in non-secure contexts).
	 *   3. Open the .md file in a new tab so the user can copy manually.
	 */
	const handleSkillCopy = () => {
		const text = STELLAR_DEVELOPER_ACTIVITY_SKILL;
		const onSuccess = () => {
			setSkillCopied(true);
			setTimeout(() => setSkillCopied(false), 2000);
		};

		// Try modern API first.
		if (navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(text).then(onSuccess, () => {
				// Fall through to execCommand on rejection.
				if (legacyCopy(text)) onSuccess();
				else window.open("/skills/stellar-developer-activity.md", "_blank");
			});
			return;
		}

		// No modern API at all → try legacy directly.
		if (legacyCopy(text)) onSuccess();
		else window.open("/skills/stellar-developer-activity.md", "_blank");
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
				title="Copy the Stellar developer-activity skill manifest to your clipboard. Paste it into Claude / any AI agent to give it native access to Stellar dev data."
			>
				{skillCopied ? (
					<>
						<Check className="w-3.5 h-3.5 text-emerald-400" />
						Copied
					</>
				) : (
					<>
						<Copy className="w-3.5 h-3.5" />
						Skill
					</>
				)}
			</button>
		</div>
	);
}
