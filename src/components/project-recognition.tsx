import Link from "next/link";
import type { ProjectHackathon } from "@/components/project-hackathons-card";
import { Badge } from "@/components/ui/badge";
import { scfBadgeLabel } from "@/lib/project-scf";

interface ProjectRecognitionProps {
	scfAwarded: boolean;
	scfRounds: number[];
	hackathons: ProjectHackathon[];
	from?: { name: string; slug?: string; status?: string } | null;
}

export function ProjectRecognition({
	scfAwarded,
	scfRounds,
	hackathons,
	from,
}: ProjectRecognitionProps) {
	const named = new Set(hackathons.map((h) => h.slug));
	const showFrom = from && !(from.slug && named.has(from.slug));
	if (!scfAwarded && !hackathons.length && !showFrom) return null;

	return (
		<div className="flex flex-wrap items-center gap-3">
			{scfAwarded && (
				<a href="#scf">
					<Badge
						variant="outline"
						className="text-sm px-4 py-1.5 font-semibold shadow-sm rounded-full transition-colors bg-[#FDDA24]/10 text-[#FDDA24] border-[#FDDA24]/30 hover:border-[#FDDA24]/60"
					>
						{scfBadgeLabel(scfRounds)}
					</Badge>
				</a>
			)}
			{showFrom && (
				<Link
					href={from.slug ? `/hackathons/${from.slug}` : "#"}
					aria-disabled={!from.slug}
				>
					<Badge
						variant="outline"
						className="text-sm px-4 py-1.5 font-semibold shadow-sm rounded-full transition-colors bg-gradient-to-r from-purple-500/20 to-purple-500/10 text-purple-400 border-purple-500/30 hover:border-purple-500/60"
					>
						From {from.name}
						{from.status && (
							<span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded-md bg-white/10 text-purple-300">
								{from.status}
							</span>
						)}
					</Badge>
				</Link>
			)}
			{hackathons.map((h) => (
				<Link key={h.slug} href={`/hackathons/${h.slug}`}>
					<Badge
						variant="outline"
						className="text-sm px-4 py-1.5 font-semibold shadow-sm rounded-full transition-colors bg-gradient-to-r from-purple-500/20 to-purple-500/10 text-purple-400 border-purple-500/30 hover:border-purple-500/60"
					>
						{h.title}
						{h.placement ? ` · ${h.placement}` : ""}
					</Badge>
				</Link>
			))}
		</div>
	);
}
