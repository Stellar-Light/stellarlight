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
import { registrableDomain } from "../../src/lib/partner-project-identity";
import { isThirdPartyLink, parseRoundVerdicts } from "./scf-official";

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
	/** AWARDED numeric rounds only (see enrichRounds). */
	rounds: string[];
	/** Rounds this project entered and did NOT win — carried so the absence
	 *  list stays triageable: a rejected applicant is not a coverage gap. */
	notAwardedRounds?: string[];
	/** True when ANY submission is Awarded, including awards SCF does not
	 *  number (Liquidity/Public Goods/Kickstart). `rounds` alone would file
	 *  those funded projects as unfunded. */
	awardedAny?: boolean;
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
	Array<{
		slug: string;
		name: string;
		aliases: string[];
		website: string | null;
	}>
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
 * Award status is read from the DETAIL page, fetched ONLY for the unmatched
 * set (bounded: the absence list, not all 547), so award status separates
 * "awardee we're missing" from "submission that went nowhere".
 *
 * A BADGE IS A ROUND ENTERED, NOT A ROUND WON. This pass used to set `rounds`
 * from every `SCF #<n>` string on the page. A detail page badges each round
 * the project ever entered, including the ones it lost: on a 20-page random
 * sample of the roster, 8 pages carried a badge for a round explicitly marked
 * "Not Awarded" or "Prescreen Failed" (blockroll #30, crebit #44, dolphinze
 * #38, liquid #41, lumexo #40, smilepay #31/#32/#35, stallion #38). Publishing
 * those numbers as award rounds credits a project with funding it did not get
 * — the same overstatement scf-rounds-guard already polices on directory rows.
 *
 * It does NOT follow that a badged project is unfunded. Every project on the
 * roster sampled so far carries the page's own `"awarded":true`, and a card
 * sitting in "Information Collection" or "Panel Review" is a DISBURSEMENT
 * stage after the award, not a pending verdict. Award status therefore comes
 * from parseRoundVerdicts (scripts/eval/scf-official.ts) — the same parser the
 * membership crosscheck uses, with the negative vocabulary, the partial-award
 * "Awarded (50%)" case, the double-embed dedupe, and the page-counter
 * reconciliation that reads the page's own summary — never from page text.
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
				const verdicts = parseRoundVerdicts(html);
				e.rounds = [...verdicts.awarded];
				e.notAwardedRounds = [...verdicts.notAwarded];
				// BOTH halves are needed. `awarded` holds numbered rounds,
				// including ones the parser reconciles from the page's own
				// awarded/lastAwardedRound/totalAwarded summary when the card
				// still sits in a post-award pipeline status. `awardedAnyCount`
				// catches awards SCF does not number (Public Goods, Liquidity,
				// Kickstart), which land in no round set at all. Testing only
				// the count filed 7 of the 8 standing absences as unfunded when
				// every one of them is an awardee.
				e.awardedAny =
					verdicts.awarded.size > 0 || verdicts.awardedAnyCount > 0;
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
				const links = [
					...unescaped.matchAll(
						/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s\\"'<)]*/gi,
					),
				].map((m) => m[0]);
				// ALL surviving external links, not the first. The first-pick
				// version matched 7 of ~14 known-duplicate pages: the product
				// site is not reliably the first link in the RSC payload (decks,
				// forms and secondary links precede it on several pages). The
				// domain-intersection downstream is unordered anyway.
				//
				// Which is why the exclusion list has to hold every THIRD-PARTY
				// SERVICE a project merely uses. Casting the net over all links
				// means one stray link decides identity: minisend-7tt links a
				// Dune dashboard and matched our `dune` row; the BWB submission
				// links a beacons.ai bio and matched `noticias-trading`. Both
				// projects are genuinely absent from the directory (checked by
				// name and by domain on 2026-09-14) and both were being reported
				// as served — a false match does not merely mislabel a row, it
				// deletes a real gap from the list. Dashboards, link-in-bio
				// hosts and event pages belong here beside the socials.
				e.websites = [
					...new Set(links.filter((u) => !isThirdPartyLink(u))),
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
const REVIEWED_ABSENT: Record<
	string,
	{ verdict: string; evidence: string; servedAs?: string }
> = {
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
		verdict:
			"served under stellar-expert — the RFP's deliverable is StellarExpert's contract source validation",
		evidence:
			"stellar-expert/soroban-build-workflow (the reproducible-build verification pipeline behind stellar.expert's verified-contract badges); row stellar-expert exists",
		servedAs: "stellar-expert",
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
		verdict:
			"served under soroban-decompiler; page carries no product link for the matcher",
		evidence: "same author (salaheldinsoliman); the row exists and is scanned",
		servedAs: "soroban-decompiler",
	},
	"ctxcom-evm": {
		verdict: "served under ctx (aliased + rounds linked)",
		evidence:
			"domain ctx.com matches the row after the x.com filter fix — kept here in case the page's links change",
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
			if (
				/\.(github\.io|vercel\.app|netlify\.app|pages\.dev|onrender\.com|webflow\.io|framer\.website)$/.test(
					h,
				)
			)
				return h;
			// MULTI-LABEL PUBLIC SUFFIXES. This used to be `parts.slice(-2)`,
			// which turns bwbi.com.br into "com.br" — not a domain but a public
			// suffix every Brazilian company shares, so the BWB submission
			// domain-matched our unrelated `mbrl` row and its genuine absence
			// vanished from the list. src/lib/partner-project-identity.ts
			// already solved this (com.br is in its suffix set); use that one
			// helper so a new ccTLD only has to be added in one place.
			return registrableDomain(h) || h;
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
			return `${host}/${segs
				.join("/")
				.toLowerCase()
				.replace(/\.git$/, "")}`;
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
		// A human review that names the serving row IS a match — stronger than
		// any string heuristic, and named in the artifact like every other
		// match so it stays reviewable. Only verdicts with servedAs count;
		// wound-down/no-product verdicts still show as reviewed absences.
		const rv = REVIEWED_ABSENT[e.scfSlug];
		if (rv?.servedAs) {
			domainMatched.push({
				scf: e.scfSlug,
				slug: rv.servedAs,
				domain: `human-review: ${rv.evidence.slice(0, 60)}`,
			});
			return false;
		}
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
			domainMatched.push({
				scf: e.scfSlug,
				slug: hit.slug,
				domain: dom as string,
			});
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
	const absentAwarded = absentFinal.filter((e) => e.awardedAny);
	const report = {
		frame: { scf: scf.length, directory: dir.length },
		absent: absentFinal.length,
		/** Absences SCF actually FUNDED. The coverage claim rests on this, not
		 *  on `absent`: the roster lists every submission, so an absence can be
		 *  an open or rejected application, which is not a gap in our index. */
		absentAwarded: absentAwarded.length,
		/** Absent, but never awarded anything — applied and lost, or still in
		 *  the pipeline. Reported so the two are never summed into "funded". */
		absentSubmittedOnly: absentFinal.length - absentAwarded.length,
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
			/** Awarded rounds only. Empty + awarded:false = applied, never won. */
			rounds: e.rounds,
			notAwardedRounds: e.notAwardedRounds ?? [],
			awarded: e.awardedAny === true,
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
		`\nUnmatched (no directory record found): ${absent.length} — ${absentAwarded.length} SCF actually awarded, ${absent.length - absentAwarded.length} applied without winning (open or rejected). Only the awarded ones are coverage gaps.\n`,
	);
	console.log("| scf project | awarded rounds | applied, not awarded | link |");
	console.log("|---|---|---|---|");
	for (const e of absent.slice(0, 60))
		console.log(
			`| ${e.base} | ${e.rounds.map((r) => `#${r}`).join(" ") || "—"} | ${(e.notAwardedRounds ?? []).map((r) => `#${r}`).join(" ") || "—"} | ${e.url} |`,
		);
	if (absent.length > 60) console.log(`…and ${absent.length - 60} more`);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
