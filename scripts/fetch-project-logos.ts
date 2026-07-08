/**
 * Fetch logos for projects that don't have one, using unavatar.io
 *
 * unavatar.io resolves avatars from GitHub, Twitter/X, and domains — no API keys needed.
 *
 * Priority:
 *   1. GitHub org/user avatar (from links.github or github.orgLogin)
 *   2. Twitter/X profile picture (from links.twitter)
 *   3. Domain favicon/logo (from links.website)
 *
 * Usage:
 *   npx tsx scripts/fetch-project-logos.ts                  # Dry run (default)
 *   npx tsx scripts/fetch-project-logos.ts --execute        # Actually write to DB
 *   npx tsx scripts/fetch-project-logos.ts --execute --force # Re-fetch even if logo exists
 */
import "dotenv/config";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

// --- CLI args ---
const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const force = args.includes("--force");

// --- Stats ---
const stats = {
	total: 0,
	alreadyHasLogo: 0,
	fetched: 0,
	failed: 0,
	skipped: 0,
};
const failures: string[] = [];

// --- Helpers ---

/** Extract GitHub username from a GitHub URL or orgLogin field */
function extractGithubUsername(project: any): string | null {
	const url: string | undefined = project.links?.github;
	if (url) {
		// Match github.com/{user} or github.com/{user}/{repo}, but skip github.com/orgs/...
		const match = url.match(/github\.com\/(?!orgs\/)([a-zA-Z0-9_-]+)/i);
		if (match) return match[1];
	}

	// Fall back to orgLogin, but skip bad values like "orgs"
	const orgLogin = project.github?.orgLogin;
	if (orgLogin && orgLogin !== "orgs") {
		return orgLogin;
	}

	return null;
}

/** Extract Twitter/X username from a Twitter URL */
function extractTwitterUsername(project: any): string | null {
	const url: string | undefined = project.links?.twitter;
	if (!url) return null;

	// Match twitter.com/{user} or x.com/{user}
	const match = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
	return match ? match[1] : null;
}

/** Extract bare domain from a website URL */
function extractDomain(project: any): string | null {
	const url: string | undefined = project.links?.website;
	if (!url) return null;

	try {
		const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
		return parsed.hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

/** Build ordered list of avatar URLs to try for a project */
function getAvatarUrls(project: any): { source: string; url: string }[] {
	const urls: { source: string; url: string }[] = [];

	// Twitter/X first — usually the best branded logo
	const twitter = extractTwitterUsername(project);
	if (twitter) {
		urls.push({
			source: `x/${twitter}`,
			url: `https://unavatar.io/x/${twitter}`,
		});
	}

	// GitHub avatars — sometimes generic user icons, so lower priority
	const github = extractGithubUsername(project);
	if (github) {
		urls.push({
			source: `github/${github}`,
			url: `https://github.com/${github}.png?size=200`,
		});
	}

	// Domain favicon/logo as last resort
	const domain = extractDomain(project);
	if (domain) {
		urls.push({ source: domain, url: `https://unavatar.io/${domain}` });
	}

	return urls;
}

const UNAVATAR_API_KEY = process.env.UNAVATAR_API_KEY || "";

/** Download an image, return buffer + content type. Returns null on failure. */
async function downloadImage(
	url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const headers: Record<string, string> = {
			"User-Agent":
				"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
			Accept: "image/*,*/*;q=0.8",
		};

		// Add API key for unavatar requests
		if (url.includes("unavatar.io") && UNAVATAR_API_KEY) {
			headers["x-api-key"] = UNAVATAR_API_KEY;
		}

		const response = await fetch(url, {
			headers,
			redirect: "follow",
		});

		if (!response.ok) return null;

		const contentType = response.headers.get("content-type") || "image/png";

		// unavatar returns a fallback placeholder if it can't find an avatar.
		// The placeholder is typically very small or has a specific content type.
		// We'll check the content length — real avatars are usually > 1KB.
		const arrayBuffer = await response.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		if (buffer.length < 1000) {
			return null; // Likely a placeholder/fallback
		}

		return { buffer, contentType };
	} catch {
		return null;
	}
}

/** Map content type to file extension */
function getExtension(contentType: string): string {
	const map: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/jpg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
		"image/svg+xml": ".svg",
	};
	return map[contentType.split(";")[0]] || ".png";
}

