/**
 * Enrich projects with data from the Stellar Community Fund (SCF).
 *
 * Fetches the public SCF projects API and matches against our DB by name/slug.
 * Pulls in: thumbnail images, category mapping, award status.
 *
 * For matched projects with detail pages, scrapes additional data:
 * description, links (website, X, github), team info, funding amounts.
 *
 * Usage:
 *   npx tsx scripts/enrich-from-scf.ts                  # Dry run
 *   npx tsx scripts/enrich-from-scf.ts --execute        # Write to DB
 */
import "./load-env";
import { getPayload } from "payload";
import {
	cleanTitle as cleanScfTitle,
	normSpaceless,
	stemSlugHash,
	titlePrefixMatch,
} from "../src/lib/identity";
import configPromise from "../src/payload.config";
import { parseRoundVerdicts } from "./eval/scf-official";

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");

const stats = {
	scfProjects: 0,
	matched: 0,
	unmatched: 0,
	enriched: 0,
	scfDataUpdated: 0,
	thumbnailsFetched: 0,
	descriptionsAdded: 0,
	linksAdded: 0,
	skipped: 0,
	errors: 0,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** EQUALITY-ONLY normalization — see src/lib/identity.ts for why
 * containment on this form is banned (the 18-row poisoning). */
const normalize = normSpaceless;

/** Generate slug from name */
function toSlug(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.replace(/[\s_]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
}

/** Download image buffer */
async function downloadImage(
	url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
			},
			redirect: "follow",
		});
		if (!res.ok) return null;
		const ct = res.headers.get("content-type") || "image/jpeg";
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length < 500) return null;
		return { buffer: buf, contentType: ct };
	} catch {
		return null;
	}
}

function getExtension(ct: string): string {
	const map: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/jpg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
	};
	return map[ct.split(";")[0]] || ".jpg";
}

/** Scrape project detail page for additional data */
async function scrapeDetailPage(slug: string): Promise<{
	description?: string;
	website?: string;
	twitter?: string;
	github?: string;
	totalAwarded?: number;
	awardedRounds?: number[];
	roundAwards?: Array<{
		round: number;
		amountUSD: number | null;
		awardType: string | null;
	}>;
	verdictSubmissions?: number;
	verdictAwardedAny?: number;
} | null> {
	try {
		const res = await fetch(
			`https://communityfund.stellar.org/project/${slug}`,
			{
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
					Accept: "text/html",
				},
			},
		);
		if (!res.ok) return null;
		const html = await res.text();

		const result: any = {};

		// Try __NEXT_DATA__ (Pages Router) first
		const nextDataMatch = html.match(
			/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
		);
		if (nextDataMatch) {
			try {
				const nextData = JSON.parse(nextDataMatch[1]);
				const pageProps = nextData?.props?.pageProps;
				const project = pageProps?.project || pageProps?.data || pageProps;
				if (project) {
					const desc =
						project.description ||
						project.projectDescription ||
						project.shortDescription;
					if (desc && typeof desc === "string" && desc.length > 20) {
						result.description = desc.slice(0, 500);
					}
					const urls = project.siteUrls || project.urls || project.links || {};
					if (urls.website) result.website = urls.website;
					if (urls.x || urls.twitter) result.twitter = urls.x || urls.twitter;
					if (urls.github) result.github = urls.github;
					if (
						project.totalAwarded &&
						typeof project.totalAwarded === "number"
					) {
						result.totalAwarded = project.totalAwarded;
					}
				}
			} catch {
				/* ignore parse errors */
			}
		}

		// Try __next_f streaming data (App Router) — extract totalAwarded
		// Data is in escaped JSON like: totalAwarded\":115000
		if (!result.totalAwarded) {
			const awardedMatch = html.match(
				/totalAwarded\\?"?\s*:\s*(\d+(?:\.\d+)?)/,
			);
			if (awardedMatch) {
				result.totalAwarded = parseFloat(awardedMatch[1]);
			}
		}

		// Awarded rounds from per-submission VERDICTS ONLY (2026-07-11 fix).
		// The old "grab every SCF #N on the page" scrape read the badge/
		// submission arrays, which include NOT-awarded submission rounds —
		// that corrupted round membership on 74 records (fixed by
		// scripts/data/fix-scf-rounds.ts; verdict parser shared via
		// scripts/eval/scf-official.ts). No parseable verdicts → leave
		// awardedRounds unset rather than guess.
		const verdicts = parseRoundVerdicts(html);
		if (verdicts.awarded.size > 0) {
			result.awardedRounds = [...verdicts.awarded]
				.map(Number)
				.sort((a, b) => a - b);
		}
		// sls-058 defect 2: per-awarded-round official record (published budget
		// + award type) from the same submission cards — the reconciling basis
		// for the page's own totalAwarded.
		if (verdicts.awards.length > 0) {
			result.roundAwards = verdicts.awards.map((a) => ({
				round: a.round,
				amountUSD: a.budgetUSD,
				awardType: a.awardType,
			}));
		}
		// Surfaced for the no-resurrect guard below (main loop): a page that
		// parses ≥1 submission with ZERO awarded is affirmative evidence of
		// non-award.
		result.verdictSubmissions = verdicts.submissions;
		result.verdictAwardedAny = verdicts.awardedAnyCount;

		return Object.keys(result).length > 0 ? result : null;
	} catch {
		return null;
	}
}

