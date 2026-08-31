/**
 * Apply the code-proof tier — the WRITE PATH scan-report.ts was always gating.
 *
 * `codeProofTier` (src/lib/code-signals.ts) has existed and been tested for
 * months, and is called from exactly ONE place: scripts/scan/scan-report.ts,
 * whose own header says it "prints what the scanner WOULD assign" and whose
 * safety summary "mirrors the circuit breakers the WRITE path will enforce".
 * That write path was never built. Measured on the live corpus 2026-08-30:
 *
 *     tier=quality        0
 *     tier=community      11,376
 *     tier=archive        1,585
 *     cargo-sdk AND codeDepth>=0.6   1,333   <- should be quality, none is
 *
 * So the tier ladder PLAN.md leans on ("tier-gated so bulk rows can't displace
 * canonical answers") has never promoted anything: SDF's own stellar/friendbot
 * sits in `community` beside 10,018 Electric-Capital long-tail rows. The gate
 * is not weak, it is absent.
 *
 * ZERO GitHub API calls — every input is a STORED field, so this can run
 * full-corpus without touching the scan budget:
 *   proof←stellarProof  outcome←codeScanState  codeDepth  farmScore
 *   isArchived  lastCommitAt  stars  repoScoreLabel  protection←project link
 *
 * !! DO NOT --execute YET. The dry run (2026-08-30, full corpus) proved the
 * !! write path is missing AND that the promotion RULE is inverted:
 * !!
 * !!   proposed: 1330 -> quality, 7 -> community, 4 -> archive
 * !!
 * !! but not ONE canonical repo clears the bar, while 1,330 student/hackathon
 * !! dApps do:
 * !!   stellar/js-stellar-sdk    695* depth 0.94  -> community (proof=js-sdk,
 * !!                                                 the gate wants cargo-sdk)
 * !!   stellar/rs-soroban-sdk    199* depth 0.45  -> community (< 0.6)
 * !!   stellar/stellar-cli       123* depth 0.35  -> community
 * !!   OpenZeppelin/stellar-contracts 94* depth 0.39 -> community
 * !!   stellar/soroban-examples  139*             -> NEVER CODE-SCANNED
 * !!   Prince-kumar223/voting-dapp, Poorva-M/Xpense-Web3, polsalarm/PadaLock
 * !!                                              -> quality
 * !!
 * !! Why: codeDepth measures how heavily a repo USES the SDK. An application
 * !! that calls the SDK everywhere scores high; the SDK ITSELF scores low,
 * !! because it does not import itself. "Code-proven" and "canonical" are two
 * !! different questions and this rule only answers the first.
 * !!
 * !! Executing as-is would put 1,330 hackathon repos ABOVE every canonical SDF
 * !! repo — the opposite of what the tier exists for (PLAN.md: "tier-gated so
 * !! bulk rows can't displace canonical answers"). The tier needs a
 * !! canonicality signal (ownership, curation, stars, dependents), not depth
 * !! of SDK usage. Until that lands this script is a DIAGNOSTIC.
 *
 *   pnpm exec tsx scripts/backfill-code-tier.ts             # dry run (default)
 *   pnpm exec tsx scripts/backfill-code-tier.ts --execute   # write
 *
 * Discipline (the house rules, all enforced below):
 *   - dry-run by default; --execute is explicit
 *   - only-write-if-different, and a per-write READ-BACK (the silent-drop class)
 *   - never-demote-on-doubt: codeProofTier returns null on a non-ok outcome
 *   - CIRCUIT BREAKERS from scan-report's safety gate: a protected repo is
 *     never archived, and a run that would archive more than ARCHIVE_CAP of the
 *     corpus aborts instead of writing
 *   - zero-work RED: a sweep that proposes nothing over a corpus known to hold
 *     1,333 qualifying repos means the derivation broke — exit 1, loudly
 */
import "./load-env";

