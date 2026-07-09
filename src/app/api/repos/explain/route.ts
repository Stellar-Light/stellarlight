/**
 * Deep code answer — the "in tandem with DeepWiki" half of repo intelligence.
 *
 *   GET /api/repos/explain?q=where are transaction result codes defined
 *   GET /api/repos/explain?q=how does consensus work&repo=stellar/stellar-core
 *
 * Routes a deep code question to the authoritative Stellar repo (our curated
 * canonical map, falling back to the graded repo index), then asks DeepWiki for
 * a source-grounded answer about that repo's internals — so an agent gets the
 * actual answer (e.g. the txSUCCESS/txBAD_SEQ result codes and where they live),
 * not just a link. Our index picks WHICH repo; DeepWiki explains WHAT'S INSIDE.
 *
 * Degrades gracefully: if DeepWiki is unavailable, still returns the routed
 * authoritative repo + its deepWikiUrl so the agent has the right source.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { askDeepWiki } from "@/lib/deepwiki";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { canonicalFor, searchRepos } from "@/lib/repo-search";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const q =
		(sp.get("q") ?? sp.get("query") ?? sp.get("question"))?.trim() ?? "";
	let repo = sp.get("repo")?.trim() ?? "";

	if (!q) {
		return NextResponse.json(
			{
				ok: false,
				error: "no_query",
				message:
					"Pass ?q= a deep code question (e.g. 'where are transaction result codes defined'). Optionally pin ?repo=owner/name.",
			},
			{ status: 400 },
		);
	}

	// Route to the authoritative repo: curated canonical map first (concept →
	// SDF repo), then the graded index as a fallback for non-canonical topics.
	let routedVia: "explicit" | "canonical" | "search" = "explicit";
	const canon = canonicalFor(q);
	if (!repo) {
		if (canon.length) {
			repo = canon[0];
			routedVia = "canonical";
		} else {
			const payload = await getPayloadSafe();
			const { repos } = await searchRepos(payload, q, { limit: 1 });
			if (repos[0]) {
				repo = repos[0].fullName;
				routedVia = "search";
			}
		}
	}

	logApiHit({
		req,
		endpoint: "/api/repos/explain",
		query: q,
		filters: { repo, routedVia },
	});

	if (!repo) {
		// Total routing failure. Still emit the full documented shape
		// (answered/sources/alternateRepos) so agents parsing those keys don't
		// hit a KeyError on off-topic/unroutable questions.
		return NextResponse.json({
			ok: true,
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
			},
			q,
			repo: null,
			routedVia: null,
			repoMeta: null,
			alternateRepos: [],
			answer: null,
			answered: false,
			sources: {
				repoUrl: null,
				deepWikiUrl: null,
				deepWikiSearchUrl: null,
			},
			note: "Couldn't route this question to a specific repo. Try search_repos to find candidates, or pin ?repo=owner/name.",
		});
	}

	// Freshness/status of the routed repo from our index, so the answer can be
	// framed as-of a date ("grounded in stellar/stellar-core, last commit …")
	// instead of an undated assertion. Best-effort: null when not indexed.
	let repoMeta: {
		lastCommitAt: string | null;
		stars: number | null;
		isArchived: boolean;
		repoScoreLabel: string | null;
	} | null = null;
	// Code-verified truth from analyzing the routed repo's ACTUAL source — leads
	// the answer so an agent knows whether it's real, current, deployable Soroban
	// code before quoting DeepWiki prose. Null until code-scanned.
	let codeVerified: {
		stellarProof: string;
		codeDepth: number | null;
		isDeployableContract: boolean;
		sorobanSdkVersion: string | null;
		versionStatus: string | null;
		scannedAt: string | null;
		symbols: string[];
		mainnetContractId: string | null;
	} | null = null;
	try {
		const payload = await getPayloadSafe();
		if (payload) {
			const found = await payload.find({
				collection: "repos",
				where: { fullName: { equals: repo } },
				limit: 1,
				depth: 0,
				select: {
					lastCommitAt: true,
					stars: true,
					isArchived: true,
					repoScoreLabel: true,
					stellarProof: true,
					codeDepth: true,
					isDeployableContract: true,
					sorobanSdkVersion: true,
					versionStatus: true,
					codeScanState: true,
					codeScannedAt: true,
					codeSymbols: true,
					mainnetContractId: true,
				},
			});
			const d = found.docs[0] as unknown as Record<string, unknown> | undefined;
			if (d) {
				repoMeta = {
					lastCommitAt: (d.lastCommitAt as string) ?? null,
					stars: (d.stars as number) ?? null,
					isArchived: !!d.isArchived,
					repoScoreLabel: (d.repoScoreLabel as string) ?? null,
				};
				if (d.codeScanState === "scanned" && d.stellarProof) {
					codeVerified = {
						stellarProof: d.stellarProof as string,
						codeDepth:
							typeof d.codeDepth === "number" ? (d.codeDepth as number) : null,
						isDeployableContract: !!d.isDeployableContract,
						sorobanSdkVersion: (d.sorobanSdkVersion as string) ?? null,
						versionStatus: (d.versionStatus as string) ?? null,
						scannedAt: (d.codeScannedAt as string) ?? null,
						symbols: Array.isArray(d.codeSymbols)
							? (d.codeSymbols as unknown[])
									.filter((s): s is string => typeof s === "string")
									.slice(0, 20)
							: [],
						mainnetContractId: (d.mainnetContractId as string) ?? null,
					};
				}
			}
		}
	} catch {
		// best-effort — the answer is still valid without index freshness
	}

	const dw = await askDeepWiki(repo, q);

	return NextResponse.json(
		{
			ok: true,
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				note: "Repo routed by the StellarLight canonical/repo index; answer grounded by DeepWiki (deepwiki.com). Cite repoUrl as the source of truth; the answer is AI-generated from the repo and should be verified against the code for anything safety-critical.",
			},
			q,
			repo,
			routedVia,
			repoMeta,
			// Code-verified truth (from analyzing the repo's source, not stars):
			// leads so the agent can qualify the answer — "real deployable contract
			// on a supported soroban-sdk" vs "tooling that merely uses Stellar".
			codeVerified,
			// Other authoritative repos for this concept, so the agent can follow up.
			alternateRepos: canon.filter(
				(r) => r.toLowerCase() !== repo.toLowerCase(),
			),
			answer: dw?.answer ?? null,
			answered: !!dw,
			sources: {
				repoUrl: `https://github.com/${repo}`,
				deepWikiUrl: `https://deepwiki.com/${repo}`,
				deepWikiSearchUrl: dw?.searchUrl ?? null,
			},
			...(dw
				? {}
				: {
						note2:
							"DeepWiki had no answer (repo not indexed, or the service was briefly unavailable). The routed repo above is still the authoritative source — read it directly or retry.",
					}),
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
