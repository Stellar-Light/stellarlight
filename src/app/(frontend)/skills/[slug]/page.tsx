/**
 * Per-skill detail page.
 *
 *   /skills/{slug}
 *
 * One server-rendered page per skill, statically generated at build time
 * via generateStaticParams(). Every URL is its own indexable SEO surface
 * with:
 *   - Dynamic <title> + <meta description> from the skill's name + tagline
 *   - OpenGraph + Twitter card using the per-skill OG route
 *   - application/ld+json SoftwareApplication for rich result eligibility
 *   - Sitemap entry (handled in app/sitemap.ts)
 *   - Full SKILL.md content rendered inline for kind=skill-md entries —
 *     becomes long-form indexable content (the Scout page alone is ~6KB
 *     of markdown that now ranks)
 *
 * Slugs come from the merged catalog: SDF skills + curated entries +
 * approved community submissions. A slug not in any source returns
 * notFound() → /skills/[slug]/not-found.tsx (Next.js handles this).
 *
 * revalidate = 3600 so the page picks up new community approvals + the
 * occasional SDF skill update within an hour, without paying for full
 * dynamic rendering on every request.
 */

import { ArrowLeft, ExternalLink, Github } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { CopyCommand } from "@/components/copy-command";
import {
	CURATED_SKILLS,
	findCuratedSkill,
} from "@/lib/integrations/curated-skills";
import { fetchSdfSkill, SDF_SKILL_NAMES } from "@/lib/integrations/sdf-skills";
import { getPayloadSafe } from "@/lib/payload-client";
import { STELLAR_DEVELOPER_ACTIVITY_SKILL } from "@/lib/stellar-developer-activity-skill";
import { STELLAR_SCOUT_SKILL } from "@/lib/stellar-scout-skill";

export const revalidate = 3600;
// Pages not covered by generateStaticParams (e.g. a freshly-approved
// community skill between rebuilds) get rendered on-demand and cached.
export const dynamicParams = true;

const SITE_URL = "https://stellarlight.xyz";

interface SkillData {
	slug: string;
	name: string;
	tagline?: string;
	description: string;
	source: "sdf" | "stellarlight" | "lumenloop" | "external" | "community";
	kind: string;
	install?: string;
	installAlt?: { label: string; command: string }[];
	repository?: string;
	homepage?: string;
	docs?: string;
	rawUrl?: string;
	compatibility?: string[];
	targetUser?: string[];
	tags?: string[];
	featured?: boolean;
	content: string | null;
}

/**
 * Pre-render every known slug at build time. SDF + curated are statically
 * known; community submissions get on-demand rendering via dynamicParams=true.
 */
export async function generateStaticParams() {
	const sdf = SDF_SKILL_NAMES.map((slug) => ({ slug }));
	const curated = CURATED_SKILLS.map((s) => ({ slug: s.slug }));
	const community = await loadApprovedCommunitySlugs();
	return [...sdf, ...curated, ...community];
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const skill = await loadSkill(slug);
	if (!skill) return { title: "Skill not found | Stellar Light" };

	const title = `${skill.name} | Stellar Light Skills`;
	const description = skill.tagline ?? truncate(skill.description, 160);
	const canonical = `${SITE_URL}/skills/${skill.slug}`;
	const ogUrl = `${SITE_URL}/api/skills/${skill.slug}/og`;

	return {
		title,
		description,
		alternates: { canonical },
		openGraph: {
			title,
			description,
			url: canonical,
			siteName: "Stellar Light",
			type: "article",
			images: [{ url: ogUrl, width: 1200, height: 630, alt: skill.name }],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [ogUrl],
		},
	};
}

