import { ArrowRight, Clock, DollarSign, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
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

	return (
		<a
			href={getHackathonUrl(h.uname)}
			target="_blank"
			rel="noopener noreferrer"
			className="group block rounded-xl border border-primary/30 bg-card overflow-hidden hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 h-full"
		>
			{h.image_url && (
				<div className="relative w-full aspect-[3/1] overflow-hidden">
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
						<span className="font-semibold text-foreground">
							{formatPrize(h.bonus_price)}
						</span>
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
