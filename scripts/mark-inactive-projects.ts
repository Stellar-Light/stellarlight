/**
 * Mark defunct projects Inactive so they stop ranking as active
 * (leaderboard/directory drop them; search down-ranks — see PR).
 *
 *   pnpm exec tsx scripts/mark-inactive-projects.ts            # DRY RUN (report only)
 *   pnpm exec tsx scripts/mark-inactive-projects.ts --execute  # write CURATED only
 *
 * Two lists:
 *  1. CURATED_INACTIVE — hand-verified defunct/not-a-Stellar-project-anymore.
 *     Only these are WRITTEN on --execute. Keybase is the clear one: acquired by
 *     Zoom in 2020, its Stellar integration is long dead — yet `keybase/client`
 *     still gets maintenance commits + has 9k+ stars, which is exactly how it
 *     rode to leaderboard #2. Staleness alone can't catch that; curation must.
 *  2. Detected CANDIDATES — active projects whose newest repo commit is >18mo
 *     old (or which have no repo at all), and separately the high-star + stale
 *     "borrowed clout" risks. REPORTED ONLY, never auto-marked — a human
 *     confirms before any of these flip.
 *  3. SITE GONE candidates — an active row whose own website is proven dead or
 *     is serving somebody else's content. This is the signal repo staleness
 *     cannot see, and it is the Keybase problem from the other side: a product
 *     can shut down while its repository keeps getting commits, and the tell is
 *     that nobody renewed the domain. A parked page, lottery spam or a lapsed
 *     registration on the URL the project itself cites is good evidence the
 *     product is gone. Also REPORT ONLY — a domain is evidence about the
 *     world, and hiding a row stays a human call.
 *
 * House rules: no deletes; dry-run first; run against prod via GitHub Action.
 */
import "./load-env";
import { getPayload } from "payload";
import { NON_PRODUCT_VERDICTS } from "../src/lib/page-verdict";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
// --mark-stale (with --execute) also flips the CLEARLY-DEAD set: no repo commit
// in >=36 months AND never SCF-funded. That combo is unambiguous abandonment —
// a funded or recently-touched project is never included, so we don't bury
// stable-but-quiet work. Everything else stays report-only for human review.
const MARK_STALE = process.argv.includes("--mark-stale");
const STALE_MS = 18 * 30 * 24 * 60 * 60 * 1000; // ~18 months (report threshold)
const DEAD_MONTHS = 36; // ~3 years — the auto-mark threshold

// Hand-verified. Extend only after confirming a project is genuinely defunct.
// ALSO add a STATUS_FIX row in scripts/data/curation-maps.ts for each slug, or
// the nightly lumenloop sync writes the seed's Live label straight back.
const CURATED_INACTIVE: string[] = ["keybase"];

// Watchlist from prior review (memory) — NOT auto-marked; we print their live
// state so a human can decide. Some were SCF-funded, so precision matters.
const WATCHLIST: string[] = [
	"communidao",
	"lumosdao",
	"instantdao",
	"enerdao",
	"the-hub",
	"fxdao",
];