export default async function SkillDetailPage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const skill = await loadSkill(slug);
	if (!skill) notFound();

	const related = pickRelatedSkills(skill);

	return (
		<>
			{/* Structured data for Google rich results. SoftwareApplication is
			    the closest schema.org type — agents/SDKs/CLIs are software, and
			    Google does surface them with star ratings + price hints when
			    eligible. We don't expose offers/ratings, so it stays a clean
			    descriptive object. JSON-LD requires raw <script> injection;
			    the body is JSON.stringify-safe so XSS is not a vector here. */}
			<script
				type="application/ld+json"
				// biome-ignore lint/security/noDangerouslySetInnerHtml: see above — JSON.stringify output, no user-controlled string in JSON-LD body
				dangerouslySetInnerHTML={{
					__html: JSON.stringify(buildJsonLd(skill)),
				}}
			/>

			<main className="max-w-5xl mx-auto px-6 py-12">
				<Link
					href="/skills"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-8 transition-colors"
				>
					<ArrowLeft className="w-3.5 h-3.5" />
					All skills
				</Link>

				{/* Header */}
				<div className="mb-10">
					<div className="flex items-baseline gap-3 mb-3 flex-wrap">
						<h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight">
							{skill.name}
						</h1>
						<SourceBadge source={skill.source} />
						<KindBadge kind={skill.kind} />
					</div>
					{skill.tagline && (
						<p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-3xl">
							{skill.tagline}
						</p>
					)}
				</div>

				{/* Install block */}
				{skill.install && (
					<section className="mb-10">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
							Install
						</div>
						<CopyCommand
							command={skill.install}
							className="flex items-center gap-3 rounded-lg bg-black/40 border border-border/40 p-4 font-mono text-sm text-foreground overflow-hidden"
						/>
						{skill.installAlt && skill.installAlt.length > 0 && (
							<div className="mt-3 space-y-2">
								{skill.installAlt.map((alt) => (
									<div key={alt.label}>
										<div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
											{alt.label}
										</div>
										<CopyCommand
											command={alt.command}
											className="flex items-center gap-3 rounded-lg bg-black/40 border border-border/40 p-3 font-mono text-xs text-foreground overflow-hidden"
										/>
									</div>
								))}
							</div>
						)}
					</section>
				)}

				{/* Compatibility chips */}
				{skill.compatibility && skill.compatibility.length > 0 && (
					<section className="mb-10">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
							Works with
						</div>
						<div className="flex flex-wrap gap-1.5">
							{skill.compatibility.map((c) => (
								<span
									key={c}
									className="inline-flex items-center px-2.5 py-1 rounded-full border border-border/60 bg-white/[0.03] text-[11px] text-muted-foreground"
								>
									{c}
								</span>
							))}
						</div>
					</section>
				)}

				{/* About */}
				<section className="mb-10">
					<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
						About
					</div>
					<p className="text-sm md:text-base text-foreground/90 leading-relaxed max-w-3xl">
						{skill.description}
					</p>
				</section>

				{/* Links */}
				{(skill.repository || skill.homepage || skill.docs || skill.rawUrl) && (
					<section className="mb-10">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
							Links
						</div>
						<div className="flex flex-wrap gap-2">
							{skill.repository && (
								<LinkButton
									href={skill.repository}
									icon={<Github className="w-3.5 h-3.5" />}
								>
									Repository
								</LinkButton>
							)}
							{skill.homepage && (
								<LinkButton
									href={skill.homepage}
									icon={<ExternalLink className="w-3.5 h-3.5" />}
								>
									Homepage
								</LinkButton>
							)}
							{skill.docs && (
								<LinkButton
									href={skill.docs}
									icon={<ExternalLink className="w-3.5 h-3.5" />}
								>
									Docs
								</LinkButton>
							)}
							{skill.rawUrl && (
								<LinkButton
									href={skill.rawUrl}
									icon={<ExternalLink className="w-3.5 h-3.5" />}
								>
									Raw SKILL.md
								</LinkButton>
							)}
						</div>
					</section>
				)}

				{/* Tags */}
				{skill.tags && skill.tags.length > 0 && (
					<section className="mb-10">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
							Tags
						</div>
						<div className="text-xs text-muted-foreground">
							{skill.tags.join(" · ")}
						</div>
					</section>
				)}

				{/* Full SKILL.md content — inline for SEO. Long-form indexable
				    content per skill. Only shown when the source has actual
				    markdown (SDF + our own); curated SDKs/CLIs surface a
				    link-out via the Docs button above. */}
				{skill.content && (
					<section className="mb-10">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
							SKILL.md
						</div>
						<article className="rounded-xl border border-border/40 bg-card/30 px-6 py-6 text-sm leading-relaxed">
							<ReactMarkdown
								remarkPlugins={[remarkGfm]}
								components={MARKDOWN_COMPONENTS}
							>
								{stripFrontmatter(skill.content)}
							</ReactMarkdown>
						</article>
					</section>
				)}

				{/* Related skills */}
				{related.length > 0 && (
					<section className="mb-10 pt-10 border-t border-border/40">
						<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-4">
							Related skills
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
							{related.map((r) => (
								<Link
									key={r.slug}
									href={`/skills/${r.slug}`}
									className="block rounded-xl border border-border/40 bg-card/30 hover:bg-card/60 hover:border-border/80 px-4 py-3 transition-colors"
								>
									<div className="text-sm font-medium text-foreground mb-1">
										{r.name}
									</div>
									{r.tagline && (
										<div className="text-xs text-muted-foreground line-clamp-2">
											{r.tagline}
										</div>
									)}
								</Link>
							))}
						</div>
					</section>
				)}
			</main>
		</>
	);
}

/* ─── data loading ───────────────────────────────────────────────────── */

