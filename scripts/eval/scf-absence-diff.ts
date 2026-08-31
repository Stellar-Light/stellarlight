/**
 * SCF-awardee absence diff — the bounded, objective slice of "what's missing
 * from the directory entirely" (Curator Phase-2 discovery, scoped to the one
 * source whose ground truth is unambiguous: communityfund.stellar.org).
 *
 *   pnpm exec tsx scripts/eval/scf-absence-diff.ts [--json] [--out=path]
 *
 * Scrapes the server-rendered SCF projects listing (award-round badges
 * included), matches every entry against our directory frame by normalized
 * name/slug containment + token overlap, and reports the UNMATCHED ones —
 * SCF-visible projects we have no record of. Report-only; absences become
 * human-reviewed SEEDS (create-if-missing) per the curation discipline,
 * never auto-created (an SCF submission ≠ a real launched project).
 *
 * Matching is deliberately conservative toward MATCHED (an absence report
 * that cries wolf wastes review time — precision over recall, class 13).
 */
import { writeFileSync } from "node:fs";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const SCF = "https://communityfund.stellar.org";
const JSON_OUT = process.argv.includes("--json");
const OUT_FILE = process.argv
	.find((x) => x.startsWith("--out="))
	?.slice("--out=".length);

const canon = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const tokens = (s: string) =>
	new Set(
		s
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter((t) => t.length >= 3 && !GENERIC.has(t)),
	);
const GENERIC = new Set([
	"the",
	"and",
	"for",
	"stellar",
	"soroban",
	"protocol",
	"platform",
	"network",
	"app",
	"project",
	"with",
]);

interface ScfEntry {
	scfSlug: string;
	base: string;
	rounds: string[];
	url: string;
	website?: string | null;
	websites?: string[];
}

