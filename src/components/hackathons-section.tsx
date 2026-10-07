import { ArrowRight, Clock, DollarSign, Users } from "lucide-react";
import Link from "next/link";
import { HackathonCover } from "@/components/hackathon-cover";
import { Badge } from "@/components/ui/badge";
import {
	type DoraHacksHackathon,
	fetchAllDoraHacksHackathons,
	formatPrize,
	getDaysRemaining,
	getHackathonUrl,
	isHackathonActive,
} from "@/lib/integrations/dorahacks";

export default async function HackathonsSection() {
	let active: DoraHacksHackathon[] = [];

	try {
		const all = await fetchAllDoraHacksHackathons();
		active = all.filter((h) => isHackathonActive(h));
	} catch {
		return null;
	}

	if (active.length === 0) return null;

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-2 text-foreground">
						Hackathons
					</h2>
					<p className="text-muted-foreground">
						Open now and announced: DoraHacks, Rise In, HackMeridian
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

			{/* Single hackathon — no scroll */}
			{active.length === 1 ? (
				<HackathonCard h={active[0]} />
			) : (
				/* Multiple — horizontal scroll carousel */
				<div
					className="flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-4 px-4 sm:-mx-0 sm:px-0"
					style={{
						scrollbarWidth: "none",
						msOverflowStyle: "none",
						WebkitOverflowScrolling: "touch",
					}}
				>
					{active.map((h) => (
						<div
							key={h.id}
							className="snap-start flex-shrink-0 w-[85vw] sm:w-[70vw] md:w-[calc(50%-8px)] lg:w-[calc(50%-8px)]"
						>
							<HackathonCard h={h} />
						</div>
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

function HackathonCard({ h }: { h: DoraHacksHackathon }) {
	const days = getDaysRemaining(h.end_time);
	const upcoming = h.start_time * 1000 > Date.now();
	const starts = new Date(h.start_time * 1000).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	});

	return (
		<a
			href={getHackathonUrl(h)}
			target="_blank"
			rel="noopener noreferrer"
			className="group block rounded-xl border border-white/15 bg-card overflow-hidden hover:border-white/30 transition-colors duration-200 h-full"
		>
			<HackathonCover
				src={h.image_url}
				title={h.title}
				organization={h.organization?.name}
				aspect="aspect-[3/1]"
				sizes="(max-width: 768px) 100vw, 50vw"
			>
				<Badge className="absolute top-3 right-3 bg-neutral-100 text-black border-0 shadow-md">
					{upcoming ? "Upcoming" : "Open"}
				</Badge>
			</HackathonCover>
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
						<DollarSign className="w-3.5 h-3.5 text-neutral-400" />
						<span className="font-semibold text-foreground">
							{h.bonus_price > 0 ? formatPrize(h.bonus_price) : "TBA"}
						</span>
					</span>
					{h.hackers_count > 0 && (
						<span className="flex items-center gap-1">
							<Users className="w-3.5 h-3.5" />
							{h.hackers_count}
						</span>
					)}
					<span className="flex items-center gap-1">
						<Clock className="w-3.5 h-3.5" />
						{upcoming
							? `Starts ${starts}`
							: days > 0
								? `${days}d left`
								: "Ending soon"}
					</span>
				</div>
			</div>
		</a>
	);
}

export function HackathonsSkeleton() {
	return (
		<section className="mb-16">
			<div className="mb-10">
				<div className="h-10 w-40 bg-[#262626] rounded animate-pulse mb-2" />
				<div className="h-4 w-64 bg-[#262626] rounded animate-pulse" />
			</div>
			<div className="h-[220px] rounded-xl bg-[#262626] animate-pulse" />
		</section>
	);
}
