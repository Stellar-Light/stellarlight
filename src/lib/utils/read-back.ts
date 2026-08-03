/** Write-verification for recurring writers (lessons class 20 / 32).
 *
 * "The job exited 0" is evidence about the JOB, never about the DATA. Three
 * separate incidents share that root:
 *
 *   class 20  a ValidationError killed 13 writes and the re-run reported GREEN
 *             because `process.exit(0)` stomped `exitCode = 1`
 *   class 32  curate-projects logged "125 write(s) applied" while a sibling
 *             cron reverted every curated field within 24h
 *   #615      payload.update() silently DROPS keys with no schema field at that
 *             path — it reports success and persists nothing
 *
 * The last one is the nastiest: the write call resolves, the counter
 * increments, the summary says "written", and the field never existed. Nothing
 * in the writer can see it. The only thing that can is reading the row back and
 * comparing it to what was sent.
 *
 * This module is the pure comparison half, kept in src/ so it is unit-testable
 * without a Payload config. Each writer supplies the re-read.
 */

/** A field that was sent but did not come back the same. */
export interface ReadBackMismatch {
	/** Identifier of the row (slug or id) — whatever the caller keys on. */
	key: string;
	field: string;
	expected: unknown;
	actual: unknown;
}

function isDateLike(value: unknown): boolean {
	if (value instanceof Date) return true;
	if (typeof value !== "string") return false;
	// ISO-8601-ish only — avoid treating arbitrary strings as dates.
	return (
		/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(value) && !Number.isNaN(Date.parse(value))
	);
}

function sameValue(expected: unknown, actual: unknown): boolean {
	if (expected === actual) return true;

	// Null/undefined are the same absence for this purpose: Payload returns
	// null for a cleared field where the writer may have sent undefined.
	if (expected == null && actual == null) return true;
	if (expected == null || actual == null) return false;

	// Dates: compare the INSTANT, not the string. Payload can return a Date
	// object or a differently-formatted ISO string for the same moment, and
	// string equality would report a mismatch that isn't one.
	if (isDateLike(expected) && isDateLike(actual)) {
		const a =
			expected instanceof Date
				? expected.getTime()
				: Date.parse(String(expected));
		const b =
			actual instanceof Date ? actual.getTime() : Date.parse(String(actual));
		return a === b;
	}

	if (Array.isArray(expected) && Array.isArray(actual)) {
		if (expected.length !== actual.length) return false;
		return expected.every((v, i) => sameValue(v, actual[i]));
	}

	if (typeof expected === "object" && typeof actual === "object") {
		// Compare only the keys the writer SENT — Payload adds its own (id,
		// timestamps), and those are not evidence of a failed write.
		const e = expected as Record<string, unknown>;
		const a = actual as Record<string, unknown>;
		return Object.keys(e).every((k) => sameValue(e[k], a[k]));
	}

	return false;
}

/** Compare what a writer SENT against what the row actually holds now.
 *
 * Only `fields` are checked — a writer verifies the values it is responsible
 * for, not the whole document. A field listed here but absent from `sent` is
 * skipped (the writer did not claim it this run), which keeps conditional
 * writes from reporting phantom mismatches.
 */
export function diffWritten(
	key: string,
	sent: Record<string, unknown>,
	stored: Record<string, unknown> | null | undefined,
	fields: readonly string[],
): ReadBackMismatch[] {
	if (!stored)
		return [
			{
				key,
				field: "(row)",
				expected: "present after write",
				actual: "not found",
			},
		];

	const out: ReadBackMismatch[] = [];
	for (const field of fields) {
		if (!(field in sent)) continue;
		if (!sameValue(sent[field], stored[field]))
			out.push({ key, field, expected: sent[field], actual: stored[field] });
	}
	return out;
}

/** Re-read every row a writer claimed to write and diff it against what was
 * sent.
 *
 * The store read is INJECTED rather than importing Payload, for two reasons:
 * every `scripts/` module that touches Payload is currently unrunnable outside
 * CI (its `loadEnv` sits between hoisted imports, so `payload.config` evaluates
 * before the env loads), and the only way to exercise the real `--execute` path
 * would be to write to the production database. Injection means the batching,
 * paging and diffing here are covered by tests, and each caller supplies only
 * its own key lookup.
 *
 * Batched because a full enrich wave is many hundreds of rows.
 */
export async function verifyWrites(
	sent: Map<string, Record<string, unknown>>,
	fetchStored: (
		keys: string[],
	) => Promise<Map<string, Record<string, unknown>>>,
	fields: readonly string[],
	pageSize = 200,
): Promise<ReadBackMismatch[]> {
	const keys = [...sent.keys()];
	const stored = new Map<string, Record<string, unknown>>();
	for (let i = 0; i < keys.length; i += pageSize) {
		const batch = await fetchStored(keys.slice(i, i + pageSize));
		for (const [k, v] of batch) stored.set(k, v);
	}
	const out: ReadBackMismatch[] = [];
	for (const [key, data] of sent)
		out.push(...diffWritten(key, data, stored.get(key), fields));
	return out;
}

/** One-line summary for a writer's log. Truncates so a mass failure does not
 * bury the run's real output, but always states the true count. */
export function formatMismatches(
	mismatches: ReadBackMismatch[],
	max = 10,
): string {
	const shown = mismatches.slice(0, max).map((m) => {
		const exp = JSON.stringify(m.expected);
		const act = JSON.stringify(m.actual);
		return `    ${m.key}.${m.field}: sent ${exp}, stored ${act}`;
	});
	const rest =
		mismatches.length > max ? `\n    …and ${mismatches.length - max} more` : "";
	return shown.join("\n") + rest;
}
