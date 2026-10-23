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
 * Served from our own store (the hackathon-builds collection, filled daily by
 * scripts/sync-hackathon-builds.ts), with a live DoraHacks read as the
 * fallback; the flattened index is cached for an hour, so search is cheap.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { RERANK_TOP } from "@/lib/build-rerank";
import { afterEventFields, distribution } from "@/lib/hackathon-analytics";
import {
	BUILD_FILTER_PARAMS,
	listedEvents,
	parseBuildFilters,
	queryBuilds,
} from "@/lib/hackathon-build-query";
import {
	getHackathonBuildsIndex,
	type IndexedBuild,
	wordsNoBuildUses,
} from "@/lib/hackathon-builds";
import { heldSecurity } from "@/lib/held-repos";
import { clampLimit, clampOffset } from "@/lib/http-params";
import { parsePlacement } from "@/lib/integrations/dorahacks";
import { matchModeMeta } from "@/lib/match-mode";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { serverTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

const SUPPORTED_PARAMS = [...BUILD_FILTER_PARAMS, "limit", "offset"] as const;

// Index shape + builder live in src/lib/hackathon-builds.ts (shared with the
// builder profile pages); the hour-long cache is unstable_cache, not per instance.
async function getIndex(): Promise<IndexedBuild[]> {
	return getHackathonBuildsIndex();
}

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
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

	let indexed: IndexedBuild[];
	try {
		indexed = await getIndex();
	} catch {
		// A cold index that failed to build (an upstream timeout) is an outage,
		// not "no prior art": a warm instance keeps serving its last complete
		// index, a cold one asks the caller to retry.
		return NextResponse.json(
			{
				error: "hackathon builds index unavailable",
				advisory:
					"The prior-art index could not be built: the stored submissions could not be read, or the read came back empty. This is an outage, NOT a claim that nothing similar was built. Retry after a moment.",
				retryAfterSeconds: 2,
			},
			{
				status: 503,
				headers: { ...serverTiming(startedAt), "Retry-After": "2" },
			},
		);
	}
	// Hybrid by default: on 40 labeled ideas it put a wrong build in 22% of
	// top-5 slots to keyword's 40%, and kept exact-name lookups (27 of 30
	// first, keyword 26) for about 150 ms more at the median (2026-10-20).
	// After the index read: a hackathon value is checked against its events.
	const parsed = await parseBuildFilters(sp, "hybrid", indexed, listedEvents);
	if ("error" in parsed)
		return NextResponse.json(parsed.error, { status: 400 });
	const f = parsed.filters;
	const q = f.q || undefined;
	const limit = clampLimit(sp.get("limit"), 20, 100);
	// Pages share one ranking: offset skips that many matched builds.
	const offset = clampOffset(sp.get("offset"));
	// Submissions, not event entries: a submission entered in several events
	// is one result here (sls-092).
	const indexedTotal = new Set(indexed.map((b) => b.id)).size;

	// Filters, scoring and the meaning fallback live in
	// src/lib/hackathon-build-query.ts, shared with analyze, so the operations
	// read the same set the same way.
	const {
		scored,
		served: mode,
		warnings,
		entries,
		rerank,
	} = await queryBuilds(indexed, f, {
		perSubmission: true,
		// Here only: a declared package matches q (q=passkey finds builds on
		// passkey-kit); prior art and analyze's counts read the text alone.
		packages: true,
		countEntries: true,
		// Hybrid's first 50 reordered by the reranker: on 13 held-out labeled
		// ideas the top 5 held 15 same-idea builds and 17 wrong ones, where
		// the hybrid order held 11 and 21 (2026-10-23).
		rerank: true,
	});
	warnings.unshift(...parsed.warnings);
	// Most of q's words in no submission: a build listed by its words alone
	// matches only part of q. One found by meaning was scored on all of it.
	const unused =
		q && scored.some((s) => s.matched.length && s.similarity === undefined)
			? wordsNoBuildUses(indexed, q)
			: null;
	if (unused && unused.absent.length * 2 > unused.concepts) {
		const { absent, concepts } = unused;
		const words = `searched in q (${absent.join(", ")})`;
		// Every word in no submission: a words-alone build holds them only
		// inside longer words ("1 of the 1 words ... part of q" said less).
		warnings.push(
			absent.length < concepts
				? `${absent.length} of the ${concepts} words ${words} occur as a whole word in no submission in the index (a matchedTerms entry naming one was found inside a longer word), so a build listed by its words alone, with no similarity, matches only part of q and is not evidence that this idea was built`
				: concepts === 1
					? `the word ${words} occurs as a whole word in no submission in the index: a build listed by its words alone, with no similarity, holds it only inside a longer word and is not evidence that this idea was built`
					: `none of the ${concepts} words ${words} occurs as a whole word in any submission in the index: a build listed by its words alone, with no similarity, holds them only inside longer words and is not evidence that this idea was built`,
		);
	}

	const builds = scored
		.slice(offset, offset + limit)
		.map(({ b, matched, similarity }) => ({
			// Opens the full submission in getHackathonBuild.
			id: b.id,
			name: b.name,
			description: b.description,
			hackathon: b.hackathon.title,
			hackathonSlug: b.hackathon.slug,
			endedAt: b.hackathon.endedAt,
			track: b.track,
			placement: b.hackathonPlacement,
			award: b.award,
			// What this project actually won, parsed from its own placement string.
			// `award` is the CATEGORY title and is shared by every placement inside
			// it: DoraHacks nests prizes under an award_list entry, so all five
			// winners of Stellar Hacks: Real-World ZK carry award "$10,000 XLM
			// Prize" while placing 1st ($5,000) through 5th ($750) — the five sum
			// to that pool. Reading `award` as one winner's prize overstates 3rd
			// place by 8x and makes the winners sum to 5x the pot.
			prizeUsd: parsePlacement(b.hackathonPlacement).prizeUsd || null,
			isWinner: b.isWinner,
			votes: b.voteCount,
			url: b.url,
			githubUrl: b.githubUrl,
			...heldSecurity(b),
			demoUrl: b.demoUrl,
			// Present only when the link was checked: the directory project that
			// lists this build's exact repo, or null when none does.
			...(b.project !== undefined ? { project: b.project } : {}),
			// What the repo did after the event, in analyze's activity
			// vocabulary, and its last commit: absent is unknown.
			...afterEventFields(b),
			// Present only when the repo was read: absent is unknown.
			...(b.stack ? { stack: b.stack } : {}),
			// Present only when categorized: best first.
			...(b.categories ? { categories: b.categories.map((c) => c.type) } : {}),
			...(matched.length ? { matchedTerms: matched } : {}),
			...(similarity !== undefined
				? { similarity: Math.round(similarity * 1000) / 1000 }
				: {}),
		}));

	try {
		logApiHit({
			endpoint: "/api/hackathons/builds",
			query: q,
			req,
			startedAt,
			status: 200,
		});
	} catch {}

	return NextResponse.json(
		{
			meta: {
				...matchModeMeta(
					!q
						? "all"
						: mode === "meaning"
							? "vector"
							: mode === "hybrid"
								? "hybrid"
								: "filtered",
				),
				mode: { requested: f.mode, served: mode },
				// Present only when the reranker was attempted (q, hybrid served).
				...(rerank !== undefined ? { reranked: rerank !== null } : {}),
				...(warnings.length ? { warnings } : {}),
				source: "https://stellarlight.xyz/api/hackathons/builds",
				upstream: "dorahacks.io",
				generatedAt: new Date().toISOString(),
				filters: {
					q: q ?? null,
					winnersOnly: f.winnersOnly,
					hackathon: f.hackathons.length ? f.hackathons : null,
					track: f.track ?? null,
					category: f.category ?? null,
					package: f.package ?? null,
					limit,
					offset,
					mode: f.mode,
				},
				counts: {
					indexedBuilds: indexedTotal,
					matched: scored.length,
					// Event entries that match: analyze's unit for the same filter.
					entries,
					returned: builds.length,
				},
				// Over every matched build, not just this page: "which SDKs do
				// winners use" is winnersOnly=1 with no q.
				stack: {
					...stackMeta(scored.map((s) => s.b)),
					note: "Stellar packages declared in each matched build's repo manifests (package.json, Cargo.toml). Counted over buildsRead; the other matched builds have no repo link, a repo that is not public, or were not read yet: unknown, not 'uses none'.",
				},
				note: q
					? `Prior art over hackathon PROTOTYPES (DoraHacks submissions); most never become directory projects. Ordered by how many of the query's concepts a build covers, then prize winners first${rerank ? `; the first ${RERANK_TOP} then reordered by a reranker that reads q with each build's name and summary (meta.reranked)` : ""}. A hit means someone already built something similar at a Stellar hackathon: check \`url\` or \`githubUrl\` before rebuilding, and \`project\` for what it became. No hit is NOT proof it was never tried (DoraHacks-sourced; non-winners can have thin descriptions).`
					: "No q: prize winners first across all Stellar hackathons. Pass q to check prior art ('has anyone built X at a hackathon?').",
			},
			builds,
		},
		{ headers: serverTiming(startedAt) },
	);
}

/** meta.stack, the package facet in the shape it shipped with (spec 1.9.68). */
function stackMeta(builds: IndexedBuild[]) {
	const d = distribution(builds, "package", { top: 15 });
	return {
		buildsMatched: d.builds,
		buildsRead: d.known,
		packages: d.values.map((v) => ({
			name: v.value,
			builds: v.builds,
			winners: v.winners,
		})),
	};
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
