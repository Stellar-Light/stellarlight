/**
 * Public write endpoint for stellar-scout skill feedback.
 *
 *   POST /api/feedback
 *   Body: { kind, message, context? }
 *
 * Mirrors Colosseum Copilot's /feedback pattern — gives agents an
 * in-skill channel for reporting bugs / missing data / wrong answers
 * without a separate GitHub-issues flow.
 *
 * Why we want this:
 *   - Closes the loop: real failure modes from real installs land in
 *     /admin where curators can see + fix them
 *   - Cheap signal: every feedback row is an answer to "what did the
 *     skill get wrong today?" — the bug source we said we can't generate
 *     without shipping
 *   - Lower friction than GitHub issues for agents who don't have repo
 *     access permission anyway
 *
 * Rate limit: 6 / minute / IP (lower than the read endpoints — feedback
 * doesn't need to be high-volume per source; this prevents abuse).
 */

import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const VALID_KINDS = [
	"bug",
	"missing-data",
	"wrong-answer",
	"suggestion",
	"other",
] as const;

interface FeedbackBody {
	kind?: string;
	message?: string;
	context?: {
		query?: string;
		endpoint?: string;
		skillVersion?: string;
		agentName?: string;
	};
}

function ipHashOf(req: NextRequest): string {
	const ip =
		req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		req.headers.get("x-real-ip") ||
		"unknown";
	const salt = process.env.PAYLOAD_SECRET || "stellar-scout-feedback-salt";
	return createHash("sha256").update(`${ip}:${salt}`).digest("hex").slice(0, 16);
}

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/feedback",
		limit: 6,
		windowMs: 60_000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{
				error: "rate-limited",
				hint: "Feedback is rate-limited to 6 / minute / IP. Try again shortly.",
			},
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}

	let body: FeedbackBody;
	try {
		body = (await req.json()) as FeedbackBody;
	} catch {
		return NextResponse.json(
			{
				error: "invalid JSON body",
				hint: 'POST with header `Content-Type: application/json` and a body shaped { kind, message, context? }.',
				example: {
					kind: "missing-data",
					message:
						"Searched /api/research?q=stellar+x402&source=audit but got 0 results — there are 3 x402 mentions in our project descriptions that should be indexed.",
					context: {
						endpoint: "/api/research",
						skillVersion: "1.0.0",
						agentName: "claude-code",
					},
				},
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	if (!body.kind || !VALID_KINDS.includes(body.kind as never)) {
		return NextResponse.json(
			{
				error: `'kind' must be one of: ${VALID_KINDS.join(", ")}`,
				validKinds: VALID_KINDS,
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	if (!body.message || body.message.trim().length < 10) {
		return NextResponse.json(
			{
				error: "'message' is required and must be at least 10 chars",
				hint: "Describe what went wrong concretely so curators can act on it.",
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	if (body.message.length > 4000) {
		return NextResponse.json(
			{
				error: "'message' is capped at 4000 chars",
				hint: "Summarize. Long stack traces / chat transcripts don't help triage.",
			},
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{
				error: "payload unavailable",
				hint: "Server-side data layer is down; try again in a minute.",
			},
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	try {
		const doc = await payload.create({
			collection: "scout-feedback",
			data: {
				kind: body.kind as (typeof VALID_KINDS)[number],
				message: body.message.trim(),
				query: body.context?.query,
				endpoint: body.context?.endpoint,
				skillVersion: body.context?.skillVersion,
				agentName: body.context?.agentName,
				userAgent: req.headers.get("user-agent") ?? undefined,
				ipHash: ipHashOf(req),
			},
		});

		return NextResponse.json(
			{
				ok: true,
				id: doc.id,
				message:
					"Feedback received. Curators review the queue weekly; high-signal reports tend to land as a corpus or endpoint update within a few weeks. Thank you.",
			},
			{ status: 201, headers: rateLimitHeaders(limit) },
		);
	} catch (err) {
		return NextResponse.json(
			{
				error: "failed to persist feedback",
				detail: (err as Error).message,
			},
			{ status: 500, headers: rateLimitHeaders(limit) },
		);
	}
}

// GET returns the schema + recent stats, so an agent can discover what
// the endpoint expects without reading the SKILL.md.
export async function GET() {
	return NextResponse.json({
		meta: {
			source: "https://stellarlight.xyz/scout",
			generatedAt: new Date().toISOString(),
		},
		schema: {
			method: "POST",
			contentType: "application/json",
			body: {
				kind: VALID_KINDS,
				message: "10–4000 chars, required",
				context: {
					query: "optional — the user query that triggered the issue",
					endpoint: "optional — the /api/* endpoint that misbehaved",
					skillVersion: "optional — SKILL.md frontmatter version",
					agentName: "optional — claude-code | codex | openclaw | etc.",
				},
			},
			example: {
				kind: "missing-data",
				message:
					"Searched /api/research?q=x402&source=audit but got 0 results — Halborn's Alula audit has a finding labeled '// CRITICAL' on x402 escrow that should match.",
				context: {
					query: "x402 escrow security",
					endpoint: "/api/research",
					skillVersion: "1.0.0",
					agentName: "claude-code",
				},
			},
			rateLimit: "6 requests / minute / IP",
		},
	});
}
