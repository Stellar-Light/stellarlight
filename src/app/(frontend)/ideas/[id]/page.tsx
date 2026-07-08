import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IdeaShareButton } from "@/components/idea-share-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CATEGORY_LABELS, IDEAS } from "@/data/ideas";

type Params = Promise<{ id: string }>;

export async function generateMetadata({
	params,
}: {
	params: Params;
}): Promise<Metadata> {
	const { id } = await params;
	const idea = IDEAS.find((i) => i.id === id);

	if (!idea) {
		return { title: "RFP Not Found" };
	}

	return {
		title: idea.title,
		description: idea.description.slice(0, 160),
	};
}

export function generateStaticParams() {
	return IDEAS.map((idea) => ({ id: idea.id }));
}

export default async function IdeaDetailPage({ params }: { params: Params }) {
	const { id } = await params;
	const idea = IDEAS.find((i) => i.id === id);

	if (!idea) {
		notFound();
	}

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
				{/* Back + Share */}
				<div className="flex items-center justify-between mb-8">
					<Link
						href="/ideas"
						className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 group"
					>
						<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
						<span className="text-sm font-medium">Back to RFPs</span>
					</Link>
					<IdeaShareButton />
				</div>

				<div className="max-w-4xl mx-auto">
					{/* Header */}
					<div className="mb-8">
						<div className="mb-4 flex items-center gap-2">
							<Badge
								variant="secondary"
								className="px-3 py-1 text-xs font-medium rounded-lg bg-white/10 text-foreground border border-border/50"
							>
								{CATEGORY_LABELS[idea.category] || idea.category}
							</Badge>
						</div>
						<h1 className="text-3xl md:text-4xl font-bold text-foreground">
							{idea.title}
						</h1>
					</div>

					{/* Content Grid */}
					<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
						{/* Main Content */}
						<div className="lg:col-span-2 space-y-6">
							<Card className="border border-border/50 bg-card">
								<CardContent className="p-6">
									<h2 className="text-xl font-semibold mb-4 text-foreground">
										Problem Statement
									</h2>
									<p className="text-muted-foreground leading-relaxed whitespace-pre-line">
										{idea.description}
									</p>
								</CardContent>
							</Card>

							{idea.technicalRequirements && (
								<Card className="border border-border/50 bg-card">
									<CardContent className="p-6">
										<h2 className="text-xl font-semibold mb-4 text-foreground">
											Technical Requirements
										</h2>
										<p className="text-muted-foreground leading-relaxed whitespace-pre-line">
											{idea.technicalRequirements}
										</p>
									</CardContent>
								</Card>
							)}
						</div>

						{/* Sidebar */}
						<div className="space-y-6">
							<Card className="border border-border/50 bg-card">
								<CardContent className="p-6">
									<h3 className="text-lg font-semibold mb-3 text-foreground">
										Apply for Funding
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										Ready to build this? Apply for an SCF grant to fund your
										project.
									</p>
									<a
										href="https://communityfund.stellar.org/"
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity"
									>
										Apply for Funding
										<ExternalLink className="w-3.5 h-3.5" />
									</a>
								</CardContent>
							</Card>

							<Card className="border border-border/50 bg-card">
								<CardContent className="p-6">
									<h3 className="text-lg font-semibold mb-3 text-foreground">
										Join the Discussion
									</h3>
									<p className="text-sm text-muted-foreground mb-4">
										Chat with the community about this RFP in the Stellar dev
										Discord.
									</p>
									<a
										href="https://discord.gg/stellardev"
										target="_blank"
										rel="noopener noreferrer"
										className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-[#5865F2] hover:bg-[#4752C4] text-white transition-colors"
									>
										Join Discord
										<ExternalLink className="w-3.5 h-3.5" />
									</a>
								</CardContent>
							</Card>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
