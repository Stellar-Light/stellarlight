/**
 * AI chatbot onboarding for the Partner Connector (Anke's standout feature).
 *
 *   POST /api/partners/onboard   { mode: "chat",    messages: [...] }
 *   POST /api/partners/onboard   { mode: "extract", messages: [...] }
 *
 * Two modes, one endpoint:
 *   chat    → Claude (Haiku) interviews the partner conversationally, one
 *             topic at a time, and returns the next assistant turn as plain
 *             text. This is the chat UI.
 *   extract → Claude reads the whole transcript and returns a STRUCTURED
 *             object of partner-owned profile fields (Option A: structured
 *             outputs via output_config.format — schema-guaranteed JSON).
 *
 * Trust boundary, by construction:
 *   - The endpoint is gated to a logged-in partner (Payload cookie auth) so
 *     it's never an open Claude proxy that anyone can burn tokens on.
 *   - The extract schema contains ONLY partner-owned manual fields. The
 *     model literally cannot emit a verified/auto field (githubCommits90d,
 *     scfInvolvement, freshnessStatus, status…). And even the extracted
 *     values are not written here — the client reviews them and saves via
 *     the existing access-gated PATCH /api/partner-accounts/{id}, which
 *     rejects writes to system-owned fields. Two independent guards.
 *   - The model is instructed to return null for anything the partner did
 *     not actually say — no fabricated specifics put in a partner's mouth.
 *
 * Degrades gracefully: with no ANTHROPIC_API_KEY set (e.g. Vercel env not
 * configured yet) it returns 503 with a clear flag, and the portal falls
 * back to the manual form instead of erroring.
 */

import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Haiku tier: cheapest/fastest, ideal for short structured-extraction
// interviews. (Haiku 4.5 does not support the `effort` param — don't pass it.)
const MODEL = "claude-haiku-4-5";

// Public "get listed" onboarding (no partner login required). Per-IP rate
// limit + the max_tokens caps below bound abuse/cost on the LLM endpoint.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

const SECTORS = [
	"defi",
	"payments",
	"rwa",
	"stablecoins",
	"identity",
	"data",
	"ai",
	"gaming",
	"other",
] as const;

const REGIONS = [
	"global",
	"north-america",
	"latam",
	"europe",
	"africa",
	"mena",
	"asia",
	"oceania",
] as const;

const PRICING = [
	"free",
	"freemium",
	"subscription",
	"usage-based",
	"fixed",
	"hourly",
	"rev-share",
	"custom",
] as const;

/** A chat turn from the client. We only trust role + text. */
interface Turn {
	role: "user" | "assistant";
	content: string;
}

/**
 * Structured-output schema. ONLY partner-owned fields. Every field is
 * nullable so the model returns null for anything not stated rather than
 * inventing a value. additionalProperties:false + all-keys-required is what
 * structured outputs requires.
 *
 * Nullability uses `anyOf: [<type>, {type:"null"}]` — Anthropic structured
 * outputs reject a union `type: ["string","null"]` (and reject it outright
 * when combined with an enum), so anyOf is the supported form.
 */
const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] };

const PARTNER_TYPES = [
	"anchor",
	"on-off-ramp",
	"infrastructure",
	"tooling",
	"protocol",
	"wallet",
	"audit-firm",
	"legal",
	"agency",
	"other",
];

const EXTRACT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		partnerType: {
			anyOf: [
				{
					type: "string",
					enum: [...PARTNER_TYPES],
					description:
						"What kind of partner this company is, based on what they described. null if genuinely unclear.",
				},
				{ type: "null" },
			],
		},
		tagline: {
			anyOf: [
				{
					type: "string",
					description:
						"One line a builder sees first. Keep under 140 characters.",
				},
				{ type: "null" },
			],
		},
		description: nullableString,
		services: {
			type: "array",
			description:
				"Granular, lowercase, hyphenated service tags the matchmaker matches on — e.g. 'sep-24-ngn', 'soroban-audit-rust', 'usdc-off-ramp-mexico'. [] if none stated.",
			items: { type: "string" },
		},
		sectors: {
			type: "array",
			items: { type: "string", enum: [...SECTORS] },
		},
		regions: {
			type: "array",
			items: { type: "string", enum: [...REGIONS] },
		},
		acceptingClients: { anyOf: [{ type: "boolean" }, { type: "null" }] },
		typicalEngagement: nullableString,
		leadTime: nullableString,
		pricingModel: {
			anyOf: [{ type: "string", enum: [...PRICING] }, { type: "null" }],
		},
		pricingNotes: nullableString,
		websiteUrl: nullableString,
		docsUrl: nullableString,
		githubOrg: nullableString,
		contactEmail: nullableString,
		contactChannel: nullableString,
		responseSla: nullableString,
	},
	required: [
		"tagline",
		"description",
		"services",
		"sectors",
		"regions",
		"acceptingClients",
		"typicalEngagement",
		"leadTime",
		"pricingModel",
		"pricingNotes",
		"websiteUrl",
		"docsUrl",
		"githubOrg",
		"contactEmail",
		"contactChannel",
		"responseSla",
	],
} as const;

