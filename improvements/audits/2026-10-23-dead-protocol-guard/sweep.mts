// Sweep the full public corpus with the status checks (lane DQ1).
//
//   pnpm exec tsx improvements/audits/2026-10-23-dead-protocol-guard/sweep.mts \
//     <corpus.json> <llama-protocols.json> <out.json>
//
// <corpus.json> holds every public row (GET /api/projects/search?status=<s>
// for the four public statuses, read-only); <llama-protocols.json> is
// https://api.llama.fi/protocols. Each row with a DefiLlama link gets the
// llamaListing the enrich-tvl lane would write from that list under today's
// mapping (scenario B), then the real statusChecksFor runs on it. Pure:
// nothing is fetched or written but <out.json>.
import { readFileSync, writeFileSync } from "node:fs";
import {
	llamaListingOf,
	statusChecksFor,
} from "../../../src/lib/status-checks";

const [corpusPath, protocolsPath, outPath] = process.argv.slice(2);
const corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
const protocols = JSON.parse(readFileSync(protocolsPath, "utf8")) as Array<{
	slug: string;
	deprecated?: boolean | null;
	deadFrom?: string | null;
	chains?: string[];
}>;
const NOW = new Date("2026-10-23T21:00:00.000Z");
const CHECKED_AT = "2026-10-23T18:04:09.000Z";

// biome-ignore lint/suspicious/noExplicitAny: served rows
const rows: any[] = corpus.rows;
// biome-ignore lint/suspicious/noExplicitAny: served rows
const checked = rows.map((r: any) => {
	const slugs = Array.isArray(r.llamaSlugs) ? r.llamaSlugs : [];
	const doc = slugs.length
		? {
				...r,
				llamaListing: {
					...llamaListingOf(slugs, protocols),
					checkedAt: CHECKED_AT,
				},
			}
		: r;
	return { row: r, out: statusChecksFor(doc, NOW) };
});

const linked = checked.filter((c) => c.out.statusChecks);
const caveated = linked.filter((c) => c.out.statusCaveat);
const hits = linked.filter((c) =>
	c.out.statusChecks?.some((k) => k.result === "hit"),
);
const live = rows.filter((r) => r.status === "Live");
const flagship = [...live]
	.filter((r) => r.slug !== "allbridge")
	.sort(
		(a, b) =>
			(b.prominence ?? 0) - (a.prominence ?? 0) || a.slug.localeCompare(b.slug),
	)
	.slice(0, 20)
	.map((r) => r.slug);
const caveatedSlugs = new Set(caveated.map((c) => c.row.slug));
const stellarDead = protocols
	.filter(
		(p) =>
			p.chains?.includes("Stellar") && (p.deprecated === true || !!p.deadFrom),
	)
	.map((p) => ({
		slug: p.slug,
		deprecated: p.deprecated,
		deadFrom: p.deadFrom,
	}));

const out = {
	corpus: {
		start: corpus.start,
		end: corpus.end,
		rows: rows.length,
		byStatus: Object.fromEntries(
			["Live", "Pre-Release", "Development", "Inactive"].map((s) => [
				s,
				rows.filter((r) => r.status === s).length,
			]),
		),
	},
	defillama: {
		protocols: protocols.length,
		stellarChain: protocols.filter((p) => p.chains?.includes("Stellar")).length,
		stellarChainDeprecatedOrDead: stellarDead,
	},
	linkedRows: linked.length,
	caveated: caveated.map((c) => ({
		slug: c.row.slug,
		status: c.row.status,
		statusCaveat: c.out.statusCaveat,
		statusConfidence: c.out.statusConfidence,
	})),
	hits: hits.map((c) => ({
		slug: c.row.slug,
		status: c.row.status,
		checks: c.out.statusChecks,
	})),
	perLinkedRow: linked.map((c) => ({
		slug: c.row.slug,
		status: c.row.status,
		types: c.row.types,
		llamaSlugs: c.row.llamaSlugs,
		tvlUSD: c.row.tvlUSD,
		checks: c.out.statusChecks?.map((k) => `${k.check}: ${k.result}`),
		detail: c.out.statusChecks?.map((k) => k.detail),
	})),
	flagship20: flagship.map((slug) => ({
		slug,
		caveated: caveatedSlugs.has(slug),
		linked: linked.some((c) => c.row.slug === slug),
	})),
	tvlZeroRows: rows
		.filter((r) => r.tvlUSD === 0)
		.map((r) => ({ slug: r.slug, status: r.status, types: r.types })),
};
writeFileSync(outPath, `${JSON.stringify(out, null, 1)}\n`);
console.log(
	`${rows.length} rows; ${linked.length} with a DefiLlama link; ${hits.length} with a hit; ${caveated.length} caveated (${caveated.map((c) => c.row.slug).join(", ")}); flagship 20 caveated: ${out.flagship20.filter((f) => f.caveated).length}`,
);
