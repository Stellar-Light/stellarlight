"use client";

/**
 * The single "find a partner" surface. ONE obvious way to start: a search-first
 * guided matcher (instant, deterministic). The free-form concierge chat is a
 * one-way ESCALATION from there — reached by "ask the concierge" when the
 * structured search isn't enough — not a co-equal mode toggle (which is what
 * confused people). Listing your own company is a separate, clearly-labelled
 * door, since that's a different job.
 *
 * A query handed off from /ask (?q=) pre-fills and auto-runs the search.
 */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PartnerConciergeChat } from "@/components/partner-concierge-chat";
import { PartnerMatchmaker } from "@/components/partner-matchmaker";

type View = "search" | "chat";

export function PartnerFinder({ initialQuery }: { initialQuery?: string }) {
	const [view, setView] = useState<View>("search");
	const [conciergeSeed, setConciergeSeed] = useState<string | undefined>(
		undefined,
	);

	function toConcierge(seed?: string) {
		setConciergeSeed(seed && seed.trim() ? seed.trim() : undefined);
		setView("chat");
	}

	if (view === "chat") {
		return (
			<div className="space-y-5">
				<button
					type="button"
					onClick={() => setView("search")}
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
					Back to guided search
				</button>
				<PartnerConciergeChat initialQuery={conciergeSeed} />
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<PartnerMatchmaker
				initialNeed={initialQuery}
				onAskConcierge={(need) => toConcierge(need)}
			/>

			{/* Listing is a different job → its own clear door, not a mode. */}
			<div className="rounded-2xl border border-border bg-card/60 p-5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
				<div className="text-sm text-muted-foreground">
					<span className="text-foreground font-medium">
						Are you a partner?
					</span>{" "}
					Get listed so builders — and their AI agents — find you.{" "}
					<Link
						href="/partners/dashboard"
						className="text-foreground/90 underline underline-offset-2 hover:no-underline"
					>
						Already listed? Sign in
					</Link>
				</div>
				<button
					type="button"
					onClick={() =>
						toConcierge("I want to list my company on Stellar Light.")
					}
					className="h-10 px-4 inline-flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground transition-colors whitespace-nowrap"
				>
					List your company
				</button>
			</div>

			<p className="text-xs text-muted-foreground/70 text-center">
				Looking for ecosystem knowledge instead?{" "}
				<Link
					href="/ask"
					className="text-foreground/80 underline underline-offset-2 hover:no-underline"
				>
					Ask Stellar
				</Link>
			</p>
		</div>
	);
}
