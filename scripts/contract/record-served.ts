/**
 * Re-record src/lib/__tests__/fixtures/served-bodies.json, the live bodies
 * src/lib/__tests__/served-bodies-spec.test.ts checks against the spec.
 *
 * Reads every URL listed there once from production (read-only, generic
 * User-Agent) and keeps only what a spec check can judge: per operation, the
 * reads and array items that serve something the earlier ones did not (a
 * key path, a JSON type, a null, an enum value). A string outside an enum
 * keeps only its first 8 characters: the check reads its type, and a token
 * id or hash at full length reads to a secret scanner as a key. A read that
 * adds nothing is dropped from the list. A read that does not answer 200
 * stays listed with its status and no body, to be read again on the next
 * run. For a new operation, add {"url": ...} entries to `reads` by hand,
 * then run:
 *   pnpm exec tsx scripts/contract/record-served.ts
 * scripts/check-api-drift.ts reads the same URLs live every day.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spec } from "../../src/lib/openapi-spec";
import { operationOf, responseSchema } from "./served-shape";

const FILE = join(
	process.cwd(),
	"src/lib/__tests__/fixtures/served-bodies.json",
);
const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";
type N = Record<string, unknown>;
type Read = { url: string; status?: number; body?: unknown };
const isObj = (v: unknown): v is N =>
	typeof v === "object" && v !== null && !Array.isArray(v);

const deref = (s: unknown): N => {
	let n: unknown = s;
	for (let i = 0; isObj(n) && n.$ref && i < 10; i++) {
		let cur: unknown = spec;
		for (const k of String(n.$ref).replace(/^#\//, "").split("/"))
			cur = isObj(cur) ? cur[k] : undefined;
		n = cur;
	}
	return isObj(n) ? n : {};
};
const parts = (s: N): N[] => [
	s,
	...["allOf", "oneOf", "anyOf"].flatMap((k) =>
		((s[k] as unknown[]) ?? []).flatMap((b) => parts(deref(b))),
	),
];
const kind = (v: unknown) =>
	v === null ? "null" : Array.isArray(v) ? "array" : typeof v;

/** Adds what `v` serves to `seen`; returns the trimmed value and how many
 * features were new. */
function trim(
	raw: unknown,
	v: unknown,
	at: string,
	seen: Set<string>,
): [unknown, number] {
	const ps = parts(deref(raw));
	let added = 0;
	const note = (f: string) => {
		if (!seen.has(f)) {
			seen.add(f);
			added++;
		}
	};
	note(`${at}:${kind(v)}`);
	if (!isObj(v) && !Array.isArray(v)) {
		if (ps.some((p) => Array.isArray(p.enum))) {
			note(`${at}=${JSON.stringify(v)}`);
			return [v, added];
		}
		return [typeof v === "string" ? v.slice(0, 8) : v, added];
	}
	if (Array.isArray(v)) {
		const items = ps.find((p) => p.items)?.items;
		const out: unknown[] = [];
		for (const item of v) {
			const [t, n] = trim(items, item, `${at}[]`, seen);
			if (n) out.push(t);
			added += n;
		}
		return [out, added];
	}
	const props: N = {};
	for (const p of ps)
		for (const [k, c] of Object.entries(
			isObj(p.properties) ? p.properties : {},
		))
			props[k] = Object.hasOwn(props, k) ? { allOf: [props[k], c] } : c;
	const open = ps.some(
		(p) =>
			p.additionalProperties !== undefined && p.additionalProperties !== false,
	);
	const extra = ps.find((p) =>
		isObj(p.additionalProperties),
	)?.additionalProperties;
	const out: N = {};
	for (const [k, c] of Object.entries(v)) {
		const known = Object.hasOwn(props, k);
		const [t, n] = trim(
			known ? props[k] : extra,
			c,
			known || !open ? `${at}.${k}` : `${at}{}`,
			seen,
		);
		// An open map's keys are data: keep only the entries that add a shape.
		if (known || !open || n) out[k] = t;
		added += n;
	}
	return [out, added];
}

const main = async () => {
	const file = JSON.parse(readFileSync(FILE, "utf8")) as { reads: Read[] };
	const seen = new Map<string, Set<string>>();
	const reads: Read[] = [];
	for (const { url } of file.reads) {
		const op = operationOf(spec, url);
		if (!op) throw new Error(`no GET operation in the spec serves ${url}`);
		const res = await fetch(`${BASE}${url}`, {
			headers: { "User-Agent": "stellarlight-scout-ingest" },
		});
		if (res.status !== 200) {
			reads.push({ url, status: res.status });
			console.log(`${res.status}  ${url}`);
			continue;
		}
		const set = seen.get(op.operationId) ?? new Set<string>();
		seen.set(op.operationId, set);
		const [body, added] = trim(
			responseSchema(spec, op.path),
			await res.json(),
			"$",
			set,
		);
		if (added) reads.push({ url, body });
		console.log(`${added ? "kept" : "drop"} ${url}`);
	}
	// One read per line: diffs stay per read (biome.json skips this file).
	const head = JSON.stringify({
		recordedAt: new Date().toISOString(),
		base: BASE,
	});
	writeFileSync(
		FILE,
		`${head.slice(0, -1)},"reads":[\n${reads.map((r) => JSON.stringify(r)).join(",\n")}\n]}\n`,
	);
};
main().catch((e) => {
	console.error(e);
	process.exit(1);
});
