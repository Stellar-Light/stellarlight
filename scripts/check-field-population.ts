/**
 * Field-population guard — asserts every ADVERTISED field actually POPULATES
 * on live rows where it must exist (known-item style, like the golden eval's
 * recall pins). Complements check-api-drift.ts: drift checks the SHAPE agrees
 * with the spec; this checks the VALUES arrive.
 *
 * Born from the 2026-08-08 contractInterface backfill: a new field can serve
 * empty forever (starved backfill, dropped write, wrong wiring) while every
 * dashboard stays green — engine-E only checks documented-vs-served shape,
 * and hand-rolled probes get the field name wrong (codeVerified vs
 * codeSignals cost an hour that day). This file is the machine-checked list.
 *
 * THE RULE (see SHIPPING.md): a PR that adds a served field MUST add a probe
 * here, pinned to a row where the field is guaranteed (a curated entry, a
 * hand-verified backfill target). Probes pin specific rows, not "any row" —
 * "some row somewhere has it" can pass while 95% of the corpus is empty.
 *
 *   SCOUT_BASE=https://stellarlight.xyz npx tsx scripts/check-field-population.ts
 *
 * Exits non-zero on any unpopulated field. Wired into api-drift.yml (daily).
 * No DB / auth / LLM — plain fetch against the public API.
 */

import { type NightlyFailure, writeNightlyFindings } from "./nightly-findings";

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";
const UA = { "User-Agent": "stellarlight-field-guard" };

interface Probe {
	/** Human name shown in the report. */
	name: string;
	/** GET path with query, e.g. /api/repos/search?q=comet&limit=5 */
	path: string;
	/** Key of the rows array in the response body. */
	rowsKey: string;
	/** Pin: [field, value] identifying THE row that must carry the field. */
	pin: [string, string];
	/** Dot path of the field that must be non-empty on the pinned row. */
	field: string;
	/** Set to the tracking issue ref while a probe is a KNOWN regression:
	 * reported daily as ⚠ (visible pressure) but non-fatal, so the guard can
	 * ship green while the fix is in flight. Remove when the issue closes. */
	knownFailing?: string;
}

/** Non-empty = not null/undefined, not "", not []. 0 and false COUNT as
 * populated (a real stored value); null-means-not-captured is the miss. */
function populated(v: unknown): boolean {
	if (v === null || v === undefined) return false;
	if (typeof v === "string") return v.length > 0;
	if (Array.isArray(v)) return v.length > 0;
	return true;
}

