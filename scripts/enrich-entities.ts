/**
 * Enrich entities with data inherited from their linked projects + unavatar logos.
 *
 * For each entity:
 *   1. Find its linked projects (populated with links + logo)
 *   2. Inherit website, github, twitter from the best project
 *   3. If entity still has no logo:
 *      a. Try unavatar (twitter first, then github, then domain)
 *      b. Fall back to the best project's logo
 *
 * Usage:
 *   npx tsx scripts/enrich-entities.ts                  # Dry run
 *   npx tsx scripts/enrich-entities.ts --execute        # Write to DB
 */
import "dotenv/config";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const UNAVATAR_API_KEY = process.env.UNAVATAR_API_KEY || "";

const stats = {
	total: 0,
	enrichedLinks: 0,
	enrichedLogo: 0,
	logoFromUnavatar: 0,
	logoFromProject: 0,
	skipped: 0,
	failed: 0,
};

/** Download image, return buffer + content type */
async function downloadImage(
	url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const headers: Record<string, string> = {
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
			Accept: "image/*,*/*;q=0.8",
		};
		if (url.includes("unavatar.io") && UNAVATAR_API_KEY) {
			headers["x-api-key"] = UNAVATAR_API_KEY;
		}
		const res = await fetch(url, { headers, redirect: "follow" });
		if (!res.ok) return null;
		const ct = res.headers.get("content-type") || "image/png";
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length < 1000) return null;
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
	return map[ct.split(";")[0]] || ".png";
}

/** Extract username from a URL */
function extractUsername(url: string, pattern: RegExp): string | null {
	const m = url.match(pattern);
	return m ? m[1] : null;
}

