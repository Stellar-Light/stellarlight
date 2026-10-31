/**
 * API drift guard — asserts the THREE sources of truth agree:
 *   live API  ⇄  OpenAPI spec (/api/openapi.json)  ⇄  skill docs (/skills/*)
 *
 * Built in response to a downstream consumer's discrepancy report (2026-06-20):
 * the API had drifted from the spec + skill docs as endpoints/params were added.
 * This catches that class of drift before it ships.
 *
 *   SCOUT_BASE=https://stellarlight.xyz npx tsx scripts/check-api-drift.ts
 *
 * Exits non-zero on any drift. Wired into CI (.github/workflows/api-drift.yml).
 * No DB / auth needed — everything is fetched from the public live API.
 */

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";

import { type NightlyFailure, writeNightlyFindings } from "./nightly-findings";

let failures = 0;
let passes = 0;
let unchecked = 0;
const failRows: NightlyFailure[] = [];
function ok(name: string) {
	passes++;
	console.log(`  ✓ ${name}`);
}
function bad(name: string, detail: string) {
	failures++;
	failRows.push({ probe: name, note: detail });
	console.log(`  ✗ ${name}\n      ${detail}`);
}
function check(name: string, cond: boolean, detail = "") {
	cond ? ok(name) : bad(name, detail);
}
/** The API answered without the fact the check compares (a partial page):
 * neither a pass nor drift, so it is counted apart from both. */
function couldNotCheck(name: string, detail: string) {
	unchecked++;
	console.log(`  ? ${name}\n      could not check: ${detail}`);
}

// stellarlight-* UA → uaBucket "probe": keeps this daily guard out of
// Engine D's demand mining (the residual `other` bucket ≈ Raven traffic).
const UA = { "User-Agent": "stellarlight-drift-guard" };

async function getJson(path: string): Promise<{ status: number; body: any }> {
	const res = await fetch(`${BASE}${path}`, {
		headers: { Accept: "application/json", ...UA },
	});
	let body: any = null;
	try {
		body = await res.json();
	} catch {
		/* non-JSON */
	}
	return { status: res.status, body };
}
async function statusOf(path: string): Promise<number> {
	const res = await fetch(`${BASE}${path}`, { method: "GET", headers: UA });
	return res.status;
}
async function headerOf(path: string, name: string): Promise<string | null> {
	const res = await fetch(`${BASE}${path}`, { method: "GET", headers: UA });
	return res.headers.get(name);
}