function dig(obj: unknown, dotPath: string): unknown {
	let cur: unknown = obj;
	for (const part of dotPath.split(".")) {
		if (cur === null || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

/** Every served field with a guaranteed-population row. Ordered by surface. */
const PROBES: Probe[] = [
	// ── repos: code-truth fields (repo-intel arc) ──────────────────────────
	{
		name: "repos.codeVerified.contractInterface (Soroban ABI, 2026-08-08)",
		path: "/api/repos/search?q=comet&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "cometdex/comet-contracts-v1"],
		field: "codeVerified.contractInterface",
	},
	{
		name: "repos.codeVerified.symbols (pub-surface names)",
		path: "/api/repos/search?q=comet&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "cometdex/comet-contracts-v1"],
		field: "codeVerified.symbols",
	},
	{
		name: "repos.knowledgeNotes (curated colibri — must always serve)",
		path: "/api/repos/search?q=colibri&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "fazzatti/colibri"],
		field: "knowledgeNotes",
	},
	{
		name: "repos.knowledgeNotes (curated creit — dupe class fixed in #783/#788)",
		path: "/api/repos/search?q=stellar-indexer-sdk&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "creit-tech/stellar-indexer-sdk"],
		field: "knowledgeNotes",
	},
	{
		name: "repos.activityState (derived tag)",
		path: "/api/repos/search?q=comet&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "cometdex/comet-contracts-v1"],
		field: "activityState",
	},
	{
		name: "projects.scfSourceUrl (provenance trio slice 1 — band, official page)",
		path: "/api/projects/search?q=band&limit=6",
		rowsKey: "projects",
		pin: ["slug", "band"],
		field: "scfSourceUrl",
	},
	{
		name: "partners.tomlFetchedAt (toml provenance, clpx)",
		path: "/api/partners?limit=60",
		rowsKey: "partners",
		pin: ["slug", "clpx"],
		field: "tomlFetchedAt",
	},
	{
		name: "repos.codeVerified.scannedRef (provenance pin, rozo)",
		path: "/api/repos/search?q=rozo-mpprouter&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "mpprouter/rozo-mpprouter"],
		field: "codeVerified.scannedRef",
	},
	{
		name: "repos.codeVerified.symbols (conformance C4, rozo)",
		path: "/api/repos/search?q=rozo-mpprouter&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "mpprouter/rozo-mpprouter"],
		field: "codeVerified.symbols",
	},
	{
		name: "repos.codeVerified.stellarDeps (conformance C4, rozo)",
		path: "/api/repos/search?q=rozo-mpprouter&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "mpprouter/rozo-mpprouter"],
		field: "codeVerified.stellarDeps",
	},
	{
		name: "repos.codeVerified.isDeployableContract (conformance C4, blend)",
		path: "/api/repos/search?q=blend&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "blend-capital/blend-contracts-v2"],
		field: "codeVerified.isDeployableContract",
	},
	{
		name: "projects.products (#742 model — dtcc announced-product record)",
		path: "/api/projects/search?q=dtcc&limit=6",
		rowsKey: "projects",
		pin: ["slug", "dtcc"],
		field: "products",
	},
	{
		name: "projects.scfConfidence (fact-confidence slice, band)",
		path: "/api/projects/search?q=band&limit=6",
		rowsKey: "projects",
		pin: ["slug", "band"],
		field: "scfConfidence.label",
	},
	{
		name: "repos.codeVerified.codeConfidence (fact-confidence slice, rozo)",
		path: "/api/repos/search?q=rozo-mpprouter&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "mpprouter/rozo-mpprouter"],
		field: "codeVerified.codeConfidence.label",
	},
	{
		name: "repos.codeVerified.sdkCapabilities (write-path fix 2026-08-12, rozo x402)",
		path: "/api/repos/search?q=rozo-mpprouter&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "mpprouter/rozo-mpprouter"],
		field: "codeVerified.sdkCapabilities",
	},
	{
		name: "repos.codeVerified.protocolCaps (sdk⇄protocol⇄CAP join, blend sdk 22)",
		path: "/api/repos/search?q=blend&limit=6",
		rowsKey: "repos",
		pin: ["fullName", "blend-capital/blend-contracts-v2"],
		field: "codeVerified.protocolCaps",
	},
	{
		name: "projects.statusBasis (sls-024 fixture — slender)",
		path: "/api/projects/search?q=slender&limit=6",
		rowsKey: "projects",
		pin: ["slug", "slender"],
		field: "statusBasis",
	},
	{
		name: "projects.statusBasis (sls-024 fixture — laina)",
		path: "/api/projects/search?q=laina&limit=6",
		rowsKey: "projects",
		pin: ["slug", "laina"],
		field: "statusBasis",
	},
	{
		name: "projects.statusBasis (sls-024 fixture — k2-lend)",
		path: "/api/projects/search?q=k2+lend&limit=6",
		rowsKey: "projects",
		pin: ["slug", "k2-lend"],
		field: "statusBasis",
	},
	{
		name: "projects.statusBasis (sls-024 fixture — orbitcdp)",
		path: "/api/projects/search?q=orbitcdp&limit=6",
		rowsKey: "projects",
		pin: ["slug", "orbitcdp"],
		field: "statusBasis",
	},
	// ── projects: SCF official-record fields ───────────────────────────────
	{
		name: "projects.scfRoundAwards (bondhive #767/#772 backfill)",
		path: "/api/projects/search?q=bondhive&limit=4",
		rowsKey: "projects",
		pin: ["slug", "bondhive"],
		field: "scfRoundAwards",
	},
	{
		name: "projects.scfRoundAwards (comet — curated SCF_FIX row)",
		path: "/api/projects/search?q=comet&limit=6",
		rowsKey: "projects",
		pin: ["slug", "comet"],
		field: "scfRoundAwards",
	},
	{
		name: "research.repo-docs (in-repo docs — indexer Blend extension guide)",
		path: "/api/research?q=stellar+indexer+blend+extension&source=repo-docs&limit=6",
		rowsKey: "results",
		pin: ["source", "repo-docs"],
		field: "url",
	},
	// ── research: CAP crosswalk fields ─────────────────────────────────────
	{
		name: "research.capStatus (cap-registry crosswalk, CAP-65 Final)",
		path: "/api/research?q=CAP-65+module+cache&limit=8",
		rowsKey: "results",
		pin: ["source", "cap"],
		field: "capStatus",
	},
	{
		name: "research.capStatus (identifier-pin path, fixed across 5 serving paths — #785)",
		path: "/api/research?q=CAP-46&limit=8",
		rowsKey: "results",
		pin: ["source", "cap"],
		field: "capStatus",
	},
];

async function main() {
	console.log(`Field-population guard — ${BASE}\n`);
	let failures = 0;
	let known = 0;
	const failRows: NightlyFailure[] = [];
	const surfaceOf = (path: string): string =>
		path.startsWith("/api/repos")
			? "code"
			: path.startsWith("/api/research")
				? "corpus"
				: path.startsWith("/api/partners")
					? "anchors"
					: "directory";
	for (const p of PROBES) {
		let detail = "";
		try {
			const res = await fetch(`${BASE}${p.path}`, {
				headers: { Accept: "application/json", ...UA },
			});
			const body = (await res.json()) as Record<string, unknown>;
			const rows = body[p.rowsKey];
			if (!Array.isArray(rows)) {
				detail = `rows key "${p.rowsKey}" missing/not array (HTTP ${res.status})`;
			} else {
				const [pinField, pinValue] = p.pin;
				const row = rows.find(
					(r) =>
						String(dig(r, pinField) ?? "").toLowerCase() ===
						pinValue.toLowerCase(),
				);
				if (!row) {
					detail = `pinned row ${pinField}=${pinValue} not in top ${rows.length} (recall regression?)`;
				} else if (!populated(dig(row, p.field))) {
					detail = `field "${p.field}" empty on pinned row (value: ${JSON.stringify(dig(row, p.field))})`;
				}
			}
		} catch (e) {
			detail = `fetch failed: ${e instanceof Error ? e.message : String(e)}`;
		}
		if (detail && p.knownFailing) {
			known++;
			failRows.push({ probe: p.name, note: detail, surface: surfaceOf(p.path), known: true });
			console.log(`  ⚠ ${p.name} (known, ${p.knownFailing})\n      ${detail}`);
		} else if (detail) {
			failures++;
			failRows.push({ probe: p.name, note: detail, surface: surfaceOf(p.path) });
			console.log(`  ✗ ${p.name}\n      ${detail}`);
		} else if (p.knownFailing) {
			console.log(`  ✓ ${p.name} — RECOVERED; close ${p.knownFailing} and drop the knownFailing marker`);
		} else {
			console.log(`  ✓ ${p.name}`);
		}
	}
	writeNightlyFindings("field-population", failRows);
	console.log(
		`\n${PROBES.length - failures - known}/${PROBES.length} populated · ${known} known-failing${failures ? " — FAILING" : ""}`,
	);
	process.exit(failures ? 1 : 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
