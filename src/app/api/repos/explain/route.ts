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
import { isKnownInfraNotDeployable } from "@/lib/known-infra";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { canonicalFor, contentTokens, searchRepos } from "@/lib/repo-search";

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
	let nearMisses: string[] = [];
	const canon = canonicalFor(q);
	if (!repo) {
		if (canon.length) {
			repo = canon[0];
			routedVia = "canonical";
		} else {
			const payload = await getPayloadSafe();
			const { repos } = await searchRepos(payload, q, { limit: 1 });
			// F4 honesty guard (audit: token-soup fallback): adopting the search
			// top-1 is only justified when it shares a real query token in its
			// own identity (name/topics/description). Otherwise an unmapped NL
			// question got a lexical-noise winner — say so instead of confidently
			// explaining the wrong repo.
			const qTokens = contentTokens(q);
			const identityHit = (rr: (typeof repos)[number]) => {
				const hay =
					`${rr.fullName} ${(rr.topics ?? []).join(" ")} ${rr.description ?? ""}`.toLowerCase();
				return qTokens.some((t) => hay.includes(t));
			};
			nearMisses = repos.slice(0, 3).map((rr) => rr.fullName);
			if (repos[0] && (qTokens.length === 0 || identityHit(repos[0]))) {
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
			// Near-miss candidates from search — surfaced so an agent can pick
			// one and pin ?repo= instead of dead-ending (F4 honesty guard).
			alternateRepos: nearMisses,
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
		sdkCapabilities: string[];
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
					sdkCapabilities: true,
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
						// sls-046: known platform/SDK/tooling repos (stellar-core,
						// rs-soroban-env, the SDKs/CLI…) are pinned NOT-deployable —
						// their cdylib crates are the runtime/fixtures, not a
						// deployable contract product. Flag semantics: "this repo's
						// PRODUCT is a deployable Soroban contract".
						isDeployableContract: isKnownInfraNotDeployable(repo)
							? false
							: !!d.isDeployableContract,
						sorobanSdkVersion: (d.sorobanSdkVersion as string) ?? null,
						versionStatus: (d.versionStatus as string) ?? null,
						scannedAt: (d.codeScannedAt as string) ?? null,
						symbols: Array.isArray(d.codeSymbols)
							? (d.codeSymbols as unknown[])
									.filter((s): s is string => typeof s === "string")
									.slice(0, 20)
							: [],
						mainnetContractId: (d.mainnetContractId as string) ?? null,
						sdkCapabilities: Array.isArray(d.sdkCapabilities)
							? (d.sdkCapabilities as unknown[]).filter(
									(s): s is string => typeof s === "string",
								)
							: [],
					};
				}
			}
		}
	} catch {
		// best-effort — the answer is still valid without index freshness
	}

	const dw = await askDeepWiki(repo, q);
	// DeepWiki can return a RESPONSE whose answer is an empty string (the repo
	// isn't indexed there yet) — `!!dw` then reports `answered: true` with
	// `answer: ""`, a silent dead-end that's strictly worse than a stated
	// failure, and it suppresses note2. Treat a blank answer as unanswered so
	// `answered` stays honest and the caller gets the explanation; codeVerified
	// below still carries real code-derived facts about the routed repo.
	const dwAnswer = dw?.answer?.trim() ? dw.answer : null;

	// DeepWiki doesn't index every repo — but WE scanned these repos precisely so
	// an uncovered one still gets a CODE-GROUNDED answer instead of a shrug. When
	// DeepWiki is blank, synthesize from our own source scan (symbols, SDK
	// version, deployability, mainnet id) and label the provenance via
	// `answerSource`, so a consumer can always tell a DeepWiki mechanism
	// walkthrough from our scan-derived facts. Both are real; they answer
	// different depths of the question.
	let scanAnswer: string | null = null;
	if (!dwAnswer && codeVerified) {
		const cv = codeVerified;
		const bits: string[] = [
			`DeepWiki hasn't indexed \`${repo}\`, so this answer is grounded in StellarLight's own source scan${cv.scannedAt ? ` (${cv.scannedAt.slice(0, 10)})` : ""} rather than a DeepWiki walkthrough.`,
			`\`${repo}\` is ${cv.isDeployableContract ? "a deployable Soroban contract" : "Stellar-related code (its product is not a deployable contract)"}${cv.sorobanSdkVersion ? ` built on soroban-sdk \`${cv.sorobanSdkVersion}\`${cv.versionStatus ? ` (${cv.versionStatus})` : ""}` : ""}.`,
		];
		if (cv.stellarProof) bits.push(`Code-verified: ${cv.stellarProof}.`);
		if (cv.symbols.length)
			bits.push(
				`Scanned entry points: ${cv.symbols
					.slice(0, 12)
					.map((s) => `\`${s}\``)
					.join(", ")}.`,
			);
		if (cv.sdkCapabilities.length)
			bits.push(`SDK capabilities: ${cv.sdkCapabilities.join(", ")}.`);
		if (cv.mainnetContractId)
			bits.push(`Deployed on mainnet as \`${cv.mainnetContractId}\`.`);
		bits.push(
			`For the full mechanism, read the source at https://github.com/${repo}.`,
		);
		scanAnswer = bits.join(" ");
	}
	const finalAnswer = dwAnswer ?? scanAnswer;

	return NextResponse.json(
		{
			ok: true,
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				note: "Repo routed by the StellarLight canonical/repo index. `answerSource` states the grounding: `deepwiki` = an AI-generated mechanism walkthrough of the repo (deepwiki.com); `stellarlight-code-scan` = facts derived from OUR scan of the actual source (entry-point symbols, soroban-sdk version, deployability, mainnet id) used when DeepWiki hasn't indexed the repo — narrower than a walkthrough, but code-grounded, never a guess. Cite repoUrl as the source of truth and verify against the code for anything safety-critical.",
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
			answer: finalAnswer,
			answered: !!finalAnswer,
			// Provenance, always explicit: a DeepWiki mechanism walkthrough vs our
			// own source scan. They answer different depths — never let a consumer
			// mistake scan-derived facts for a code walkthrough (or vice versa).
			answerSource: dwAnswer
				? "deepwiki"
				: scanAnswer
					? "stellarlight-code-scan"
					: null,
			sources: {
				repoUrl: `https://github.com/${repo}`,
				deepWikiUrl: `https://deepwiki.com/${repo}`,
				deepWikiSearchUrl: dw?.searchUrl ?? null,
			},
			...(finalAnswer
				? {}
				: {
						note2:
							"DeepWiki has no answer for this repo (not indexed there yet, or briefly unavailable) AND it hasn't been code-scanned by us yet, so there is no grounded answer to give — `answer` is null rather than an empty string, making this a stated gap, not a silent one. The routed repo above is still the authoritative source: read it directly, or retry once the code scan lands.",
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