/** Build unavatar URLs from links */
function getAvatarUrls(links: {
	twitter?: string;
	github?: string;
	website?: string;
}): { source: string; url: string }[] {
	const urls: { source: string; url: string }[] = [];

	if (links.twitter) {
		const user = extractUsername(
			links.twitter,
			/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i,
		);
		if (user)
			urls.push({ source: `x/${user}`, url: `https://unavatar.io/x/${user}` });
	}

	if (links.github) {
		const user = extractUsername(
			links.github,
			/github\.com\/(?!orgs\/)([a-zA-Z0-9_-]+)/i,
		);
		if (user)
			urls.push({
				source: `github/${user}`,
				url: `https://github.com/${user}.png?size=200`,
			});
	}

	if (links.website) {
		try {
			const parsed = new URL(
				links.website.startsWith("http")
					? links.website
					: `https://${links.website}`,
			);
			const domain = parsed.hostname.replace(/^www\./, "");
			urls.push({ source: domain, url: `https://unavatar.io/${domain}` });
		} catch {}
	}

	return urls;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
	console.log("=== Enrich Entities ===");
	console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
	console.log("");

	const payload = await getPayload({ config: configPromise });

	// Fetch all entities with their projects populated (depth 2 to get project logos)
	let page = 1;
	const entities: any[] = [];
	while (true) {
		const r = await payload.find({
			collection: "entities",
			limit: 100,
			page,
			depth: 2,
		});
		entities.push(...r.docs);
		if (!r.hasNextPage) break;
		page++;
	}

	stats.total = entities.length;
	console.log(`Found ${entities.length} entities\n`);

	for (const entity of entities) {
		const name = entity.name;
		const projects: any[] = Array.isArray(entity.projects)
			? entity.projects
			: [];

		if (projects.length === 0) {
			console.log(`  SKIP: ${name} — no linked projects`);
			stats.skipped++;
			continue;
		}

		// Pick the "best" project: prefer one with the most links, then Live status
		const scored = projects
			.filter((p: any) => typeof p === "object" && p.name) // filter out unpopulated IDs
			.map((p: any) => {
				let score = 0;
				if (p.links?.twitter) score += 3;
				if (p.links?.github) score += 2;
				if (p.links?.website) score += 1;
				if (p.logo) score += 1;
				if (p.status === "Live") score += 2;
				return { project: p, score };
			})
			.sort((a: any, b: any) => b.score - a.score);

		if (scored.length === 0) {
			console.log(`  SKIP: ${name} — projects not populated`);
			stats.skipped++;
			continue;
		}

		const best = scored[0].project;
		console.log(
			`  ${name} — best project: ${best.name} (score: ${scored[0].score})`,
		);

		// --- Inherit links ---
		const currentLinks = entity.links || {};
		const newLinks: Record<string, string> = {};
		let linksChanged = false;

		// Aggregate best links across all projects
		for (const { project: p } of scored) {
			if (!newLinks.website && p.links?.website)
				newLinks.website = p.links.website;
			if (!newLinks.github && p.links?.github) newLinks.github = p.links.github;
			if (!newLinks.twitter && p.links?.twitter)
				newLinks.twitter = p.links.twitter;
		}

		const mergedLinks: Record<string, string | undefined> = {
			website: currentLinks.website || newLinks.website || undefined,
			github: currentLinks.github || newLinks.github || undefined,
			twitter: currentLinks.twitter || newLinks.twitter || undefined,
		};

		if (
			mergedLinks.website !== (currentLinks.website || undefined) ||
			mergedLinks.github !== (currentLinks.github || undefined) ||
			mergedLinks.twitter !== (currentLinks.twitter || undefined)
		) {
			linksChanged = true;
			console.log(
				`    Links: website=${mergedLinks.website || "—"}, github=${mergedLinks.github || "—"}, twitter=${mergedLinks.twitter || "—"}`,
			);
		}

		// --- Fetch logo ---
		let newLogoId: string | null = null;

		if (!entity.logo) {
			// Try unavatar first
			const avatarUrls = getAvatarUrls({
				twitter: mergedLinks.twitter,
				github: mergedLinks.github,
				website: mergedLinks.website,
			});

			let gotAvatar = false;
			for (const { source, url } of avatarUrls) {
				if (dryRun) {
					console.log(`    WOULD TRY LOGO: ${source}`);
					stats.logoFromUnavatar++;
					gotAvatar = true;
					break;
				}

				const img = await downloadImage(url);
				if (img) {
					try {
						const ext = getExtension(img.contentType);
						const filename = `${entity.slug}-entity-logo${ext}`;
						const media = await payload.create({
							collection: "media",
							data: { alt: `${name} logo` },
							file: {
								data: img.buffer,
								name: filename,
								mimetype: img.contentType,
								size: img.buffer.length,
							},
						});
						newLogoId = String(media.id);
						console.log(
							`    LOGO: ${source} (${(img.buffer.length / 1024).toFixed(1)}KB)`,
						);
						stats.logoFromUnavatar++;
						gotAvatar = true;
						break;
					} catch (err) {
						console.log(
							`    LOGO UPLOAD ERROR: ${source}: ${err instanceof Error ? err.message : String(err)}`,
						);
					}
				} else {
					console.log(`    MISS: ${source}`);
				}
				await sleep(150);
			}

			// Fall back to best project's logo
			if (!gotAvatar) {
				const projectLogo = best.logo;
				if (projectLogo) {
					const logoId =
						typeof projectLogo === "string" ? projectLogo : projectLogo.id;
					if (logoId) {
						newLogoId = logoId;
						console.log(`    LOGO: fallback to project "${best.name}" logo`);
						stats.logoFromProject++;
					}
				} else {
					console.log(`    NO LOGO: no avatar or project logo available`);
				}
			}
		}

		// --- Apply updates ---
		if (!linksChanged && !newLogoId) {
			if (!entity.logo) {
				stats.failed++;
			} else {
				stats.skipped++;
			}
			continue;
		}

		if (!dryRun) {
			const updateData: any = {};
			if (linksChanged) updateData.links = mergedLinks;
			if (newLogoId) updateData.logo = newLogoId;

			await payload.update({
				collection: "entities",
				id: entity.id,
				data: updateData,
			});
		}

		if (linksChanged) stats.enrichedLinks++;
		if (newLogoId) stats.enrichedLogo++;
	}

	console.log("\n=== SUMMARY ===");
	console.log(`Mode:               ${dryRun ? "DRY RUN" : "EXECUTED"}`);
	console.log(`Total entities:     ${stats.total}`);
	console.log(`Links enriched:     ${stats.enrichedLinks}`);
	console.log(`Logos added:        ${stats.enrichedLogo}`);
	console.log(`  From unavatar:    ${stats.logoFromUnavatar}`);
	console.log(`  From project:     ${stats.logoFromProject}`);
	console.log(`Skipped:            ${stats.skipped}`);
	console.log(`No logo available:  ${stats.failed}`);

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
