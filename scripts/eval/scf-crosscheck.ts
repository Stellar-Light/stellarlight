/**
 * SCF status cross-check — verifies our directory's SCF fields against the
 * authoritative source (communityfund.stellar.org). The data-truth guard for
 * "is X SCF-funded?" — the single most-cited SCF fact.
 *
 *   pnpm exec tsx scripts/eval/scf-crosscheck.ts [--json] [--out=path]
 *
 * Rides the absence-diff scraper. Scrapes the SCF listing (award-round
 * badges), high-precision-matches each entry to our directory record (exact
 * slug-base or exact canon-name — NOT the absence diff's fuzzy match, which is
 * tuned for recall not precision), and reports two divergence classes:
 *
 *   OVERSTATED  we mark scfAwarded=true but the SCF page shows no award badge
 *               (confirmed via a detail-page fetch — the highest concern: we
 *               claim funding the source doesn't corroborate)
 *   UNDERSTATED we mark scfAwarded=false but the SCF listing shows a round
 *               badge (we're hiding real funding from agents)
 *
 * Plus a ROUNDS-BACKFILL enrichment list: awarded records with an empty
 * scfAwardedRounds that the SCF page can populate (a data-completeness win,
 * not an error). Report-only — divergences become owner-reviewed curate rows.
 *
 * ROUND MEMBERSHIP (the phoenix #18/#24 class, sls-020..051 wave): totals can
 * be right while per-round membership is wrong — a project's detail page
 * lists every SUBMISSION with an explicit per-round status ("Awarded" /
 * "Not Awarded"), and the page's top badges include NOT-awarded rounds, which
 * is exactly what naive badge-scrapes inherit. For every awarded match with a
 * non-empty scfAwardedRounds we parse those per-submission verdicts and emit:
 *
 *   roundsOverstated    we list a round the page affirmatively marks
 *                       "Not Awarded" (and no submission in that round was
 *                       awarded) — the membership analog of OVERSTATED
 *   roundsUnverifiable  the page carries no parseable verdict for one of our
 *                       rounds — never accuse on ambiguity (run-1 calibration
 *                       lesson: absence of a badge is NOT negative evidence)
 *
 * NOTE (why amounts aren't cross-checked): SCF doesn't publish all per-award
 * amounts (some XLM/undisclosed — see scfAmountStatus), so our USD totals are
 * in-house reconstructions that legitimately disagree with SDF's counters.
 * The awarded BOOLEAN and the round set are the reliably-comparable facts.
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

const canon = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

interface ScfEntry {
	base: string;
	rounds: string[];
	url: string;
}

async function fetchScf(): Promise<ScfEntry[]> {
	const res = await fetch(`${SCF}/projects`, {
		headers: { "User-Agent": "stellarlight-scf-crosscheck" },
	});
	if (!res.ok) throw new Error(`SCF listing: ${res.status}`);
	const html = await res.text();
	const matches = [...html.matchAll(/href="\/project\/([a-z0-9-]+)"/g)];
	const out = new Map<string, ScfEntry>();
	for (let i = 0; i < matches.length; i++) {
		const slug = matches[i][1];
		if (out.has(slug)) continue;
		const base = slug.replace(/-[a-z0-9]{3}$/, "");
		const start = matches[i].index ?? 0;
		const end = matches[i + 1]?.index ?? Math.min(html.length, start + 6000);
		const rounds = [
			...new Set(
				[...html.slice(start, end).matchAll(/SCF\s*#(\d+)/g)].map((m) => m[1]),
			),
		];
		out.set(slug, { base, rounds, url: `${SCF}/project/${slug}` });
	}
	return [...out.values()];
}

/**
 * Awarded verdict from a detail page. Run-1 calibration: the `SCF #N` round
 * badge is NOT reliably in the raw HTML (blend-mfy/scaffold-stellar are
 * genuinely awarded but render the award differently), so absence of a badge
 * is NOT proof of non-award. Confirm via affirmative award text before
 * accusing — precision over false alarms (ground-truth, not adversarial).
 * Returns true (awarded), false (clearly not), or null (fetch failed / can't
 * tell → don't accuse).
 */