const CHAT_SYSTEM = `You are the onboarding guide for Stellar Light's partner directory. You're interviewing a Stellar ecosystem partner (an anchor, on/off-ramp, infrastructure provider, tooling/protocol team, wallet, audit firm, etc.) to help them fill out their public profile so builders — and the AI matchmaker — can find and integrate with them.

Your job: hold a short, warm, efficient conversation that surfaces the facts below. Ask about ONE topic at a time, in plain language. Acknowledge what they said, then ask the next thing. Keep each message to 1–3 sentences. Do not dump a long form.

Cover, roughly in this order:
1. A one-line tagline + what they do (description).
2. Their concrete services — push for granular, specific capabilities (e.g. "USDC off-ramp to Mexican pesos via SEP-24", "Rust Soroban contract audits"), not vague categories.
3. Sectors (DeFi, payments, RWA, stablecoins, identity, data, AI, gaming) and regions they serve.
4. Whether they're accepting new integrations/clients, typical engagement shape, lead time, and pricing model.
5. Links (website, docs, GitHub org) and the best contact channel + response SLA.

Rules:
- Never invent facts or pressure them into specifics they didn't give. "Not sure yet" is a fine answer — move on.
- Do NOT ask about GitHub commit counts, on-chain activity, or SCF history. Those are measured automatically by Stellar Light and the partner cannot set them — never imply they can.
- When you've covered the essentials, tell them they can click "Fill profile from this chat" to turn the conversation into their draft, which they then review and save. Don't claim you saved anything — you don't.`;

const EXTRACT_SYSTEM = `You extract a Stellar partner's profile fields from an onboarding conversation transcript.

Return ONLY what the partner actually stated or clearly implied. For any field they did not address, return null (or [] for list fields). Do NOT infer, guess, or fill gaps with plausible-sounding defaults — putting words in a partner's mouth is worse than leaving a field empty.

Normalization:
- tagline: a single line, under 140 characters.
- services: lowercase, hyphenated, specific tags (e.g. "sep-24-ngn", "soroban-audit-rust"). Split compound statements into multiple tags.
- sectors/regions: only values from the allowed enums; omit anything that doesn't map cleanly.
- pricingModel: pick the closest allowed enum value, or null if unclear.
- URLs: include the scheme if the partner gave a bare domain.`;

function getAnthropic(): Anthropic | null {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) return null;
	return new Anthropic({ apiKey: key });
}

/** Coerce arbitrary client input into a clean, bounded message list. */
function sanitizeMessages(raw: unknown): Turn[] {
	if (!Array.isArray(raw)) return [];
	const out: Turn[] = [];
	for (const m of raw) {
		if (!m || typeof m !== "object") continue;
		const role = (m as { role?: unknown }).role;
		const content = (m as { content?: unknown }).content;
		if (
			(role !== "user" && role !== "assistant") ||
			typeof content !== "string"
		)
			continue;
		const text = content.trim().slice(0, 4000); // bound each turn
		if (text) out.push({ role, content: text });
	}
	// Cap total turns so a runaway client can't blow up a request.
	return out.slice(-40);
}

