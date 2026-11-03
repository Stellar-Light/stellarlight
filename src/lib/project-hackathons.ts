import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import hackmeridian2026 from "@/data/hackmeridian-2026-projects.json";
import { getHackathonBuildsIndex } from "@/lib/hackathon-builds";
import type { Project } from "@/payload-types";

export interface ProjectHackathon {
	slug: string;
	title: string;
	placement: string | null;
	track: string | null;
	url: string | null;
	endedAt: string;
}

const HM_EVENT = CURATED_HACKATHONS.find(
	(h) => h.uname === hackmeridian2026.event,
);
const HM_ENDED_AT = HM_EVENT
	? new Date(HM_EVENT.end_time * 1000).toISOString()
	: "";
const HM_REPOS = new Map(
	hackmeridian2026.projects.map((p) => [p.repo.toLowerCase(), p]),
);

function getVerifiedHackathon(
	repoFullNames: readonly string[],
): ProjectHackathon | null {
	if (!HM_EVENT) return null;

	for (const repo of repoFullNames) {
		const project = HM_REPOS.get(repo.toLowerCase());
		if (project) {
			return {
				slug: HM_EVENT.uname,
				title: HM_EVENT.title,
				placement: project.placement,
				track: project.track,
				url: `${hackmeridian2026.source}/${project.file}.yml`,
				endedAt: HM_ENDED_AT,
			};
		}
	}

	return null;
}

export async function hackathonsOfProject(
	projectSlug: string,
	repoFullNames: string[],
): Promise<ProjectHackathon[]> {
	const byEvent = new Map<string, ProjectHackathon>();

	try {
		for (const b of await getHackathonBuildsIndex()) {
			if (b.project?.slug !== projectSlug) continue;
			const placement = b.hackathonPlacement ?? (b.isWinner ? "Winner" : null);
			if (byEvent.get(b.hackathon.slug)?.placement && !placement) continue;

			byEvent.set(b.hackathon.slug, {
				slug: b.hackathon.slug,
				title: b.hackathon.title,
				placement,
				track: b.track ?? null,
				url: b.url,
				endedAt: b.hackathon.endedAt ?? "",
			});
		}
	} catch {
		// The build index is optional here: the in-memory projects still show.
	}

	const verified = getVerifiedHackathon(repoFullNames);
	if (verified) {
		const existing = byEvent.get(verified.slug);
		if (!existing || (!existing.placement && verified.placement)) {
			byEvent.set(verified.slug, verified);
		}
	}

	return Array.from(byEvent.values()).sort((a, b) => {
		const placedDiff = (b.placement ? 1 : 0) - (a.placement ? 1 : 0);
		return placedDiff !== 0 ? placedDiff : b.endedAt.localeCompare(a.endedAt);
	});
}

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
