/**
 * Partner concierge — one public chat, two jobs.
 *
 *   POST /api/partners/assistant   { messages: [{role, content}, ...] }
 *
 * A single conversational surface, open to anyone (no login):
 *   - FIND: a builder describes what they need ("USDC off-ramp in Mexico",
 *     "a Rust auditor") → the model calls the `search_partners` tool, which
 *     runs a DETERMINISTIC query over the published directory and hands back
 *     real candidates. The model only ever explains partners that exist —
 *     it cannot invent one. Surfaced partners are logged as leads so the
 *     partner hears "someone was looking for you" in the weekly digest.
 *   - LIST: a partner wants to get listed → the model interviews them and,
 *     when there's enough, calls `ready_to_list` so the UI can offer
 *     "Create my listing" (which reuses POST /api/partners/onboard extract).
 *   - Anything else → it points them to /ask for general ecosystem questions.
 *
 * Response: { reply, matches?: PublicPartner[], intent, canList }.
 *
 * Bounded + graceful: per-IP rate limit, capped tool-loop, capped tokens;
 * no ANTHROPIC_API_KEY → 503 unavailable so the UI falls back to the
 * directory + the manual "get listed" form.
 */

import Anthropic from "@anthropic-ai/sdk";
import { type NextRequest, NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";
import {
	fetchEligiblePartners,
	type PublicPartner,
	PARTNER_TYPES,
	scorePartners,
} from "@/lib/partner-match";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MODEL = "claude-haiku-4-5";
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_TOOL_TURNS = 3; // bound the agentic loop per request
const MAX_LEADS_PER_SEARCH = 5;

interface Turn {
	role: "user" | "assistant";
	content: string;
}

const SYSTEM = `You are the partner concierge for Stellar Light — the ecosystem's directory of anchors, on/off-ramps, infrastructure, tooling, protocols, wallets, and audit/legal/agency partners that builders can integrate with.

You do TWO things, and you figure out which from what the person says:

1. HELP A BUILDER FIND A PARTNER. If they describe something they need ("a USDC off-ramp in Mexico", "someone to audit my Soroban contract", "a wallet SDK"), call the search_partners tool with a concise need string (and a type filter only if they clearly named one). The tool returns REAL published partners. Then recommend from ONLY those results — name the specific ones that fit and say why in a sentence each. If the tool returns nothing that fits, say so honestly and suggest they broaden, or browse /partners. NEVER invent a partner or a capability a candidate doesn't list.

2. HELP A PARTNER GET LISTED. If they're describing their OWN company ("we're an anchor", "we build infra", "list us"), interview them briefly — one topic at a time, warm and short (1-3 sentences): what they do (tagline + description), concrete services, sectors/regions, whether they're accepting clients, links, and contact. When you have the essentials, call ready_to_list so they can turn the chat into a draft profile. Don't claim you saved anything.

If it's a general ecosystem question (not finding or listing a partner), answer briefly and suggest they try the Ask Stellar search at /ask for deeper research.

Keep every message short and plain. Don't dump long forms or lists of questions.

Links: only ever refer to on-site paths written exactly as /partners, /partners/chat, or /ask. NEVER invent a full URL or link to any external site — no https://, no other domains. Do not link to a specific partner unless the tool returned their slug.`;

const TOOLS: Anthropic.Tool[] = [
	{
		name: "search_partners",
		description:
			"Search the published Stellar partner directory for partners matching a builder's stated need. Returns real candidates only.",
		input_schema: {
			type: "object",
			properties: {
				need: {
					type: "string",
					description:
						"A concise phrase for what the builder needs, e.g. 'USDC off-ramp Mexico' or 'Soroban contract audit'.",
				},
				type: {
					type: "string",
					enum: [...PARTNER_TYPES],
					description:
						"Optional partner-type filter, only if the builder clearly named one.",
				},
			},
			required: ["need"],
		},
	},
	{
		name: "ready_to_list",
		description:
			"Signal that a partner has described enough about their company to turn the conversation into a draft directory listing. Call this once the essentials are covered.",
		input_schema: { type: "object", properties: {} },
	},
];

function getAnthropic(): Anthropic | null {
	const key = process.env.ANTHROPIC_API_KEY;
	if (!key) return null;
	return new Anthropic({ apiKey: key });
}

function sanitizeMessages(raw: unknown): Turn[] {
	if (!Array.isArray(raw)) return [];
	const out: Turn[] = [];
	for (const m of raw) {
		if (!m || typeof m !== "object") continue;
		const role = (m as { role?: unknown }).role;
		const content = (m as { content?: unknown }).content;
		if ((role !== "user" && role !== "assistant") || typeof content !== "string")
			continue;
		const text = content.trim().slice(0, 4000);
		if (text) out.push({ role, content: text });
	}
	return out.slice(-40);
}

/**
 * Run the deterministic partner search. `type` is a SOFT signal, not a hard
 * filter: many partners offer capabilities outside their primary type (an
 * "anchor" that also does USDC off-ramps), so filtering the candidate set by
 * type would wrongly exclude them. We fetch the whole eligible set and fold
 * the type hint into the scored need instead.
 */
async function runSearch(
	need: string,
	type: string | undefined,
): Promise<{ candidates: PublicPartner[]; blobs: string[] }> {
	const payload = await getPayloadSafe();
	if (!payload) return { candidates: [], blobs: [] };
	try {
		const docs = await fetchEligiblePartners(payload, {});
		const scoreQuery =
			type && (PARTNER_TYPES as readonly string[]).includes(type)
				? `${need} ${type}`
				: need;
		const scored = scorePartners(scoreQuery, docs, 6);
		return {
			candidates: scored.map((s) => s.partner),
			blobs: scored.map((s) => s.blob),
		};
	} catch {
		return { candidates: [], blobs: [] };
	}
}

/** Fire-and-forget: record that these partners were surfaced for a need. */
async function logLeads(need: string, partners: PublicPartner[]): Promise<void> {
	const payload = await getPayloadSafe();
	if (!payload) return;
	const trimmed = need.trim().slice(0, 400);
	await Promise.allSettled(
		partners.slice(0, MAX_LEADS_PER_SEARCH).map((p) =>
			payload.create({
				collection: "partner-leads",
				data: {
					partnerSlug: p.slug,
					partnerName: p.name,
					need: trimmed,
					source: "concierge",
					notified: false,
				},
				overrideAccess: true,
			}),
		),
	);
}

export async function OPTIONS() {
	return new NextResponse(null, { status: 204 });
}

export async function POST(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/partners/assistant",
		limit: RATE_LIMIT_MAX,
		windowMs: RATE_LIMIT_WINDOW_MS,
	});
	if (!limit.allowed) {
		const retry = Math.ceil((limit.resetAt - Date.now()) / 1000);
		return NextResponse.json(
			{ error: "Too many messages — give it a moment.", retryAfterSeconds: retry },
			{
				status: 429,
				headers: { ...rateLimitHeaders(limit), "Retry-After": String(retry) },
			},
		);
	}

	const anthropic = getAnthropic();
	if (!anthropic) {
		return NextResponse.json(
			{
				error:
					"The assistant isn't available right now — browse /partners or use the form.",
				unavailable: true,
			},
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}

	let body: unknown;
	try {
		body = await req.json();
	} catch {
		return NextResponse.json(
			{ error: "Invalid JSON" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const turns = sanitizeMessages((body as { messages?: unknown }).messages);
	const convo: Anthropic.MessageParam[] =
		turns.length > 0
			? turns.map((t) => ({ role: t.role, content: t.content }))
			: [{ role: "user", content: "Hi — I'm exploring Stellar partners." }];

	let matches: PublicPartner[] | undefined;
	let lastNeed = "";
	let canList = false;

	try {
		// Agentic loop: let the model call tools, feed real results back, and
		// compose a final grounded reply. Bounded by MAX_TOOL_TURNS.
		for (let i = 0; i < MAX_TOOL_TURNS; i++) {
			const res = await anthropic.messages.create({
				model: MODEL,
				max_tokens: 700,
				system: SYSTEM,
				tools: TOOLS,
				messages: convo,
			});

			if (res.stop_reason !== "tool_use") {
				const reply = res.content
					.filter((b): b is Anthropic.TextBlock => b.type === "text")
					.map((b) => b.text)
					.join("")
					.trim();
				if (matches && lastNeed) await logLeads(lastNeed, matches);
				const intent = matches ? "find" : canList ? "list" : "chat";
				return NextResponse.json(
					{ reply, matches, intent, canList },
					{ headers: rateLimitHeaders(limit) },
				);
			}

			// Execute the requested tools and append results.
			convo.push({ role: "assistant", content: res.content });
			const toolResults: Anthropic.ToolResultBlockParam[] = [];
			for (const block of res.content) {
				if (block.type !== "tool_use") continue;
				if (block.name === "search_partners") {
					const input = block.input as { need?: string; type?: string };
					const need = String(input?.need ?? "").trim();
					lastNeed = need || lastNeed;
					const { candidates, blobs } = await runSearch(need, input?.type);
					matches = candidates;
					toolResults.push({
						type: "tool_result",
						tool_use_id: block.id,
						content: candidates.length
							? `Found ${candidates.length} published partner(s):\n${candidates
									.map((c, idx) => `${idx + 1}. [${c.slug}] ${blobs[idx]}`)
									.join(
										"\n",
									)}\n\nRecommend only from these; cite each one's specific fit.`
							: "No published partners match that need. Tell the builder honestly and suggest broadening or browsing /partners.",
					});
				} else if (block.name === "ready_to_list") {
					canList = true;
					toolResults.push({
						type: "tool_result",
						tool_use_id: block.id,
						content:
							"Acknowledged. Tell them they can click 'Create my listing' to turn this chat into a draft profile to review.",
					});
				} else {
					toolResults.push({
						type: "tool_result",
						tool_use_id: block.id,
						content: "Unknown tool.",
						is_error: true,
					});
				}
			}
			convo.push({ role: "user", content: toolResults });
		}

		// Ran out of tool turns — do a final plain call for a closing reply.
		const finalRes = await anthropic.messages.create({
			model: MODEL,
			max_tokens: 500,
			system: SYSTEM,
			messages: convo,
		});
		const reply = finalRes.content
			.filter((b): b is Anthropic.TextBlock => b.type === "text")
			.map((b) => b.text)
			.join("")
			.trim();
		if (matches && lastNeed) await logLeads(lastNeed, matches);
		const intent = matches ? "find" : canList ? "list" : "chat";
		return NextResponse.json(
			{ reply, matches, intent, canList },
			{ headers: rateLimitHeaders(limit) },
		);
	} catch (err) {
		if (err instanceof Anthropic.RateLimitError) {
			return NextResponse.json(
				{ error: "Busy right now — try again in a moment." },
				{ status: 429, headers: rateLimitHeaders(limit) },
			);
		}
		if (
			err instanceof Anthropic.AuthenticationError ||
			err instanceof Anthropic.PermissionDeniedError ||
			(err instanceof Anthropic.BadRequestError &&
				/credit balance|billing|quota/i.test(err.message))
		) {
			return NextResponse.json(
				{
					error:
						"The assistant isn't available right now — browse /partners or use the form.",
					unavailable: true,
				},
				{ status: 503, headers: rateLimitHeaders(limit) },
			);
		}
		if (err instanceof Anthropic.APIError) {
			return NextResponse.json(
				{ error: "The assistant hit a snag — browse /partners instead." },
				{ status: 502, headers: rateLimitHeaders(limit) },
			);
		}
		return NextResponse.json(
			{ error: "Unexpected error" },
			{ status: 500, headers: rateLimitHeaders(limit) },
		);
	}
}
