/**
 * A partition must sum to its denominator.
 *
 * Three served surfaces broke this rule in two days, each one silently:
 *   - hackathon `stats.outcomes` read built 0 · inProgress 0 · abandoned 0 ·
 *     unknown 0 beside `totalSubmissions: 300` — four buckets asserting that
 *     300 projects were classified and none exist, when none were classified.
 *   - `/api/analyze?dimension=toolchain` summed its version buckets to exactly
 *     2,000 under a 5,616 headline — the query cap, not the corpus — and the
 *     deprecated rate read 1.9% instead of 7.1%.
 *   - the `/api/rwa` changelog said four deployed-no-supply rows; `byState`
 *     served one. Written from notes, not from the surface.
 *
 * Every part was locally plausible. What none of them had was the one check
 * that cannot be argued with: the buckets add up to the thing they claim to
 * partition. This guard is that check, and nothing more — it does not judge
 * whether a bucket is RIGHT, only whether the set is complete.
 *
 * Read-only. Trinary per check: pass / FAIL / could-not-check. A fetch that
 * fails is could-not-check and exits 2 — an unreachable endpoint is not a
 * broken invariant, and reading it as one would teach people to ignore red.
 *
 *   pnpm exec tsx scripts/check-sum-invariants.ts            # live surfaces
 *   pnpm exec tsx scripts/check-sum-invariants.ts --json     # machine output
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const BASE = process.env.SUM_INVARIANTS_BASE ?? "https://stellarlight.xyz";
const OUT = "improvements/audits/sum-invariants-latest.json";
const JSON_OUT = process.argv.includes("--json");
const H = {
	"user-agent": "stellar-light-sum-invariants/1.0 (+https://stellarlight.xyz)",
};

type Part = {
	name: string;
	why: string;
	/** Fetch the response (or read an artifact) and return the partition + denominator. */
	read: () => Promise<
		{ parts: Record<string, number>; total: number; scope: string }[]
	>;
};

const getJson = async (path: string) => {
	const r = await fetch(`${BASE}${path}`, {
		headers: H,
		signal: AbortSignal.timeout(30_000),
	});
	if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
	return r.json();
};
const sum = (o: Record<string, number>) =>
	Object.values(o).reduce((a, b) => a + (Number(b) || 0), 0);

const PARTITIONS: Part[] = [
	{
		name: "hackathon outcomes sum to totalSubmissions",
		why: "outcomes served 0/0/0/0 beside 300 submissions — a classification that never ran, asserted as a result",
		read: async () => {
			const list = await getJson("/api/hackathons");
			const out = [];
			for (const h of (list.hackathons ?? []).slice(0, 8)) {
				const d = await getJson(`/api/hackathons/${h.slug}`);
				const s = d.hackathon?.stats;
				if (!s?.outcomes) continue;
				out.push({
					scope: h.slug,
					parts: s.outcomes,
					total: Number(s.totalSubmissions ?? 0),
				});
			}
			return out;
		},
	},
	{
		name: "rwa byState / byLevel sum to registry",
		why: "the 1.9.31 changelog said four deployed-no-supply rows; the served partition held one",
		read: async () => {
			const m = (await getJson("/api/rwa?limit=1")).meta.counts;
			return [
				{ scope: "byState", parts: m.byState, total: m.registry },
				{ scope: "byLevel", parts: m.byLevel, total: m.registry },
			];
		},
	},
	{
		name: "toolchain version buckets sum to measuredRepos",
		why: "buckets summed to the 2,000-row query cap under a 5,616 headline; every rate deflated 2.8x",
		read: async () => {
			const t = (await getJson("/api/analyze?dimension=toolchain")).toolchain;
			if (!t?.byVersionStatus) return [];
			return [
				{
					scope: "byVersionStatus",
					parts: t.byVersionStatus,
					total: Number(t.measuredRepos ?? t.scannedRepos ?? 0),
				},
			];
		},
	},
	{
		name: "stablecoin byBasis sums to returned",
		why: "a basis partition served beside tracked/total/returned — three denominators to pick from, and the spec says which: RETURNED. This guard first paired it with tracked and flagged a correct surface",
		read: async () => {
			const c = (await getJson("/api/stablecoins?limit=1")).meta.counts;
			return c?.byBasis
				? [
						{
							scope: "byBasis",
							parts: c.byBasis,
							total: Number(c.returned ?? 0),
						},
					]
				: [];
		},
	},
	{
		name: "quality findings open + refreshQueue + cleared + verified = total",
		why: "entities.json states it in its own `states` field: open + refreshQueue + cleared + verified = total, disjoint. This guard first shipped with three states and flagged the artifact — the guard was wrong, the data was right",
		read: async () => {
			const p = "improvements/quality/entities.json";
			if (!existsSync(p)) throw new Error(`missing ${p}`);
			const f = JSON.parse(readFileSync(p, "utf8")).findings;
			return [
				{
					scope: "findings",
					parts: {
						open: f.open,
						refreshQueue: f.refreshQueue ?? 0,
						cleared: f.cleared,
						verified: f.verified,
					},
					total: Number(f.total),
				},
			];
		},
	},
];

(async () => {
	const results: {
		name: string;
		scope: string;
		status: "pass" | "FAIL" | "could-not-check";
		sum?: number;
		total?: number;
		detail?: string;
	}[] = [];
	for (const p of PARTITIONS) {
		let rows: Awaited<ReturnType<Part["read"]>>;
		try {
			rows = await p.read();
		} catch (e) {
			results.push({
				name: p.name,
				scope: "-",
				status: "could-not-check",
				detail: String((e as Error).message).slice(0, 120),
			});
			continue;
		}
		if (!rows.length) {
			results.push({
				name: p.name,
				scope: "-",
				status: "could-not-check",
				detail: "surface returned no partition to check",
			});
			continue;
		}
		for (const r of rows) {
			const s = sum(r.parts);
			results.push({
				name: p.name,
				scope: r.scope,
				status: s === r.total ? "pass" : "FAIL",
				sum: s,
				total: r.total,
				detail:
					s === r.total
						? undefined
						: `${JSON.stringify(r.parts)} sums to ${s}, denominator is ${r.total}`,
			});
		}
	}
	const fails = results.filter((r) => r.status === "FAIL");
	const cnc = results.filter((r) => r.status === "could-not-check");
	const report = {
		generatedAt: new Date().toISOString(),
		base: BASE,
		checked: results.length,
		pass: results.length - fails.length - cnc.length,
		fail: fails.length,
		couldNotCheck: cnc.length,
		results,
	};
	writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);
	if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
	else {
		for (const r of results)
			console.log(
				`  ${r.status === "pass" ? "✓" : r.status === "FAIL" ? "✗" : "?"} ${r.name} · ${r.scope}${r.detail ? ` — ${r.detail}` : ""}`,
			);
		console.log(
			`\n${fails.length ? "RED" : cnc.length === results.length ? "COULD NOT CHECK" : "GREEN"}: ${report.pass} pass · ${fails.length} fail · ${cnc.length} could-not-check`,
		);
	}
	// A fail is a broken invariant. Could-not-check on EVERYTHING is an instrument
	// failure and gets its own exit code so nobody reads it as green or as red.
	process.exit(fails.length ? 1 : cnc.length === results.length ? 2 : 0);
})();
