/**
 * Engine E — contract-honesty sweep (spec ⇄ live behavior).
 *
 *   pnpm exec tsx scripts/eval/engine-e-contract.ts [--json] [--out=path]
 *
 * The standing guard for the silent-param + advertised-but-absent classes
 * (sls-033/040/038 were instances): the OpenAPI spec advertises a param or
 * field, but the live API quietly ignores it / never serves it. Where
 * check-api-drift.ts asserts a HAND-PICKED list of known contracts (and §6b
 * covers live⊆spec for two sampled ops), Engine E derives its probes from the
 * spec itself, so every operation is swept automatically:
 *
 *   PARAM HONESTY  for every documented enum/boolean query param, probe each
 *                  valid value against a baseline call and flag params where
 *                  NO value has any observable effect on the returned rows
 *                  (byte-identical rows + counts ⇒ the param is inert). Each
 *                  enum/boolean param is also probed with one INVALID value —
 *                  a silent 200 (instead of the API's own 400+validX
 *                  convention) is the silently-ignored-filter class.
 *   FIELD HONESTY  for every operation's documented response properties (top
 *                  2 levels), one live call: documented-but-absent fields AND
 *                  live-but-undocumented fields are both drift (the #353
 *                  anchorProfile event, generalized).
 *
 * Conservative by design (never accuse on ambiguity — the SCF-crosscheck
 * calibration lesson): single-value enums whose only value may restate the
 * server default (accepting=1) go to `ambiguous`, not `silentParams`;
 * documented array-item props absent from every sampled row are reported with
 * a may-be-conditional note. POST endpoints are only probed with an EMPTY
 * body expecting a 400 — never a mutation.
 *
 * Report-only, no writes. Exit 1 iff silentParams>0 (regression signal for
 * post-deploy-eval); everything else is fix-queue material, not a red.
 */
import { writeFileSync } from "node:fs";

const BASE = (process.env.BASE_URL || "https://stellarlight.xyz").replace(
	/\/$/,
	"",
);
const JSON_OUT = process.argv.includes("--json");
const OUT_FILE = process.argv
	.find((x) => x.startsWith("--out="))
	?.slice("--out=".length);
const UA = { "User-Agent": "stellarlight-engine-e" };

/** Params whose effect is pagination/relevance, not a contract filter. */
const SKIP_PARAMS = new Set(["limit", "offset", "q"]);
// 200, not a small page: filters that bite in the TAIL are invisible on a
// short first page (the leaderboard ?range= false-positive, 2026-07-14 —
// every range value shares the same recently-active top-5 while the full
// row-set shrinks 200→39). Param-effect probes must see the whole window.
const LIMIT = 200;

/**
 * Baseline query strings for ops that need one to return rows at all
 * (projects/search 400s bare; research requires q). Everything else
 * baselines on the bare path.
 */
const BASELINE_QUERY: Record<string, string> = {
	"/api/projects/search": "q=wallet",
	"/api/repos/search": "q=soroban",
	"/api/repos/explain": "q=soroban",
	"/api/research": "q=stellar anchors",
};

// ── spec plumbing ──────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: raw OpenAPI traversal
type Json = any;

