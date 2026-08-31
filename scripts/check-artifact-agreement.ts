/**
 * Two artifacts that report the SAME quantity must agree.
 *
 * /quality showed "Open findings 56 — still reproducing on the latest run" as
 * its headline verdict, directly above a guard row reading "Improvement ledger
 * · 27 open · measured 2026-08-31". Same page, same quantity, off by 29.
 *
 * Neither artifact was wrong about itself. `improvements/quality/entities.json`
 * was generated 2026-08-30T13:10 and honestly said 56; the ledger snapshot was
 * regenerated after the stale sweep and honestly said 27. The page read both
 * and presented the older one as the headline. Nothing in the pipeline required
 * them to be refreshed together, and nothing noticed they had diverged.
 *
 * This is the sibling of class 33 (provenance that doesn't cover the value):
 * there, a value borrowed a neighbour's date; here, a page carries two answers
 * to one question. Both are cases where every part is locally honest and the
 * assembled surface is not.
 *
 * The rule is narrow on purpose: only quantities that ARE the same thing by
 * definition. A guard that flags coincidentally-similar numbers would be noise.
 *
 * Read-only. Exits 1 on disagreement, 2 when an artifact is missing — an
 * unreadable file is not agreement.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const OUT = "improvements/audits/artifact-agreement-latest.json";
const JSON_OUT = process.argv.includes("--json");

type Claim = { artifact: string; path: string };
type Pair = { quantity: string; why: string; a: Claim; b: Claim };

/** Quantities two artifacts both assert, which /quality renders side by side. */
const PAIRS: Pair[] = [
	{
		quantity: "open findings",
		why: "the Verdict headline and the improvement-ledger row are the same number, rendered ~200px apart",
		a: {
			artifact: "improvements/quality/entities.json",
			path: "findings.open",
		},
		b: {
			artifact: "improvements/engine/weekly/improvement-ledger-latest.json",
			path: "open",
		},
	},
	{
		quantity: "total findings",
		why: "the denominator behind both the headline and the ledger row",
		a: {
			artifact: "improvements/quality/entities.json",
			path: "findings.total",
		},
		b: {
			artifact: "improvements/engine/weekly/improvement-ledger-latest.json",
			path: "total",
		},
	},
	{
		quantity: "verified findings",
		why: "the strong-closure count; the two artifacts disagreeing would misstate how much closure is real",
		a: {
			artifact: "improvements/quality/entities.json",
			path: "findings.verified",
		},
		b: {
			artifact: "improvements/engine/weekly/improvement-ledger-latest.json",
			path: "verified",
		},
	},
];

function read(artifact: string): unknown | null {
	if (!existsSync(artifact)) return null;
	try {
		return JSON.parse(readFileSync(artifact, "utf8"));
	} catch {
		return null;
	}
}

function dig(obj: unknown, path: string): unknown {
	return path
		.split(".")
		.reduce<unknown>(
			(o, k) =>
				o && typeof o === "object"
					? (o as Record<string, unknown>)[k]
					: undefined,
			obj,
		);
}

const rows = PAIRS.map((p) => {
	const da = read(p.a.artifact);
	const db = read(p.b.artifact);
	const va = da === null ? null : dig(da, p.a.path);
	const vb = db === null ? null : dig(db, p.b.path);
	const readable = va !== undefined && va !== null && vb !== undefined && vb !== null;
	return { ...p, valueA: va ?? null, valueB: vb ?? null, readable, agrees: readable && va === vb };
});

const unreadable = rows.filter((r) => !r.readable);
const disagree = rows.filter((r) => r.readable && !r.agrees);

const artifact = {
	asOf: new Date().toISOString(),
	source: "scripts/check-artifact-agreement.ts",
	checked: rows.length,
	agreeing: rows.filter((r) => r.agrees).length,
	disagreements: disagree.map((r) => ({
		quantity: r.quantity,
		[r.a.artifact]: r.valueA,
		[r.b.artifact]: r.valueB,
		why: r.why,
	})),
};

if (JSON_OUT) {
	writeFileSync(OUT, `${JSON.stringify(artifact, null, "\t")}\n`);
	console.log(`wrote ${OUT}`);
}

// An artifact we cannot read is not agreement. Same rule as everywhere else:
// no measurement, no verdict.
if (unreadable.length > 0) {
	console.error(
		`INCONCLUSIVE: could not read ${unreadable.length} claim(s):\n${unreadable
			.map((r) => `  ${r.quantity}: ${r.a.artifact}#${r.a.path} / ${r.b.artifact}#${r.b.path}`)
			.join("\n")}`,
	);
	process.exit(2);
}

if (disagree.length > 0) {
	if (!JSON_OUT)
		console.error(
			`\nRED: ${disagree.length} quantity/quantities reported twice with different answers:\n${disagree
				.map(
					(r) =>
						`  ${r.quantity}\n     ${r.a.artifact}#${r.a.path} = ${r.valueA}\n     ${r.b.artifact}#${r.b.path} = ${r.valueB}\n     ${r.why}\n     -> regenerate the STALER artifact; do not hand-edit either`,
				)
				.join("\n")}`,
		);
	process.exit(1);
}

if (!JSON_OUT)
	console.log(
		`GREEN: ${rows.length}/${rows.length} cross-artifact quantities agree.`,
	);
