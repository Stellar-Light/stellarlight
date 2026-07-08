/**
 * Public submission endpoint for the Stellar AI skills marketplace.
 *
 *   POST /api/community-skills
 *
 * Body:
 *   {
 *     name, slug, tagline, description, kind, install,
 *     repository?, homepage?, docs?, compatibility?[], targetUser?[], tags?[],
 *     submittedBy: { name, email?, githubHandle? }
 *   }
 *
 * Lands in the `community-skills` Payload collection with status='pending'.
 * Admin reviews + flips to 'approved'/'rejected' via /admin.
 *
 * Validation:
 *   - Required: name, slug, tagline, description, kind, install
 *   - slug must be unique (case-insensitive, kebab)
 *   - rate-limited 4/min/IP via lib/rate-limit
 *
 * GET also returns the schema so agents can self-discover the POST shape.
 */

import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_KINDS = [
	"skill-md",
	"mcp-server",
	"sdk",
	"cli",
	"agent-kit",
	"tool",
] as const;
const VALID_TARGET_USERS = ["dev", "founder", "agent"] as const;

interface SubmissionBody {
	name?: string;
	slug?: string;
	tagline?: string;
	description?: string;
	kind?: string;
	install?: string;
	repository?: string;
	homepage?: string;
	docs?: string;
	compatibility?: string[];
	targetUser?: string[];
	tags?: string[];
	submittedBy?: {
		name?: string;
		email?: string;
		githubHandle?: string;
	};
}

function ipHashOf(req: NextRequest): string {
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"unknown";
	const salt = process.env.PAYLOAD_SECRET || "stellar-skills-marketplace-salt";
	return createHash("sha256")
		.update(`${ip}:${salt}`)
		.digest("hex")
		.slice(0, 16);
}

function isKebab(s: string): boolean {
	return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s);
}

function isUrl(s: string): boolean {
	try {
		new URL(s);
		return true;
	} catch {
		return false;
	}
}

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/community-skills",
		limit: 4,
		windowMs: 60_000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{
				error: "rate-limited",
				hint: "Submissions are rate-limited to 4 / minute / IP.",
			},
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}

	let body: SubmissionBody;
	try {
		body = (await req.json()) as SubmissionBody;
	} catch {
		return NextResponse.json(
			{
				error: "invalid JSON body",
				hint: "POST application/json with the shape described in GET /api/community-skills",
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	// Field validation
	const errs: string[] = [];
	if (!body.name || body.name.trim().length < 2)
		errs.push("'name' is required (≥ 2 chars)");
	if (!body.slug || !isKebab(body.slug))
		errs.push("'slug' is required (kebab-case, e.g. 'my-cool-skill')");
	if (!body.tagline || body.tagline.length < 10 || body.tagline.length > 160)
		errs.push("'tagline' must be 10–160 chars");
	if (
		!body.description ||
		body.description.length < 30 ||
		body.description.length > 2000
	)
		errs.push("'description' must be 30–2000 chars");
	if (!body.kind || !VALID_KINDS.includes(body.kind as never))
		errs.push(`'kind' must be one of: ${VALID_KINDS.join(", ")}`);
	if (!body.install || body.install.trim().length < 5)
		errs.push("'install' command is required");
	if (body.repository && !isUrl(body.repository))
		errs.push("'repository' must be a valid URL");
	if (body.homepage && !isUrl(body.homepage))
		errs.push("'homepage' must be a valid URL");
	if (body.docs && !isUrl(body.docs)) errs.push("'docs' must be a valid URL");
	if (body.targetUser) {
		for (const t of body.targetUser) {
			if (!VALID_TARGET_USERS.includes(t as never))
				errs.push(`'targetUser' contains invalid value '${t}'`);
		}
	}
	if (!body.submittedBy?.name || body.submittedBy.name.trim().length < 1)
		errs.push("'submittedBy.name' is required");
	if (
		body.submittedBy?.email &&
		!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.submittedBy.email)
	)
		errs.push("'submittedBy.email' must be a valid email if provided");

	if (errs.length > 0) {
		return NextResponse.json(
			{ error: "validation failed", details: errs },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "data layer unavailable; try again shortly" },
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	// Slug uniqueness — case-insensitive against approved+pending
	const slug = body.slug as string;
	try {
		const dup = await payload.find({
			collection: "community-skills",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
		});
		if (dup.docs.length > 0) {
			return NextResponse.json(
				{
					error: "duplicate slug",
					hint: `A submission with slug '${slug}' already exists. Pick a different slug.`,
				},
				{ status: 409, headers: rateLimitHeaders(limit) },
			);
		}
	} catch {
		// fall through — best-effort dedup
	}

	try {
		const doc = await payload.create({
			collection: "community-skills",
			data: {
				status: "pending",
				name: body.name as string,
				slug,
				tagline: body.tagline as string,
				description: body.description as string,
				kind: body.kind as (typeof VALID_KINDS)[number],
				install: body.install as string,
				repository: body.repository,
				homepage: body.homepage,
				docs: body.docs,
				compatibility: (body.compatibility ?? []).map((agent) => ({ agent })),
				targetUser: body.targetUser as
					| (typeof VALID_TARGET_USERS)[number][]
					| undefined,
				tags: (body.tags ?? []).map((tag) => ({ tag })),
				submittedBy: body.submittedBy,
				submittedAt: new Date().toISOString(),
				ipHash: ipHashOf(req),
			},
		});

		return NextResponse.json(
			{
				ok: true,
				id: doc.id,
				message:
					"Submission received. Stellarlight curators review the queue weekly; you'll see your skill in the marketplace once approved.",
			},
			{ status: 201, headers: rateLimitHeaders(limit) },
		);
	} catch (err) {
		return NextResponse.json(
			{ error: "failed to persist submission", detail: (err as Error).message },
			{ status: 500, headers: rateLimitHeaders(limit) },
		);
	}
}

// GET returns the schema so agents can self-discover the submission shape.
export async function GET() {
	return NextResponse.json({
		meta: {
			source: "https://stellarlight.xyz/skills",
			generatedAt: new Date().toISOString(),
		},
		schema: {
			method: "POST",
			contentType: "application/json",
			body: {
				name: "string · required · ≥ 2 chars",
				slug: "kebab-case slug · required · unique",
				tagline: "string · 10–160 chars",
				description: "string · 30–2000 chars",
				kind: VALID_KINDS,
				install: "string · the install command shown on the card",
				repository: "URL · optional",
				homepage: "URL · optional",
				docs: "URL · optional",
				compatibility: "string[] · optional · e.g. ['Claude Code', 'Cursor']",
				targetUser: `${VALID_TARGET_USERS.join("|")} · optional · multi`,
				tags: "string[] · optional",
				submittedBy: {
					name: "string · required",
					email: "email · optional",
					githubHandle: "string · optional",
				},
			},
			example: {
				name: "Soroban Audit Helper",
				slug: "soroban-audit-helper",
				tagline:
					"AI skill that audits Soroban contracts against known attack patterns.",
				description:
					"Installable SKILL.md that prompts your agent to run a Soroban contract through a known-pattern check, citing OWASP-style attack vectors and recent Stellar audit findings.",
				kind: "skill-md",
				install: "npx skills add some-org/soroban-audit-helper",
				repository: "https://github.com/some-org/soroban-audit-helper",
				compatibility: ["Claude Code", "Codex"],
				targetUser: ["dev"],
				tags: ["audit", "soroban", "security"],
				submittedBy: {
					name: "Jane Builder",
					email: "jane@example.com",
					githubHandle: "janebuilder",
				},
			},
			rateLimit: "4 requests / minute / IP",
		},
	});
}