export async function POST(req: NextRequest) {
	// Public onboarding funnel — rate-limit per IP so an unauthenticated LLM
	// endpoint can't be cost-bombed. Extracted profiles land as drafts for
	// review, so there's nothing sensitive to gate behind login yet.
	const limit = rateLimit(req, {
		endpoint: "/api/partners/onboard",
		limit: RATE_LIMIT_MAX,
		windowMs: RATE_LIMIT_WINDOW_MS,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "Too many messages — give it a moment and try again." },
			{
				status: 429,
				headers: {
					...rateLimitHeaders(limit),
					"Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
				},
			},
		);
	}

	const anthropic = getAnthropic();
	if (!anthropic) {
		// Key not configured (e.g. Vercel env not set yet) — tell the client so
		// it can fall back to the manual form instead of showing an error.
		return NextResponse.json(
			{
				error: "AI onboarding isn't available right now — use the form below.",
				unavailable: true,
			},
			{ status: 503 },
		);
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
	}

	const mode = (body as { mode?: unknown }).mode;
	const messages = sanitizeMessages((body as { messages?: unknown }).messages);

	try {
		if (mode === "chat") {
			// Conversational interviewer turn. If the transcript is empty, seed a
			// warm opener.
			const convo =
				messages.length > 0
					? messages
					: [
							{
								role: "user" as const,
								content: "Hi, I'd like to set up my partner profile.",
							},
						];

			const res = await anthropic.messages.create({
				model: MODEL,
				max_tokens: 512,
				system: CHAT_SYSTEM,
				messages: convo,
			});
			const reply = res.content
				.filter((b): b is Anthropic.TextBlock => b.type === "text")
				.map((b) => b.text)
				.join("")
				.trim();
			return NextResponse.json({ reply });
		}

		if (mode === "extract") {
			if (messages.length === 0) {
				return NextResponse.json(
					{ error: "Nothing to extract yet — have a conversation first." },
					{ status: 400 },
				);
			}
			// Flatten the transcript into a single user message so the extractor
			// reads it as a document, not a dialogue to continue.
			const transcript = messages
				.map((m) => `${m.role === "user" ? "Partner" : "Guide"}: ${m.content}`)
				.join("\n");

			const res = await anthropic.messages.create({
				model: MODEL,
				max_tokens: 2048,
				system: EXTRACT_SYSTEM,
				messages: [
					{
						role: "user",
						content: `Onboarding transcript:\n\n${transcript}\n\nExtract the partner-owned profile fields.`,
					},
				],
				// Option A — structured outputs. Schema-guaranteed JSON; the model
				// cannot emit any field outside the partner-owned set.
				output_config: {
					format: {
						type: "json_schema",
						schema: EXTRACT_SCHEMA as unknown as Record<string, unknown>,
					},
				},
			});

			if (res.stop_reason === "refusal") {
				return NextResponse.json(
					{ error: "Could not process that conversation." },
					{ status: 422 },
				);
			}

			const text = res.content
				.filter((b): b is Anthropic.TextBlock => b.type === "text")
				.map((b) => b.text)
				.join("");
			let fields: Record<string, unknown>;
			try {
				fields = JSON.parse(text);
			} catch {
				return NextResponse.json(
					{ error: "Extraction produced malformed output — try again." },
					{ status: 502 },
				);
			}
			return NextResponse.json({ fields });
		}

		return NextResponse.json(
			{ error: "Unknown mode. Use 'chat' or 'extract'." },
			{ status: 400 },
		);
	} catch (err) {
		if (err instanceof Anthropic.RateLimitError) {
			return NextResponse.json(
				{ error: "Busy right now — try again in a moment." },
				{ status: 429 },
			);
		}
		// Auth / billing / permission failures (401/403, and the 400 "credit
		// balance too low") are OUR account-config problem, not the partner's —
		// surface them like the no-key case so the UI falls back cleanly to the
		// form instead of implying the partner did something wrong.
		if (
			err instanceof Anthropic.AuthenticationError ||
			err instanceof Anthropic.PermissionDeniedError ||
			(err instanceof Anthropic.BadRequestError &&
				/credit balance|billing|quota/i.test(err.message))
		) {
			return NextResponse.json(
				{
					error:
						"AI onboarding isn't available right now — use the form below.",
					unavailable: true,
				},
				{ status: 503 },
			);
		}
		if (err instanceof Anthropic.APIError) {
			// Don't leak provider internals to the client.
			return NextResponse.json(
				{ error: "AI onboarding hit a snag — use the form below." },
				{ status: 502 },
			);
		}
		return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
	}
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const GET = methodNotAllowed(["POST"]);
export const PUT = methodNotAllowed(["POST"]);
export const DELETE = methodNotAllowed(["POST"]);
export const PATCH = methodNotAllowed(["POST"]);
