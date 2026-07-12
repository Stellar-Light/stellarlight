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
import "dotenv/config";
import { getPayload } from "payload";
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

/** Normalize a name for fuzzy matching */
function normalize(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "")
		.trim();
}

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
	const matched: { scf: any; ours: any }[] = [];
	const unmatched: string[] = [];

	for (const scf of scfProjects) {
		// Trim parenthetical/whitespace noise from SCF titles before normalizing
		// (e.g. "Soroban Optimistic Oracle  (SOO) " → "soroban optimistic oracle").
		const cleanTitle = scf.title.replace(/\s*\([^)]*\)\s*/g, " ").trim();
		const normTitle = normalize(cleanTitle);
		const scfSlug = toSlug(cleanTitle);
		// SCF slugs carry a trailing hash (e.g. "warp-drive-7tk") — stem it so it
		// joins our "warp-drive" / "warpdrive" records.
		const scfSlugStem = String(scf.slug || "").replace(/-[a-z0-9]{2,5}$/i, "");

		let ours =
			byNormName.get(normTitle) ||
			bySlug.get(scfSlug) ||
			bySlug.get(scf.slug) ||
			bySlug.get(scfSlugStem) ||
			byNormName.get(normalize(scfSlugStem));

		// Try partial matching for common patterns (last resort; guard tiny stems
		// to avoid e.g. "velo" swallowing "velocity").
		if (!ours && normTitle.length >= 4) {
			for (const [key, proj] of byNormName) {
				if (key.includes(normTitle) || normTitle.includes(key)) {
					ours = proj;
					break;
				}
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
			currentScf.awarded !== isAwarded ||
			currentScf.lastAwardedRound !== scf.lastAwardedRound ||
			currentScf.slug !== scf.slug ||
			(detail?.totalAwarded &&
				currentScf.totalAwarded !== detail.totalAwarded) ||
			(detail?.awardedRounds &&
				JSON.stringify(currentScf.awardedRounds) !==
					JSON.stringify(detail.awardedRounds));

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
				...(detail?.totalAwarded ? { totalAwarded: detail.totalAwarded } : {}),
				...(detail?.awardedRounds
					? { awardedRounds: detail.awardedRounds }
					: {}),
			};
			console.log(
				`    SCF: awarded=${isAwarded}, round=${scf.lastAwardedRound}, slug=${scf.slug}, totalAwarded=${detail?.totalAwarded ?? "N/A"}`,
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

	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