async function loadSkill(slug: string): Promise<SkillData | null> {
	// SDF
	if ((SDF_SKILL_NAMES as readonly string[]).includes(slug)) {
		const s = await fetchSdfSkill(slug);
		if (!s) return null;
		return {
			slug,
			name: humanize(slug),
			tagline: truncate(s.description, 160),
			description: s.description,
			source: "sdf",
			kind: "skill-md",
			install: `npx skills add stellar/${slug}`,
			homepage: s.url,
			rawUrl: s.rawUrl,
			compatibility: ["Claude Code", "Codex", "Cursor", "OpenClaw"],
			targetUser: ["dev"],
			tags: [slug, "SDF"],
			content: s.content,
		};
	}
	// Curated
	const c = findCuratedSkill(slug);
	if (c) {
		return {
			slug: c.slug,
			name: c.name,
			tagline: c.tagline,
			description: c.description,
			source: c.source,
			kind: c.kind,
			install: c.install,
			installAlt: c.installAlt,
			repository: c.repository,
			homepage: c.homepage,
			docs: c.docs,
			compatibility: c.compatibility,
			targetUser: c.targetUser,
			tags: c.tags,
			featured: c.featured,
			content:
				c.slug === "stellar-scout"
					? STELLAR_SCOUT_SKILL.trim()
					: c.slug === "stellar-developer-activity"
						? STELLAR_DEVELOPER_ACTIVITY_SKILL.trim()
						: null,
		};
	}
	// Community
	return loadApprovedCommunitySkill(slug);
}

async function loadApprovedCommunitySkill(
	slug: string,
): Promise<SkillData | null> {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	try {
		const result = await payload.find({
			collection: "community-skills",
			where: {
				and: [{ slug: { equals: slug } }, { status: { equals: "approved" } }],
			},
			limit: 1,
			depth: 0,
		});
		const d = result.docs[0] as
			| {
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
			  }
			| undefined;
		if (!d) return null;
		return {
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
			content: null,
		};
	} catch {
		return null;
	}
}

async function loadApprovedCommunitySlugs(): Promise<{ slug: string }[]> {
	const payload = await getPayloadSafe();
	if (!payload) return [];
	try {
		const result = await payload.find({
			collection: "community-skills",
			where: { status: { equals: "approved" } },
			limit: 500,
			depth: 0,
		});
		return (result.docs as Array<{ slug: string }>).map((d) => ({
			slug: d.slug,
		}));
	} catch {
		return [];
	}
}

/* ─── helpers ────────────────────────────────────────────────────────── */

function pickRelatedSkills(skill: SkillData) {
	// Same kind first, then same source, up to 4 total. Excludes self.
	const others = CURATED_SKILLS.filter((s) => s.slug !== skill.slug);
	const sameKind = others.filter((s) => s.kind === skill.kind).slice(0, 4);
	if (sameKind.length >= 4) return sameKind;
	const sameSource = others
		.filter((s) => s.source === skill.source && !sameKind.includes(s))
		.slice(0, 4 - sameKind.length);
	return [...sameKind, ...sameSource];
}

function stripFrontmatter(md: string): string {
	// Drop the leading --- ... --- block so the rendered article doesn't
	// show a literal YAML header above the actual content. Idempotent on
	// already-stripped strings.
	const m = md.match(/^---\n[\s\S]*?\n---\n+/);
	return m ? md.slice(m[0].length) : md;
}

function truncate(s: string, max: number): string {
	if (s.length <= max) return s;
	return `${s.slice(0, max - 1).trimEnd()}…`;
}

function humanize(slug: string): string {
	return slug
		.split("-")
		.map((w) =>
			w === "zk"
				? "ZK"
				: w === "dapp"
					? "dApp"
					: w[0]?.toUpperCase() + w.slice(1),
		)
		.join(" ");
}

function buildJsonLd(skill: SkillData) {
	return {
		"@context": "https://schema.org",
		"@type": "SoftwareApplication",
		name: skill.name,
		description: skill.tagline ?? skill.description,
		applicationCategory: "DeveloperApplication",
		operatingSystem: "Cross-platform",
		url: `${SITE_URL}/skills/${skill.slug}`,
		...(skill.repository && { codeRepository: skill.repository }),
		...(skill.docs && { documentation: skill.docs }),
		offers: {
			"@type": "Offer",
			price: "0",
			priceCurrency: "USD",
		},
		...(skill.tags &&
			skill.tags.length > 0 && {
				keywords: skill.tags.join(", "),
			}),
	};
}

/* ─── markdown rendering ─────────────────────────────────────────────── */

/**
 * Tailwind-styled element overrides for ReactMarkdown. Avoids the dependency
 * on @tailwindcss/typography — every element we expect in SKILL.md (h1-h3,
 * p, ul/ol, code, pre, table, blockquote, links) gets a deliberate style.
 */
