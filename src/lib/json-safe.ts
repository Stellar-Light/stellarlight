/**
 * Strip the characters that `JSON.stringify` emits RAW (unescaped) and that
 * then break strict / eval-based JSON consumers:
 *   - U+0085 NEL, U+2028 LINE SEPARATOR, U+2029 PARAGRAPH SEPARATOR.
 * These are legal in a JS string and valid per the JSON spec, but `eval`/JSONP
 * and some parsers reject them, and a stray one in source text yields a body
 * that fails jq / Python json.loads. (C0 controls U+0000-U+001F are already
 * escaped by JSON.stringify, so they need no handling here.)
 *
 * Built from char codes so this source file stays pure ASCII. Apply to a
 * response payload right before NextResponse.json so the endpoint parses
 * cleanly under any consumer. Reported by a downstream integrator on /api/rfps.
 */
const RAW_UNSAFE = new RegExp(`[${String.fromCharCode(0x85, 0x2028, 0x2029)}]`, "g");

export function jsonSafe<T>(value: T): T {
	if (typeof value === "string") {
		return value.replace(RAW_UNSAFE, " ") as T;
	}
	if (Array.isArray(value)) {
		return value.map((v) => jsonSafe(v)) as unknown as T;
	}
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
			out[k] = jsonSafe(v);
		}
		return out as T;
	}
	return value;
}
