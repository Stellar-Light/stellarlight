import type { Metadata } from "next";
import { SkillsMarketplace } from "@/components/skills-marketplace";
import {
	CURATED_SKILLS,
	type CuratedSkill,
} from "@/lib/integrations/curated-skills";
import { fetchSdfSkillCatalog } from "@/lib/integrations/sdf-skills";
import { getPayloadSafe } from "@/lib/payload-client";

export const revalidate = 600;

export const metadata: Metadata = {
	title: "Skills Marketplace | Stellar AI Tools | StellarLight",
	description:
		"The canonical directory of AI skills, MCP servers, and agent tools for Stellar builders. Official SDF skills, Stellarlight tools, lumenloop, and community submissions — all installable via npx in one click.",
};

interface UnifiedSkill {
	slug: string;
	name: string;
	tagline?: string;
	description: string;
	source: string;
	kind: string;
	install: string;
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
	const sdfRaw = await fetchSdfSkillCatalog().catch(() => []);
	const sdf: UnifiedSkill[] = sdfRaw.map((s) => ({
		slug: s.name,
		name: humanize(s.name),
		tagline: s.description.split(/[.!?]\s/)[0],
		description: s.description,
		source: "sdf",
		kind: "skill-md",
		install: `npx skills add stellar/${s.name}`,
		homepage: s.url,
		compatibility: ["Claude Code", "Codex", "Cursor", "OpenClaw"],
		targetUser: ["dev"],
		tags: [s.name, "SDF"],
	}));

	// Curated
	const curated: UnifiedSkill[] = CURATED_SKILLS.map((s: CuratedSkill) => ({
		slug: s.slug,
		name: s.name,
		tagline: s.tagline,
		description: s.description,
		source: s.source,
		kind: s.kind,
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
				tags: (d.tags ?? [])
					.map((t) => t.tag)
					.filter((x): x is string => !!x),
			}));
		} catch {
			community = [];
		}
	}

	// Dedup by slug (curated wins over SDF wins over community)
	const seen = new Set<string>();
	const merged: UnifiedSkill[] = [];
	for (const list of [curated, sdf, community]) {
		for (const s of list) {
			if (seen.has(s.slug)) continue;
			seen.add(s.slug);
			merged.push(s);
		}
	}

	// Featured first, then alpha
	merged.sort((a, b) => {
		if (a.featured && !b.featured) return -1;
		if (!a.featured && b.featured) return 1;
		return a.name.localeCompare(b.name);
	});

	return merged;
}

function humanize(slug: string): string {
	return slug
		.split("-")
		.map((w) => {
			if (w === "zk") return "ZK";
			if (w === "dapp") return "dApp";
			return (w[0]?.toUpperCase() ?? "") + w.slice(1);
		})
		.join(" ");
}

export default async function SkillsPage() {
	const skills = await loadSkills();
	return <SkillsMarketplace initialSkills={skills} />;
}
