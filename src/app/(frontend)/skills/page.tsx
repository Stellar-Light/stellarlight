import type { Metadata } from "next";
import { SkillsMarketplace } from "@/components/skills-marketplace";
import {
	CURATED_SKILLS,
	type CuratedSkill,
} from "@/lib/integrations/curated-skills";
import {
	fetchSdfSkillCatalog,
	mergeSkillLists,
	registrySkillView,
	SKILLS_REGISTRY,
} from "@/lib/integrations/sdf-skills";
import { getPayloadSafe } from "@/lib/payload-client";

export const revalidate = 600;

export const metadata: Metadata = {
	title: "Stellar Skills for AI Agents",
	description:
		"Installable skills that teach an AI agent to build on Stellar: smart contracts, assets, payments, data and dapp patterns, each backed by the live docs.",
	alternates: { canonical: "/skills" },
};

interface UnifiedSkill {
	slug: string;
	name: string;
	tagline?: string;
	description: string;
	source: string;
	kind: string;
	registry?: string;
	install?: string;
	installAlt?: { label: string; command: string }[];
	repository?: string;
	homepage?: string;
	docs?: string;
	compatibility?: string[];
	targetUser?: string[];
	tags?: string[];
	featured?: boolean;
}

/**
 * Fetch skills server-side so the marketplace shows real entries on first
 * paint (SEO + perceived performance). The client component handles
 * filtering + the submission modal without a refetch.
 */
async function loadSkills(): Promise<UnifiedSkill[]> {
	// SDF skills (proxied)
	const catalog = await fetchSdfSkillCatalog().catch(() => null);
	const sdf: UnifiedSkill[] = (catalog?.skills ?? []).map(registrySkillView);
	const registryNames = new Set((catalog?.skills ?? []).map((s) => s.name));

	const curated: UnifiedSkill[] = CURATED_SKILLS.map((s: CuratedSkill) => ({
		slug: s.slug,
		name: s.name,
		tagline: s.tagline,
		description: s.description,
		source: s.source,
		kind: s.kind,
		...(s.registryName && registryNames.has(s.registryName)
			? { registry: SKILLS_REGISTRY }
			: {}),
		install: s.install,
		installAlt: s.installAlt,
		repository: s.repository,
		homepage: s.homepage,
		docs: s.docs,
		compatibility: s.compatibility,
		targetUser: s.targetUser,
		tags: s.tags,
		featured: s.featured,
	}));

	// Community (approved only)
	const payload = await getPayloadSafe();
	let community: UnifiedSkill[] = [];
	if (payload) {
		try {
			const result = await payload.find({
				collection: "community-skills",
				where: { status: { equals: "approved" } },
				limit: 200,
				depth: 0,
			});
			community = (
				result.docs as unknown as Array<{
					slug: string;
					name: string;
					tagline?: string;
					description: string;
					kind: string;
					install: string;
					repository?: string;
					homepage?: string;
					docs?: string;
					compatibility?: Array<{ agent?: string }>;
					targetUser?: string[];
					tags?: Array<{ tag?: string }>;
				}>
			).map((d) => ({
				slug: d.slug,
				name: d.name,
				tagline: d.tagline,
				description: d.description,
				source: "community",
				kind: d.kind,
				install: d.install,
				repository: d.repository,
				homepage: d.homepage,
				docs: d.docs,
				compatibility: (d.compatibility ?? [])
					.map((c) => c.agent)
					.filter((x): x is string => !!x),
				targetUser: d.targetUser,
				tags: (d.tags ?? []).map((t) => t.tag).filter((x): x is string => !!x),
			}));
		} catch {
			community = [];
		}
	}

	const { all: merged } = mergeSkillLists(
		curated,
		sdf,
		community,
		CURATED_SKILLS.flatMap((s) => (s.registryName ? [s.registryName] : [])),
	);

	// Featured first, then alpha
	merged.sort((a, b) => {
		if (a.featured && !b.featured) return -1;
		if (!a.featured && b.featured) return 1;
		return a.name.localeCompare(b.name);
	});

	return merged;
}

export default async function SkillsPage() {
	const skills = await loadSkills();
	return <SkillsMarketplace initialSkills={skills} />;
}
