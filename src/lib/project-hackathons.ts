import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import hackmeridian2026 from "@/data/hackmeridian-2026-projects.json";
import { getHackathonBuildsIndex } from "@/lib/hackathon-builds";
import type { Project } from "@/payload-types";

export interface ProjectHackathon {
	slug: string;
	title: string;
	placement: string | null;
	endedAt: string;
}

const hackmeridian2026Repos = new Map(
	hackmeridian2026.projects.map((p) => [p.repo.toLowerCase(), p]),
);

/** HackMeridian 2026's verified projects whose repo is one of these. Held in
 * memory: only the placed ones are stored builds. */
function verifiedHackathons(repoFullNames: string[]): ProjectHackathon[] {
	const event = CURATED_HACKATHONS.find(
		(h) => h.uname === hackmeridian2026.event,
	);
	if (!event) return [];
	const project = repoFullNames
		.map((r) => hackmeridian2026Repos.get(r.toLowerCase()))
		.find(Boolean);

	return project
		? [
				{
					slug: event.uname,
					title: event.title,
					placement: project.placement,
					endedAt: new Date(event.end_time * 1000).toISOString(),
				},
			]
		: [];
}

/** The hackathons a directory project took part in, one per event: its
 * linked submissions, and HackMeridian 2026 by its repo. Placed ones first,
 * then the newest. A build index that cannot be read leaves only the
 * in-memory ones. */
export async function hackathonsOfProject(
	projectSlug: string,
	repoFullNames: string[],
): Promise<ProjectHackathon[]> {
	const found: ProjectHackathon[] = [];
	try {
		for (const b of await getHackathonBuildsIndex()) {
			if (b.project?.slug !== projectSlug) continue;
			found.push({
				slug: b.hackathon.slug,
				title: b.hackathon.title,
				placement: b.hackathonPlacement ?? (b.isWinner ? "Winner" : null),
				endedAt: b.hackathon.endedAt ?? "",
			});
		}
	} catch {}
	const byEvent = new Map<string, ProjectHackathon>();
	for (const h of [...found, ...verifiedHackathons(repoFullNames)]) {
		const known = byEvent.get(h.slug);
		if (!known || (!known.placement && h.placement)) byEvent.set(h.slug, h);
	}

	return [...byEvent.values()].sort(
		(a, b) =>
			Number(!!b.placement) - Number(!!a.placement) ||
			b.endedAt.localeCompare(a.endedAt),
	);
}

/** The hackathon the directory entry itself names, when it names one. */
export function declaredHackathon(
	project: Pick<Project, "hackathon" | "hackathonStatus">,
): { name: string; slug?: string; status?: string } | null {
	const { hackathon, hackathonStatus } = project;
	if (!hackathon) return null;
	const linked = typeof hackathon === "object" ? hackathon : null;

	return {
		name: linked?.name ?? "Hackathon",
		slug: linked?.slug ?? undefined,
		status: hackathonStatus ?? undefined,
	};
}
