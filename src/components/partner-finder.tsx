"use client";

/**
 * The single "find a partner" surface, two modes:
 *   - Guided match: structured, instant, deterministic (PartnerMatchmaker).
 *   - Ask / list: the free-form concierge chat (find OR get listed).
 * A query handed off from /ask (?q=) defaults to chat, which auto-answers it.
 */

import { useState } from "react";
import { PartnerConciergeChat } from "@/components/partner-concierge-chat";
import { PartnerMatchmaker } from "@/components/partner-matchmaker";
import { cn } from "@/lib/utils";

export function PartnerFinder({ initialQuery }: { initialQuery?: string }) {
	const [mode, setMode] = useState<"match" | "chat">(
		initialQuery ? "chat" : "match",
	);

	const tab = (value: "match" | "chat", label: string) => (
		<button
			type="button"
			onClick={() => setMode(value)}
			className={cn(
				"h-9 px-4 rounded-lg text-sm font-medium transition-colors",
				mode === value
					? "bg-white/10 text-foreground"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{label}
		</button>
	);

	return (
		<div className="space-y-6">
			<div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
				{tab("match", "Guided match")}
				{tab("chat", "Ask / list")}
			</div>

			{mode === "match" ? (
				<PartnerMatchmaker />
			) : (
				<PartnerConciergeChat initialQuery={initialQuery} />
			)}
		</div>
	);
}
