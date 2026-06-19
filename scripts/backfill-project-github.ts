/**
 * Backfill missing `links.github` on project records so their repos can be
 * indexed + surfaced. A project with no GitHub link contributes zero code
 * references (e.g. Noether was Live in our DB but linkless → "no repos").
 *
 * Two high-precision sources only (no fuzzy name-search — too false-positive):
 *   1. CURATED — confirmed owner links.
 *   2. The project's OWN website (links.website) — fetch it, extract a
 *      github.com/<owner> link. The project's own site is a trusted source.
 * We store the OWNER-level link (github.com/<owner>) so the enricher's
 * org-expansion pulls in all of that owner's Stellar repos.
 *
 * Edit sticks past the lumenloop sync by setting provenance.source=AdminEdit
 * AND bumping verificationLevel off "Unverified" (the sync's overwrite guard is
 * an OR over those two). Re-run enrich-repos afterwards to pull the new repos.
 *
 *   pnpm exec tsx scripts/backfill-project-github.ts            # dry run / audit
 *   pnpm exec tsx scripts/backfill-project-github.ts --execute  # write
 */
import "dotenv/config";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

// Confirmed owner links (verified the org exists + is the project's).
const CURATED: Record<string, string> = {
	noether: "https://github.com/NoetherDEX",
};

const NOT_A_USER = new Set([
	"orgs", "sponsors", "marketplace", "topics", "search", "about",
	"features", "pricing", "apps", "collections", "login", "join", "settings",
]);
const VALID_OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;

function ownerLink(raw: string): string | null {
	const m = raw
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.match(/github\.com\/([A-Za-z0-9-]+)/i);
	if (!m) return null;
	const owner = m[1];
	if (!VALID_OWNER.test(owner) || NOT_A_USER.has(owner.toLowerCase())) return null;
	return `https://github.com/${owner}`;
}

async function githubFromWebsite(url: string): Promise<string | null> {
	try {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 6000);
		const res = await fetch(url, {
			redirect: "follow",
			signal: ctrl.signal,
			headers: { "User-Agent": "stellarlight-github-backfill" },
		}).finally(() => clearTimeout(t));
		if (!res.ok) return null;
		const html = (await res.text()).slice(0, 400_000);
		// Collect all github.com/<owner> mentions; pick the most frequent owner
		// (the project's own org appears repeatedly: header, footer, social).
		const counts = new Map<string, number>();
		for (const m of html.matchAll(/github\.com\/([A-Za-z0-9-]+)/gi)) {
			const owner = m[1];
			if (!VALID_OWNER.test(owner) || NOT_A_USER.has(owner.toLowerCase())) continue;
			counts.set(owner, (counts.get(owner) ?? 0) + 1);
		}
		if (!counts.size) return null;
		const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
		return `https://github.com/${top}`;
	} catch {
		return null;
	}
}

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN / AUDIT"}\n`);

	// biome-ignore lint/suspicious/noExplicitAny: payload doc
	const projects = (await payload.find({ collection: "projects", pagination: false, depth: 0 }))
		.docs as any[];

	const missing = projects.filter((p) => !p.links?.github?.trim());
	const withGh = projects.length - missing.length;
	console.log(
		`${projects.length} projects: ${withGh} have a github link, ${missing.length} missing.\n`,
	);

	// Landscape of the missing set BEFORE attempting fills — tells us which
	// discovery sources are worth building (e.g. if most missing are SCF-funded,
	// the SCF project page is a high-yield source).
	const liveMissing = missing.filter((p) => p.status === "Live");
	const scfMissing = missing.filter((p) => p.scf?.awarded || p.scf?.slug);
	const siteMissing = missing.filter((p) => p.links?.website?.trim());
	console.log(
		`Missing-set signals: ${liveMissing.length} are Live, ${scfMissing.length} are SCF-funded (→ SCF page source), ${siteMissing.length} have a website (→ extraction source), ${missing.length - siteMissing.length} have no website.\n`,
	);

	const filled: { slug: string; gh: string; src: string }[] = [];
	const unfilled: { slug: string; status: string; scf: boolean; site: string }[] = [];
	let written = 0;

	for (const p of missing) {
		let candidate: string | null = CURATED[p.slug] ? ownerLink(CURATED[p.slug]) : null;
		let src = candidate ? "curated" : "";
		if (!candidate && p.links?.website?.trim()) {
			candidate = await githubFromWebsite(p.links.website.trim());
			if (candidate) src = "website";
		}
		if (!candidate) {
			unfilled.push({
				slug: p.slug,
				status: p.status ?? "?",
				scf: !!(p.scf?.awarded || p.scf?.slug),
				site: p.links?.website ?? "",
			});
			continue;
		}
		filled.push({ slug: p.slug, gh: candidate, src });
		if (EXECUTE) {
			await payload.update({
				collection: "projects",
				id: p.id,
				data: {
					links: { ...(p.links ?? {}), github: candidate },
					provenance: { ...(p.provenance ?? {}), source: "AdminEdit" },
					...(p.verificationLevel === "Unverified" || !p.verificationLevel
						? { verificationLevel: "Verified (Community)" }
						: {}),
				},
			});
			written++;
		}
	}

	console.log(`── FILLABLE (${filled.length}) ──`);
	for (const f of filled)
		console.log(`  ${f.src === "curated" ? "★" : " "} ${f.slug.padEnd(30)} → ${f.gh}   (${f.src})`);

	console.log(`\n── UNFILLED (${unfilled.length}) — need another source ──`);
	for (const u of unfilled)
		console.log(
			`    ${u.slug.padEnd(30)} status=${u.status.padEnd(12)} scf=${u.scf ? "Y" : "n"} ${u.site ? `site=${u.site}` : "(no website)"}`,
		);

	console.log(
		`\n${EXECUTE ? "DONE" : "DRY RUN"}: ${filled.length}/${missing.length} fillable (${filled.filter((f) => f.src === "curated").length} curated + ${filled.filter((f) => f.src === "website").length} website); ${unfilled.length} need another source.${EXECUTE ? ` Wrote ${written}.` : ""}`,
	);
	console.log("→ After executing, re-run the enrich-repos Action to index the newly-linked repos.");
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