const MARKDOWN_COMPONENTS = {
	h1: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
		<h1
			className="text-2xl font-semibold text-foreground tracking-tight mt-8 mb-4 first:mt-0"
			{...p}
		/>
	),
	h2: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
		<h2
			className="text-xl font-semibold text-foreground tracking-tight mt-8 mb-3"
			{...p}
		/>
	),
	h3: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
		<h3
			className="text-base font-semibold text-foreground tracking-tight mt-6 mb-2"
			{...p}
		/>
	),
	h4: (p: React.HTMLAttributes<HTMLHeadingElement>) => (
		<h4
			className="text-sm font-semibold text-foreground tracking-tight mt-5 mb-2"
			{...p}
		/>
	),
	p: (p: React.HTMLAttributes<HTMLParagraphElement>) => (
		<p className="text-foreground/85 leading-relaxed my-3" {...p} />
	),
	ul: (p: React.HTMLAttributes<HTMLUListElement>) => (
		<ul className="list-disc pl-5 my-3 space-y-1.5 text-foreground/85" {...p} />
	),
	ol: (p: React.HTMLAttributes<HTMLOListElement>) => (
		<ol
			className="list-decimal pl-5 my-3 space-y-1.5 text-foreground/85"
			{...p}
		/>
	),
	li: (p: React.HTMLAttributes<HTMLLIElement>) => (
		<li className="leading-relaxed" {...p} />
	),
	a: ({ href, ...rest }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
		const isExternal = href?.startsWith("http");
		return (
			<a
				href={href}
				{...(isExternal && { target: "_blank", rel: "noopener noreferrer" })}
				className="text-foreground underline underline-offset-2 hover:opacity-80"
				{...rest}
			/>
		);
	},
	code: ({
		className,
		children,
		...rest
	}: React.HTMLAttributes<HTMLElement>) => {
		// Block-level code (inside <pre>) keeps the className for syntax hints;
		// inline code gets the chip styling.
		const isBlock = !!className;
		if (isBlock) {
			return (
				<code className={className} {...rest}>
					{children}
				</code>
			);
		}
		return (
			<code
				className="text-xs bg-white/[0.05] px-1 py-0.5 rounded border border-border/30 text-foreground"
				{...rest}
			>
				{children}
			</code>
		);
	},
	pre: (p: React.HTMLAttributes<HTMLPreElement>) => (
		<pre
			className="bg-black/40 border border-border/30 rounded-lg px-4 py-3 my-3 overflow-x-auto text-xs"
			{...p}
		/>
	),
	blockquote: (p: React.HTMLAttributes<HTMLQuoteElement>) => (
		<blockquote
			className="border-l-2 border-foreground/30 pl-4 my-4 italic text-muted-foreground"
			{...p}
		/>
	),
	table: (p: React.HTMLAttributes<HTMLTableElement>) => (
		<div className="overflow-x-auto my-4">
			<table
				className="w-full text-xs border-collapse border border-border/40"
				{...p}
			/>
		</div>
	),
	th: (p: React.HTMLAttributes<HTMLTableCellElement>) => (
		<th
			className="text-left font-semibold text-foreground border border-border/40 px-3 py-1.5 bg-white/[0.03]"
			{...p}
		/>
	),
	td: (p: React.HTMLAttributes<HTMLTableCellElement>) => (
		<td
			className="border border-border/40 px-3 py-1.5 text-foreground/85 align-top"
			{...p}
		/>
	),
	hr: (p: React.HTMLAttributes<HTMLHRElement>) => (
		<hr className="my-6 border-border/40" {...p} />
	),
	strong: (p: React.HTMLAttributes<HTMLElement>) => (
		<strong className="font-semibold text-foreground" {...p} />
	),
	em: (p: React.HTMLAttributes<HTMLElement>) => (
		<em className="italic" {...p} />
	),
};

/* ─── inline UI bits ─────────────────────────────────────────────────── */

function SourceBadge({ source }: { source: SkillData["source"] }) {
	const label = {
		sdf: "SDF",
		stellarlight: "Stellarlight",
		lumenloop: "LumenLoop",
		external: "Ecosystem",
		community: "Community",
	}[source];
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded border border-border/60 bg-white/[0.04] text-[10px] uppercase tracking-wider text-muted-foreground">
			{label}
		</span>
	);
}

function KindBadge({ kind }: { kind: string }) {
	const label =
		{
			"skill-md": "SKILL.md",
			"mcp-server": "MCP server",
			sdk: "SDK",
			cli: "CLI",
			"agent-kit": "Agent kit",
			tool: "Tool",
		}[kind] ?? kind;
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded border border-border/60 bg-white/[0.04] text-[10px] uppercase tracking-wider text-muted-foreground">
			{label}
		</span>
	);
}

function LinkButton({
	href,
	icon,
	children,
}: {
	href: string;
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-white/[0.03] hover:bg-white/[0.06] hover:border-border text-xs text-foreground transition-colors"
		>
			{icon}
			{children}
		</a>
	);
}