async function fetchScfEntries(): Promise<ScfEntry[]> {
	const res = await fetch(`${SCF}/projects`, {
		headers: { "User-Agent": "stellarlight-scf-diff" },
	});
	if (!res.ok) throw new Error(`SCF listing: ${res.status}`);
	const html = await res.text();
	const matches = [...html.matchAll(/href="\/project\/([a-z0-9-]+)"/g)];
	const entries = new Map<string, ScfEntry>();
	for (let i = 0; i < matches.length; i++) {
		const slug = matches[i][1];
		if (entries.has(slug)) continue;
		// SCF slugs end in a 3-char id suffix (aerochain-yzr) — the base is
		// the project name.
		const base = slug.replace(/-[a-z0-9]{3}$/, "");
		// award badges live in the card segment between this href and the next
		const start = matches[i].index ?? 0;
		const end = matches[i + 1]?.index ?? Math.min(html.length, start + 6000);
		const seg = html.slice(start, end);
		const rounds = [
			...new Set([...seg.matchAll(/SCF\s*#(\d+)/g)].map((m) => m[1])),
		];
		entries.set(slug, {
			scfSlug: slug,
			base,
			rounds,
			url: `${SCF}/project/${slug}`,
		});
	}
	return [...entries.values()];
}

async function fetchDirectory(): Promise<
	Array<{ slug: string; name: string; aliases: string[]; website: string | null }>
> {
	let cats: string[] = [];
	try {
		const bad = await fetch(`${BASE}/api/projects/search?category=bogus`);
		cats =
			((await bad.json()) as { validCategories?: string[] }).validCategories ??
			[];
	} catch {}
	const rows: Array<{
		slug: string;
		name: string;
		aliases: string[];
		website: string | null;
	}> = [];
	for (const c of cats) {
		for (let offset = 0; ; offset += 100) {
			const res = await fetch(
				`${BASE}/api/projects/search?category=${encodeURIComponent(c)}&limit=100&offset=${offset}`,
				{ headers: { "User-Agent": "stellarlight-scf-diff" } },
			);
			// biome-ignore lint/suspicious/noExplicitAny: narrow use
			const d: any = await res.json();
			const page = d.projects ?? [];
			// ALIASES. report-coverage-gaps.ts — the sibling lane in this same
			// report — has always read identity.aliases; this lane mapped only
			// {slug, name}, so an SCF row whose title uses a project's former name
			// counted as absent. hermes-isy (round 32) was reported missing while
			// we serve `zenex` with identity.aliases ['Hermes'] and scfAwarded true.
			rows.push(
				...page.map(
					(p: {
						slug: string;
						name: string;
						identity?: { aliases?: unknown };
						links?: { website?: string | null };
					}) => ({
						slug: p.slug,
						name: p.name,
						aliases: Array.isArray(p.identity?.aliases)
							? (p.identity.aliases as string[])
							: [],
						website: p.links?.website ?? null,
					}),
				),
			);
			if (page.length < 100) break;
		}
	}
	return rows;
}

function matches(
	e: ScfEntry,
	dir: Array<{
		slug: string;
		name: string;
		kind: "name" | "alias";
		c: string;
		t: Set<string>;
	}>,
): boolean {
	const cb = canon(e.base);
	const first = e.base.split("-")[0];
	const tb = tokens(e.base.replace(/-/g, " "));
	for (const d of dir) {
		if (d.slug === e.base || d.c === cb) return true;
		// An alias is a WEAKER identity claim than a name — a former name, an
		// abbreviation, a rebrand — so it earns only the strictest branches:
		// exact equality (above) and whole-token equality (here). Never
		// first-token, never prefix, never substring containment: an alias
		// "Vibrant" must not claim every SCF slug whose first token happens to
		// be "vibrant".
		if (d.kind === "alias") {
			if (d.c.length >= 4 && tb.has(d.c)) return true;
			continue;
		}
		// SCF titles are descriptive ('sfx-super-money-app'); the product name
		// is usually the FIRST token or a prefix ('cocaxyz' → coca).
		if (first.length >= 3 && d.c === first) return true;
		if (d.c.length >= 4 && cb.startsWith(d.c)) return true;
		if (
			cb.length >= 5 &&
			(d.c.includes(cb) || cb.includes(d.c)) &&
			d.c.length >= 5
		)
			return true;
		// A short name that is a WHOLE TOKEN of the SCF title, rather than a
		// substring of it. "identity-operating-system-idos" contains "idos", but
		// canon("idOS") is 4 chars and the containment floor above requires 5.
		//
		// The floor is not the bug and must not be lowered: relaxing it to 4 was
		// measured and produced new FALSE matches —
		// soroban-disassembler-working-title-ply -> "band",
		// bpv-stellarmesh-anchor-afq -> "mesh". Those are substrings; this is a
		// token boundary, which is why it catches idOS and rejects both.
		if (d.c.length >= 4 && tb.has(d.c)) return true;
		// all significant SCF-name tokens present in the directory name
		if (tb.size > 0 && [...tb].every((t) => d.t.has(t))) return true;
	}
	return false;
}

/**
 * Round badges render only on DETAIL pages, not the listing grid — fetched
 * ONLY for the unmatched set (bounded: the absence list, not all 547), so
 * award status separates "awardee we're missing" from "submission that went
 * nowhere".
 */
async function enrichRounds(entries: ScfEntry[]): Promise<void> {
	let idx = 0;
	async function worker() {
		for (;;) {
			const i = idx++;
			if (i >= entries.length) return;
			const e = entries[i];
			try {
				const res = await fetch(e.url, {
					headers: { "User-Agent": "stellarlight-scf-diff" },
				});
				if (!res.ok) continue;
				const html = await res.text();
				e.rounds = [
					...new Set([...html.matchAll(/SCF\s*#(\d+)/g)].map((m) => m[1])),
				];
				// The submission's own website link, for the domain-equality pass.
				// First external http(s) link that is not an SCF/social/platform
				// domain — the page's product-website field renders as exactly that.
				//
				// UNESCAPE FIRST. The first run of this pass matched ZERO of 25
				// while the human review had domain-resolved 23 of 47 — because
				// these pages embed their data in an RSC payload where every URL
				// arrives \/-escaped or \u002F-escaped. A regex that only knows
				// literal slashes reads a page full of links and finds none.
				const unescaped = html
					.replace(/\\u002[fF]/g, "/")
					.replace(/\\\//g, "/");
				const links = [...unescaped.matchAll(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s\\"'<)]*/gi)].map((m) => m[0]);
				// ALL surviving external links, not the first. The first-pick
				// version matched 7 of ~14 known-duplicate pages: the product
				// site is not reliably the first link in the RSC payload (decks,
				// forms and secondary links precede it on several pages). The
				// domain-intersection downstream is unordered anyway.
				e.websites = [
					...new Set(
						links.filter(
							(u) =>
								!/stellar\.org|stellar\.expert|twitter\.com|\/\/x\.com|\/\/www\.x\.com|linkedin\.com|discord|t\.me|medium\.com|docs\.google|airtable|notion\.so|vercel\.app\/api|fonts\.|cdn\.|googleapis|gstatic|cloudfront|w3\.org|sanity\.io|googletagmanager|visualwebsiteoptimizer|gitbook\.io|schema\.org|sentry|segment\.|hotjar|plausible|posthog|apple\.com|play\.google|google\.com|dappradar|defillama|coinmarketcap|coingecko|crunchbase|producthunt|typeform|calendly|mailchimp|substack/i.test(
									u,
								),
						),
					),
				].slice(0, 12);
				e.website = e.websites[0] ?? null;
			} catch {
				/* stays as listed */
			}
		}
	}
	await Promise.all(Array.from({ length: 8 }, worker));
}

/** Human review verdicts for absences (docs/SCF-SEED-REVIEW-2026-08-31.md).
 *
 * The documented-empty discipline: an absence is DEBT until a human has
 * looked, and a VERDICT after. The five rows here are the review's leftovers
 * that no code can honestly resolve — two projects that no longer exist
 * anywhere but as rows-with-history (seeded Inactive in the same change), an
 * RFP winner whose own SCF page points back at the SCF handbook, and two
 * community-program submissions with no product identity to serve. Every
 * entry names its evidence; an absent slug NOT in this map is unreviewed and
 * keeps the row red.
 */
const REVIEWED_ABSENT: Record<string, { verdict: string; evidence: string }> = {
	"dockingzone-a18": {
		verdict: "wound-down — served as an Inactive row (docking-zone)",
		evidence: "DNS dead; last Wayback capture 2025-11-09",
	},
	"communidao-9pm": {
		verdict: "wound-down — served as an Inactive row (communidao)",
		evidence: "site 502; GitHub org has zero public repos; last award 2023",
	},
	"enerdao-r84": {
		verdict: "served — row exists, un-drafted to Development this run",
		evidence: "https://www.enerdao.org/ up, repo silent — review's own verdict",
	},
	"soroban-contract-source-verification-service-bax": {
		verdict: "unidentifiable — cannot honestly create a row",
		evidence:
			"the submission's own website field points back at the SCF handbook; no product identity to serve",
	},
	"west-african-ambassadors-waa-syb": {
		verdict: "community program, not a product — no row",
		evidence: "ambassador program submission; nothing to serve as a project",
	},
	"study-stellar-sdk-soroban-b3d": {
		verdict: "study/education submission, no product identity — no row",
		evidence: "no website or repo on the SCF page beyond the program itself",
	},
	"rfp-soroban-wasm-specialized-reverse-engineering-tool-mxh": {
		verdict: "served under soroban-decompiler; page carries no product link for the matcher",
		evidence: "same author (salaheldinsoliman); the row exists and is scanned",
	},
	"ctxcom-evm": {
		verdict: "served under ctx (aliased + rounds linked)",
		evidence: "domain ctx.com matches the row after the x.com filter fix — kept here in case the page's links change",
	},
	"prices-api-rfp-ctx-1vo": {
		verdict: "served under ctx (second submission, rounds linked)",
		evidence: "rates.ctx.com is ctx.com — same company",
	},
};

async function main() {
	console.error("SCF-awardee absence diff");
	const [scf, dir] = await Promise.all([fetchScfEntries(), fetchDirectory()]);
	console.error(`  SCF listing: ${scf.length} | directory: ${dir.length}`);
	// One index row per IDENTITY STRING, not per project — the shape
	// report-coverage-gaps.ts already uses. A project answering to two names is
	// two chances to match, which is the point of carrying aliases at all.
	// Each row is TAGGED name|alias: matches() grants alias rows only the
	// strictest branches, because an alias is a weaker identity claim.
	const dirIdx = dir.flatMap((d) =>
		[
			{ n: d.name, kind: "name" as const },
			...d.aliases.map((n) => ({ n, kind: "alias" as const })),
		]
			.filter(
				(x): x is { n: string; kind: "name" | "alias" } =>
					typeof x.n === "string" && x.n.trim().length > 0,
			)
			.map((x) => ({ ...d, kind: x.kind, c: canon(x.n), t: tokens(x.n) })),
	);
	const absent = scf.filter((e) => !matches(e, dirIdx));
	console.error(
		`  unmatched: ${absent.length} — fetching detail pages for award rounds…`,
	);
	await enrichRounds(absent);

	// ── DOMAIN-EQUALITY PASS ──────────────────────────────────────────────
	// The 2026-08-31 human review of 47 "absent" rows found 23 (49%) were
	// projects we already serve under another name — and nearly every one was
	// resolvable by comparing the SCF page's website to the row's website.
	// Names lie (descriptive submission titles, rebrands); a registrable
	// domain both sides publish is the strongest identity signal this lane
	// can check without a human. Runs only on the still-unmatched set, whose
	// detail pages enrichRounds just fetched anyway.
	const regDomain = (u: string | null | undefined): string | null => {
		if (!u) return null;
		try {
			const h = new URL(u).hostname.toLowerCase().replace(/^www\./, "");
			// Hosted-subdomain platforms: the SUBDOMAIN is the identity.
			// Collapsing foo.github.io to github.io matched a disassembler RFP
			// to an unrelated project that also publishes on github.io.
			if (/\.(github\.io|vercel\.app|netlify\.app|pages\.dev|onrender\.com|webflow\.io|framer\.website)$/.test(h))
				return h;
			const parts = h.split(".");
			return parts.length <= 2 ? h : parts.slice(-2).join(".");
		} catch {
			return null;
		}
	};
	const byDomain = new Map<string, { slug: string; name: string }>();
	// github.com must never domain-match (half the corpus lives there) — but a
	// submission whose website IS a github repo identifies exactly one project,
	// so those match on the full owner/repo path instead.
	// PLATFORM hosts identify a project by PATH, never by domain — github,
	// jsr, npm, crates, pypi and youtube host half the ecosystem each, and the
	// first version domain-matched jsr.io straight into the wrong package
	// (meta-contracts -> stellar-indexer instead of stellar-router-sdk).
	const PLATFORM =
		/^(github\.com|jsr\.io|npmjs\.com|crates\.io|pypi\.org|youtube\.com)$/;
	const platPath = (u: string | null | undefined): string | null => {
		if (!u) return null;
		try {
			const url = new URL(u);
			const host = url.hostname.toLowerCase().replace(/^www\./, "");
			if (!PLATFORM.test(host)) return null;
			const segs = url.pathname.split("/").filter(Boolean).slice(0, 2);
			if (!segs.length) return null;
			return `${host}/${segs.join("/").toLowerCase().replace(/\.git$/, "")}`;
		} catch {
			return null;
		}
	};
	const byPlatPath = new Map<string, { slug: string; name: string }>();
	for (const d of dir) {
		const dom = regDomain(d.website);
		if (dom && !PLATFORM.test(dom))
			byDomain.set(dom, { slug: d.slug, name: d.name });
		const pp = platPath(d.website);
		if (pp) byPlatPath.set(pp, { slug: d.slug, name: d.name });
	}
	const domainMatched: Array<{ scf: string; slug: string; domain: string }> =
		[];
	const stillAbsent = absent.filter((e) => {
		let hit: { slug: string; name: string } | undefined;
		let matchedOn = "";
		for (const link of e.websites ?? []) {
			const pp = platPath(link);
			if (pp && byPlatPath.has(pp)) {
				hit = byPlatPath.get(pp);
				matchedOn = pp;
				break;
			}
			const dom = regDomain(link);
			if (dom && !PLATFORM.test(dom) && byDomain.has(dom)) {
				hit = byDomain.get(dom);
				matchedOn = dom;
				break;
			}
		}
		const dom = matchedOn;
		if (hit) {
			domainMatched.push({ scf: e.scfSlug, slug: hit.slug, domain: dom as string });
			return false;
		}
		return true;
	});
	if (domainMatched.length) {
		console.error(
			`  domain-equality pass: ${domainMatched.length} resolved to existing rows:`,
		);
		for (const m of domainMatched)
			console.error(`    ${m.scf} -> ${m.slug} (${m.domain})`);
	}
	const absentFinal = stillAbsent;
	const absentAwarded = absentFinal.filter((e) => e.rounds.length > 0);
	const report = {
		frame: { scf: scf.length, directory: dir.length },
		absent: absentFinal.length,
		absentWithRoundBadge: absentAwarded.length,
		/** Absences carrying a human review verdict vs not. The row is honest
		 *  debt only while unreviewed > 0 — a reviewed absence is a decision. */
		reviewedAbsent: absentFinal
			.filter((e) => REVIEWED_ABSENT[e.scfSlug])
			.map((e) => ({ scfSlug: e.scfSlug, ...REVIEWED_ABSENT[e.scfSlug] })),
		unreviewedAbsent: absentFinal.filter((e) => !REVIEWED_ABSENT[e.scfSlug])
			.length,
		/** SCF rows resolved to an existing directory row by website-domain
		 *  equality — served, not absent, and named so the match is reviewable. */
		domainMatched,
		sample: absentFinal.slice(0, 40).map((e) => ({
			scfSlug: e.scfSlug,
			rounds: e.rounds,
			url: e.url,
		})),
		// The FULL list, uncapped. `sample` is 40 rows of detail and that is
		// fine for reading, but a consumer that wants to JOIN against this list
		// cannot use a truncated one — report-coverage-gaps.ts needs to ask "is
		// this DefiLlama protocol also on the SCF absent list", and FxDAO sits at
		// position 42. Slugs are cheap; the cap was only ever about detail rows.
		absentSlugs: absentFinal.map((e) => e.scfSlug),
	};
	if (OUT_FILE) {
		writeFileSync(OUT_FILE, JSON.stringify(report, null, 1));
		console.error(`  wrote ${OUT_FILE}`);
		return;
	}
	if (JSON_OUT) {
		console.log(JSON.stringify(report, null, 1));
		return;
	}
	console.log(
		`# SCF absence diff — ${scf.length} SCF-listed projects vs ${dir.length} directory records`,
	);
	console.log(
		`\nUnmatched (no directory record found): ${absent.length} (${absentAwarded.length} carry an award-round badge)\n`,
	);
	console.log("| scf project | rounds | link |");
	console.log("|---|---|---|");
	for (const e of absent.slice(0, 60))
		console.log(
			`| ${e.base} | ${e.rounds.map((r) => `#${r}`).join(" ") || "—"} | ${e.url} |`,
		);
	if (absent.length > 60) console.log(`…and ${absent.length - 60} more`);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
