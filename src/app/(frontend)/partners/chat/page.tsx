import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PartnerConciergeChat } from "@/components/partner-concierge-chat";

export const metadata: Metadata = {
	title: "Partner concierge | Stellar Partners",
	description:
		"Find a Stellar partner by describing what you need — anchors, on/off-ramps, infrastructure, tooling, auditors — or get your own company listed. One AI-guided chat.",
};

export default function PartnerConciergePage() {
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
						Describe what you need — a USDC off-ramp, a Soroban auditor, a wallet
						SDK — and I&apos;ll match you with partners who actually do it. Or tell
						me about your company to get listed. No account needed.
					</p>
				</div>

				<PartnerConciergeChat />
			</main>
		</div>
	);
}
