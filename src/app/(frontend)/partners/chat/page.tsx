import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PartnerFinder } from "@/components/partner-finder";

export const metadata: Metadata = {
	title: "Find a partner | Stellar Partners",
	description:
		"Describe what you're building and get matched to real Stellar partners — anchors, ramps, auditors, infrastructure. Or list your own company. A short AI-guided chat, no account needed.",
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
							Find a partner
						</h1>
						<span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground border border-border">
							Beta
						</span>
					</div>
					<p className="text-sm text-muted-foreground mt-2 max-w-xl">
						Describe what you&apos;re building and the concierge will match you
						to real Stellar partners — anchors, ramps, auditors, infrastructure
						— or help you get your own company listed. No account needed. Prefer
						to browse?{" "}
						<Link
							href="/partners"
							className="text-foreground underline underline-offset-2 hover:no-underline"
						>
							See the full directory
						</Link>
						.
					</p>
				</div>

				<PartnerFinder initialQuery={q} />
			</main>
		</div>
	);
}
