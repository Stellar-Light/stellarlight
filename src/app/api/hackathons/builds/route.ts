/**
 * Cross-hackathon BUILD search — the prior-art layer for hackathon prototypes.
 *
 *   GET /api/hackathons/builds?q=recurring%20payments
 *   GET /api/hackathons/builds?q=nft%20marketplace&winnersOnly=1
 *   GET /api/hackathons/builds?track=DeFi&limit=30
 *
 * The projects directory answers "what already SHIPPED", but a builder's idea
 * should also be checked against everything ever PROTOTYPED at a Stellar
 * hackathon — most of which never becomes a directory project. DoraHacks exposes
 * every submission ("buidl") per event; this flattens them ALL into one
 * topic-searchable index so "has anyone built X at a hackathon?" is answerable in
 * one call, with the event, placement/award, and links for each hit.
 *
 * Read-through + module-cached (buidl rosters are DoraHacks-fetch-cached 1h, and
 * the flattened index is held in-memory per instance) so search is cheap.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import {
	type DoraHacksSubmission,
	fetchAllDoraHacksHackathons,
	fetchHackathonSubmissions,
} from "@/lib/integrations/dorahacks";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { CORE_SYNONYMS, GENERIC_QUERY_TOKENS } from "@/lib/search-vocabulary";
import { generateSlug } from "@/lib/utils/normalize";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SUPPORTED_PARAMS = ["q", "limit", "winnersOnly", "track"] as const;

interface IndexedBuild extends DoraHacksSubmission {
	hackathon: { title: string; slug: string; endedAt: string | null };
	haystack: string; // lowercased name + description + track + award, for matching
}

// Flattened cross-hackathon buidl index, held per warm instance (the underlying
// DoraHacks fetches are already Next-data-cached 1h, so a cold rebuild is cheap).
let INDEX: { at: number; builds: IndexedBuild[] } | null = null;
const INDEX_TTL_MS = 3_600_000;

/** Concurrency-limited map so a cold rebuild doesn't fan out to hundreds of
 *  simultaneous DoraHacks calls. */
