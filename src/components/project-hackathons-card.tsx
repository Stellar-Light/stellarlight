import { ExternalLink } from "lucide-react";
import Link from "next/link";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import type { ProjectHackathon } from "@/lib/project-hackathons";

export function ProjectHackathonsCard({
	hackathons,
}: {
	hackathons: ProjectHackathon[];
}) {
	if (!hackathons.length) return null;

	return (
		<Card
			id="hackathons"
			className="mb-8 border border-border/50 bg-card shadow-sm"
		>
			<CardHeader className="pb-4">
				<CardTitle className="text-xl font-bold">Hackathons</CardTitle>
				<CardDescription>
					{hackathons.length === 1
						? "This project took part in a hackathon"
						: `This project took part in ${hackathons.length} hackathons`}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					{hackathons.map((h) => (
						<div
							key={h.slug}
							className="p-4 rounded-xl border border-border/50 bg-background/50"
						>
							<Link
								href={`/hackathons/${h.slug}`}
								className="text-sm font-semibold text-foreground hover:underline underline-offset-2"
							>
								{h.title}
							</Link>
							{(h.placement || h.track) && (
								<div className="flex flex-wrap gap-2 mt-3">
									{h.placement && (
										<span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-500/20 to-purple-500/10 text-purple-400 border border-purple-500/30">
											{h.placement}
										</span>
									)}
									{h.track && (
										<span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-white/10 text-foreground border border-border/50">
											{h.track}
										</span>
									)}
								</div>
							)}
							{h.url && (
								<a
									href={h.url}
									target="_blank"
									rel="noopener noreferrer"
									className="group mt-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
								>
									View submission
									<ExternalLink className="h-3.5 w-3.5" />
								</a>
							)}
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
