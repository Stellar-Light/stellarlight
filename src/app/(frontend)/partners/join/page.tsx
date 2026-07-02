import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PartnerOnboardChat } from "@/components/partner-onboard-chat";

export const metadata: Metadata = {
	title: "Get listed | Stellar Partners",
	description:
		"Join the Stellar Light partner directory. Describe your company in a short AI-guided chat and we'll draft your profile — anchors, on/off-ramps, infrastructure, tooling, protocols.",
};

export default function PartnerJoinPage() {
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
							Get listed
						</h1>
						<span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground border border-border">
							Beta
						</span>
					</div>
					<p className="text-sm text-muted-foreground mt-2 max-w-xl">
						Tell us what your company does in a quick chat — anchors, on/off-ramps,
						infrastructure, tooling, protocols. Our AI drafts your directory profile
						from the conversation; you review it before it goes live. No account needed
						to start.
					</p>
				</div>

				<PartnerOnboardChat />
			</main>
		</div>
	);
}
