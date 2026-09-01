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
import {
	findDirectAnswerNote,
	findRepoByTrigger,
	REPO_KNOWLEDGE_NOTES,
} from "@/lib/repo-knowledge";
import {
	canonicalFor,
	contentTokens,
	explicitRepoName,
	searchRepos,
} from "@/lib/repo-search";

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
	let routedVia: "explicit" | "canonical" | "knowledge-trigger" | "search" =
		"explicit";
	let nearMisses: string[] = [];
	const canon = canonicalFor(q);
	if (!repo) {
		// A bare owner/name IS the routing — the same as passing ?repo=. Before
		// the concept map: "stellar/stellar-etl" wordy-split into "etl" and
		// went to stellar-ledger-data-indexer (2026-09-01).
		const named = explicitRepoName(q);
		if (named) {
			repo = named;
		}
	}
	if (!repo) {
		const viaTrigger = canon.length ? null : findRepoByTrigger(q);
		if (canon.length) {
			repo = canon[0];
			routedVia = "canonical";
		} else if (viaTrigger) {
			// A curated trigger phrase names the repo that holds the dated fact —
			// before the lexical index votes ("soroban cli renamed" went to
			// tupui/soroban-cli-python by name while the rename note lived on
			// stellar/stellar-cli, 2026-09-01).
			repo = viaTrigger;
			routedVia = "knowledge-trigger";
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
			// Explicit nulls, not omitted keys: `answerAsOf === null` is the
			// documented "age unknown" check, and an absent key is undefined — a
			// client's null-check would silently never fire on this envelope.
			answerSource: null,
			answerAsOf: null,
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
		scannedRef: string | null;
		successorRepo: string | null;
		symbols: string[];
		mainnetContractId: string | null;
		sdkCapabilities: string[];
		codeDomains: string[];
		contractInterface: string[];
		stellarDeps: string[];
		codeInUse: Record<string, unknown> | null;
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
					codeDomains: true,
					contractInterface: true,
					stellarDeps: true,
					codeInUse: true,
					scannedRef: true,
					successorRepo: true,
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
						scannedRef: typeof d.scannedRef === "string" ? d.scannedRef : null,
						successorRepo:
							typeof d.successorRepo === "string" ? d.successorRepo : null,
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
						codeDomains: Array.isArray(d.codeDomains)
							? (d.codeDomains as unknown[]).filter(
									(s): s is string => typeof s === "string",
								)
							: [],
						contractInterface: Array.isArray(d.contractInterface)
							? (d.contractInterface as unknown[])
									.filter((s): s is string => typeof s === "string")
									.slice(0, 60)
							: [],
						stellarDeps: Array.isArray(d.stellarDeps)
							? (d.stellarDeps as unknown[]).filter(
									(s): s is string => typeof s === "string",
								)
							: [],
						codeInUse:
							d.codeInUse && typeof d.codeInUse === "object"
								? (d.codeInUse as Record<string, unknown>)
								: null,
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
		if (cv.codeDomains.length)
			bits.push(`Code-evidenced domains: ${cv.codeDomains.join(", ")}.`);
		if (cv.mainnetContractId)
			bits.push(`Deployed on mainnet as \`${cv.mainnetContractId}\`.`);
		bits.push(
			`For the full mechanism, read the source at https://github.com/${repo}.`,
		);
		scanAnswer = bits.join(" ");
	}
	// sls-080 (the consumer's roadmap blocker): DeepWiki's index can contradict
	// the scanned source on the exact constant asked about — it answered 22–25
	// for a value stellar/stellar-horizon defines as 28 at our own scannedRef.
	// When a CURATED, DATED, source-cited note directly answers the question
	// (tight identifier match — see findDirectAnswerNote), the note LEADS and
	// carries the dating; the DeepWiki walkthrough stays underneath, labeled as
	// possibly lagging. A dated fact we verified beats an undated index we
	// didn't.
	const curatedNotes = REPO_KNOWLEDGE_NOTES[repo.toLowerCase()] ?? [];
	const directNote = findDirectAnswerNote(q, curatedNotes);
	// Audit N2: the walkthrough is NOT concatenated into the dated answer —
	// #1168 existed because a naive parser reads the wrong number out of
	// mixed text, and gluing DeepWiki's lagging 22–25 under a note dated
	// answerAsOf rebuilt exactly that trap inside one field. The dated answer
	// carries only the dated fact; the walkthrough stays reachable at
	// sources.deepWikiUrl and is named, not embedded.
	const noteAnswer = directNote
		? dwAnswer
			? `${directNote.note}\n\n(A fuller mechanism walkthrough exists via sources.deepWikiUrl — an undated index that can LAG the dated fact above; where they disagree, the dated fact wins.)`
			: directNote.note
		: null;
	const finalAnswer = noteAnswer ?? dwAnswer ?? scanAnswer;

	return NextResponse.json(
		{
			ok: true,
			meta: {
				source: "https://stellarlight.xyz/directory",
				generatedAt: new Date().toISOString(),
				// Say it in `warnings` too, not only in the field. An absent
				// `answerAsOf` is easy to skim past; a warning naming the three
				// fields that do NOT date the answer is not.
				...(noteAnswer
					? {
							warnings: [
								"The answer IS a curated, dated, source-cited fact (answerSource: knowledge-note, dated by answerAsOf) because it directly names what was asked. The DeepWiki walkthrough is deliberately NOT embedded in this dated answer — it is an undated index that can lag or contradict the dated fact; reach it via sources.deepWikiUrl, and where they disagree, the dated fact wins.",
							],
						}
					: dwAnswer
						? {
								warnings: [
									"answerAsOf is null: DeepWiki exposes no index date, so the age of this answer is UNKNOWN. `codeVerified.scannedAt`, `codeVerified.scannedRef` and `repoMeta.lastCommitAt` date OUR SOURCE SCAN, not this answer — a DeepWiki answer can be older than the scanned ref and disagree with it. Verify any specific value (version numbers, constants, addresses) against repoUrl at scannedRef before relying on it.",
								],
							}
						: {}),
				note: "Repo routed by the StellarLight canonical/repo index. `answerSource` states the grounding: `knowledge-note` = a curated, dated, source-cited fact that directly names what was asked (leads over any walkthrough; answerAsOf dates it); `deepwiki` = an AI-generated mechanism walkthrough of the repo (deepwiki.com); `stellarlight-code-scan` = facts derived from OUR scan of the actual source (entry-point symbols, soroban-sdk version, deployability, mainnet id) used when DeepWiki hasn't indexed the repo — narrower than a walkthrough, but code-grounded, never a guess. Cite repoUrl as the source of truth and verify against the code for anything safety-critical. `knowledgeNotes` lists every public dated fact we hold for the routed repo (deprecations, renames, registry identity, advisories) whether or not one of them led the answer — read them even when answerSource is 'deepwiki'.",
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
			// Every public dated fact we hold for this repo, whether or not one
			// of them led the answer — a DeepWiki walkthrough never says that a
			// package is deprecated or a path was renamed. Internal notes never
			// leave; triggers are routing hints, not content.
			knowledgeNotes: curatedNotes
				.filter((n) => n.visibility !== "internal")
				.map(({ note, source, asOf }) => ({ note, source, asOf })),
			answer: finalAnswer,
			answered: !!finalAnswer,
			// Provenance, always explicit: a DeepWiki mechanism walkthrough vs our
			// own source scan. They answer different depths — never let a consumer
			// mistake scan-derived facts for a code walkthrough (or vice versa).
			answerSource: noteAnswer
				? "knowledge-note"
				: dwAnswer
					? "deepwiki"
					: scanAnswer
						? "stellarlight-code-scan"
						: null,
			// WHEN THE ANSWER WAS TRUE — which is not when we fetched it, and not
			// when we scanned the code.
			//
			// Raven filed this (issue #1134) with three independent reproductions:
			// `explainRepo` on stellar/stellar-horizon returned
			// `MaxSupportedProtocolVersion = 25` while the source at our own
			// `codeVerified.scannedRef` (82660510) defines 28. Verified again here
			// against raw.githubusercontent at that ref and at 2abda012 — both say
			// 28. DeepWiki's index is simply behind.
			//
			// The stale number is DeepWiki's to fix. Ours is that the response
			// carried three dates — meta.generatedAt, codeVerified.scannedAt,
			// repoMeta.lastCommitAt — every one of them describing the code scan,
			// and none of them dating the ANSWER. A consumer reading
			// "scannedAt: 2026-08-14" beside "answerSource: deepwiki" reasonably
			// concludes the answer reflects the code as of that scan. It does not.
			//
			// DeepWikiAnswer carries { repo, answer, searchUrl } and the MCP
			// envelope exposes no index date, so for the deepwiki path this is
			// NULL — an admission, not a guess. Inventing a timestamp here would
			// be worse than the original defect: it would make the unknown look
			// measured. The scan-derived path CAN be dated, because there the
			// answer IS the scan.
			answerAsOf: noteAnswer
				? // Audit C6: notes date to the DAY of verification; the contract
					// declares date-time, so a bare date is serialized as that day's
					// start in UTC — conservative, and stated in the spec.
					directNote?.asOf
					? directNote.asOf.length === 10
						? `${directNote.asOf}T00:00:00Z`
						: directNote.asOf
					: null
				: dwAnswer
					? null
					: scanAnswer
						? (codeVerified?.scannedAt ?? null)
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
