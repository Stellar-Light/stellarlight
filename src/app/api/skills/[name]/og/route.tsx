/**
 * Per-skill OG card.
 *
 *   GET /api/skills/{slug}/og  → 1200×630 PNG
 *
 * Server-rendered via Next.js's built-in next/og (Satori). Used by the
 * /skills/{slug} detail page's openGraph + twitter image metadata so that
 * every skill gets a unique, branded preview when shared on
 * Twitter / Slack / Discord / iMessage.
 *
 * Lookup is identical to /api/skills/[name]/route.ts — SDF, curated, or
 * approved community — but only metadata is needed here (no markdown
 * content). 404s for unknown slugs.
 */

import { ImageResponse } from "next/og";
import { type NextRequest, NextResponse } from "next/server";
import { findCuratedSkill } from "@/lib/integrations/curated-skills";
import { SDF_SKILL_NAMES } from "@/lib/integrations/sdf-skills";
import { getPayloadSafe } from "@/lib/payload-client";

export const runtime = "nodejs";

interface OgSkill {
	slug: string;
	name: string;
	tagline?: string;
	source: string;
	kind: string;
}

const KIND_LABEL: Record<string, string> = {
	"skill-md": "SKILL.md",
	"mcp-server": "MCP server",
	sdk: "SDK",
	cli: "CLI",
	"agent-kit": "Agent kit",
	tool: "Tool",
};

const SOURCE_LABEL: Record<string, string> = {
	sdf: "SDF",
	stellarlight: "Stellarlight",
	lumenloop: "LumenLoop",
	external: "Ecosystem",
	community: "Community",
};

export async function GET(
	_req: NextRequest,
	{ params }: { params: Promise<{ name: string }> },
) {
	const { name: slug } = await params;
	const skill = await loadSkillForOg(slug);
	if (!skill) {
		return NextResponse.json({ error: "skill not found" }, { status: 404 });
	}

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background: "#0a0a0a",
				color: "#fff",
				padding: "72px",
				fontFamily: "sans-serif",
			}}
		>
			{/* Top row — site brand + source/kind chips */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					width: "100%",
				}}
			>
				<div
					style={{
						fontSize: 18,
						letterSpacing: 4,
						textTransform: "uppercase",
						color: "#9ca3af",
					}}
				>
					stellarlight · skills
				</div>
				<div style={{ display: "flex", gap: 12 }}>
					<Chip>{SOURCE_LABEL[skill.source] ?? skill.source}</Chip>
					<Chip>{KIND_LABEL[skill.kind] ?? skill.kind}</Chip>
				</div>
			</div>

			{/* Middle — title + tagline */}
			<div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
				<div
					style={{
						fontSize: 88,
						fontWeight: 700,
						lineHeight: 1.05,
						letterSpacing: -2,
					}}
				>
					{skill.name}
				</div>
				{skill.tagline && (
					<div
						style={{
							fontSize: 32,
							color: "#d1d5db",
							lineHeight: 1.35,
							maxWidth: "90%",
						}}
					>
						{skill.tagline}
					</div>
				)}
			</div>

			{/* Bottom — URL */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					width: "100%",
					fontSize: 22,
					color: "#9ca3af",
				}}
			>
				<div>stellarlight.xyz/skills/{skill.slug}</div>
				<div style={{ color: "#FDDA24" }}>★</div>
			</div>
		</div>,
		{
			width: 1200,
			height: 630,
			headers: {
				"Cache-Control": "public, max-age=3600, s-maxage=86400",
			},
		},
	);
}

function Chip({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				padding: "8px 16px",
				borderRadius: 999,
				border: "1px solid #4b5563",
				background: "rgba(255,255,255,0.04)",
				fontSize: 18,
				color: "#d1d5db",
				textTransform: "uppercase",
				letterSpacing: 2,
			}}
		>
			{children}
		</div>
	);
}

async function loadSkillForOg(slug: string): Promise<OgSkill | null> {
	if ((SDF_SKILL_NAMES as readonly string[]).includes(slug)) {
		return {
			slug,
			name: humanize(slug),
			tagline: `Official Stellar Development Foundation skill.`,
			source: "sdf",
			kind: "skill-md",
		};
	}
	const c = findCuratedSkill(slug);
	if (c) {
		return {
			slug: c.slug,
			name: c.name,
			tagline: c.tagline,
			source: c.source,
			kind: c.kind,
		};
	}
	const community = await loadCommunity(slug);
	return community;
}

async function loadCommunity(slug: string): Promise<OgSkill | null> {
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
			| { slug: string; name: string; tagline?: string; kind: string }
			| undefined;
		if (!d) return null;
		return {
			slug: d.slug,
			name: d.name,
			tagline: d.tagline,
			source: "community",
			kind: d.kind,
		};
	} catch {
		return null;
	}
}

function humanize(slug: string): string {
	return slug
		.split("-")
		.map((w) =>
			w === "zk" ? "ZK" : w === "dapp" ? "dApp" : w[0]?.toUpperCase() + w.slice(1),
		)
		.join(" ");
}
