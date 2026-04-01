import Link from "next/link";
import Image from "next/image";
import { ArrowRight, DollarSign, Users, Clock, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
	fetchAllDoraHacksHackathons,
	formatShortDate,
	formatPrize,
	getHackathonUrl,
	isHackathonActive,
	getDaysRemaining,
	type DoraHacksHackathon,
} from "@/lib/integrations/dorahacks";

export default async function HackathonsSection() {
	let active: DoraHacksHackathon[] = [];
	let recentPast: DoraHacksHackathon[] = [];

	try {
		const all = await fetchAllDoraHacksHackathons();
		active = all.filter((h) => isHackathonActive(h));
		recentPast = all.filter((h) => !isHackathonActive(h)).slice(0, 3);
	} catch {
		return null;
	}

	// Show nothing if no hackathons at all
	if (active.length === 0 && recentPast.length === 0) return null;

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
						Hackathons
					</h2>
					<p className="text-muted-foreground">
						Build and compete in the Stellar ecosystem
					</p>
				</div>
				<Link
					href="/hackathons"
					className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
				>
					View All
					<ArrowRight className="w-4 h-4" />
				</Link>
			</div>

			{/* Active hackathons — hero cards */}
			{active.length > 0 && (
				<div className="space-y-4 mb-6">
					{active.slice(0, 2).map((h) => {
						const days = getDaysRemaining(h.end_time);
						return (
							<a
								key={h.id}
								href={getHackathonUrl(h.uname)}
								target="_blank"
								rel="noopener noreferrer"
								className="group block rounded-xl border border-primary/30 bg-card overflow-hidden hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300"
							>
								{h.image_url && (
									<div className="relative w-full aspect-[3.5/1] overflow-hidden">
										<Image
											src={h.image_url}
											alt={h.title}
											fill
											className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
										/>
										<div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
										<Badge className="absolute top-3 right-3 bg-green-500 text-white border-0 shadow-md">
											OPEN
										</Badge>
									</div>
								)}
								<div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3">
									<div className="flex-1 min-w-0">
										<h3 className="font-bold text-foreground group-hover:text-primary transition-colors truncate">
											{h.title}
										</h3>
										{h.organization && (
											<span className="text-xs text-muted-foreground">
												{h.organization.name}
											</span>
										)}
									</div>
									<div className="flex items-center gap-4 text-sm text-muted-foreground whitespace-nowrap flex-shrink-0">
										<span className="flex items-center gap-1">
											<DollarSign className="w-3.5 h-3.5 text-[#FDDA24]" />
											<span className="font-semibold text-foreground">{formatPrize(h.bonus_price)}</span>
										</span>
										<span className="flex items-center gap-1">
											<Users className="w-3.5 h-3.5" />
											{h.hackers_count}
										</span>
										<span className="flex items-center gap-1">
											<Clock className="w-3.5 h-3.5" />
											{days > 0 ? `${days}d left` : "Ending soon"}
										</span>
									</div>
								</div>
							</a>
						);
					})}
				</div>
			)}

			{/* Recent past hackathons — compact rows */}
			{recentPast.length > 0 && (
				<div className="space-y-2">
					{recentPast.map((h) => (
						<a
							key={h.id}
							href={getHackathonUrl(h.uname)}
							target="_blank"
							rel="noopener noreferrer"
							className="group flex items-center gap-4 p-3 rounded-lg border border-border/50 bg-card hover:bg-card/80 hover:border-primary/30 transition-all duration-150"
						>
							<div className="flex-1 min-w-0">
								<span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate block">
									{h.title}
								</span>
							</div>
							<span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:block">
								{formatPrize(h.bonus_price)}
							</span>
							<span className="text-xs text-muted-foreground whitespace-nowrap">
								Ended {formatShortDate(h.end_time)}
							</span>
						</a>
					))}
				</div>
			)}

			<Link
				href="/hackathons"
				className="sm:hidden flex items-center justify-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mt-6"
			>
				View All Hackathons
				<ArrowRight className="w-4 h-4" />
			</Link>
		</section>
	);
}

export function HackathonsSkeleton() {
	return (
		<section className="mb-16">
			<div className="mb-10">
				<div className="h-10 w-40 bg-[#262626] rounded animate-pulse mb-2" />
				<div className="h-4 w-64 bg-[#262626] rounded animate-pulse" />
			</div>
			<div className="h-[180px] rounded-xl bg-[#262626] animate-pulse mb-4" />
			<div className="space-y-2">
				{Array.from({ length: 3 }).map((_, i) => (
					<div key={i} className="h-[48px] rounded-lg bg-[#262626] animate-pulse" />
				))}
			</div>
		</section>
	);
}