async function detailAwarded(url: string): Promise<boolean | null> {
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "stellarlight-scf-crosscheck" },
		});
		if (!res.ok) return null;
		const html = await res.text();
		const hasBadge = /SCF\s*#\d+/.test(html);
		// "awarded" affirmative, excluding the "Not Awarded" negation.
		const awardedText = /(?<!not\s)(?<!not-)awarded/i.test(html);
		const clearlyNot = /not awarded/i.test(html) && !awardedText && !hasBadge;
		if (hasBadge || awardedText) return true;
		if (clearlyNot) return false;
		return null; // ambiguous — don't accuse
	} catch {
		return null;
	}
}

/**
 * Per-round award verdicts from a detail page's submission cards. The page
 * embeds each submission as structured data with an explicit status:
 *   {"status":"Not Awarded", …, "roundName":"SCF #24", …}
 * (present twice — flight chunks + inline props — with escaped quotes; we
 * unescape and dedupe via sets). A round counts as AWARDED if ANY submission
 * in it was awarded (projects resubmit within a round — phoenix's Liquidity
 * round has both verdicts), and NOT-awarded only when every submission in the
 * round says "Not Awarded". Rounds without an SCF #N number (e.g. "Liquidity
 * Award…") don't map onto our numeric scfAwardedRounds and are ignored.
 * NOTE: the page's `buildAwardRounds` array is NOT usable — it includes
 * not-awarded rounds (verified on phoenix-svj, 2026-07-11).
 */
function parseRoundVerdicts(html: string): {
	awarded: Set<string>;
	notAwarded: Set<string>;
	submissions: number;
} {
	const txt = html.replace(/\\"/g, '"');
	const awarded = new Set<string>();
	const negative = new Set<string>();
	let submissions = 0;
	const re = /"status":"(Awarded|Not Awarded)"[^{}]*?"roundName":"([^"]+)"/g;
	for (const m of txt.matchAll(re)) {
		submissions++;
		const num = m[2].match(/SCF\s*#\s*(\d+)/i)?.[1];
		if (!num) continue;
		const round = String(Number(num));
		if (m[1] === "Awarded") awarded.add(round);
		else negative.add(round);
	}
	const notAwarded = new Set([...negative].filter((r) => !awarded.has(r)));
	return { awarded, notAwarded, submissions };
}

async function fetchDetailHtml(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "stellarlight-scf-crosscheck" },
		});
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

interface DirRow {
	slug: string;
	name: string;
	scfAwarded: boolean;
	scfAwardedRounds: string[];
}

async function fetchDir(): Promise<DirRow[]> {
	let cats: string[] = [];
	try {
		const bad = await fetch(`${BASE}/api/projects/search?category=bogus`);
		cats =
			((await bad.json()) as { validCategories?: string[] }).validCategories ??
			[];
	} catch {}
	const rows: DirRow[] = [];
	for (const c of cats) {
		for (let offset = 0; ; offset += 100) {
			const res = await fetch(
				`${BASE}/api/projects/search?category=${encodeURIComponent(c)}&limit=100&offset=${offset}`,
				{ headers: { "User-Agent": "stellarlight-scf-crosscheck" } },
			);
			// biome-ignore lint/suspicious/noExplicitAny: narrow use
			const d: any = await res.json();
			const page = d.projects ?? [];
			for (const p of page)
				rows.push({
					slug: p.slug,
					name: p.name,
					scfAwarded: !!p.scfAwarded,
					scfAwardedRounds: (p.scfAwardedRounds ?? []).map(String),
				});
			if (page.length < 100) break;
		}
	}
	return rows;
}