/** Sleep for ms */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// --- Main ---

async function main() {
	console.log("=== Fetch Project Logos via unavatar.io ===");
	console.log(
		`Mode: ${dryRun ? "DRY RUN (no changes)" : "EXECUTE (writing to DB)"}`,
	);
	console.log(
		`Force: ${force ? "YES (re-fetch all)" : "NO (skip projects with logos)"}`,
	);
	console.log("");

	// Connect to Payload
	console.log("Connecting to database...");
	const payload = await getPayload({ config: configPromise });
	console.log("Connected.\n");

	// Fetch ALL projects (paginate)
	let page = 1;
	let hasMore = true;
	const projects: any[] = [];

	while (hasMore) {
		const result = await payload.find({
			collection: "projects",
			limit: 100,
			page,
			depth: 0, // Don't populate relations — we just need IDs
		});
		projects.push(...result.docs);
		hasMore = result.hasNextPage;
		page++;
	}

	stats.total = projects.length;
	console.log(`Found ${projects.length} projects total\n`);

	// Process each project
	for (const project of projects) {
		const name = project.name || project.slug;

		// Skip if already has a logo (unless --force)
		if (project.logo && !force) {
			stats.alreadyHasLogo++;
			continue;
		}

		const sources = getAvatarUrls(project);
		if (sources.length === 0) {
			stats.skipped++;
			console.log(`  SKIP: ${name} — no github/twitter/website URLs`);
			failures.push(`${name}: no source URLs available`);
			continue;
		}

		// Try each source in priority order
		let fetched = false;
		for (const { source, url } of sources) {
			if (dryRun) {
				console.log(`  WOULD FETCH: ${name} ← ${source} (${url})`);
				stats.fetched++;
				fetched = true;
				break;
			}

			const imageData = await downloadImage(url);
			if (!imageData) {
				console.log(`    MISS: ${name} ← ${source}`);
				continue;
			}

			// Create media entry
			try {
				const ext = getExtension(imageData.contentType);
				const filename = `${project.slug}-logo${ext}`;

				const media = await payload.create({
					collection: "media",
					data: {
						alt: `${name} logo`,
					},
					file: {
						data: imageData.buffer,
						name: filename,
						mimetype: imageData.contentType,
						size: imageData.buffer.length,
					},
				});

				// Update project with new logo
				await payload.update({
					collection: "projects",
					id: project.id,
					data: { logo: media.id },
				});

				console.log(
					`  OK: ${name} ← ${source} (${(imageData.buffer.length / 1024).toFixed(1)}KB)`,
				);
				stats.fetched++;
				fetched = true;
				break;
			} catch (err) {
				console.error(
					`  UPLOAD ERROR: ${name} ← ${source}: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}

		if (!fetched) {
			stats.failed++;
			failures.push(
				`${name}: all sources failed (tried: ${sources.map((s) => s.source).join(", ")})`,
			);
			console.log(`  FAIL: ${name} — no source returned a valid image`);
		}

		// Rate limit: unavatar.io asks for ~100ms between requests
		await sleep(150);
	}

	// Summary
	console.log("\n=== SUMMARY ===");
	console.log(`Mode:             ${dryRun ? "DRY RUN" : "EXECUTED"}`);
	console.log(`Total projects:   ${stats.total}`);
	console.log(`Already had logo: ${stats.alreadyHasLogo}`);
	console.log(`Logos fetched:    ${stats.fetched}`);
	console.log(`Failed:           ${stats.failed}`);
	console.log(`Skipped (no URL): ${stats.skipped}`);

	if (failures.length > 0) {
		console.log(`\n=== FAILURES (${failures.length}) ===`);
		for (const f of failures) {
			console.log(`  - ${f}`);
		}
	}

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
