import { getPayloadSafe } from "@/lib/payload-client";
import ProjectCard from "@/components/project-card";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default async function EmergingAppsSection() {
	const payload = await getPayloadSafe();
	if (!payload) return null;

	let projects: any[] = [];

	try {
		// Find projects created in the last 60 days that are not drafts
		const sixtyDaysAgo = new Date();
		sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

		const result = await payload.find({
			collection: "projects",
			where: {
				and: [
					{
						status: {
							in: ["Development", "Pre-Release", "Live"],
						},
					},
					{
						createdAt: {
							greater_than: sixtyDaysAgo.toISOString(),
						},
					},
				],
			},
			sort: "-createdAt",
			limit: 6,
			depth: 1,
		});

		projects = result.docs;
	} catch {
		return null;
	}

	if (projects.length === 0) return null;

	return (
		<section className="mb-16">
			<div className="flex items-center justify-between mb-10">
				<div>
					<h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-foreground">
						Emerging Apps
					</h2>
					<p className="text-muted-foreground">
						Recently added to the ecosystem
					</p>
				</div>
				<Link
					href="/directory?sort=newest"
					className="hidden sm:flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
				>
					View All
					<ArrowRight className="w-4 h-4" />
				</Link>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{projects.map((project: any) => (
					<ProjectCard key={project.id} project={project} />
				))}
			</div>
		</section>
	);
}

export function EmergingAppsSkeleton() {
	return (
		<section className="mb-16">
			<div className="mb-10">
				<div className="h-10 w-48 bg-[#262626] rounded animate-pulse mb-2" />
				<div className="h-4 w-56 bg-[#262626] rounded animate-pulse" />
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="h-[250px] rounded-xl bg-[#262626] animate-pulse" />
				))}
			</div>
		</section>
	);
}
