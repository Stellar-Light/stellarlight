/**
 * Code-reference search — find existing Stellar ecosystem GitHub repos by tech.
 * Answers the "has anyone built X / show me zk repos" question that project
 * search can't: it indexes GitHub topics + description + language, and ranks by
 * a quality grade (repoScore = freshness + traction + hackathon/SCF/prominence).
 *
 *   GET /api/repos/search?q=zk
 *   GET /api/repos/search?q=oracle&language=Rust&minScore=40
 *
 * Keyword overlap over name + description + topics + language, then ordered by
 * keyword score, then by repoScore (the graded "best reference" signal). Repo
 * counts are in the hundreds, so candidates are scored in memory.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 60;

interface RepoDoc {
	id: string;
	fullName: string;
	owner?: string;
	name?: string;
	url?: string;
	description?: string | null;
	topics?: unknown;
	primaryLanguage?: string | null;
	stars?: number;
	openIssues?: number;
	lastCommitAt?: string | null;
	homepageUrl?: string | null;
	isFork?: boolean;
	isArchived?: boolean;
	projectSlug?: string | null;
	projectName?: string | null;
	hackathonWinner?: boolean;
	scfAwarded?: boolean;
	repoScore?: number;
	repoScoreLabel?: string | null;
}

function topicList(topics: unknown): string[] {
	return Array.isArray(topics) ? topics.filter((t): t is string => typeof t === "string") : [];
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const q = sp.get("q")?.trim() ?? "";
	const language = sp.get("language")?.trim().toLowerCase() ?? "";
	const minScore = Number(sp.get("minScore") || "0") || 0;
	const limit = Math.min(Number(sp.get("limit") || "20") || 20, 100);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	const payload = await getPayloadSafe();
	let rows: Array<RepoDoc & { score: number }> = [];
	let total = 0;

	if (payload) {
		try {
			const res = await payload.find({
				collection: "repos",
				where: language ? { primaryLanguage: { like: language } } : {},
				limit: 2000,
				depth: 0,
			});
			const tokens = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
			const docs = (res.docs as unknown as RepoDoc[]).map((r) => {
				const topics = topicList(r.topics);
				const hay = `${r.fullName} ${r.description ?? ""} ${topics.join(" ")} ${r.primaryLanguage ?? ""}`.toLowerCase();
				const score = tokens.length
					? tokens.reduce((s, t) => s + (hay.includes(t) ? 1 : 0), 0)
					: 1;
				return { ...r, score, _topics: topics };
			});

			let filtered = tokens.length ? docs.filter((d) => d.score >= 1) : docs;
			if (minScore > 0) filtered = filtered.filter((d) => (d.repoScore ?? 0) >= minScore);

			// Primary rank = keyword overlap; tiebreak by the quality grade so the
			// best-maintained / most-credentialed reference leads within a tier.
			filtered.sort(
				(a, b) =>
					b.score - a.score ||
					(b.repoScore ?? 0) - (a.repoScore ?? 0) ||
					(b.stars ?? 0) - (a.stars ?? 0),
			);
			total = filtered.length;
			rows = filtered.slice(offset, offset + limit) as Array<RepoDoc & { score: number }>;
		} catch {
			// degrade to empty
		}
	}

	logApiHit({ req, endpoint: "/api/repos/search", query: q, filters: { language, minScore, limit } });

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				filters: { q, language: language || null, minScore, limit, offset },
				note: "Code references graded by repoScore (0-100) = freshness + traction + hackathon/SCF/prominence authority. Sort/lead with high-score repos as the strongest existing references.",
				counts: { returned: rows.length, total },
			},
			repos: rows.map((r) => ({
				fullName: r.fullName,
				owner: r.owner ?? null,
				name: r.name ?? null,
				url: r.url ?? null,
				description: r.description ?? null,
				topics: topicList(r.topics),
				primaryLanguage: r.primaryLanguage ?? null,
				stars: r.stars ?? 0,
				openIssues: r.openIssues ?? 0,
				lastCommitAt: r.lastCommitAt ?? null,
				homepageUrl: r.homepageUrl ?? null,
				isFork: !!r.isFork,
				isArchived: !!r.isArchived,
				project: r.projectSlug ? { slug: r.projectSlug, name: r.projectName ?? null } : null,
				hackathonWinner: !!r.hackathonWinner,
				scfAwarded: !!r.scfAwarded,
				repoScore: r.repoScore ?? 0,
				repoScoreLabel: r.repoScoreLabel ?? null,
				score: r.score,
			})),
		},
		{ headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
	);
}
