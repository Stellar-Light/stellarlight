import { getPayloadSafe } from "@/lib/payload-client";
import Link from "next/link";
import type { Metadata } from "next";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
	ArrowLeft,
	Calendar,
	ExternalLink,
	Building2,
	Code2,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "Hackathons | Stellar Light",
	description: "Stellar ecosystem hackathon events calendar",
};

type SearchParams = Promise<{
	status?: string;
}>;

export default async function HackathonsPage({
	searchParams,
}: {
	searchParams: SearchParams;
}) {
	const params = await searchParams;
	const statusFilter = params.status || "all";

	const payload = await getPayloadSafe();
	let hackathons: any[] = [];

	if (payload) {
		try {
			const where: any =
				statusFilter !== "all"
					? { status: { equals: statusFilter } }
					: {};

			const result = await payload.find({
				collection: "hackathons",
				where,
				sort: "-startDate",
				limit: 50,
				depth: 1,
			});

			hackathons = result.docs;
		} catch {
			// Handle silently
		}
	}

	const formatDateRange = (start: string, end: string): string => {
		const s = new Date(start);
		const e = new Date(end);
		const opts: Intl.DateTimeFormatOptions = {
			month: "short",
			day: "numeric",
			year: "numeric",
		};
		return `${s.toLocaleDateString("en-US", opts)} — ${e.toLocaleDateString("en-US", opts)}`;
	};

	const statusColors: Record<string, string> = {
		upcoming: "bg-blue-500/20 text-blue-400 border-blue-500/30",
		active: "bg-green-500/20 text-green-400 border-green-500/30",
		completed: "bg-muted text-muted-foreground border-border/50",
	};

	const filterOptions = [
		{ value: "all", label: "All" },
		{ value: "upcoming", label: "Upcoming" },
		{ value: "active", label: "Active" },
		{ value: "completed", label: "Past" },
	];

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				<div className="mb-10">
					<div className="flex items-center gap-3 mb-2">
						<Code2 className="w-8 h-8 text-[#FDDA24]" />
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
							Hackathons
						</h1>
					</div>
					<p className="text-muted-foreground">
						Stellar ecosystem hackathon events
					</p>
				</div>

				{/* Filters */}
				<div className="flex items-center gap-1 p-1 rounded-lg bg-card border border-border/50 w-fit mb-8">
					{filterOptions.map((option) => (
						<Link
							key={option.value}
							href={`/hackathons${option.value !== "all" ? `?status=${option.value}` : ""}`}
							className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
								statusFilter === option.value
									? "bg-white/10 text-foreground"
									: "text-muted-foreground hover:text-foreground hover:bg-white/5"
							}`}
						>
							{option.label}
						</Link>
					))}
				</div>

				{/* Hackathons List */}
				{hackathons.length === 0 ? (
					<Card className="border border-border/50 bg-card">
						<CardContent className="py-16 text-center">
							<Calendar className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
							<p className="text-muted-foreground">
								No hackathons found{statusFilter !== "all" ? ` with status "${statusFilter}"` : ""}.
							</p>
						</CardContent>
					</Card>
				) : (
					<div className="space-y-4">
						{hackathons.map((hackathon: any) => {
							const organizer =
								hackathon.organizer &&
								typeof hackathon.organizer !== "string"
									? hackathon.organizer
									: null;

							return (
								<Card
									key={hackathon.id}
									className="border border-border/50 bg-card shadow-sm hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150"
								>
									<CardContent className="p-6">
										<div className="flex flex-col md:flex-row md:items-center gap-4">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-3 mb-2">
													<h3 className="text-lg font-bold text-foreground truncate">
														{hackathon.name}
													</h3>
													<Badge
														className={`text-xs capitalize ${statusColors[hackathon.status] || ""}`}
													>
														{hackathon.status}
													</Badge>
												</div>
												{hackathon.description && (
													<p className="text-sm text-muted-foreground mb-3 line-clamp-2">
														{hackathon.description}
													</p>
												)}
												<div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
													<span className="flex items-center gap-1.5">
														<Calendar className="w-4 h-4" />
														{formatDateRange(
															hackathon.startDate,
															hackathon.endDate,
														)}
													</span>
													{organizer && (
														<Link
															href={`/entities/${organizer.slug}`}
															className="flex items-center gap-1.5 hover:text-foreground transition-colors"
														>
															<Building2 className="w-4 h-4" />
															{organizer.name}
														</Link>
													)}
												</div>
											</div>
											{hackathon.externalUrl && (
												<a
													href={hackathon.externalUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-border/50 hover:bg-white/5 hover:border-primary/30 transition-all duration-150 flex-shrink-0"
												>
													Visit
													<ExternalLink className="w-4 h-4" />
												</a>
											)}
										</div>
									</CardContent>
								</Card>
							);
						})}
					</div>
				)}
			</main>
		</div>
	);
}