async function main() {
	console.log("=== Enrich Projects from Stellar Community Fund ===");
	console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
	console.log("");

	// 1. Fetch SCF projects
	console.log("Fetching SCF projects...");
	const scfRes = await fetch(
		"https://communityfund.stellar.org/backend/projects",
	);
	if (!scfRes.ok) {
		console.error(`Failed to fetch SCF projects: ${scfRes.status}`);
		process.exit(1);
	}
	const scfProjects: any[] = await scfRes.json();
	stats.scfProjects = scfProjects.length;
	console.log(`Fetched ${scfProjects.length} SCF projects\n`);
	// An EMPTY listing is an outage, not a clean sweep (the silent-params /
	// empty-vs-empty class): 200-with-zero-rows must not exit green.
	if (scfProjects.length === 0) {
		console.error(
			"✗ SCF listing returned 0 projects — outage or contract change; exiting 1.",
		);
		process.exit(1);
	}

	// 2. Connect to Payload
	console.log("Connecting to database...");
	const payload = await getPayload({ config: configPromise });
	console.log("Connected.\n");

	// 3. Build lookup of our projects by normalized name and slug
	let page = 1;
	const ourProjects: any[] = [];
	while (true) {
		const r = await payload.find({
			collection: "projects",
			limit: 100,
			page,
			depth: 0,
		});
		ourProjects.push(...r.docs);
		if (!r.hasNextPage) break;
		page++;
	}
	console.log(`Loaded ${ourProjects.length} projects from DB\n`);

	const byNormName = new Map<string, any>();
	const bySlug = new Map<string, any>();
	for (const p of ourProjects) {
		byNormName.set(normalize(p.name), p);
		bySlug.set(p.slug, p);
	}

	// 4. Match and enrich
	// sls-061 (#767): SCF titles that no normalization reaches — the API title
	// names the PRODUCT/SUBMISSION, our record names the project. Keyed by the
	// SCF slug (stable), mapped to OUR slug. Each pair verified 2026-08-07
	// against the SCF page + our record before adding; never guessed.
	const SCF_SLUG_OVERRIDES: Record<string, string> = {
		"bondhiveonchain-fixed-deposit-pbl": "bondhive",
		"coinsph-stellar-remittances-qwo": "coins-ph",
		"identity-operating-system-idos-nqg": "idos",
		"peer-by-honeycoin-inz": "honey-coin",
		"pelago-airswift-nkm": "airswift",
		// Soroban → Stellar rename class (product renamed, SCF page didn't).
		"soroban-security-portal-7ea": "stellar-security-portal",
		// sls-063 (2026-08-11, stellar-raven): 10 more product/submission-named
		// slugs, each page-verified locally — parseRoundVerdicts on the official
		// page reproduces the finding's exact round + budget before mapping.
		// vottun disambiguated by evidence: the developer-platform page carries
		// the r27 award; the wirex-vottun page does not.
		"allbridge-core-3lc": "allbridge",
		"obsrvr-prism-fvl": "obsrvr",
		"ibis-stablecoin-neobank-ramp-api-infrastructure-g4c": "ibis",
		"digibank-non-custodial-n1t": "digibank",
		"vottun-developer-platform-c2v": "vottun",
		"upesa-formerly-utoken-pbs": "utoken",
		"usdc-swap-stellar-cctp-bridge-yv8": "usdc-swap",
		"transfuse-multichain-asset-bridge-iyi": "transfuse",
		"catalyst-blockchain-manager-woe": "catalyst",
		"blade-tradfi-to-defi-bridge-zgq": "blade",
		// title-prefix rule casualties, same-entity page-verified (2026-08-12):
		// Greep pay = Greeppay; zkCrossDEX = zkCross's DEX; CashAbroad Smart
		// Treasury = Cash Abroad's second submission.
		"greep-pos-greep-pay-hfe": "greeppay",
		"zkcrossdex-ipb": "zkcross",
		"cashabroad-smart-treasury-wla": "cash-abroad",
		// Canonical-vs-dupe routing (sls-043 close-out): official "Band Protocol"
		// exact-matches the band-protocol DUPE row by name; the CANONICAL slug is
		// `band`, which otherwise matches nothing and would keep stale data.
		"band-protocol-2ob": "band",
	};

	const matched: { scf: any; ours: any }[] = [];
	const unmatched: string[] = [];

	for (const scf of scfProjects) {
		// Trim parenthetical/whitespace noise from SCF titles before normalizing
		// (e.g. "Soroban Optimistic Oracle  (SOO) " → "soroban optimistic oracle").
		const cleanTitle = cleanScfTitle(scf.title);
		const normTitle = normalize(cleanTitle);
		const scfSlug = toSlug(cleanTitle);
		// SCF slugs carry a trailing hash (e.g. "warp-drive-7tk") — stem it so it
		// joins our "warp-drive" / "warpdrive" records.
		const scfSlugStem = stemSlugHash(String(scf.slug || ""));

		let ours =
			bySlug.get(SCF_SLUG_OVERRIDES[String(scf.slug)] ?? "") ||
			byNormName.get(normTitle) ||
			bySlug.get(scfSlug) ||
			bySlug.get(scf.slug) ||
			bySlug.get(scfSlugStem) ||
			byNormName.get(normalize(scfSlugStem));

		// Partial matching, last resort — TITLE-PREFIX ONLY (sls-043 regression,
		// 2026-08-12): normalize() strips spaces, so plain substring containment
		// matched across word seams ("Soroban Disassembler" → soro**band**issa…
		// wrote another project's r41/$100k onto Band Protocol; "ars" absorbed
		// FOUR different projects via stell**ars**/…). Even word-boundary
		// containment fails for generic one-word names ("Basilic — Stablecoin
		// Rails…" is not the project "Rails"). The rule the data supports: the
		// official TITLE must START with our project's name at a token boundary
		// (or vice versa) — "Band Protocol" ↔ "Band" ✓, "DIA Oracles" ↔ "DIA" ✓,
		// tagline mentions ✗. Legit tail matches ("…by Gateway.fm") get explicit
		// SCF_SLUG_OVERRIDES instead. Rejections are logged for that triage.
		if (!ours && normTitle.length >= 4) {
			for (const [key, proj] of byNormName) {
				if (!key || (!key.includes(normTitle) && !normTitle.includes(key)))
					continue;
				if (titlePrefixMatch(cleanTitle, String(proj.name ?? ""))) {
					ours = proj;
				} else {
					console.log(
						`  partial REJECTED (not title-prefix): ours "${proj.name}" vs SCF "${scf.title}"`,
					);
				}
				break;
			}
		}

		if (ours) {
			matched.push({ scf, ours });
		} else {
			unmatched.push(scf.title);
		}
	}

	stats.matched = matched.length;
	stats.unmatched = unmatched.length;

	console.log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}\n`);

	if (unmatched.length > 0) {
		console.log("Unmatched SCF projects:");
		for (const name of unmatched) {
			console.log(`  - ${name}`);
		}
		console.log("");
	}

	// 5. Enrich matched projects
	for (const { scf, ours } of matched) {
		console.log(
			`  ${ours.name} ← SCF "${scf.title}" (round ${scf.lastAwardedRound})`,
		);
		const updateData: any = {};

		// --- SCF round data: always update ---
		const currentScf = ours.scf || {};

		// Scrape detail page early so we can include totalAwarded in SCF data
		const detail = await scrapeDetailPage(scf.slug);

		// The SCF API encodes special award types (Liquidity / Public Goods / RFP)
		// as NEGATIVE lastAwardedRound codes — those ARE awards. The old
		// `lastAwardedRound > 0` check silently dropped Blend, Soroswap, Aquarius,
		// FxDAO, Phoenix, Slender, Scaffold Stellar, SoroPG, the Stellar SDKs, etc.
		// Treat any non-zero round, or a positive totalAwarded / any awarded rounds,
		// as funded.
		const isAwarded =
			(typeof scf.lastAwardedRound === "number" &&
				scf.lastAwardedRound !== 0) ||
			(detail?.totalAwarded ?? 0) > 0 ||
			(detail?.awardedRounds?.length ?? 0) > 0;

		const hasNewData =
			// provenance first-stamp: a row missing the citation trio IS new data
			// (the trio ships 2026-08-12; without this the stamp only rides award
			// deltas and an already-converged corpus never gets it — the
			// advertised-but-never-persisted class, on the provenance feature
			// itself)
			!currentScf.basis ||
			currentScf.sourceUrl !==
				`https://communityfund.stellar.org/project/${scf.slug}` ||
			currentScf.awarded !== isAwarded ||
			currentScf.lastAwardedRound !== scf.lastAwardedRound ||
			currentScf.slug !== scf.slug ||
			(detail?.totalAwarded &&
				currentScf.totalAwarded !== detail.totalAwarded) ||
			(detail?.awardedRounds &&
				JSON.stringify(currentScf.awardedRounds) !==
					JSON.stringify(detail.awardedRounds)) ||
			// roundAwards drift: compare on the value triple only — the stored
			// rows carry Payload array-row ids the scrape doesn't have.
			(detail?.roundAwards &&
				JSON.stringify(
					(currentScf.roundAwards ?? []).map(
						(r: {
							round: number;
							amountUSD?: number | null;
							awardType?: string | null;
						}) => [r.round, r.amountUSD ?? null, r.awardType ?? null],
					),
				) !==
					JSON.stringify(
						detail.roundAwards.map((r) => [r.round, r.amountUSD, r.awardType]),
					));

		// No-resurrect guard (2026-07-11): if this record is already
		// awarded=false and the official page affirmatively shows ZERO awarded
		// submissions, don't let API round-codes flip it back to true (the
		// coopstable class, corrected by scripts/data/fix-scf-rounds.ts).
		// Narrow on purpose: records currently awarded=true are unaffected,
		// and this script still never auto-flips true→false.
		const skipResurrect =
			currentScf.awarded === false &&
			isAwarded &&
			(detail?.verdictSubmissions ?? 0) > 0 &&
			(detail?.verdictAwardedAny ?? 0) === 0;

		if (hasNewData && skipResurrect) {
			console.log(
				`    SCF: NO-RESURRECT — awarded=false stands (official page shows ${detail?.verdictSubmissions} submission(s), zero awarded)`,
			);
		} else if (hasNewData) {
			updateData.scf = {
				awarded: isAwarded,
				lastAwardedRound: scf.lastAwardedRound,
				slug: scf.slug,
				// provenance trio: parsed from the official page, dated, citable.
				// human-verified (curate SCF_FIX) outranks the page and must survive
				// enrich passes — the curation-reverted-by-sync class.
				basis:
					currentScf.basis === "human-verified"
						? "human-verified"
						: "official-record",
				asOf: new Date().toISOString().slice(0, 10),
				sourceUrl: `https://communityfund.stellar.org/project/${scf.slug}`,
				...(detail?.totalAwarded ? { totalAwarded: detail.totalAwarded } : {}),
				...(detail?.awardedRounds
					? { awardedRounds: detail.awardedRounds }
					: {}),
				...(detail?.roundAwards?.length
					? { roundAwards: detail.roundAwards }
					: {}),
			};
			console.log(
				`    SCF: awarded=${isAwarded}, round=${scf.lastAwardedRound}, slug=${scf.slug}, totalAwarded=${detail?.totalAwarded ?? "N/A"}, roundAwards=${detail?.roundAwards?.map((r) => `#${r.round}:$${r.amountUSD ?? "?"}`).join(" ") ?? "N/A"}`,
			);
			stats.scfDataUpdated++;
		}

		// --- Thumbnail: use SCF image if project has no logo ---
		if (!ours.logo && scf.thumbnail) {
			const imgUrl =
				scf.thumbnail.url ||
				scf.thumbnail.file?.thumbnails?.large?.url ||
				scf.thumbnail.file?.url;
			if (imgUrl) {
				if (dryRun) {
					console.log(`    WOULD FETCH thumbnail: ${imgUrl.slice(0, 80)}...`);
					stats.thumbnailsFetched++;
				} else {
					const img = await downloadImage(imgUrl);
					if (img) {
						try {
							const ext = getExtension(img.contentType);
							const media = await payload.create({
								collection: "media",
								data: { alt: `${ours.name} logo` },
								file: {
									data: img.buffer,
									name: `${ours.slug}-scf${ext}`,
									mimetype: img.contentType,
									size: img.buffer.length,
								},
							});
							updateData.logo = media.id;
							stats.thumbnailsFetched++;
							console.log(
								`    THUMBNAIL: ${(img.buffer.length / 1024).toFixed(1)}KB`,
							);
						} catch (err) {
							console.log(
								`    THUMBNAIL ERROR: ${err instanceof Error ? err.message : String(err)}`,
							);
						}
					}
				}
			}
		}

		// --- Use scraped detail page for richer data ---
		if (detail) {
			// Add description if we don't have one
			if (detail.description && !ours.shortDescription) {
				updateData.shortDescription = detail.description;
				stats.descriptionsAdded++;
				console.log(`    DESC: "${detail.description.slice(0, 60)}..."`);
			}

			// Add links we're missing
			const currentLinks = ours.links || {};
			const newLinks: any = { ...currentLinks };
			let linksChanged = false;

			if (detail.website && !currentLinks.website) {
				newLinks.website = detail.website;
				linksChanged = true;
			}
			if (detail.twitter && !currentLinks.twitter) {
				newLinks.twitter = detail.twitter;
				linksChanged = true;
			}
			if (detail.github && !currentLinks.github) {
				newLinks.github = detail.github;
				linksChanged = true;
			}

			if (linksChanged) {
				updateData.links = newLinks;
				stats.linksAdded++;
				console.log(`    LINKS: ${JSON.stringify(newLinks)}`);
			}
		}

		// --- Apply ---
		if (Object.keys(updateData).length > 0) {
			if (!dryRun) {
				try {
					await payload.update({
						collection: "projects",
						id: ours.id,
						data: updateData,
					});
				} catch (err) {
					console.log(
						`    UPDATE ERROR: ${err instanceof Error ? err.message : String(err)}`,
					);
					stats.errors++;
					continue;
				}
			}
			stats.enriched++;
		} else {
			stats.skipped++;
			console.log(`    SKIP: nothing new to add`);
		}

		await sleep(300); // Be respectful to SCF server
	}

	console.log("\n=== SUMMARY ===");
	console.log(`Mode:               ${dryRun ? "DRY RUN" : "EXECUTED"}`);
	console.log(`SCF projects:       ${stats.scfProjects}`);
	console.log(`Matched to DB:      ${stats.matched}`);
	console.log(`Unmatched:          ${stats.unmatched}`);
	console.log(`Enriched:           ${stats.enriched}`);
	console.log(`  SCF data:         ${stats.scfDataUpdated}`);
	console.log(`  Thumbnails:       ${stats.thumbnailsFetched}`);
	console.log(`  Descriptions:     ${stats.descriptionsAdded}`);
	console.log(`  Links:            ${stats.linksAdded}`);
	console.log(`Skipped (no new):   ${stats.skipped}`);
	console.log(`Errors:             ${stats.errors}`);

	if (dryRun) {
		console.log(
			"\n*** DRY RUN — no changes made. Run with --execute to apply. ***",
		);
	}

	// Failed writes must not exit green (2026-08-08 sweep).
	if (stats.errors > 0) {
		console.error(
			`\n✗ ${stats.errors} write error(s) — exiting 1 so the run shows red.`,
		);
		process.exit(1);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
