"use client";

/**
 * The "find a partner" surface. The concierge CHAT is the primary way to find a
 * partner (describe what you need in your own words, or get listed) — it's front
 * and center. Guided match (structured chips → instant ranked results) is an
 * optional secondary path for people who'd rather pick from filters, reachable
 * by a quiet link, not a co-equal tab that competes with the chat.
 *
 * A query handed off from /ask (?q=) auto-sends into the chat.
 */

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { PartnerConciergeChat } from "@/components/partner-concierge-chat";
import { PartnerMatchmaker } from "@/components/partner-matchmaker";

type View = "chat" | "match";

export function PartnerFinder({ initialQuery }: { initialQuery?: string }) {
	const [view, setView] = useState<View>("chat");

	// Guided match, when chosen, can hand back to the chat.
	if (view === "match") {
		return (
			<div className="space-y-5">
				<button
					type="button"
					onClick={() => setView("chat")}
					className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
					Back to the concierge
				</button>
				<PartnerMatchmaker onAskConcierge={() => setView("chat")} />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<PartnerConciergeChat initialQuery={initialQuery} />

			<p className="text-xs text-muted-foreground/80 text-center">
				Prefer to pick from filters?{" "}
				<button
					type="button"
					onClick={() => setView("match")}
					className="text-foreground/90 underline underline-offset-2 hover:no-underline"
				>
					Use guided match
				</button>
			</p>

			{/* Listing is a different job → its own clear door. */}
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