async function main() {
	console.error("SCF status cross-check");
	const [scf, dir] = await Promise.all([fetchScf(), fetchDir()]);
	console.error(`  SCF: ${scf.length} | directory: ${dir.length}`);

	// High-precision match: exact slug-base OR exact canon-name. One dir row
	// per SCF entry (first exact hit). Ambiguous/no match → not compared.
	const byExactName = new Map<string, DirRow>();
	const bySlug = new Map<string, DirRow>();
	for (const d of dir) {
		bySlug.set(d.slug, d);
		if (!byExactName.has(canon(d.name))) byExactName.set(canon(d.name), d);
	}
	const matched: Array<{ scf: ScfEntry; dir: DirRow }> = [];
	for (const e of scf) {
		const d = bySlug.get(e.base) ?? byExactName.get(canon(e.base));
		if (d) matched.push({ scf: e, dir: d });
	}
	console.error(`  high-precision matches: ${matched.length}`);

	// UNDERSTATED: listing shows a badge, we say not-awarded.
	const understated = matched.filter(
		(m) => m.scf.rounds.length > 0 && !m.dir.scfAwarded,
	);
	// OVERSTATED CANDIDATES: we say awarded, listing shows no badge. Confirm
	// via detail page before reporting (listing badges are partial).
	const overCandidates = matched.filter(
		(m) => m.dir.scfAwarded && m.scf.rounds.length === 0,
	);
	console.error(
		`  confirming ${overCandidates.length} overstated-candidates via detail pages…`,
	);
	const overstated: Array<{ slug: string; name: string; url: string }> = [];
	let idx = 0;
	async function worker() {
		for (;;) {
			const i = idx++;
			if (i >= overCandidates.length) return;
			const m = overCandidates[i];
			const awarded = await detailAwarded(m.scf.url);
			// Only accuse when the detail page CLEARLY shows not-awarded.
			if (awarded === false)
				overstated.push({
					slug: m.dir.slug,
					name: m.dir.name,
					url: m.scf.url,
				});
		}
	}
	await Promise.all(Array.from({ length: 8 }, worker));

	// ROUNDS-BACKFILL: awarded both sides, we have empty rounds, SCF has them.
	const backfill = matched
		.filter(
			(m) =>
				m.dir.scfAwarded &&
				m.dir.scfAwardedRounds.length === 0 &&
				m.scf.rounds.length > 0,
		)
		.map((m) => ({
			slug: m.dir.slug,
			name: m.dir.name,
			scfRounds: m.scf.rounds,
			url: m.scf.url,
		}));

	// ROUND MEMBERSHIP: for every awarded match with a non-empty round set,
	// verify each of OUR rounds against the detail page's per-submission
	// verdicts (the phoenix class: badge-derived rounds inherit Not-Awarded
	// submissions). Affirmative negatives only; ambiguity → unverifiable.
	interface RoundsFinding {
		slug: string;
		name: string;
		ourRounds: string[];
		officialAwardedRounds: string[];
		url: string;
	}
	const membership = matched.filter(
		(m) => m.dir.scfAwarded && m.dir.scfAwardedRounds.length > 0,
	);
	console.error(
		`  round-membership: verifying ${membership.length} awarded matches with rounds via detail pages…`,
	);
	const roundsOverstated: Array<RoundsFinding & { evidence: string }> = [];
	const roundsUnverifiable: Array<RoundsFinding & { reason: string }> = [];
	let mIdx = 0;
	async function membershipWorker() {
		for (;;) {
			const i = mIdx++;
			if (i >= membership.length) return;
			const m = membership[i];
			const ours = [
				...new Set(m.dir.scfAwardedRounds.map((r) => String(Number(r)))),
			];
			const base = {
				slug: m.dir.slug,
				name: m.dir.name,
				ourRounds: ours,
				url: m.scf.url,
			};
			const html = await fetchDetailHtml(m.scf.url);
			if (!html) {
				roundsUnverifiable.push({
					...base,
					officialAwardedRounds: [],
					reason: "detail page fetch failed — never accuse",
				});
				continue;
			}
			const v = parseRoundVerdicts(html);
			if (v.submissions === 0) {
				roundsUnverifiable.push({
					...base,
					officialAwardedRounds: [],
					reason: "no parseable submission cards on the page — never accuse",
				});
				continue;
			}
			const official = [...v.awarded].sort((a, b) => Number(a) - Number(b));
			const over = ours.filter((r) => v.notAwarded.has(r));
			const unknown = ours.filter(
				(r) => !v.awarded.has(r) && !v.notAwarded.has(r),
			);
			if (over.length)
				roundsOverstated.push({
					...base,
					officialAwardedRounds: official,
					evidence: `SCF page marks round(s) ${over.map((r) => `#${r}`).join(" ")} "Not Awarded" on every submission in that round`,
				});
			if (unknown.length)
				roundsUnverifiable.push({
					...base,
					officialAwardedRounds: official,
					reason: `no submission verdict found for round(s) ${unknown.map((r) => `#${r}`).join(" ")}`,
				});
		}
	}
	await Promise.all(Array.from({ length: 8 }, membershipWorker));

	const report = {
		frame: {
			scf: scf.length,
			directory: dir.length,
			matched: matched.length,
			roundsChecked: membership.length,
		},
		overstated,
		understated: understated.map((m) => ({
			slug: m.dir.slug,
			name: m.dir.name,
			scfRounds: m.scf.rounds,
			url: m.scf.url,
		})),
		roundsBackfill: backfill,
		roundsOverstated,
		roundsUnverifiable,
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
		`# SCF status cross-check — ${matched.length} matched (of ${scf.length} SCF / ${dir.length} dir)`,
	);
	console.log(
		`\n## OVERSTATED (${overstated.length}) — we say scfAwarded but SCF page shows no round\n`,
	);
	for (const o of overstated) console.log(`- ${o.slug} (${o.name}) — ${o.url}`);
	console.log(
		`\n## UNDERSTATED (${report.understated.length}) — SCF badge present, we say not awarded\n`,
	);
	for (const u of report.understated)
		console.log(
			`- ${u.slug} (${u.name}) — SCF ${u.scfRounds.map((r) => `#${r}`).join(" ")} — ${u.url}`,
		);
	console.log(
		`\n## ROUNDS-BACKFILL (${backfill.length}) — awarded, empty scfAwardedRounds, SCF has them (enrichment)\n`,
	);
	for (const b of backfill.slice(0, 30))
		console.log(`- ${b.slug}: ${b.scfRounds.map((r) => `#${r}`).join(" ")}`);
	if (backfill.length > 30) console.log(`…and ${backfill.length - 30} more`);
	console.log(
		`\n## ROUNDS-OVERSTATED (${roundsOverstated.length} of ${membership.length} checked) — we list a round the page marks "Not Awarded"\n`,
	);
	for (const r of roundsOverstated)
		console.log(
			`- ${r.slug}: ours [${r.ourRounds.map((x) => `#${x}`).join(" ")}] vs official awarded [${r.officialAwardedRounds.map((x) => `#${x}`).join(" ")}] — ${r.evidence} — ${r.url}`,
		);
	console.log(
		`\n## ROUNDS-UNVERIFIABLE (${roundsUnverifiable.length}) — page ambiguous for some of our rounds, review by hand (never accused)\n`,
	);
	for (const r of roundsUnverifiable.slice(0, 30))
		console.log(
			`- ${r.slug}: ours [${r.ourRounds.map((x) => `#${x}`).join(" ")}] — ${r.reason} — ${r.url}`,
		);
	if (roundsUnverifiable.length > 30)
		console.log(`…and ${roundsUnverifiable.length - 30} more`);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL", e);
		process.exit(1);
	});
