/**
 * The research corpus's declared sources. The route validates `source` and
 * `sources` against this list and the spec spreads it, so the two cannot
 * drift (sls-082/084).
 */
export const RESEARCH_SOURCES = [
	"sdf-blog",
	"scf-handbook",
	"sep",
	"cap",
	"dev-docs",
	"paper",
	"scf-proposal",
	"lumenloop",
	"lumenloop-research",
	"repo-docs",
	"audit",
	"incident",
	"security-program",
	"sdf-org",
	"ec-developer-report",
	"release",
] as const;

/**
 * The sources a request names when it asks for several: `sources`
 * (comma-separated) and a comma in `source` are both read, trimmed and
 * de-duplicated in order. null when the request names at most one source the
 * single-source way (`source=<one>` or none), so that path stays untouched.
 */
export function requestedSources(sp: URLSearchParams): string[] | null {
	const source = sp.get("source") ?? "";
	if (!sp.has("sources") && !source.includes(",")) return null;
	const all = [sp.get("sources") ?? "", source]
		.join(",")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
	return [...new Set(all)];
}
