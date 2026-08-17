import type { Metadata } from "next";
import {
	EntitiesDirectory,
	type EntityItem,
} from "@/components/entities-directory";
import { aggregateEntity } from "@/lib/entity-stats";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * Entities & Organizations — the "who builds what" map of the Stellar ecosystem.
 *
 * Each org's project signals (SCF raised, funded count, categories, repos) are
 * aggregated up from our own data so the directory is sortable by real
 * substance, not just alphabetical. ~46 orgs → fetched and ranked in one pass;
 * the client component handles search / sort / filter.
 */

export const metadata: Metadata = {
	title: "Entities & Organizations | Stellar Light",
	description:
		"Organizations building on Stellar — ranked by SCF funding raised, projects shipped, and categories built in. Aggregated from the Stellar Light project directory.",
};

export const revalidate = 300;

async function getEntities(): Promise<EntityItem[]> {
	const payload = await getPayloadSafe();
	if (!payload) return [];
	try {
		const res = await payload.find({
			collection: "entities",
			limit: 500,
			depth: 1, // populate projects (carry scf / category / status / repos)
			sort: "name",
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const items = (res.docs as any[]).map((e) => ({
			id: String(e.id),
			name: e.name,
			slug: e.slug,
			description: e.description ?? null,
			logo: e.logo ?? null,
			stats: aggregateEntity(e),
		}));
		// Activity is a date, not a count: join the repos index once for every
		// org's projects and keep the freshest commit + 90d commits per org.
		try {
			const slugs = [...new Set(items.flatMap((i) => i.stats.projectSlugs))];
			if (slugs.length) {
				const repos = await payload.find({
					collection: "repos",
					where: {
						and: [
							{ projectSlug: { in: slugs } },
							{ tier: { not_equals: "archive" } },
						],
					},
					limit: 5000,
					depth: 0,
					select: {
						projectSlug: true,
						lastCommitAt: true,
						activitySignals: true,
					},
				} as any);
				const bySlug = new Map<string, { last: string | null; c90: number }>();
				for (const r of repos.docs as any[]) {
					const e = bySlug.get(r.projectSlug) ?? { last: null, c90: 0 };
					if (r.lastCommitAt && (!e.last || r.lastCommitAt > e.last))
						e.last = r.lastCommitAt;
					e.c90 += Number(r.activitySignals?.commits90d ?? 0);
					bySlug.set(r.projectSlug, e);
				}
				for (const it of items) {
					for (const sl of it.stats.projectSlugs) {
						const a = bySlug.get(sl);
						if (!a) continue;
						if (
							a.last &&
							(!it.stats.lastCommitAt || a.last > it.stats.lastCommitAt)
						)
							it.stats.lastCommitAt = a.last;
						it.stats.commits90d += a.c90;
					}
				}
			}
		} catch {}
		return items;
	} catch {
		return [];
	}
}

export default async function EntitiesPage() {
	const items = await getEntities();
	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 pt-24 pb-16">
				<div className="mb-8">
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
						Entities & Organizations
					</h1>
					<p className="text-sm text-muted-foreground mt-2 max-w-2xl">
						The teams and companies building on Stellar — ranked by SCF funding
						raised across their projects, what they ship, and where they focus.
					</p>
				</div>
				{items.length === 0 ? (
					<div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground text-sm">
						No organizations yet.
					</div>
				) : (
					<EntitiesDirectory items={items} />
				)}
			</main>
		</div>
	);
}