import { getPayload } from "payload";
import { codeProofTier } from "../src/lib/code-signals";
import { CURATED_CANONICAL_REPOS } from "../src/lib/repo-search";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
/** Demotions are OFF unless asked for. Promotions are provably safe — they
 * come from the curated list, which a human maintains. Demotions come from
 * `proof === "none"`, and the proof engine has a LANGUAGE BLIND SPOT: it looks
 * for Rust `soroban-sdk` and JS `@stellar/stellar-sdk`, so an AssemblyScript
 * Soroban contract reads as none. The dry run duly proposed archiving
 * Soneso/as-soroban-examples — AssemblyScript examples from a well-known
 * Stellar SDK vendor — on `none+farm:1`. Until proof covers the languages we
 * actually index, an archive decision made on its silence is a guess. */
const WITH_DEMOTIONS = process.argv.includes("--include-demotions");
/** Abort rather than write if a run wants to archive more than this share. */
const ARCHIVE_CAP = 0.05;
const PAGE = 500;

/** codeScanState is scan bookkeeping ("scanned"/"error"); codeProofTier speaks
 * ScanOutcome ("ok"/…). They were never the same vocabulary — mapping them is
 * exactly the seam where the write path went missing. */
function toOutcome(state: string | null | undefined) {
	return state === "scanned" ? "ok" : "error";
}

type Row = {
	id: string;
	fullName?: string | null;
	tier?: string | null;
	stellarProof?: string | null;
	codeScanState?: string | null;
	codeDepth?: number | null;
	farmScore?: number | null;
	isArchived?: boolean | null;
	lastCommitAt?: string | null;
	stars?: number | null;
	repoScoreLabel?: string | null;
	scfAwarded?: boolean | null;
	projectSlug?: string | null;
	projectProminence?: number | null;
};