async function main() {
	console.log(`API drift guard — ${BASE}\n`);

	const spec = (await getJson("/api/openapi.json")).body;
	const status = (await getJson("/api/status")).body;

	// ── 1. Spec ⇄ /api/status endpoint registry agree ──────────────────────
	console.log("◆ Spec ⇄ status endpoint registry");
	const specPaths = Object.keys(spec?.paths ?? {});
	const statusEndpoints: string[] = status?.endpoints ?? [];
	for (const p of specPaths) {
		check(
			`status.endpoints lists ${p}`,
			statusEndpoints.includes(p),
			`OpenAPI documents ${p} but /api/status.endpoints[] omits it`,
		);
	}
	for (const e of statusEndpoints) {
		check(
			`OpenAPI documents ${e}`,
			specPaths.includes(e),
			`/api/status advertises ${e} but the OpenAPI spec omits it`,
		);
	}

	// ── 1b. Every public GET endpoint emits X-API-Version + CORS ────────────
	// next.config.mjs enumerates the public API; an endpoint that ships without
	// being added there silently loses CORS + the version header (the
	// repos/search + changelog + explain drift a consumer flagged 2026-06-27).
	// Headers are path-based, so a bare probe carries them regardless of status,
	// and a path parameter can be any segment: skipping {param} paths hid
	// /api/hackathons/builds/{id} shipping without either header (2026-10-31).
	console.log("◆ Public GET endpoints emit X-API-Version + CORS");
	const getPaths = specPaths.filter((p) => spec.paths[p]?.get);
	for (const p of getPaths) {
		const probe = p.replace(/\{[^}]+\}/g, "drift-probe");
		// The publicApi[] entry to add, in Next.js source syntax.
		const source = p.replace(/\{([^}]+)\}/g, ":$1");
		const ver = await headerOf(probe, "x-api-version");
		check(
			`${p} emits X-API-Version`,
			ver === "1",
			`got "${ver ?? "none"}" — add "${source}" to next.config.mjs publicApi[]`,
		);
		const origin = await headerOf(probe, "access-control-allow-origin");
		check(
			`${p} emits CORS (Access-Control-Allow-Origin)`,
			origin === "*",
			`got "${origin ?? "none"}" — add "${source}" to next.config.mjs publicApi[]`,
		);
	}

	// ── 2. Populated collections must not read as empty ─────────────────────
	console.log("◆ Data presence (no false-empty)");
	const sources: Array<{ name: string; count: number | null }> =
		status?.sources ?? [];
	for (const name of ["projects", "builders", "repos"]) {
		const src = sources.find((s) => s.name === name);
		check(
			`status.sources has a populated '${name}'`,
			!!src && (src.count ?? 0) > 0,
			`source '${name}' missing or count=${src?.count} (consumers infer the collection is empty)`,
		);
	}
	// builders advisory on a filter miss must NOT claim the directory is empty
	const builders = (await getJson("/api/builders?skill=__nope__zzz__")).body;
	const adv: string = builders?.meta?.advisory?.summary ?? "";
	const buildersCount = sources.find((s) => s.name === "builders")?.count ?? 0;
	check(
		"builders filter-miss advisory frames it as a filter miss, not an empty directory",
		buildersCount === 0 ||
			/filter miss|matched this query|matched this filter/i.test(adv),
		`advisory says "${adv.slice(0, 90)}..." while ${buildersCount} builders exist — it must say it's a filter miss, not claim the directory is empty`,
	);

	// ── 2b. Hackathon winners are placement-sorted with a numeric rank ───────
	// A consumer (Raven) couldn't ground winner-order claims because the array
	// was scrambled with only a string label. winners[] must be sorted by
	// placementRank ascending, and winners[0] must carry a rank.
	console.log("◆ Hackathon winners placement-sorted");
	const hk = (await getJson("/api/hackathons/stellar-hacks-kale-reflector"))
		.body;
	const wns: Array<{ placementRank?: number | null; name?: string }> =
		hk?.winners ?? [];
	if (wns.length > 1) {
		const ranks = wns.map((w) => w.placementRank ?? 9999);
		const sorted = ranks.every((r, i) => i === 0 || ranks[i - 1] <= r);
		check(
			"hackathon winners[] is sorted by placementRank (winners[0] = best)",
			sorted,
			`winner ranks out of order: [${ranks.join(", ")}] — rankAndSort regressed`,
		);
		check(
			"hackathon winners carry a numeric placementRank",
			typeof wns[0].placementRank === "number",
			`winners[0] (${wns[0]?.name}) has placementRank=${wns[0]?.placementRank} — the field is missing`,
		);
	}

	// ── 2c. Every ranked prize tier has its winner (sls-092) ─────────────────
	// Stellar Hacks: Blend served a First Place tier and no rank-1 winner: the
	// winning submission had also entered a later event, which kept it. An
	// event whose winners carry ranks must have a winner at every ranked tier.
	console.log("◆ Ranked prize tiers each have a winner");
	const events: Array<{ slug?: string }> =
		(await getJson("/api/hackathons")).body?.hackathons ?? [];
	const holes: string[] = [];
	const explained: string[] = [];
	let ranked = 0;
	for (const ev of events) {
		if (!ev.slug) continue;
		const d = (await getJson(`/api/hackathons/${ev.slug}`)).body;
		const got = new Set(
			(d?.winners ?? [])
				.map((w: { placementRank?: unknown }) => w.placementRank)
				.filter((r: unknown) => typeof r === "number"),
		);
		const tiers: Array<{ rank?: unknown }> = d?.hackathon?.prizeTiers ?? [];
		// Unranked winners or no tiers: nothing this rule can check.
		if (!got.size || !tiers.length) continue;
		ranked++;
		// A rank held by a winner its team hid on DoraHacks is explained by
		// the record (stats.hiddenWinners and winnersNote), not a hole.
		const hiddenRanks = new Set(
			(d?.hackathon?.stats?.hiddenWinners ?? [])
				.map((h: { placementRank?: unknown }) => h.placementRank)
				.filter((r: unknown) => typeof r === "number"),
		);
		const missing = tiers
			.map((t) => t.rank)
			.filter((r) => typeof r === "number" && !got.has(r));
		const unexplained = missing.filter((r) => !hiddenRanks.has(r));
		if (unexplained.length)
			holes.push(`${ev.slug} (rank ${unexplained.join(", ")})`);
		else if (missing.length)
			explained.push(`${ev.slug} (rank ${missing.join(", ")})`);
	}
	if (explained.length)
		console.log(
			`  held by a winner its team hid on DoraHacks: ${explained.join("; ")}`,
		);
	check(
		`every ranked prize tier has a winner at its rank (${ranked} events with ranked winners)`,
		ranked > 0 && holes.length === 0,
		ranked
			? `no winner at: ${holes.join("; ")}`
			: "no event with ranked winners was read, so the rule checked nothing",
	);

	// ── 2d. Raven findings stay fixed (sls-090, sls-093) ───────────────────
	// Live regression checks for two findings closed on 2026-10-15: research
	// finds a named advisory exactly and says exactMiss for an absent one,
	// and each row's exactKeys says whether it is the record or a neighbour;
	// repo search labels a spelling-corrected match `corrected`.
	console.log("◆ Raven findings stay fixed");
	const ghsa = (await getJson("/api/research?q=GHSA-96xm-fv9w-pf3f&limit=3"))
		.body;
	const absent = (await getJson("/api/research?q=CVE-2099-00001&limit=3")).body;
	const strupey = (await getJson("/api/repos/search?q=strupey&limit=5")).body;
	// sls-092: Build on Stellar Chile has 15 winners on DoraHacks; one team
	// hid its submission. Served plus hidden stays 15 whether or not it is
	// hidden again, and drops to 14 if the record stops naming it.
	const chile = (await getJson("/api/hackathons/buildonstellarchile")).body
		?.hackathon?.stats;
	const stroopy = (await getJson("/api/repos/search?q=stroopy&limit=5")).body;
	// sls-094: a typo-distance name recovery reads `corrected`, not strict.
	const frieghter = (await getJson("/api/projects/search?q=frieghter&limit=5"))
		.body;
	const freighter = (await getJson("/api/projects/search?q=freighter&limit=5"))
		.body;
	if (
		[ghsa, absent, strupey, stroopy, frieghter, freighter].some(
			(b) => b?.meta?.partial === true,
		)
	)
		couldNotCheck(
			"Raven sls-090 / sls-093 / sls-094 regressions",
			"a page was partial (a backend read failed)",
		);
	else {
		const neighbours: Array<{ exactKeys?: unknown }> = absent?.results ?? [];
		check(
			"sls-090: a named GHSA advisory is found first, its row carries the id in exactKeys, with no exactMiss",
			/GHSA-96xm-fv9w-pf3f/i.test(String(ghsa?.results?.[0]?.title ?? "")) &&
				(ghsa?.results?.[0]?.exactKeys ?? []).includes("GHSA-96xm-fv9w-pf3f") &&
				!ghsa?.meta?.exactMiss,
			`top row "${ghsa?.results?.[0]?.title}", exactKeys ${JSON.stringify(ghsa?.results?.[0]?.exactKeys ?? null)}, exactMiss ${JSON.stringify(ghsa?.meta?.exactMiss?.identifiers ?? null)}`,
		);
		check(
			"sls-090: an absent CVE id is an exactMiss, and every row is marked a neighbour (exactKeys [])",
			(absent?.meta?.exactMiss?.identifiers ?? []).includes("CVE-2099-00001") &&
				neighbours.length > 0 &&
				neighbours.every(
					(r) => Array.isArray(r.exactKeys) && r.exactKeys.length === 0,
				),
			`exactMiss ${JSON.stringify(absent?.meta?.exactMiss ?? null)}, rows ${neighbours.length}, exactKeys ${JSON.stringify(neighbours.map((r) => r.exactKeys ?? null))}`,
		);
		if (chile?.hiddenWinners === null)
			couldNotCheck(
				"sls-092: Build on Stellar Chile serves or names all 15 winners",
				"its hidden-winner read failed",
			);
		else
			check(
				"sls-092: Build on Stellar Chile serves or names all 15 winners",
				Array.isArray(chile?.hiddenWinners) &&
					chile.winners + chile.hiddenWinners.length === 15 &&
					(chile.hiddenWinners.length === 0) === (chile.winnersNote === null),
				`winners ${chile?.winners}, hiddenWinners ${JSON.stringify(chile?.hiddenWinners)}, winnersNote ${JSON.stringify(chile?.winnersNote)}`,
			);
		check(
			"sls-093: repo search labels a spelling-corrected match `corrected`",
			strupey?.meta?.matchMode === "corrected" &&
				stroopy?.meta?.matchMode === "strict",
			`strupey ${strupey?.meta?.matchMode}, stroopy ${stroopy?.meta?.matchMode}`,
		);
		check(
			"sls-094: project search labels a typo-distance name recovery `corrected`",
			frieghter?.meta?.matchMode === "corrected" &&
				frieghter?.meta?.didYouMean?.to === "Freighter" &&
				freighter?.meta?.matchMode === "strict" &&
				!freighter?.meta?.didYouMean,
			`frieghter ${frieghter?.meta?.matchMode} (didYouMean ${frieghter?.meta?.didYouMean?.to ?? null}), freighter ${freighter?.meta?.matchMode}`,
		);
	}

	// ── 3. Filters actually filter (not silently ignored) ───────────────────
	console.log("◆ Filters apply (no silent no-op)");
	const baseMeta = (await getJson("/api/projects/search?q=wallet&limit=1")).body
		?.meta;
	const scfMeta = (
		await getJson("/api/projects/search?q=wallet&scfAwarded=true&limit=1")
	).body?.meta;
	const baseTotal = baseMeta?.counts?.total;
	const scfTrue = scfMeta?.counts?.total;
	// A partial page (a backend read failed) serves total null, and null < n
	// reads as "filter ignored". No count to compare is could-not-check.
	if (
		baseMeta?.partial === true ||
		scfMeta?.partial === true ||
		baseTotal == null ||
		scfTrue == null
	)
		couldNotCheck(
			"projects/search scfAwarded=true filters (boolean form honored)",
			`unfiltered total ${baseTotal} (partial ${baseMeta?.partial}), scfAwarded=true total ${scfTrue} (partial ${scfMeta?.partial})`,
		);
	else
		check(
			"projects/search scfAwarded=true filters (boolean form honored)",
			typeof scfTrue === "number" && scfTrue < baseTotal,
			`scfAwarded=true total ${scfTrue} == unfiltered ${baseTotal} (filter ignored)`,
		);

	// ── 4. Invalid filter values reject with 400 + validX ───────────────────
	console.log("◆ Invalid values rejected (400 + validX)");
	const invalidCases: Array<[string, string]> = [
		["/api/hackathons?status=__bad__", "hackathons status"],
		["/api/research?q=x&source=__bad__", "research source"],
		["/api/skills?source=__bad__", "skills source"],
		["/api/rfps?category=__bad__", "rfps category"],
		["/api/leaderboard?sort=__bad__", "leaderboard sort"],
		["/api/leaderboard?range=__bad__", "leaderboard range"],
		["/api/leaderboard?category=__bad__", "leaderboard category"],
		["/api/leaderboard?format=__bad__", "leaderboard format"],
		["/api/projects/search?q=dex&category=__bad__", "projects/search category"],
		["/api/clusters?dimension=__bad__", "clusters dimension"],
	];
	for (const [path, label] of invalidCases) {
		const code = await statusOf(path);
		check(`${label} invalid value → 400`, code === 400, `got ${code}`);
	}

	// ── 5. No-query project search is honest ────────────────────────────────
	console.log("◆ No-query guard");
	const bare = (await getJson("/api/projects/search?limit=3")).body;
	check(
		"bare projects/search returns no_query (not the full directory)",
		bare?.meta?.error === "no_query" && (bare?.projects?.length ?? 0) === 0,
		`error=${bare?.meta?.error} projects=${bare?.projects?.length}`,
	);

	// ── 6. OpenAPI documents the params the API honors ──────────────────────
	console.log("◆ OpenAPI param completeness");
	const rfpsParams = (spec?.paths?.["/api/rfps"]?.get?.parameters ?? []).map(
		(p: any) => p.name || p.$ref,
	);
	check(
		"OpenAPI rfps documents category",
		rfpsParams.some((p: string) => p === "category"),
		`rfps params: ${rfpsParams.join(",")}`,
	);
	const lbParams = (
		spec?.paths?.["/api/leaderboard"]?.get?.parameters ?? []
	).map((p: any) => p.name || p.$ref);
	for (const need of ["sort", "range", "category"]) {
		check(
			`OpenAPI leaderboard documents ${need}`,
			lbParams.includes(need),
			`leaderboard params: ${lbParams.join(",")}`,
		);
	}
	check(
		"OpenAPI leaderboard dropped the inert 'include'",
		!lbParams.includes("include"),
		"include is a documented no-op",
	);

	// ── 6b. Response FIELD coverage: live row keys ⊆ documented properties ──
	// The class behind the 2026-07-08 drift event: #353 removed anchorProfile
	// from the spec's Project component while the live rows kept carrying it
	// (plus canonicalSlug/lifecycle, never documented) — downstream catalogs
	// generated from our spec then under-described reality, and the consumer's
	// drift detector caught it before we did. Assert every field a live row
	// actually serves is documented. One direction only: spec props MISSING
	// from a sampled row are fine (conditional fields like placementRank).
	console.log("◆ Response field coverage (live ⊆ spec)");
	const fieldCoverage: Array<{
		name: string;
		path: string;
		listKey: string;
		component: string;
	}> = [
		{
			name: "searchProjects row",
			// etherfuse: an Anchor-typed row, so conditional joins (anchorProfile,
			// coverage) are populated and their absence from the spec is caught.
			path: "/api/projects/search?q=etherfuse&limit=3",
			listKey: "projects",
			component: "Project",
		},
		{
			name: "partners row",
			path: "/api/partners?all=1&limit=3",
			listKey: "partners",
			component: "Partner",
		},
		{
			name: "audits row",
			path: "/api/audits?limit=3",
			listKey: "audits",
			component: "Audit",
		},
		{
			// audit-source query so the audit-only metadata fields (auditor/
			// protocol/severity) are populated and their absence would be caught.
			name: "research row",
			path: "/api/research?q=blend%20audit&source=audit&limit=3",
			listKey: "results",
			component: "ResearchResult",
		},
		{
			name: "builders row",
			path: "/api/builders?q=soroban&limit=3",
			listKey: "builders",
			component: "Builder",
		},
		{
			name: "people row",
			path: "/api/people?limit=3",
			listKey: "people",
			component: "Person",
		},
		{
			name: "rfps row",
			path: "/api/rfps",
			listKey: "rfps",
			component: "Rfp",
		},
		{
			name: "hackathons row",
			path: "/api/hackathons",
			listKey: "hackathons",
			component: "Hackathon",
		},
		{
			name: "skills row",
			path: "/api/skills",
			listKey: "skills",
			component: "Skill",
		},
		{
			name: "clusters row",
			path: "/api/clusters?dimension=types",
			listKey: "clusters",
			component: "Cluster",
		},
		{
			name: "leaderboard row",
			path: "/api/leaderboard?limit=3",
			listKey: "projects",
			component: "LeaderboardProject",
		},
	];
	for (const fc of fieldCoverage) {
		try {
			const live = await getJson(fc.path);
			const rows: any[] = live.body?.[fc.listKey] ?? [];
			const documented = new Set(
				Object.keys(
					spec?.components?.schemas?.[fc.component]?.properties ?? {},
				),
			);
			if (!rows.length || documented.size === 0) {
				bad(
					`${fc.name} field coverage`,
					`no sample rows (${rows.length}) or empty spec component '${fc.component}' (${documented.size} props)`,
				);
				continue;
			}
			const liveKeys = new Set(rows.flatMap((r) => Object.keys(r ?? {})));
			const undocumented = [...liveKeys].filter((k) => !documented.has(k));
			check(
				`${fc.name}: every live field documented in ${fc.component}`,
				undocumented.length === 0,
				`live-but-undocumented: ${undocumented.join(", ")}`,
			);
		} catch (err) {
			bad(`${fc.name} field coverage`, `probe failed: ${String(err)}`);
		}
	}

	// ── 7. Feedback contract: GET + 201 + nested context ────────────────────
	console.log("◆ Feedback contract");
	check(
		"GET /api/feedback documented",
		!!spec?.paths?.["/api/feedback"]?.get,
		"GET works live but isn't in the spec",
	);
	check(
		"feedback POST success code is 201",
		Object.keys(spec?.paths?.["/api/feedback"]?.post?.responses ?? {}).includes(
			"201",
		),
		"spec says 200 but the endpoint returns 201",
	);
	check(
		"FeedbackRequest nests reporting context under 'context'",
		!!spec?.components?.schemas?.FeedbackRequest?.properties?.context,
		"spec is flat but the live POST + GET self-schema are nested",
	);

	// ── 8. Counts are not hardcoded into prose (drift magnets) ──────────────
	console.log("◆ No hardcoded stale counts");
	const infoDesc = JSON.stringify(spec?.info ?? {});
	check(
		"OpenAPI info does not hardcode a project count",
		!/\b\d{3,}\+? curated/i.test(infoDesc) && !/~?741/.test(infoDesc),
		"counts drift — source them from /api/status instead",
	);
	const skillDoc = await (
		await fetch(`${BASE}/skills/stellar-scout.md`)
	).text();
	for (const stale of [
		"currently empty pending",
		"~1,900",
		"7 official Stellar Foundation",
	]) {
		check(
			`skill doc free of stale phrase "${stale}"`,
			!skillDoc.includes(stale),
			"served skill doc still carries a stale claim",
		);
	}

	// ── 9. Every JSON endpoint parses under a STRICT parser ─────────────────
	// A downstream integrator hit /api/rfps returning a raw control/separator
	// char (U+2028/U+2029/U+0085 pass through JSON.stringify) that broke jq +
	// Python json.loads. Assert the raw bytes parse strictly + carry no raw
	// separators, across the text-heavy endpoints.
	console.log("◆ Strict JSON parseability");
	const jsonEndpoints = [
		"/api/rfps",
		"/api/research?q=stellar",
		"/api/projects/search?q=wallet",
		"/api/clusters",
		"/api/builders?limit=5",
		"/api/hackathons",
		"/api/leaderboard?limit=5",
		"/api/changes?since=2026-08-01&limit=5",
	];
	const SEP = [0x85, 0x2028, 0x2029];
	for (const ep of jsonEndpoints) {
		let raw = "";
		try {
			raw = await (await fetch(`${BASE}${ep}`)).text();
			JSON.parse(raw); // throws on any unescaped control char
			const hasRawSep = [...raw].some((c) => SEP.includes(c.charCodeAt(0)));
			check(
				`${ep} is strict-parseable JSON`,
				!hasRawSep,
				"contains a raw U+2028/U+2029/U+0085 separator",
			);
		} catch (e) {
			bad(
				`${ep} is strict-parseable JSON`,
				`JSON.parse failed: ${(e as Error).message.slice(0, 80)}`,
			);
		}
	}

	// ── 10. Cold-input footguns (from the cold-outsider audit) ──────────────
	console.log("◆ Cold-input footguns");
	// negative limit must not overrun the page
	const negLimit = (await getJson("/api/builders?limit=-5")).body?.meta?.counts
		?.returned;
	check(
		"builders negative limit is clamped (not an overrun)",
		typeof negLimit === "number" && negLimit <= 50,
		`limit=-5 returned ${negLimit}`,
	);
	const lbNeg = (await getJson("/api/leaderboard?limit=-3")).body?.projects
		?.length;
	check(
		"leaderboard negative limit is clamped",
		typeof lbNeg === "number" && lbNeg <= 50,
		`limit=-3 returned ${lbNeg}`,
	);
	// invalid enum values reject (rfps status/quarter — the silent-returns-all class)
	check(
		"rfps status=BOGUS → 400",
		(await statusOf("/api/rfps?status=BOGUS")) === 400,
	);
	check(
		"rfps quarter=BOGUS → 400",
		(await statusOf("/api/rfps?quarter=BOGUS")) === 400,
	);
	// spec ⇄ live shape: fallbackChannels is an object (matches live), matchMode enum covers live values
	const fbSpec =
		spec?.components?.schemas?.HackathonsResponse?.properties?.meta?.allOf?.[1]
			?.properties?.fallbackChannels?.type;
	check(
		"OpenAPI fallbackChannels typed as object (matches live)",
		fbSpec === "object",
		`spec says ${fbSpec}`,
	);
	const mmEnum =
		spec?.components?.schemas?.ProjectSearchResponse?.properties?.meta
			?.allOf?.[1]?.properties?.matchMode?.enum || [];
	check(
		"OpenAPI matchMode enum includes live values (all, loose-1)",
		mmEnum.includes("all") && mmEnum.includes("loose-1"),
		`enum=${mmEnum.join(",")}`,
	);

	// live enum values ⊆ spec enum (sls-082 / sls-084): the served value set
	// is what a generated client validates against. A value the handler
	// writes or accepts that the spec's enum lacks is drift even when every
	// field is present.
	const basisEnum: string[] =
		spec?.components?.schemas?.Project?.properties?.statusBasis?.enum ?? [];
	const basisLive = new Set<string>();
	for (const q of ["ACTA", "soroswap", "blend", "etherfuse", "stellar"]) {
		const rows = (await getJson(`/api/projects/search?q=${q}&limit=20`)).body
			?.projects;
		for (const r of Array.isArray(rows) ? rows : [])
			if (typeof r?.statusBasis === "string") basisLive.add(r.statusBasis);
	}
	const basisMissing = [...basisLive].filter((v) => !basisEnum.includes(v));
	check(
		"every statusBasis a SAMPLE of live search rows serves is in the spec enum",
		basisLive.size > 0 && basisMissing.length === 0,
		basisLive.size
			? `live=${[...basisLive].join(",")} missing=${basisMissing.join(",") || "none"}`
			: "no statusBasis values observed — could not check",
	);
	// The census, not a sample: /api/quality serves the corpus-wide histogram
	// of statusBasis (rowQuality.statusBasisMix). Every basis ANY row carries
	// must be in the spec enum — this is the check that does not depend on
	// which five queries happened to return a row with the new value.
	const mix = (await getJson("/api/quality")).body?.rowQuality?.statusBasisMix;
	const censusBases = Array.isArray(mix)
		? mix
				.map((m: { basis?: unknown }) => m?.basis)
				.filter((b): b is string => typeof b === "string")
		: [];
	const censusMissing = censusBases.filter((b) => !basisEnum.includes(b));
	check(
		"every statusBasis in the corpus-wide census (/api/quality statusBasisMix) is in the spec enum",
		censusBases.length > 0 && censusMissing.length === 0,
		censusBases.length
			? `census=${censusBases.join(",")} missing=${censusMissing.join(",") || "none"}`
			: "statusBasisMix absent — could not check",
	);
	// types the live rows carry ⊆ the spec's ?type enum — the direction the
	// parity tests cannot see: a value the DB holds that the contract lacks.
	const typeEnum: string[] =
		spec?.paths?.["/api/projects/search"]?.get?.parameters?.find(
			(p: { name?: string }) => p.name === "type",
		)?.schema?.enum ?? [];
	const typesLive = new Set<string>();
	for (const q of ["oracle", "wallet", "yield", "bridge", "stablecoin"]) {
		const rows = (
			await getJson(`/api/projects/search?q=${q}&limit=20&fields=slug,types`)
		).body?.projects;
		for (const r of Array.isArray(rows) ? rows : [])
			for (const t of Array.isArray(r?.types) ? r.types : [])
				if (typeof t === "string") typesLive.add(t);
	}
	const typesMissing = [...typesLive].filter((t) => !typeEnum.includes(t));
	check(
		"every types[] value the live rows carry is in the spec's ?type enum",
		typesLive.size > 0 && typesMissing.length === 0,
		typesLive.size
			? `live=${typesLive.size} values, missing=${typesMissing.join(",") || "none"}`
			: "no types values observed — could not check",
	);
	const rwaOp = spec?.paths?.["/api/rwa"]?.get;
	const rwaStateEnum: string[] =
		rwaOp?.parameters?.find((p: { name?: string }) => p.name === "state")
			?.schema?.enum ?? [];
	const rwaRowEnum: string[] =
		rwaOp?.responses?.["200"]?.content?.["application/json"]?.schema?.properties
			?.assets?.items?.properties?.state?.enum ?? [];
	const rwaLive = Object.keys(
		(await getJson("/api/rwa?limit=1")).body?.meta?.counts?.byState ?? {},
	);
	check(
		"every state /api/rwa serves is in BOTH spec enums (param + response)",
		rwaLive.length > 0 &&
			rwaLive.every((v) => rwaStateEnum.includes(v) && rwaRowEnum.includes(v)),
		`live=${rwaLive.join(",") || "none"} param=${rwaStateEnum.join(",")} response=${rwaRowEnum.join(",")}`,
	);
	for (const v of rwaLive)
		check(
			`/api/rwa?state=${v} is accepted (200)`,
			(await statusOf(`/api/rwa?state=${v}&limit=1`)) === 200,
		);

	// ── 11. Responsiveness (catches timeouts/outages, not just wrong data) ──
	// The guard verified CORRECTNESS but never hit /api/repos/search and had no
	// latency check — so it missed the day repos/search timed out (it fetched
	// the whole repo collection per call). Every endpoint must answer 200 within
	// a budget; repos/search is included explicitly.
	console.log("◆ Responsiveness (200 within budget)");
	const BUDGET_MS = 12_000;
	const timed = async (path: string): Promise<{ code: number; ms: number }> => {
		const ctrl = new AbortController();
		const timer = setTimeout(() => ctrl.abort(), BUDGET_MS);
		const t0 = Date.now();
		try {
			const res = await fetch(`${BASE}${path}`, { signal: ctrl.signal });
			return { code: res.status, ms: Date.now() - t0 };
		} catch {
			return { code: 0, ms: Date.now() - t0 };
		} finally {
			clearTimeout(timer);
		}
	};
	for (const path of [
		"/api/status",
		"/api/projects/search?q=wallet&limit=3",
		"/api/repos/search?q=oracle&limit=3",
		"/api/builders?limit=3",
		"/api/rfps",
		"/api/research?q=stellar&limit=3",
		"/api/clusters",
		"/api/leaderboard?limit=3",
		"/api/hackathons",
		"/api/skills",
	]) {
		const { code, ms } = await timed(path);
		check(
			`${path} → 200 in <${BUDGET_MS / 1000}s`,
			code === 200,
			`code=${code} after ${ms}ms`,
		);
	}

	// ── summary ─────────────────────────────────────────────────────────────
	writeNightlyFindings("api-drift", failRows);
	console.log(
		`\n${passes} passed · ${failures} failed · ${unchecked} could not check`,
	);
	if (failures > 0) process.exit(1);
}

main().catch((e) => {
	console.error("drift check crashed:", e);
	process.exit(1);
});
