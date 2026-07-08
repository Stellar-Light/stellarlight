/**
 * Publish the StellarLight ecosystem-report series to the Blog collection.
 *
 * Reads every markdown file in `content/reports/`, parses its YAML frontmatter,
 * and upserts a Blog post (contentType: "markdown"). These are the Messari-style
 * data-grounded ecosystem pieces (SCF Q2 deliverable #5) — every number in them
 * is pulled from the live stellarlight.xyz index.
 *
 *   pnpm exec tsx scripts/seed-blog-posts.ts            # DRY RUN (prints plan, no writes)
 *   pnpm exec tsx scripts/seed-blog-posts.ts --execute  # create/update (idempotent)
 *
 * IDEMPOTENT + NON-DESTRUCTIVE: creates a post when the slug is new, updates the
 * content fields when it already exists, and never deletes anything. Touches only
 * the `blog` collection, so it can't affect the API/Raven data lanes.
 *
 * NOTE: prod Atlas M0 must have write headroom. If it's at the 512MB cap, run the
 * `db-space` Action with prune=true first (prunes old transparency-logs), then
 * re-run this — same pattern used to unblock the partner seed.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import config from "@payload-config";
import { config as loadEnv } from "dotenv";
import yaml from "js-yaml";
import { getPayload } from "payload";

// Local dev reads .env.local; CI injects DATABASE_URI + PAYLOAD_SECRET via env.
loadEnv({ path: ".env.local" });

const EXECUTE = process.argv.includes("--execute");
const REPORTS_DIR = join(process.cwd(), "content", "reports");

// Valid Blog category select options (see src/collections/Blog.ts).
const VALID_CATEGORIES = new Set([
	"Announcement",
	"Tutorial",
	"News",
	"Technical",
	"Community",
	"Partnership",
	"Update",
	"Ecosystem",
]);

interface Frontmatter {
	title: string;
	slug: string;
	author: string;
	excerpt: string;
	category?: string;
	tags?: string | string[];
	featured?: boolean;
	publishedAt?: string;
}

interface ParsedReport {
	fm: Frontmatter;
	body: string;
	file: string;
}

function parseReport(file: string): ParsedReport {
	const raw = readFileSync(join(REPORTS_DIR, file), "utf8");
	const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!m) throw new Error(`${file}: missing YAML frontmatter`);
	const fm = yaml.load(m[1]) as Frontmatter;
	const body = m[2].trim();
	if (!fm?.title || !fm?.slug || !fm?.author || !fm?.excerpt) {
		throw new Error(`${file}: frontmatter needs title, slug, author, excerpt`);
	}
	if (!body) throw new Error(`${file}: empty body`);
	return { fm, body, file };
}

function normalizeCategory(c?: string): string {
	if (!c) return "Ecosystem";
	const titled = c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
	return VALID_CATEGORIES.has(titled) ? titled : "Ecosystem";
}

async function main() {
	let files: string[];
	try {
		files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".md"));
	} catch {
		console.error(`No reports dir at ${REPORTS_DIR}`);
		process.exit(1);
	}
	if (files.length === 0) {
		console.error("No .md reports found — nothing to publish.");
		process.exit(1);
	}

	const reports = files
		.map(parseReport)
		.sort((a, b) => a.fm.slug.localeCompare(b.fm.slug));

	console.log(
		`\n${EXECUTE ? "PUBLISHING" : "DRY RUN — would publish"} ${reports.length} ecosystem report(s):\n`,
	);
	for (const r of reports) {
		console.log(
			`  • ${r.fm.slug}  [${normalizeCategory(r.fm.category)}]  "${r.fm.title}"  (${r.body.length} chars)`,
		);
	}

	if (!EXECUTE) {
		console.log(
			"\nDry run only. Re-run with --execute to write to the Blog collection.\n",
		);
		return;
	}

	const payload = await getPayload({ config });
	let created = 0;
	let updated = 0;

	for (const r of reports) {
		// `tags` is a hasMany text field → an ARRAY of individual tags. Split a
		// comma string (or pass an array through) so each tag renders as its own
		// chip instead of one giant comma-blob.
		const tags = (
			Array.isArray(r.fm.tags) ? r.fm.tags : String(r.fm.tags ?? "").split(",")
		)
			.map((t) => t.trim())
			.filter(Boolean);
		const data = {
			title: r.fm.title,
			slug: r.fm.slug,
			author: r.fm.author,
			excerpt: r.fm.excerpt,
			contentType: "markdown" as const,
			markdownContent: r.body,
			category: normalizeCategory(r.fm.category),
			tags,
			featured: !!r.fm.featured,
			status: "published" as const,
			publishedAt: r.fm.publishedAt ?? new Date().toISOString(),
		};

		const existing = await payload.find({
			collection: "blog",
			where: { slug: { equals: r.fm.slug } },
			limit: 1,
			depth: 0,
		});

		try {
			if (existing.docs[0]) {
				await payload.update({
					collection: "blog",
					id: existing.docs[0].id,
					data,
				});
				updated++;
				console.log(`  ✓ updated  ${r.fm.slug}`);
			} else {
				await payload.create({ collection: "blog", data });
				created++;
				console.log(`  ✓ created  ${r.fm.slug}`);
			}
		} catch (err) {
			console.error(`  ✗ FAILED   ${r.fm.slug}:`, (err as Error).message);
		}
	}

	console.log(`\nDone. ${created} created, ${updated} updated.\n`);
	process.exit(0);
}

main().catch((err) => {
	console.error("seed-blog-posts failed:", err);
	process.exit(1);
});