async function main() {
	const payload = await getPayload({ config: await configPromise });
	// Lowercased: the corpus stores GitHub's canonical casing and Mongo `equals`
	// is case-sensitive — the exact trap that left 8 curated names matching zero
	// rows. Compare case-insensitively here so a casing drift cannot silently
	// drop a repo out of the top tier.
	const canonical = new Set(
		CURATED_CANONICAL_REPOS.map((n) => n.toLowerCase()),
	);
	const changes: Array<{
		full: string;
		from: string;
		to: string;
		why: string;
	}> = [];
	let seen = 0;
	let page = 1;

	for (;;) {
		const res = await payload.find({
			collection: "repos",
			depth: 0,
			limit: PAGE,
			page,
			// Internal context: tier derivation is an internal judgement and the
			// afterRead hook strips internal fields from anonymous reads.
			context: { internal: true },
		});
		const docs = res.docs as unknown as Row[];
		if (!docs.length) break;
		for (const d of docs) {
			seen++;
			const verdict = codeProofTier({
				proof: (d.stellarProof ?? "none") as never,
				outcome: toOutcome(d.codeScanState) as never,
				farmScore: d.farmScore ?? 0,
				codeDepth: d.codeDepth ?? 0,
				isArchived: d.isArchived,
				lastCommitAt: d.lastCommitAt,
				stars: d.stars,
				repoScoreLabel: d.repoScoreLabel,
				protection: {
					fullName: d.fullName,
					scfAwarded: d.scfAwarded,
					projectSlug: d.projectSlug,
					projectProminence: d.projectProminence,
				},
			});
			// null = "no change" (doubt). Never invent a tier from a bad scan.
			if (!verdict) continue;

			// CANONICALITY OVERRIDE — the fix for the inverted rule.
			//
			// codeProofTier's `quality` branch asks "does this repo use the SDK
			// deeply?", which an application answers better than the SDK itself:
			// a dry run promoted 1,330 repos and not one was canonical, while
			// js-stellar-sdk, rs-soroban-sdk and stellar-cli all failed. Depth is
			// the wrong question for a tier whose job is "must not be displaced".
			//
			// So `quality` is decided by CURATION — the same hand-maintained list
			// canonicalFor already floats to the top of a result set — and
			// codeProofTier keeps deciding archive/community, where its two-key
			// over-filter safety is exactly right. Curated repos are additionally
			// never archived here, matching isProtected's intent.
			const isCanonical = canonical.has((d.fullName ?? "").toLowerCase());
			// `quality` means CURATED, full stop. Without the second clause the
			// depth-based branch still fires for everything else and we are back
			// to 1,330 promotions led by student dApps — the inversion this
			// override exists to remove. Non-curated repos top out at community;
			// archive still comes from codeProofTier's two-key safety.
			const tier = isCanonical
				? "quality"
				: verdict.tier === "quality"
					? "community"
					: verdict.tier;
			const why = isCanonical
				? "curated-canonical"
				: verdict.tier === "quality"
					? "code-proven (not curated → community)"
					: verdict.reason.join("+");
			if (tier === (d.tier ?? "")) continue; // only-write-if-different
			changes.push({
				full: d.fullName ?? d.id,
				from: d.tier ?? "(unset)",
				to: tier,
				why,
			});
		}
		if (!res.hasNextPage) break;
		page++;
	}

	// Split before anything is written, so the safe half can land alone.
	const applied = WITH_DEMOTIONS
		? changes
		: changes.filter((c) => c.to === "quality");
	const withheld = changes.length - applied.length;
	const promote = changes.filter((c) => c.to === "quality");
	const archive = changes.filter((c) => c.to === "archive");
	const demote = changes.filter((c) => c.to === "community");

	console.log(`scanned ${seen} repos`);
	console.log(
		`proposed: ${promote.length} → quality · ${demote.length} → community · ${archive.length} → archive`,
	);
	if (withheld)
		console.log(
			`  (${withheld} demotions WITHHELD — pass --include-demotions once the proof engine covers AssemblyScript/other languages)`,
		);
	for (const c of applied.slice(0, 15))
		console.log(`  ${c.full}: ${c.from} → ${c.to}  (${c.why})`);
	if (applied.length > 15) console.log(`  … ${applied.length - 15} more`);

	// Zero-work RED: silence over a corpus known to contain qualifying repos is
	// a broken derivation, not a clean corpus.
	if (changes.length === 0) {
		console.error(
			"\nRED: zero proposals over the whole corpus. 1,333 repos match cargo-sdk + codeDepth>=0.6, so a derivation that changes nothing is broken, not clean.",
		);
		process.exit(1);
	}
	// CIRCUIT BREAKER: a mass-archive is how a corpus gets quietly deleted.
	if (archive.length / Math.max(seen, 1) > ARCHIVE_CAP) {
		console.error(
			`\nABORT: would archive ${archive.length}/${seen} (> ${ARCHIVE_CAP * 100}% cap). Refusing to write.`,
		);
		process.exit(1);
	}

	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute to apply.");
		return;
	}

	let wrote = 0;
	let mismatched = 0;
	for (const c of applied) {
		const found = await payload.find({
			collection: "repos",
			where: { fullName: { equals: c.full } },
			limit: 1,
			depth: 0,
			context: { internal: true },
		});
		const doc = found.docs[0] as unknown as Row | undefined;
		if (!doc) continue;
		await payload.update({
			collection: "repos",
			id: doc.id,
			data: { tier: c.to },
			context: { internal: true },
		});
		// READ-BACK: payload.update() reports success while silently dropping an
		// unknown key, so the only proof a write landed is reading it again.
		const back = await payload.findByID({
			collection: "repos",
			id: doc.id,
			depth: 0,
			context: { internal: true },
		});
		if ((back as unknown as Row).tier === c.to) wrote++;
		else {
			mismatched++;
			console.error(
				`  read-back MISMATCH ${c.full}: still ${(back as unknown as Row).tier}`,
			);
		}
	}
	console.log(`\nwrote ${wrote}/${applied.length} (read-back verified)`);
	if (mismatched) {
		console.error(`${mismatched} writes did not stick`);
		process.exit(1);
	}
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
