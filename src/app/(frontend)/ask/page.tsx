import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AskSearch } from "@/components/ask-search";

export const metadata: Metadata = {
	title: "Ask Stellar | Stellar Light",
	description:
		"Ask anything about the Stellar ecosystem in natural language — projects, protocols, audits, SEPs, dev docs. Grounded, cited answers from the live StellarLight index.",
};

export default function AskPage() {
	return (
		<div className="min-h-screen relative">
			<main className="max-w-3xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				<div className="mb-8">
					<div className="flex items-center gap-3 flex-wrap">
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
							Ask Stellar
						</h1>
						<span className="text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-muted-foreground border border-border">
							Beta
						</span>
					</div>
					<p className="text-sm text-muted-foreground mt-2 max-w-xl">
						Natural-language search over the live ecosystem index — projects,
						providers, protocols, audits, SEPs, and dev docs. The same data
						layer our agents query, now yours to ask directly.
					</p>
				</div>

				<Suspense
					fallback={
						<div className="h-14 rounded-2xl bg-card border border-border animate-pulse" />
					}
				>
					<AskSearch />
				</Suspense>
			</main>
		</div>
	);
}
