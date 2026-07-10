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
	Array<{ slug: string; name: string }>
> {
	let cats: string[] = [];
	try {
		const bad = await fetch(`${BASE}/api/projects/search?category=bogus`);
		cats =
			((await bad.json()) as { validCategories?: string[] }).validCategories ??
			[];
	} catch {}
	const rows: Array<{ slug: string; name: string }> = [];
	for (const c of cats) {
		for (let offset = 0; ; offset += 100) {
			const res = await fetch(
				`${BASE}/api/projects/search?category=${encodeURIComponent(c)}&limit=100&offset=${offset}`,
				{ headers: { "User-Agent": "stellarlight-scf-diff" } },
			);
			// biome-ignore lint/suspicious/noExplicitAny: narrow use
			const d: any = await res.json();
			const page = d.projects ?? [];
			rows.push(
				...page.map((p: { slug: string; name: string }) => ({
					slug: p.slug,
					name: p.name,
				})),
			);
			if (page.length < 100) break;
		}
	}
	return rows;
}

function matches(
	e: ScfEntry,
	dir: Array<{ slug: string; name: string; c: string; t: Set<string> }>,
): boolean {
	const cb = canon(e.base);
	const first = e.base.split("-")[0];
	const tb = tokens(e.base.replace(/-/g, " "));
	for (const d of dir) {
		if (d.slug === e.base || d.c === cb) return true;
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
			} catch {
				/* stays as listed */
			}
		}
	}
	await Promise.all(Array.from({ length: 8 }, worker));
}

async function main() {
	console.error("SCF-awardee absence diff");
	const [scf, dir] = await Promise.all([fetchScfEntries(), fetchDirectory()]);
	console.error(`  SCF listing: ${scf.length} | directory: ${dir.length}`);
	const dirIdx = dir.map((d) => ({
		...d,
		c: canon(d.name),
		t: tokens(d.name),
	}));
	const absent = scf.filter((e) => !matches(e, dirIdx));
	console.error(
		`  unmatched: ${absent.length} — fetching detail pages for award rounds…`,
	);
	await enrichRounds(absent);
	const absentAwarded = absent.filter((e) => e.rounds.length > 0);
	const report = {
		frame: { scf: scf.length, directory: dir.length },
		absent: absent.length,
		absentWithRoundBadge: absentAwarded.length,
		sample: absent.slice(0, 40).map((e) => ({
			scfSlug: e.scfSlug,
			rounds: e.rounds,
			url: e.url,
		})),
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
