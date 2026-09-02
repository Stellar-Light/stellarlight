"use client";

/**
 * A dismissible one-line spotlight above the explorer, for an asset worth
 * pointing at — a launch, a listing, a first measurement.
 *
 * The numbers come from the same measured row the table shows, so the banner
 * can never claim something the page below contradicts. It renders nothing
 * when that row is missing, rather than announcing an asset we cannot measure.
 *
 * Dismissal persists per headline in localStorage: change the copy and the
 * banner returns, which is what makes it usable for the NEXT launch too.
 */

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { TOKEN_LOGOS } from "@/components/stablecoin-logos";

export function StablecoinSpotlight({
	ticker,
	lead,
	body,
	highlight,
	href,
}: {
	ticker: string;
	/** Bold opener, e.g. "Now tracking USDT0". */
	lead: string;
	/** Plain sentence after the em dash. */
	body: string;
	/** The figure worth the eye, marked in the accent. */
	highlight: string;
	href: string;
}) {
	const key = `sl-spotlight-${lead}`;
	// Server and first paint must agree, so it starts hidden and appears once
	// the stored preference has been read.
	const [shown, setShown] = useState(false);

	useEffect(() => {
		try {
			setShown(localStorage.getItem(key) !== "1");
		} catch {
			setShown(true);
		}
	}, [key]);

	if (!shown) return null;
	const logo = TOKEN_LOGOS[ticker];

	return (
		<div className="mb-6 flex items-center gap-3 rounded-2xl border border-[#2F2F2F] bg-[#1A1A1A] px-4 py-3">
			{logo && (
				<div className="w-9 h-9 flex-shrink-0 rounded-full overflow-hidden bg-white/5 border border-white/10">
					{/* biome-ignore lint/performance/noImgElement: bundled mark */}
					<img src={logo} alt={ticker} className="w-full h-full object-cover" />
				</div>
			)}
			<Link href={href} className="flex-1 min-w-0 text-sm leading-relaxed">
				<span className="font-semibold text-foreground">{lead}</span>
				<span className="text-muted-foreground"> — {body} </span>
				<span className="font-medium text-foreground [box-shadow:inset_0_-0.35em_0_0_rgba(253,218,36,0.35)]">
					{highlight}
				</span>
			</Link>
			<button
				type="button"
				aria-label="Dismiss"
				onClick={() => {
					try {
						localStorage.setItem(key, "1");
					} catch {
						/* a browser with storage blocked still closes it for this view */
					}
					setShown(false);
				}}
				className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
			>
				<X className="w-4 h-4" />
			</button>
		</div>
	);
}
