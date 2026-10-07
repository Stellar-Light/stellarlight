"use client";

/**
 * Floating "Latest Updates" dock, bottom-right, minimizable — the tokens.xyz
 * pattern. It sits above the page rather than inside the grid so it stays
 * reachable while you scroll the table.
 *
 * The collapsed/expanded choice persists in localStorage: a panel that
 * reopens itself on every navigation after you deliberately closed it is a
 * nuisance, not a feature. It starts collapsed on small screens, where a
 * floating card would otherwise cover the content.
 */

import { ChevronDown, ExternalLink, List } from "lucide-react";
import { useEffect, useState } from "react";
import {
	type NewsItem,
	relativeTime,
	sourceLabel,
} from "@/lib/stablecoin-news";

const KEY = "sl-stablecoin-news-open";

export function StablecoinNewsDock({ news }: { news: NewsItem[] }) {
	// Server and first client paint must agree, so start closed and let the
	// stored preference apply after mount rather than guessing during render.
	const [open, setOpen] = useState(false);
	const [ready, setReady] = useState(false);

	useEffect(() => {
		const stored = localStorage.getItem(KEY);
		const wide =
			typeof window !== "undefined" &&
			window.matchMedia("(min-width: 1024px)").matches;
		setOpen(stored === null ? wide : stored === "1");
		setReady(true);
	}, []);

	const toggle = () => {
		setOpen((v) => {
			localStorage.setItem(KEY, v ? "0" : "1");
			return !v;
		});
	};

	if (news.length === 0) return null;

	return (
		<div
			className={`fixed bottom-4 right-4 z-40 w-[min(92vw,25rem)] rounded-2xl border border-[#2F2F2F] bg-[#1A1A1A]/95 backdrop-blur shadow-2xl transition-opacity ${
				ready ? "opacity-100" : "opacity-0"
			}`}
		>
			<button
				type="button"
				onClick={toggle}
				aria-expanded={open}
				className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
			>
				<span className="flex items-center gap-2.5 min-w-0">
					<List className="w-4 h-4 text-[#A3A3A3] flex-shrink-0" />
					<span className="text-[#F5F5F5] font-semibold text-sm">
						Latest Updates
					</span>
					{!open && (
						<span className="text-[#666666] text-xs">{news.length}</span>
					)}
				</span>
				<span className="flex items-center justify-center w-7 h-7 rounded-full border border-[#2F2F2F] text-[#A3A3A3] flex-shrink-0">
					<ChevronDown
						className={`w-4 h-4 transition-transform ${open ? "" : "rotate-180"}`}
					/>
				</span>
			</button>

			{open && (
				<div className="px-2 pb-2 max-h-[min(60vh,26rem)] overflow-auto">
					{news.map((n) => (
						<a
							key={n.url}
							href={n.url}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/[0.04] transition-colors group"
						>
							<div className="flex-1 min-w-0">
								<div className="text-[#E5E5E5] text-sm leading-snug line-clamp-2 group-hover:underline">
									{n.title}
								</div>
								<div className="text-[#999999] text-xs mt-1">
									{sourceLabel(n.source)} · {relativeTime(n.publishedAt)}
								</div>
							</div>
							<ExternalLink className="w-3.5 h-3.5 text-[#666666] flex-shrink-0 mt-0.5" />
						</a>
					))}
				</div>
			)}
		</div>
	);
}