async function pool<T, R>(
	items: T[],
	n: number,
	fn: (t: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = [];
	let i = 0;
	async function worker() {
		while (i < items.length) {
			const idx = i++;
			out[idx] = await fn(items[idx]);
		}
	}
	await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
	return out;
}

async function buildIndex(): Promise<IndexedBuild[]> {
	const hacks = await fetchAllDoraHacksHackathons();
	// Only ENDED events have a meaningful build roster (active/upcoming have few
	// or no submissions); cap to the most recent to bound cold-rebuild cost.
	const ended = hacks
		.filter((h) => h.status === 2 || h.winner_announced)
		.sort((a, b) => (b.end_time ?? 0) - (a.end_time ?? 0))
		.slice(0, 40);
	const perHack = await pool(ended, 6, async (h) => {
		const subs = await fetchHackathonSubmissions(h.uname);
		const endedAt = h.end_time
			? new Date(h.end_time * 1000).toISOString().slice(0, 10)
			: null;
		const hackathon = { title: h.title, slug: generateSlug(h.title), endedAt };
		return subs.map((s) => ({
			...s,
			hackathon,
			haystack:
				`${s.name} ${s.description ?? ""} ${s.track ?? ""} ${s.award ?? ""}`.toLowerCase(),
		}));
	});
	// Dedupe by buidl id — DoraHacks can repeat a submission across pages, and a
	// build can be cross-submitted to sibling events; keep the first occurrence.
	const seen = new Set<string>();
	const flat: IndexedBuild[] = [];
	for (const arr of perHack) {
		for (const b of arr) {
			if (seen.has(b.id)) continue;
			seen.add(b.id);
			flat.push(b);
		}
	}
	return flat;
}

async function getIndex(): Promise<IndexedBuild[]> {
	if (INDEX && Date.now() - INDEX.at < INDEX_TTL_MS) return INDEX.builds;
	const builds = await buildIndex();
	INDEX = { at: Date.now(), builds };
	return builds;
}

/** Expand a query token with a plural/singular stem + shared vocabulary synonyms
 *  so niche phrasing matches (nft↔non-fungible, lending↔loan/credit, …). */
function expand(token: string): string[] {
	const out = new Set<string>([token]);
	if (token.length > 3 && token.endsWith("s")) out.add(token.slice(0, -1));
	else if (token.length > 2) out.add(`${token}s`);
	for (const syn of CORE_SYNONYMS[token] ?? []) out.add(syn);
	return [...out];
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const unknown = [...new Set(sp.keys())].filter(
		(k) => !(SUPPORTED_PARAMS as readonly string[]).includes(k),
	);
	if (unknown.length) {
		return NextResponse.json(
			{
				error: `Unsupported query parameter(s): ${unknown.join(", ")}.`,
				supportedParams: SUPPORTED_PARAMS,
			},
			{ status: 400 },
		);
	}

	const q = sp.get("q")?.toLowerCase().trim();
	const limit = clampLimit(sp.get("limit"), 20, 100);
	const winnersOnly =
		sp.get("winnersOnly") === "1" || sp.get("winnersOnly") === "true";
	const track = sp.get("track")?.toLowerCase().trim();

	let indexed: IndexedBuild[];
	try {
		indexed = await getIndex();
	} catch {
		indexed = [];
	}
	const indexedTotal = indexed.length;

	let pool_ = indexed;
	if (winnersOnly) pool_ = pool_.filter((b) => b.isWinner);
	if (track)
		pool_ = pool_.filter((b) => (b.track ?? "").toLowerCase().includes(track));

	let scored: Array<{ b: IndexedBuild; score: number; matched: string[] }>;
	if (q) {
		const tokens = q
			.split(/\s+/)
			.filter((t) => t && !GENERIC_QUERY_TOKENS.has(t));
		scored = [];
		for (const b of pool_) {
			let score = 0;
			let nameMatched = false;
			const matched = new Set<string>();
			for (const t of tokens) {
				for (const v of expand(t)) {
					if (b.name.toLowerCase().includes(v)) {
						score += 3;
						matched.add(t);
						nameMatched = true;
					} else if (b.haystack.includes(v)) {
						score += 1;
						matched.add(t);
					}
				}
			}
			// Prior-art favors RECALL (a missed existing build is the costly error):
			// a NAME match is strong enough to always surface; otherwise require at
			// least half the concepts so a common token alone ("payments") doesn't
			// flood. Ranking (not filtering) handles precision from there.
			if (
				score > 0 &&
				(nameMatched || matched.size >= Math.ceil(tokens.length / 2))
			) {
				score += b.isWinner ? 2 : 0; // a winning build is stronger prior art
				score += Math.min(b.voteCount, 20) * 0.05;
				scored.push({ b, score, matched: [...matched] });
			}
		}
		scored.sort((a, b) => b.score - a.score);
	} else {
		// browse mode — winners first, then most-voted, across all events
		scored = pool_
			.map((b) => ({
				b,
				score: (b.isWinner ? 1000 : 0) + Math.min(b.voteCount, 100),
				matched: [] as string[],
			}))
			.sort((a, b) => b.score - a.score);
	}

	const builds = scored.slice(0, limit).map(({ b, matched }) => ({
		name: b.name,
		description: b.description,
		hackathon: b.hackathon.title,
		hackathonSlug: b.hackathon.slug,
		endedAt: b.hackathon.endedAt,
		track: b.track,
		placement: b.hackathonPlacement,
		award: b.award,
		isWinner: b.isWinner,
		votes: b.voteCount,
		url: b.url,
		githubUrl: b.githubUrl,
		demoUrl: b.demoUrl,
		...(matched.length ? { matchedTerms: matched } : {}),
	}));

	try {
		logApiHit({ endpoint: "/api/hackathons/builds", query: q, req });
	} catch {}

	return NextResponse.json({
		meta: {
			source: "https://stellarlight.xyz/api/hackathons/builds",
			upstream: "dorahacks.io",
			generatedAt: new Date().toISOString(),
			filters: { q: q ?? null, winnersOnly, track: track ?? null, limit },
			counts: {
				indexedBuilds: indexedTotal,
				matched: scored.length,
				returned: builds.length,
			},
			note: q
				? "Prior-art over hackathon PROTOTYPES (DoraHacks buidls) — most never become directory projects. A hit means someone already built something similar at a Stellar hackathon; check `url`/`githubUrl` before rebuilding. Absence here is NOT proof it's never been tried (DoraHacks-sourced; non-winners can have thin descriptions)."
				: "No q — returning winners + most-voted builds across all Stellar hackathons. Pass q to check prior art ('has anyone built X at a hackathon?').",
		},
		builds,
	});
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
