import { ArrowLeft, ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IdeaShareButton } from "@/components/idea-share-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BRIEF_ROSTER, CATEGORY_LABELS, IDEAS, rfpStatus } from "@/data/ideas";

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

	// sls-060: the page must agree with the API — closed briefs are past
	// rounds and no longer fundable, so the funding CTA is status-aware.
	const status = rfpStatus(idea.quarter);
	const anyOpen = IDEAS.some((i) => rfpStatus(i.quarter) === "open");
	const brief = idea.publishedBrief;

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
							{status === "closed" ? (
								<Badge
									variant="secondary"
									className="px-3 py-1 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/30"
								>
									Closed: past round
								</Badge>
							) : (
								<Badge
									variant="secondary"
									className="px-3 py-1 text-xs font-medium rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30"
								>
									Open
								</Badge>
							)}
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
											Technical requirements (idea summary)
										</h2>
										<p className="text-muted-foreground leading-relaxed whitespace-pre-line">
											{idea.technicalRequirements}
										</p>
									</CardContent>
								</Card>
							)}

							{brief && (
								<Card className="border border-border/50 bg-card">
									<CardContent className="p-6">
										<h2 className="text-xl font-semibold mb-2 text-foreground">
											Published brief
										</h2>
										<p className="text-sm text-muted-foreground mb-4">
											SCF published this RFP as{" "}
											<a
												href={brief.url}
												target="_blank"
												rel="noopener noreferrer"
												className="text-foreground underline underline-offset-4"
											>
												{brief.title}
											</a>{" "}
											(read {brief.checkedOn}). Where it differs from the idea
											summary, the brief is what SCF funds.
										</p>
										{brief.functionalRequirements && (
											<>
												<h3 className="text-sm font-semibold mb-2 text-foreground">
													Functional requirements
												</h3>
												<ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground mb-4">
													{brief.functionalRequirements.map((r) => (
														<li key={r}>{r}</li>
													))}
												</ul>
											</>
										)}
										{brief.outOfScope && (
											<>
												<h3 className="text-sm font-semibold mb-2 text-foreground">
													Out of scope
												</h3>
												<ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
													{brief.outOfScope.map((r) => (
														<li key={r}>{r}</li>
													))}
												</ul>
											</>
										)}
									</CardContent>
								</Card>
							)}
						</div>

						{/* Sidebar */}
						<div className="space-y-6">
							{status === "closed" ? (
								<Card className="border border-amber-500/30 bg-card">
									<CardContent className="p-6">
										<h3 className="text-lg font-semibold mb-3 text-foreground">
											This brief is closed
										</h3>
										<p className="text-sm text-muted-foreground mb-4">
											This RFP belongs to a past round and is no longer
											fundable.{" "}
											{anyOpen
												? "Browse the currently open briefs instead."
												: `No brief is open now: SCF's RFP Track page named none (checked ${BRIEF_ROSTER.checkedOn}).`}
										</p>
										<Link
											href="/ideas"
											className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity"
										>
											{anyOpen ? "View open RFPs" : "View all RFPs"}
										</Link>
										<a
											href="https://communityfund.stellar.org/"
											target="_blank"
											rel="noopener noreferrer"
											className="mt-2 inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
										>
											Visit the Community Fund
											<ExternalLink className="w-3.5 h-3.5" />
										</a>
									</CardContent>
								</Card>
							) : (
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
							)}

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
