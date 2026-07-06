import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PartnerConciergeChat } from "@/components/partner-concierge-chat";

export const metadata: Metadata = {
	title: "List your company | Stellar Partners",
	description:
		"Get your company listed in the Stellar partner directory — a short AI-guided chat, no account needed. Finding a partner happens right on /partners.",
};

export default async function PartnerConciergePage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	// A ?q= from the directory's Ask box is auto-sent as the first message,
	// so the handoff lands mid-conversation instead of at a greeting.
	const { q } = await searchParams;
	return (
		<div className="min-h-screen relative">
			<main className="max-w-2xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/partners"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Partners</span>
				</Link>

				<div className="mb-6">
					<div className="flex items-center gap-3 flex-wrap">
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
							Partner concierge
						</h1>
						<span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground border border-border">
							Beta
						</span>
					</div>
					<p className="text-sm text-muted-foreground mt-2 max-w-xl">
						Tell me about your company to get listed in the partner directory —
						a short guided chat, no account needed. Looking for a partner
						instead? Ask right on the{" "}
						<Link
							href="/partners"
							className="text-foreground underline underline-offset-2 hover:no-underline"
						>
							directory page
						</Link>
						, or continue a follow-up conversation here.
					</p>
				</div>

				<PartnerConciergeChat initialQuery={q} />
			</main>
		</div>
	);
}