async function main() {
	const payload = await getPayload({ config: configPromise });
	const now = Date.now();

	// ---- 1. curated marks ----
	console.log(`\n=== CURATED (will ${EXECUTE ? "WRITE" : "report"}) ===`);
	let marked = 0;
	for (const slug of CURATED_INACTIVE) {
		const res = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
		});
		const p = res.docs[0];
		if (!p) {
			console.log(`✗ ${slug}: not found`);
			continue;
		}
		if (p.status === "Inactive") {
			console.log(`· ${slug}: already Inactive`);
			continue;
		}
		console.log(`→ ${slug}: ${p.status} → Inactive`);
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: p.id,
				// A bare status write is reverted by the nightly lumenloop sync unless
				// the slug also owns `status` in scripts/data/curation-maps.ts STATUS_FIX
				// (that is what curatedFieldsFor reads). Keybase sat on this list, was
				// marked twice in July, and was Live again by morning both times.
				data: {
					status: "Inactive",
					statusBasis: "human-verified",
					statusAsOf: new Date().toISOString(),
				},
				overrideAccess: true,
			});
			marked++;
		}
	}

	// ---- 2. watchlist live state (report only) ----
	console.log(`\n=== WATCHLIST — live state (review, not marked) ===`);
	for (const slug of WATCHLIST) {
		const res = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
		});
		const p = res.docs[0];
		if (!p) {
			console.log(`  ${slug}: not found`);
			continue;
		}
		const repos = await payload.find({
			collection: "repos",
			where: { projectSlug: { equals: slug } },
			limit: 50,
			depth: 0,
		});
		const newest = repos.docs.reduce(
			(mx: number, r: any) =>
				Math.max(mx, r.lastCommitAt ? Date.parse(r.lastCommitAt) : 0),
			0,
		);
		const stars = repos.docs.reduce(
			(s: number, r: any) => s + (r.stars || 0),
			0,
		);
		const ageMo = newest
			? Math.round((now - newest) / (30 * 24 * 60 * 60 * 1000))
			: null;
		// biome-ignore lint/suspicious/noExplicitAny: doc shape
		const scf = (p as any).scf?.awarded
			? `SCF $${(p as any).scf.totalAwarded}`
			: "no SCF";
		console.log(
			`  ${slug}: status=${p.status} · ${stars} stars · last commit ${ageMo == null ? "never/no repo" : ageMo + "mo ago"} · ${scf}`,
		);
	}

	// ---- 3. detect stale + high-star-stale candidates (report only) ----
	console.log(
		`\n=== DETECTED candidates (report only — confirm before marking) ===`,
	);
	const active = await payload.find({
		collection: "projects",
		where: { status: { in: ["Development", "Pre-Release", "Live"] } },
		limit: 2000,
		depth: 0,
	});
	const rows: Array<{
		slug: string;
		name: string;
		stars: number;
		ageMo: number | null;
		scf: boolean;
	}> = [];
	for (const p of active.docs) {
		const repos = await payload.find({
			collection: "repos",
			where: { projectSlug: { equals: p.slug } },
			limit: 50,
			depth: 0,
		});
		const newest = repos.docs.reduce(
			(mx: number, r: any) =>
				Math.max(mx, r.lastCommitAt ? Date.parse(r.lastCommitAt) : 0),
			0,
		);
		const stars = repos.docs.reduce(
			(s: number, r: any) => s + (r.stars || 0),
			0,
		);
		const stale = newest === 0 || now - newest > STALE_MS;
		if (stale) {
			// biome-ignore lint/suspicious/noExplicitAny: doc shape
			rows.push({
				slug: p.slug,
				name: p.name,
				stars,
				ageMo: newest
					? Math.round((now - newest) / (30 * 24 * 60 * 60 * 1000))
					: null,
				scf: !!(p as any).scf?.awarded,
			});
		}
	}
	// The dangerous ones first: lots of stars but stale = borrowed-clout risk.
	rows.sort((a, b) => b.stars - a.stars);
	console.log(
		`stale/no-repo active projects: ${rows.length} (showing top 25 by stars)`,
	);
	for (const r of rows.slice(0, 25)) {
		console.log(
			`  ${r.slug.padEnd(26)} ${String(r.stars).padStart(6)}★  last ${r.ageMo == null ? "none" : r.ageMo + "mo"}  ${r.scf ? "SCF" : ""}`,
		);
	}

	// CLEARLY DEAD = no commit in >=36mo (a real, dated commit — not "no repo")
	// AND never SCF-funded. Unambiguous abandonment; safe to auto-mark under
	// --mark-stale. "No repo at all" is EXCLUDED (could be a legit closed-source
	// or mis-linked project) — those stay report-only.
	const dead = rows.filter(
		(r) => r.ageMo != null && r.ageMo >= DEAD_MONTHS && !r.scf,
	);
	console.log(
		`\n=== CLEARLY DEAD (>=${DEAD_MONTHS}mo, no SCF) — ${dead.length} projects ${MARK_STALE && EXECUTE ? "→ MARKING Inactive" : "(report only; run --mark-stale --execute to flip)"} ===`,
	);
	let deadMarked = 0;
	for (const r of dead) {
		console.log(
			`  ${r.slug.padEnd(28)} ${String(r.stars).padStart(6)}★  last ${r.ageMo}mo`,
		);
		if (MARK_STALE && EXECUTE) {
			const doc = (
				await payload.find({
					collection: "projects",
					where: { slug: { equals: r.slug } },
					limit: 1,
					depth: 0,
				})
			).docs[0];
			if (doc && doc.status !== "Inactive") {
				await payload.update({
					collection: "projects",
					id: doc.id,
					data: { status: "Inactive" },
					overrideAccess: true,
				});
				deadMarked++;
			}
		}
	}

	// ---- 4. site-gone candidates (report only) ----
	// Reads link-checks rather than re-probing: check-links already proves a URL
	// dead (404/410/DNS/refused) and already classifies what a 200 SERVED, via
	// page-verdict. A bot wall, a 5xx or a timeout is never a verdict there and
	// so never reaches this list either.
	const normUrl = (u: string) =>
		(u ?? "")
			.trim()
			.toLowerCase()
			.replace(/^(https?:\/\/)www\./, "$1")
			.replace(/\/+$/, "");
	const byWebsite = new Map<
		string,
		{ slug: string; status: string; url: string }
	>();
	for (const p of active.docs as Array<Record<string, any>>) {
		const url = p?.links?.website;
		if (url)
			byWebsite.set(normUrl(url), { slug: p.slug, status: p.status, url });
	}
	const siteGone: Array<{
		slug: string;
		status: string;
		url: string;
		why: string;
	}> = [];
	if (byWebsite.size) {
		const checks = await payload.find({
			collection: "link-checks",
			limit: 5000,
			depth: 0,
			overrideAccess: true,
		});
		for (const c of checks.docs as Array<Record<string, any>>) {
			const hit = byWebsite.get(normUrl(c.url));
			if (!hit) continue;
			if (c.status === "broken" || c.status === "dead") {
				siteGone.push({
					...hit,
					why: `dead — ${c.errorReason || c.statusCode || "proven broken"}`,
				});
			} else if (c.pageVerdict && NON_PRODUCT_VERDICTS.has(c.pageVerdict)) {
				// Answers 200 with somebody else's content: parked, spam, a
				// scaffold, or a redirect off the origin entirely.
				siteGone.push({
					...hit,
					why: `${c.pageVerdict}${c.pageTitle ? ` — "${String(c.pageTitle).slice(0, 48)}"` : ""}`,
				});
			}
		}
	}
	console.log(
		`\n=== SITE GONE candidates (report only — the row's own website is dead or serving someone else) ===`,
	);
	if (siteGone.length === 0) {
		console.log("  none — every active row's website still serves its product");
	} else {
		for (const r of siteGone)
			console.log(
				`  ${r.slug.padEnd(26)} ${r.status.padEnd(12)} ${r.why}\n      ${r.url}`,
			);
		console.log(
			`  ${siteGone.length} row(s). A lapsed or hijacked domain is evidence the product shut down — evidence about the WORLD, so the status flip stays a human call.`,
		);
	}

	console.log(
		`\nDONE. curated marked: ${EXECUTE ? marked : "(dry-run)"} · clearly-dead ${MARK_STALE && EXECUTE ? "marked: " + deadMarked : "candidates: " + dead.length} · watchlist: ${WATCHLIST.length} · total stale: ${rows.length} · site-gone: ${siteGone.length}`,
	);
	process.exit(0);
}
main().catch((e) => {
	console.error("FAILED:", e?.message ?? e);
	process.exit(1);
});
