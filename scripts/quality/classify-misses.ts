/**
 * Miss funnel — WHERE a known-item miss dies, measured per finding.
 *
 * "214 recall misses" is not actionable: those four words hide four
 * different problems with four different owners. Every open recall-miss is
 * replayed through the stages a query passes, and classified at the FIRST
 * stage that fails:
 *
 *   corpus      the entity is not in the directory at all — retrieval
 *               cannot fix this; it is a coverage job
 *   identity    it exists but its own exact slug does not return it —
 *               indexing/identity, the sls-033 / slug-in-haystack class
 *   admission   the natural-language query returns nothing keyword-tier —
 *               the tier ladder never let it in
 *   ranking     it IS returned for the query, just not in the top 3 —
 *               a scoring problem, the cheapest class to fix
 *   passing     no longer reproduces — the finding is stale and should clear
 *
 * Sampled, not exhaustive (each probe is 2-3 live calls); the output
 * carries its denominator.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLE = Number(process.env.MISS_SAMPLE || "80");
const UA = { "User-Agent": "stellarlight-miss-funnel" };
const get = async (path: string) => {
	try {
		const r = await fetch(`https://stellarlight.xyz${path}`, { headers: UA });
		return (await r.json()) as {
			projects?: Array<{ slug?: string }>;
			meta?: { matchMode?: string };
		};
	} catch {
		return null;
	}
};

type Finding = { id: string; source: string; probe: string; status: string };
const led = JSON.parse(
	readFileSync(
		join(process.cwd(), "improvements/ledger/findings.json"),
		"utf8",
	),
) as Finding[] | { findings: Finding[] };
const all: Finding[] = Array.isArray(led) ? led : led.findings;

// probe text looks like: `nownodes in top-3 for 'is NOWNodes live'`
const parsed = all
	.filter((f) => f.status === "open" && f.source === "engine-a-recall")
	.map((f) => {
		const m = /^(\S+)\s+in top-3 for '(.+)'$/.exec(f.probe);
		return m ? { id: f.id, slug: m[1], query: m[2] } : null;
	})
	.filter((x): x is { id: string; slug: string; query: string } => !!x);

// deterministic sample: every Nth, so a rerun covers the same set
const step = Math.max(1, Math.floor(parsed.length / SAMPLE));
const sample = parsed.filter((_, i) => i % step === 0).slice(0, SAMPLE);

type Stage = "corpus" | "identity" | "admission" | "ranking" | "passing";
const stages: Record<Stage, string[]> = {
	corpus: [],
	identity: [],
	admission: [],
	ranking: [],
	passing: [],
};

for (const p of sample) {
	const nl = await get(
		`/api/projects/search?q=${encodeURIComponent(p.query)}&limit=10`,
	);
	const rows = (nl?.projects ?? []).map((r) => String(r.slug));
	if (rows.slice(0, 3).includes(p.slug)) {
		stages.passing.push(p.slug);
		continue;
	}
	const exact = await get(
		`/api/projects/search?q=${encodeURIComponent(p.slug)}&limit=3`,
	);
	const exactRows = (exact?.projects ?? []).map((r) => String(r.slug));
	if (!exactRows.length) {
		stages.corpus.push(p.slug);
		continue;
	}
	if (!exactRows.includes(p.slug)) {
		stages.identity.push(p.slug);
		continue;
	}
	if (!rows.includes(p.slug)) {
		stages.admission.push(p.slug);
		continue;
	}
	stages.ranking.push(p.slug);
}

const MEANING: Record<Stage, { label: string; owner: string; note: string }> = {
	passing: {
		label: "no longer reproduces",
		owner: "ledger",
		note: "Fixed since the finding was filed — these should clear on the next detector run, and their presence in the open count is staleness, not debt.",
	},
	ranking: {
		label: "returned, but below top-3",
		owner: "ranking",
		note: "The row IS retrieved for the query and simply ranks too low. The cheapest class to fix, and the one scoring changes actually move.",
	},
	admission: {
		label: "not returned for the query at all",
		owner: "admission / matching",
		note: "The tier ladder never admitted the row for this phrasing, though its exact name resolves. Vocabulary, anchors, and synonym work live here.",
	},
	identity: {
		label: "own exact name does not return it",
		owner: "indexing / identity",
		note: "The record exists but cannot be found by its own identifier — the slug-in-haystack and split-identity class.",
	},
	corpus: {
		label: "not in the directory at all",
		owner: "coverage / curation",
		note: "No retrieval change can answer this. It is a coverage job: the entity must be added before any query can find it.",
	},
};

const ORDER: Stage[] = [
	"passing",
	"ranking",
	"admission",
	"identity",
	"corpus",
];
const out = {
	generatedAt: new Date().toISOString(),
	population: {
		openRecallMisses: parsed.length,
		sampled: sample.length,
		note: "A deterministic every-Nth sample of open engine-a-recall findings, each replayed live. Percentages are of the SAMPLE.",
	},
	stages: ORDER.map((s) => ({
		stage: s,
		...MEANING[s],
		count: stages[s].length,
		share: Math.round((stages[s].length / Math.max(sample.length, 1)) * 100),
		examples: stages[s].slice(0, 8),
	})),
};
writeFileSync(
	join(process.cwd(), "improvements/quality/miss-funnel.json"),
	`${JSON.stringify(out, null, 1)}\n`,
);
console.log(
	`miss-funnel: ${sample.length} of ${parsed.length} replayed — ${ORDER.map((s) => `${s} ${stages[s].length}`).join(" · ")}`,
);