function deref(spec: Json, node: Json, depth = 0): Json {
	if (!node || typeof node !== "object" || depth > 6) return node;
	if (node.$ref && typeof node.$ref === "string") {
		const parts = node.$ref.replace(/^#\//, "").split("/");
		let cur: Json = spec;
		for (const p of parts) cur = cur?.[p];
		return deref(spec, cur, depth + 1);
	}
	if (Array.isArray(node.allOf)) {
		const merged: Json = { type: "object", properties: {}, required: [] };
		for (const branch of node.allOf) {
			const b = deref(spec, branch, depth + 1);
			Object.assign(merged.properties, b?.properties ?? {});
			merged.required.push(...(b?.required ?? []));
			if (b?.additionalProperties !== undefined)
				merged.additionalProperties = b.additionalProperties;
		}
		return merged;
	}
	return node;
}

interface Finding {
	op: string;
	param?: string;
	field?: string;
	evidence: string;
}

// ── live plumbing ──────────────────────────────────────────────────────────

async function call(
	url: string,
): Promise<{ status: number; body: Json; text: string }> {
	try {
		const res = await fetch(url, { headers: { Accept: "*/*", ...UA } });
		const text = await res.text();
		let body: Json = null;
		try {
			body = JSON.parse(text);
		} catch {
			/* non-JSON (leaderboard csv) — compare on raw text */
		}
		return { status: res.status, body, text };
	} catch (e) {
		return { status: 0, body: null, text: String(e) };
	}
}

/**
 * The comparable "rows" of a response: every top-level array plus
 * meta.counts (a filter that leaves the first page identical still moves
 * total). meta itself is EXCLUDED — it may echo the applied filter, which
 * would make every probe trivially "different".
 */
function rowsOf(r: { body: Json; text: string }): string {
	if (!r.body || typeof r.body !== "object") return r.text;
	const picked: Record<string, Json> = {};
	for (const k of Object.keys(r.body).sort()) {
		if (Array.isArray(r.body[k])) picked[k] = r.body[k];
	}
	if (r.body.meta?.counts) picked.__counts = r.body.meta.counts;
	if (Object.keys(picked).length === 0) {
		const { meta: _meta, generatedAt: _g, ...rest } = r.body;
		return JSON.stringify(rest);
	}
	return JSON.stringify(picked);
}

function withParam(pathAndQuery: string, kv: string): string {
	return `${pathAndQuery}${pathAndQuery.includes("?") ? "&" : "?"}${kv}`;
}

/** Small pool — be polite to prod. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
	const q = [...items];
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (q.length) {
				const it = q.shift();
				if (it !== undefined) await fn(it);
			}
		}),
	);
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
	console.error(`Engine E — contract-honesty sweep → ${BASE}`);
	const specRes = await call(`${BASE}/api/openapi.json`);
	if (specRes.status !== 200 || !specRes.body?.paths)
		throw new Error(`openapi.json unreadable (${specRes.status})`);
	const spec = specRes.body;

	const silentParams: Finding[] = [];
	const invalidAccepted: Finding[] = [];
	const missingFields: Finding[] = [];
	// Optional/nullable fields absent from a sample are SPEC-COMPLIANT (OpenAPI
	// lets an optional field be absent — a conditional field like meta.
	// fallbackChannels or repos/explain `note` only appears in certain response
	// states). They are NOT drift, so they don't belong in missingFields (which
	// the improvement-ledger ingests as HIGH findings). Tracked here informational
	// only. Only a REQUIRED-but-absent field is a real contract violation.
	const optionalAbsent: Finding[] = [];
	const undocumentedFields: Finding[] = [];
	const ambiguous: Finding[] = [];
	const skipped: string[] = [];
	let paramsProbed = 0;
	let fieldsChecked = 0;
	let opsTotal = 0;

	// Sample values for path-param ops, derived from the live lists so the
	// sweep needs no hardcoded slugs.
	const sample = async (path: string, key: string, field = "slug") => {
		const d = (await call(`${BASE}${path}`)).body;
		const rows: Json[] = d?.[key] ?? [];
		return rows.map((r) => r?.[field]).filter(Boolean) as string[];
	};
	const hackSlugs = await sample("/api/hackathons?limit=5", "hackathons");
	const partnerSlugs = await sample("/api/partners?all=1&limit=5", "partners");
	const skillSlugs = await sample("/api/skills", "skills");

	/** Resolve an op path to a callable path+query baseline (null = skip). */
	const baselineFor = (p: string): string | null => {
		let path = p;
		if (path.includes("{slug}") && path.startsWith("/api/hackathons")) {
			if (!hackSlugs[0]) return null;
			path = path.replace("{slug}", hackSlugs[0]);
		} else if (path.includes("{slug}") && path.startsWith("/api/partners")) {
			if (!partnerSlugs[0]) return null;
			path = path.replace("{slug}", partnerSlugs[0]);
		} else if (path.includes("{name}")) {
			if (!skillSlugs[0]) return null;
			path = path.replace("{name}", skillSlugs[0]);
		} else if (path.includes("{")) {
			return null; // unknown path param shape
		}
		const parts: string[] = [];
		if (BASELINE_QUERY[p]) parts.push(BASELINE_QUERY[p]);
		if (p === "/api/hackathons/compare") {
			if (hackSlugs.length < 2) return null;
			parts.push(`slugs=${hackSlugs.slice(0, 2).join(",")}`);
		}
		return parts.length ? `${path}?${parts.join("&")}` : path;
	};

	interface OpJob {
		opId: string;
		path: string;
		op: Json;
	}
	const getOps: OpJob[] = [];
	const postOps: OpJob[] = [];
	for (const [path, methods] of Object.entries<Json>(spec.paths)) {
		for (const method of Object.keys(methods)) {
			if (method !== "get" && method !== "post") continue;
			opsTotal++;
			const job = {
				opId: `${method.toUpperCase()} ${path}`,
				path,
				op: methods[method],
			};
			(method === "get" ? getOps : postOps).push(job);
		}
	}

	// ── PARAM HONESTY ── probe every documented enum/boolean query param.
	interface ParamJob {
		opId: string;
		baseline: string;
		hasLimit: boolean;
		name: string;
		values: string[];
		singleValueEnum: boolean;
	}
	const paramJobs: ParamJob[] = [];
	for (const { opId, path, op } of getOps) {
		const params = (op.parameters ?? []).map((p: Json) => deref(spec, p));
		const hasLimit = params.some((p: Json) => p?.name === "limit");
		const baseline = baselineFor(path);
		if (baseline === null) {
			skipped.push(`${opId} (no sample for path params)`);
			continue;
		}
		for (const p of params) {
			if (p?.in !== "query" || !p?.name || SKIP_PARAMS.has(p.name)) continue;
			const schema = deref(spec, p.schema ?? {});
			const isBool = schema?.type === "boolean";
			const enumVals: string[] | undefined = schema?.enum?.map(String);
			if (!isBool && !enumVals?.length) continue;
			paramJobs.push({
				opId,
				baseline,
				hasLimit,
				name: p.name,
				values: isBool ? ["true", "false"] : (enumVals as string[]),
				singleValueEnum: !isBool && enumVals?.length === 1,
			});
		}
	}

	const baselineCache = new Map<string, { status: number; rows: string }>();
	const fetchBaseline = async (baseline: string, hasLimit: boolean) => {
		const url = `${BASE}${hasLimit ? withParam(baseline, `limit=${LIMIT}`) : baseline}`;
		const hit = baselineCache.get(url);
		if (hit) return { url, ...hit };
		const r = await call(url);
		const entry = { status: r.status, rows: rowsOf(r) };
		baselineCache.set(url, entry);
		return { url, ...entry };
	};

	await pool(paramJobs, 4, async (job) => {
		paramsProbed++;
		const base = await fetchBaseline(job.baseline, job.hasLimit);
		if (base.status !== 200) {
			skipped.push(`${job.opId} ?${job.name} (baseline ${base.status})`);
			return;
		}
		const obs: Array<{ value: string; status: number; same: boolean }> = [];
		for (const v of job.values) {
			const r = await call(
				withParam(base.url, `${job.name}=${encodeURIComponent(v)}`),
			);
			obs.push({
				value: v,
				status: r.status,
				same: r.status === 200 && rowsOf(r) === base.rows,
			});
		}
		const inert = obs.every((o) => o.same);
		if (inert) {
			const finding: Finding = {
				op: job.opId,
				param: job.name,
				evidence: `all ${obs.length} valid value(s) [${job.values.join(", ")}] returned rows+counts byte-identical to the baseline (${base.url})`,
			};
			if (job.singleValueEnum) {
				finding.evidence += ` — single-value enum: its only value may restate the server default, so inert vs explicit-default is undecidable from outside`;
				ambiguous.push(finding);
			} else {
				silentParams.push(finding);
			}
		}
		// INVALID value must 400 (the API's own validX convention).
		const bad = await call(withParam(base.url, `${job.name}=__bogus__`));
		if (bad.status === 200) {
			invalidAccepted.push({
				op: job.opId,
				param: job.name,
				evidence: `${job.name}=__bogus__ → 200 (expected 400 + valid-values list); rows ${rowsOf(bad) === base.rows ? "identical to baseline (silently ignored)" : "differ from baseline"}`,
			});
		}
	});

	// ── FIELD HONESTY ── documented response props (top 2 levels) vs one live
	// call. Both directions are drift; array-item props absent from every
	// sampled row carry a may-be-conditional note (never a hard accusation).
	for (const { opId, path, op } of getOps) {
		const schema = deref(
			spec,
			op.responses?.["200"]?.content?.["application/json"]?.schema,
		);
		const props: Record<string, Json> | undefined = schema?.properties;
		if (!props || Object.keys(props).length === 0) {
			skipped.push(`${opId} (no documented response properties)`);
			continue;
		}
		const baseline = baselineFor(path);
		if (baseline === null) continue; // already noted in param phase
		const hasLimit = (op.parameters ?? [])
			.map((p: Json) => deref(spec, p))
			.some((p: Json) => p?.name === "limit");
		const bodyUrl = `${BASE}${hasLimit ? withParam(baseline, `limit=${LIMIT}`) : baseline}`;
		const live = await call(bodyUrl);
		const body = live.body;
		if (live.status !== 200 || !body || typeof body !== "object") {
			skipped.push(`${opId} (field check: live call ${live.status})`);
			continue;
		}

		const checkLevel = (
			docProps: Record<string, Json>,
			live: Json,
			prefix: string,
			additional: Json,
			required: string[] = [],
		) => {
			for (const key of Object.keys(docProps)) {
				fieldsChecked++;
				if (live && typeof live === "object" && !(key in live)) {
					// Required-but-absent = hard drift (missingFields). Optional-but-
					// absent = spec-compliant (a nullable field MAY be absent; it may
					// be conditional on inputs) → informational only, not a finding.
					(required.includes(key) ? missingFields : optionalAbsent).push({
						op: opId,
						field: `${prefix}${key}`,
						evidence: required.includes(key)
							? `documented as REQUIRED in the spec, absent from the live response (${bodyUrl})`
							: `documented optional field absent from this sample (${bodyUrl}) — allowed by the schema (conditional/unreached), not drift`,
					});
				}
			}
			if (live && typeof live === "object" && !additional) {
				for (const key of Object.keys(live)) {
					if (!(key in docProps)) {
						undocumentedFields.push({
							op: opId,
							field: `${prefix}${key}`,
							evidence: `served live (${bodyUrl}), missing from the spec`,
						});
					}
				}
			}
		};

		checkLevel(props, body, "", schema.additionalProperties, schema.required);
		for (const [key, raw] of Object.entries(props)) {
			const sub = deref(spec, raw);
			if (sub?.type === "object" && sub.properties && body[key]) {
				checkLevel(
					sub.properties,
					body[key],
					`${key}.`,
					sub.additionalProperties,
					sub.required,
				);
			} else if (sub?.type === "array") {
				const item = deref(spec, sub.items ?? {});
				const rows: Json[] = Array.isArray(body[key])
					? body[key].slice(0, LIMIT)
					: [];
				if (!item?.properties || rows.length === 0) continue;
				const required: string[] = item.required ?? [];
				const liveKeys = new Set<string>(
					rows.flatMap((r) => Object.keys(r ?? {})),
				);
				for (const ik of Object.keys(item.properties)) {
					fieldsChecked++;
					if (!liveKeys.has(ik)) {
						(required.includes(ik) ? missingFields : optionalAbsent).push({
							op: opId,
							field: `${key}[].${ik}`,
							evidence: required.includes(ik)
								? `documented as REQUIRED on items, absent from all ${rows.length} sampled rows (${bodyUrl})`
								: `documented optional item property absent from all ${rows.length} sampled rows (${bodyUrl}) — allowed by the schema, not drift`,
						});
					}
				}
				if (!item.additionalProperties) {
					for (const lk of liveKeys) {
						if (!(lk in item.properties)) {
							undocumentedFields.push({
								op: opId,
								field: `${key}[].${lk}`,
								evidence: `served on live rows (${bodyUrl}), missing from the spec's item schema`,
							});
						}
					}
				}
			}
		}
	}

	// ── POST safety checks ── empty body only, expecting the 400 the contract
	// owes us. NEVER a populated body (no mutations, no synthetic submissions).
	let postChecked = 0;
	for (const { opId, path } of postOps) {
		postChecked++;
		try {
			const res = await fetch(`${BASE}${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/json", ...UA },
				body: "{}",
			});
			if (res.status < 400) {
				invalidAccepted.push({
					op: opId,
					param: "(empty body)",
					evidence: `POST {} → ${res.status} (expected a 400 validation rejection)`,
				});
			}
		} catch (e) {
			skipped.push(`${opId} (POST probe failed: ${String(e).slice(0, 60)})`);
		}
	}

	const report = {
		base: BASE,
		specVersion: spec.info?.version ?? null,
		frame: {
			ops: opsTotal,
			paramsProbed,
			fieldsChecked,
			postChecked,
			skipped,
		},
		silentParams,
		invalidAccepted,
		missingFields,
		// Spec-compliant optional-absences — informational, NOT drift/findings.
		optionalAbsent,
		undocumentedFields,
		ambiguous,
	};

	if (OUT_FILE) {
		writeFileSync(OUT_FILE, JSON.stringify(report, null, 1));
		console.error(`  wrote ${OUT_FILE}`);
	} else if (JSON_OUT) {
		console.log(JSON.stringify(report, null, 1));
	} else {
		console.log(
			`# Engine E — contract honesty (spec ${report.specVersion} ⇄ ${BASE})`,
		);
		console.log(
			`frame: ${opsTotal} ops · ${paramsProbed} params probed · ${fieldsChecked} fields checked · ${postChecked} POST empty-body checks · ${skipped.length} skipped`,
		);
		const section = (title: string, rows: Finding[]) => {
			console.log(`\n## ${title} (${rows.length})`);
			for (const f of rows.slice(0, 25))
				console.log(`- ${f.op} ${f.param ?? f.field}: ${f.evidence}`);
			if (rows.length > 25) console.log(`…and ${rows.length - 25} more`);
		};
		section("SILENT PARAMS — documented, provably no effect", silentParams);
		section(
			"INVALID ACCEPTED — bogus value 200s instead of 400",
			invalidAccepted,
		);
		section("MISSING FIELDS — documented, absent live", missingFields);
		section(
			"UNDOCUMENTED FIELDS — served live, absent from spec",
			undocumentedFields,
		);
		section("AMBIGUOUS — cannot probe honestly, review by hand", ambiguous);
	}
	// silentParams are the regression signal; everything else is fix-queue.
	process.exit(silentParams.length > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("FATAL", e);
	process.exit(1);
});
