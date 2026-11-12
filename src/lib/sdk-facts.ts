/**
 * Logic over the dated SDK facts in src/data/sdk-facts.ts: SDK-major
 * adoption across scanned repos, the advisories a soroban-sdk consumer
 * inherits through soroban-sdk's own dependency requirements, a reader per
 * upstream source, and the drift comparison scripts/check-sdk-facts.ts runs
 * weekly. Pure: no network here.
 */

import {
	ADVISORY_ECOSYSTEMS,
	ALSO_AFFECTS_MAX_HOPS,
	IDIOM_RELEASE_REPOS,
	IDIOMS_REVIEWED_THROUGH,
	SDK_ADVISORIES,
	SDK_PACKAGES,
	type SdkAdvisory,
	type SdkAlsoAffects,
} from "../data/sdk-facts";
import { parseSdkMajor, splitJsDep } from "./soroban-versions";

// ── Adoption ──────────────────────────────────────────────────────────────

export interface LineAdoption {
	/** Repos on this SDK line. */
	repos: number;
	/** Of those, repos whose stored requirement names a major. */
	readable: number;
	/** Newest major first; ordered by major, not a rank. share = repos /
	 * readable, to four places. */
	byMajor: Array<{ major: number; repos: number; share: number }>;
}

function tally(majors: Array<number | null>): LineAdoption {
	const counts = new Map<number, number>();
	for (const m of majors)
		if (m !== null) counts.set(m, (counts.get(m) ?? 0) + 1);
	const readable = majors.filter((m) => m !== null).length;
	return {
		repos: majors.length,
		readable,
		byMajor: [...counts]
			.sort((a, b) => b[0] - a[0])
			.map(([major, repos]) => ({
				major,
				repos,
				share: Math.round((repos / readable) * 10_000) / 10_000,
			})),
	};
}

/** soroban-sdk majors over stored requirements, read by the toolchain
 * table's own parser (the first major a requirement names; a pre-release
 * counts under its major; git, path, workspace and wildcard do not read). */
export function sorobanSdkAdoption(
	versions: Array<string | null | undefined>,
): LineAdoption {
	return tally(
		versions.filter((v): v is string => !!v).map((v) => parseSdkMajor(v)),
	);
}

// The range regex jsSdkVersionStatusOf applies (soroban-versions.ts): a
// range without a dotted version (^13) does not read. Unlike the status
// counts, which call a pre-release "unknown", a pre-release counts here under
// its major (17.0.0-rc.2 is on 17).
const JS_MAJOR = /^[\^~>=<\s]*(\d+)\./;

/** @stellar/stellar-sdk majors over stored `stellarJsDep` values. Other
 * packages and the scanner's language markers are not on this line. */
export function jsSdkAdoption(
	deps: Array<string | null | undefined>,
): LineAdoption {
	return tally(
		deps
			.map((d) => splitJsDep(d))
			.filter((p) => p?.name === "@stellar/stellar-sdk")
			.map((p) => {
				const m = JS_MAJOR.exec(p?.range ?? "");
				return m ? Number(m[1]) : null;
			}),
	);
}

// ── Upstream readers ──────────────────────────────────────────────────────

export interface RegistryReading {
	latestMajor: number;
	/** npm's deprecated message on the latest version; null when none. */
	deprecated: string | null;
	withdrawnVersions: string[];
}

const STABLE = /^(\d+)\.\d+\.\d+$/;

// biome-ignore lint/suspicious/noExplicitAny: untyped registry JSON
type Json = any;

/** An npm packument (full or abbreviated). Null when it holds no stable
 * latest version: an error body must never read as "nothing changed". */
export function readNpm(doc: Json): RegistryReading | null {
	const latest = doc?.["dist-tags"]?.latest;
	const m = typeof latest === "string" ? STABLE.exec(latest) : null;
	if (!m || typeof doc.versions !== "object") return null;
	const note = (v: Json): string | null =>
		typeof v?.deprecated === "string" && v.deprecated ? v.deprecated : null;
	const deprecated = note(doc.versions[latest]);
	return {
		latestMajor: Number(m[1]),
		deprecated,
		withdrawnVersions: deprecated
			? []
			: Object.keys(doc.versions).filter((v) => note(doc.versions[v])),
	};
}

/** A crates.io crate response (crates.io/api/v1/crates/{name}). */
export function readCrate(doc: Json): RegistryReading | null {
	const m = STABLE.exec(String(doc?.crate?.max_stable_version ?? ""));
	if (!m || !Array.isArray(doc.versions)) return null;
	return {
		latestMajor: Number(m[1]),
		deprecated: null,
		withdrawnVersions: doc.versions
			.filter((v: Json) => v?.yanked === true)
			.map((v: Json) => String(v.num)),
	};
}

/** A JSR package meta.json (jsr.io/@scope/name/meta.json). */
export function readJsr(meta: Json): RegistryReading | null {
	const m = STABLE.exec(String(meta?.latest ?? ""));
	if (!m || typeof meta.versions !== "object") return null;
	return {
		latestMajor: Number(m[1]),
		deprecated: null,
		withdrawnVersions: Object.keys(meta.versions).filter(
			(v) => meta.versions[v]?.yanked === true,
		),
	};
}

export type UpstreamAdvisory = Omit<SdkAdvisory, "asOf" | "alsoAffects"> & {
	withdrawn: boolean;
};

/** A global advisory (`/advisories`) or a repository advisory
 * (`/repos/{repo}/security-advisories`) in one shape. */
export function readAdvisory(
	raw: Json,
	source: SdkAdvisory["source"],
	repository = "",
): UpstreamAdvisory | null {
	if (typeof raw?.ghsa_id !== "string") return null;
	const patched = (v: Json): string | null => {
		const p = v?.first_patched_version ?? v?.patched_versions ?? null;
		return typeof p === "object" && p ? (p.identifier ?? null) : p;
	};
	const loc = /github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(
		String(raw.source_code_location ?? ""),
	);
	return {
		ghsa: raw.ghsa_id,
		cve: raw.cve_id ?? null,
		severity: raw.severity,
		summary: String(raw.summary ?? ""),
		source,
		url: String(raw.html_url ?? ""),
		repository: repository || loc?.[1] || "",
		publishedAt: String(raw.published_at ?? "").slice(0, 10),
		affected: (raw.vulnerabilities ?? []).map((v: Json) => ({
			ecosystem: String(v?.package?.ecosystem ?? ""),
			package: String(v?.package?.name ?? ""),
			vulnerableRange: String(v?.vulnerable_version_range ?? ""),
			firstPatched: patched(v),
		})),
		withdrawn: !!raw.withdrawn_at,
	};
}

export interface ReleaseReading {
	tag: string;
	/** ISO timestamp. */
	publishedAt: string;
	prerelease: boolean;
	/** The release notes mention a deprecation. A prompt to read them, never
	 * a parsed fact. */
	deprecates: boolean;
	url: string;
}

// ── Versions and inherited advisories ─────────────────────────────────────

type Ver = [number, number, number, string | null];

function parseVersion(v: string): Ver | null {
	const m =
		/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+\S*)?$/.exec(
			v.trim(),
		);
	return m
		? [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0), m[4] ?? null]
		: null;
}

/** Semver order; NaN when either side does not parse. */
export function compareVersions(a: string, b: string): number {
	const x = parseVersion(a);
	const y = parseVersion(b);
	if (!x || !y) return Number.NaN;
	for (const i of [0, 1, 2] as const) if (x[i] !== y[i]) return x[i] - y[i];
	if (x[3] === y[3]) return 0;
	if (x[3] === null) return 1;
	if (y[3] === null) return -1;
	// ponytail: lexical pre-release order; only stable releases are derived.
	return x[3] < y[3] ? -1 : 1;
}

/** Version v inside a GitHub advisory range (comparators joined by ", "). An
 * unreadable comparator holds nothing. */
export function inRange(range: string, v: string): boolean {
	return range.split(",").every((c) => {
		const m = /^\s*(<=|>=|<|>|=)\s*(\S+)\s*$/.exec(c);
		if (!m) return false;
		const d = compareVersions(v, m[2]);
		if (m[1] === "<") return d < 0;
		if (m[1] === "<=") return d <= 0;
		if (m[1] === ">") return d > 0;
		if (m[1] === ">=") return d >= 0;
		return d === 0;
	});
}

/** One crates.io index row (index.crates.io/so/ro/soroban-sdk: one JSON
 * object per published version). */
export interface IndexRow {
	vers: string;
	deps: Array<{
		name: string;
		req: string;
		kind?: string | null;
		target?: string | null;
		optional?: boolean;
		/** The real crate name when `name` is a rename. */
		package?: string | null;
	}>;
}

/** crates.io sparse-index URL of a crate. */
export const crateIndexUrl = (name: string) =>
	`https://index.crates.io/${name.length <= 2 ? `${name.length}` : name.length === 3 ? `3/${name[0]}` : `${name.slice(0, 2)}/${name.slice(2, 4)}`}/${name}`;

/** The crates the alsoAffects walk passes through: the publishers' own. */
export const WALKED_CRATE = /^(?:soroban|stellar)-/;

/** A crate's dependencies the walk follows: normal (not dev or build), not
 * optional, by real crate name. */
export function walkedDeps(row: IndexRow) {
	return row.deps
		.filter((d) => (d.kind ?? "normal") === "normal" && !d.optional)
		.map((d) => ({ ...d, name: d.package || d.name }));
}

/** Version v satisfies a Cargo requirement ("^1.2", "=1.2.3", "~1.2",
 * ">=1, <2", bare "1.2" = caret). A pre-release satisfies only a
 * requirement that names a pre-release. */
export function admits(req: string, v: string): boolean {
	const pv = parseVersion(v);
	if (!pv) return false;
	if (pv[3] !== null && !req.includes("-")) return false;
	return req.split(",").every((part) => {
		if (part.trim() === "*") return true;
		const m =
			/^\s*(\^|~|=|>=|<=|>|<)?\s*(\d+)(?:\.(\d+|\*))?(?:\.(\d+|\*))?(-[0-9A-Za-z.-]+)?\s*$/.exec(
				part,
			);
		if (!m) return false;
		const op = m[1] ?? "^";
		const maj = Number(m[2]);
		const min = m[3] && m[3] !== "*" ? Number(m[3]) : null;
		const pat = m[4] && m[4] !== "*" ? Number(m[4]) : null;
		const c = compareVersions(v, `${maj}.${min ?? 0}.${pat ?? 0}${m[5] ?? ""}`);
		const below = (upper: string) => compareVersions(v, upper) < 0;
		if (op === ">=") return c >= 0;
		if (op === ">") return c > 0;
		if (op === "<") return c < 0;
		if (op === "<=") return c <= 0;
		if (op === "=")
			return min === null
				? pv[0] === maj
				: pat === null
					? pv[0] === maj && pv[1] === min
					: c === 0;
		if (op === "~")
			return (
				c >= 0 && below(min === null ? `${maj + 1}.0.0` : `${maj}.${min + 1}.0`)
			);
		return (
			c >= 0 &&
			below(
				maj > 0 || min === null
					? `${maj + 1}.0.0`
					: min > 0 || pat === null
						? `0.${min + 1}.0`
						: `0.0.${pat + 1}`,
			)
		);
	});
}

const NOT_WASM = 'cfg(not(target_family="wasm"))';
const WASM_ONLY = 'cfg(target_family="wasm")';

/** The builds a path is in, from its hops' targets; null = no build takes
 * every hop (a wasm-only hop and a host-only hop). */
function appliesToOf(
	targets: Array<string | null>,
): SdkAlsoAffects["appliesTo"] | null {
	const t = targets.flatMap((x) => (x ? [x.replace(/\s+/g, "")] : []));
	const host = t.includes(NOT_WASM);
	const wasm = t.includes(WASM_ONLY);
	if (host && wasm) return null;
	if (t.some((x) => x !== NOT_WASM && x !== WASM_ONLY))
		return "builds matching every hop's target";
	if (host) return "host builds and tests, not the deployed wasm contract";
	return wasm ? "wasm contract builds only" : "every build";
}

type Hit = {
	path: string[];
	targets: Array<string | null>;
	exact: boolean;
	chain: string[];
};

/**
 * The soroban-sdk releases whose dependency tree reaches an affected version
 * of a crate an advisory names, read from the crates.io index, never
 * assumed. The walk follows normal, non-optional dependencies through
 * soroban-* and stellar-* crates, up to `maxHops` hops, and branches over
 * every published version a requirement admits. Stable root releases only.
 * Per release and build class (appliesTo) it keeps the strongest path: exact
 * before minimum, then the shortest; a class-specific path is dropped when
 * an "every build" path is at least as strong. Releases sharing a path,
 * pin and targets are grouped into runs.
 */
export function deriveAlsoAffects(
	advisory: Pick<SdkAdvisory, "affected">,
	index: Record<string, IndexRow[]>,
	opts: { root?: string; maxHops?: number } = {},
): SdkAlsoAffects[] {
	const root = opts.root ?? "soroban-sdk";
	const maxHops = opts.maxHops ?? ALSO_AFFECTS_MAX_HOPS;
	const stable = (index[root] ?? [])
		.filter((r) => parseVersion(r.vers)?.[3] === null)
		.sort((a, b) => compareVersions(a.vers, b.vers));
	if (!stable.length) return [];
	const out: SdkAlsoAffects[] = [];
	const vias = [
		...new Set(
			advisory.affected
				.filter((v) => v.ecosystem === "rust" && v.package !== root)
				.map((v) => v.package),
		),
	];
	for (const via of vias) {
		const ranges = advisory.affected
			.filter((v) => v.ecosystem === "rust" && v.package === via)
			.map((v) => v.vulnerableRange);
		const memo = new Map<string, Hit[]>();
		const walk = (crate: string, vers: string, hops: number): Hit[] => {
			const key = `${crate}@${vers}#${hops}`;
			const seen = memo.get(key);
			if (seen) return seen;
			memo.set(key, []); // a cycle reads as no hit
			const row = (index[crate] ?? []).find((r) => r.vers === vers);
			const byName = new Map<string, ReturnType<typeof walkedDeps>>();
			for (const d of row ? walkedDeps(row) : [])
				byName.set(d.name, [...(byName.get(d.name) ?? []), d]);
			const hits = new Map<string, Hit>();
			const add = (h: Hit) => {
				const k = `${h.path.join(">")}|${JSON.stringify(h.targets)}`;
				const prev = hits.get(k);
				if (!prev || (h.exact && !prev.exact)) hits.set(k, h);
			};
			for (const [name, deps] of byName) {
				if (name !== via && (hops <= 1 || !WALKED_CRATE.test(name))) continue;
				const req = deps[0].req.trim();
				const target = deps.some((d) => !d.target)
					? null
					: (deps[0].target ?? null);
				const exactEdge = /^=[^,]*$/.test(req);
				const step = `${crate} ${vers} requires ${name} ${req}`;
				const admitted = (index[name] ?? []).filter((r) => admits(req, r.vers));
				if (name === via) {
					if (admitted.some((r) => ranges.some((rg) => inRange(rg, r.vers))))
						add({
							path: [crate, name],
							targets: [target],
							exact: exactEdge,
							chain: [step],
						});
					continue;
				}
				for (const r of admitted)
					for (const sub of walk(name, r.vers, hops - 1))
						add({
							path: [crate, ...sub.path],
							targets: [target, ...sub.targets],
							exact: exactEdge && sub.exact,
							chain: [step, ...sub.chain],
						});
			}
			const list = [...hits.values()];
			memo.set(key, list);
			return list;
		};

		// Per release: the strongest path per build class.
		type Pick = Hit & { appliesTo: SdkAlsoAffects["appliesTo"] };
		const better = (a: Pick, b: Pick) =>
			a.exact !== b.exact
				? a.exact
				: a.path.length !== b.path.length
					? a.path.length < b.path.length
					: a.path.join(">") < b.path.join(">");
		const perRelease = stable.map((r) => {
			const best = new Map<string, Pick>();
			for (const h of walk(root, r.vers, maxHops)) {
				const appliesTo = appliesToOf(h.targets);
				if (!appliesTo) continue;
				const p = { ...h, appliesTo };
				const cur = best.get(appliesTo);
				if (!cur || better(p, cur)) best.set(appliesTo, p);
			}
			const every = best.get("every build");
			return [...best.values()].filter(
				(p) => p === every || !every || (p.exact && !every.exact),
			);
		});

		// Group releases sharing path, targets and pin into runs.
		const sig = (p: Pick) =>
			`${p.path.join(">")}|${JSON.stringify(p.targets)}|${p.exact}`;
		const sigs = [...new Set(perRelease.flat().map(sig))];
		for (const s of sigs) {
			let run: Array<{ vers: string; pick: Pick }> = [];
			const close = () => {
				if (!run.length) return;
				const first = run[0].vers;
				const last = run[run.length - 1];
				const p = last.pick;
				out.push({
					ecosystem: "rust",
					package: root,
					vulnerableRange:
						first === stable[0].vers
							? `<= ${last.vers}`
							: `>= ${first}, <= ${last.vers}`,
					via,
					path: p.path,
					targets: p.targets,
					pin: p.exact ? "exact" : "minimum",
					appliesTo: p.appliesTo,
					basis: `${root} ${first} to ${last.vers} (stable releases) reach ${via} through ${p.path.join(" > ")} (crates.io index: normal, non-optional dependencies). ${p.exact ? "Every hop is an exact = requirement, so these builds compile an affected version." : "At least one hop admits a range of versions, so Cargo.lock decides whether the version built is affected."} Newest release in range: ${p.chain.join(", ")}.`,
					sourceUrl: crateIndexUrl(root),
				});
				run = [];
			};
			stable.forEach((r, i) => {
				const pick = perRelease[i].find((p) => sig(p) === s);
				if (pick) run.push({ vers: r.vers, pick });
				else close();
			});
			close();
		}
	}
	return out;
}

/** Listed advisories that cover `version` of a package, through the
 * advisory's own ranges or a range soroban-sdk inherits (alsoAffects). A
 * lockfile is the better input: it names the versions actually built. */
export function advisoriesAffecting(
	ecosystem: string,
	pkg: string,
	version: string,
): SdkAdvisory[] {
	return SDK_ADVISORIES.filter((a) =>
		[...a.affected, ...a.alsoAffects].some(
			(x) =>
				x.ecosystem === ecosystem &&
				x.package === pkg &&
				inRange(x.vulnerableRange, version),
		),
	);
}

// ── Drift ─────────────────────────────────────────────────────────────────

/** Everything the weekly check read. null = that source could not be read:
 * never a finding, always reported as unchecked by the caller. */
export interface SdkUpstream {
	database: UpstreamAdvisory[] | null;
	/** Published repository advisories, keyed owner/repo. */
	repositories: Record<string, UpstreamAdvisory[] | null>;
	/** Keyed `${registry}:${name}`. */
	registries: Record<string, RegistryReading | null>;
	/** Keyed owner/repo, for IDIOM_RELEASE_REPOS. */
	releases: Record<string, ReleaseReading[] | null>;
	/** crates.io index rows of soroban-sdk and every soroban-* and
	 * stellar-* crate its normal dependencies reach, keyed by crate name, for
	 * alsoAffects. */
	crateIndex: Record<string, IndexRow[]> | null;
}

export const DRIFT_KINDS = [
	"advisory-unlisted",
	"advisory-changed",
	"advisory-not-upstream",
	"deprecation-unlisted",
	"deprecation-changed",
	"major-unlisted",
	"major-changed",
	"withdrawn-unlisted",
	"withdrawn-changed",
	"idiom-review",
	"also-affects-changed",
] as const;

export interface DriftRow {
	kind: (typeof DRIFT_KINDS)[number];
	/** GHSA id, `${registry}:${name}`, or `${repo} ${tag}`. */
	subject: string;
	detail: string;
	url: string | null;
	/** The source read behind the row (see unreadSources): "advisory-database",
	 * `repository:${repo}`, `${registry}:${name}`, `releases:${repo}` or
	 * "crates.io-index". */
	source: string;
	/** generatedAt of the run that last read this row's source; present only
	 * when this run could not read it and carried the row forward. */
	carriedFrom?: string;
}

/** owner/repo of every listed package: their repository advisories are
 * watched, so an advisory on a crate the lists do not hold yet still shows. */
export function watchedRepositories(): string[] {
	return [...new Set(SDK_PACKAGES.map((p) => p.repository))];
}

const inScope = (a: UpstreamAdvisory) =>
	!a.withdrawn &&
	a.affected.some((v) =>
		(ADVISORY_ECOSYSTEMS as readonly string[]).includes(v.ecosystem),
	);

const affectedKey = (a: Pick<SdkAdvisory, "affected">) =>
	JSON.stringify(
		a.affected
			.map((v) => [v.ecosystem, v.package, v.vulnerableRange, v.firstPatched])
			.sort(),
	);

/** What upstream holds that the facts do not, or holds differently. */
export function sdkFactsDrift(up: SdkUpstream): DriftRow[] {
	const rows: DriftRow[] = [];
	const push = (
		kind: DriftRow["kind"],
		subject: string,
		detail: string,
		url: string | null,
		source: string,
	) => rows.push({ kind, subject, detail, url, source });
	const DB = "advisory-database";

	// Advisories. The database is the authority for an advisory it holds; a
	// repository advisory counts only while the database lacks it. Only an
	// advisory on a code package (rust, npm) is in scope: a browser-extension
	// advisory is not an SDK fact.
	const db = up.database
		? new Map(up.database.filter(inScope).map((a) => [a.ghsa, a]))
		: null;
	const repo = new Map<string, UpstreamAdvisory>();
	for (const list of Object.values(up.repositories))
		for (const a of list ?? []) if (inScope(a)) repo.set(a.ghsa, a);
	const listed = new Map(SDK_ADVISORIES.map((a) => [a.ghsa, a]));

	for (const l of SDK_ADVISORIES) {
		const u =
			db?.get(l.ghsa) ??
			(l.source === "repository" ? repo.get(l.ghsa) : undefined);
		if (u) {
			const changed = [
				u.source !== l.source && `source ${l.source} -> ${u.source}`,
				u.severity !== l.severity && `severity ${l.severity} -> ${u.severity}`,
				u.cve !== l.cve && `cve ${l.cve} -> ${u.cve}`,
				affectedKey(u) !== affectedKey(l) &&
					`affected ${JSON.stringify(u.affected)}`,
			].filter(Boolean);
			if (changed.length)
				push(
					"advisory-changed",
					l.ghsa,
					changed.join("; "),
					u.url,
					u.source === "repository" ? `repository:${u.repository}` : DB,
				);
			continue;
		}
		const readable =
			l.source === "repository"
				? Array.isArray(up.repositories[l.repository])
				: db !== null;
		if (readable)
			push(
				"advisory-not-upstream",
				l.ghsa,
				l.source === "repository"
					? `${l.repository} no longer publishes it`
					: "the advisory database no longer returns it (withdrawn or removed)",
				l.url,
				l.source === "repository" ? `repository:${l.repository}` : DB,
			);
	}
	for (const u of new Map([...repo, ...(db ?? [])]).values()) {
		if (listed.has(u.ghsa)) continue;
		push(
			"advisory-unlisted",
			u.ghsa,
			`${u.severity} ${u.source} advisory on ${[...new Set(u.affected.map((v) => v.package))].join(", ")}: ${u.summary}`,
			u.url,
			u.source === "repository" ? `repository:${u.repository}` : DB,
		);
	}

	// Inherited ranges, re-derived from soroban-sdk's own requirements.
	if (up.crateIndex) {
		const key = (x: readonly SdkAlsoAffects[]) =>
			JSON.stringify([...x].map((y) => JSON.stringify(y)).sort());
		for (const l of SDK_ADVISORIES) {
			const derived = deriveAlsoAffects(l, up.crateIndex);
			if (key(derived) !== key(l.alsoAffects))
				push(
					"also-affects-changed",
					l.ghsa,
					`crates.io index now gives: ${JSON.stringify(derived.map((d) => `${d.package} ${d.vulnerableRange} via ${d.path.join(" > ")} (${d.pin}, ${d.appliesTo})`))}`,
					crateIndexUrl("soroban-sdk"),
					"crates.io-index",
				);
		}
	}

	// Registries.
	for (const p of SDK_PACKAGES) {
		const key = `${p.registry}:${p.name}`;
		const r = up.registries[key];
		if (!r) continue;
		if (r.latestMajor !== p.latestMajor)
			push(
				r.latestMajor > p.latestMajor ? "major-unlisted" : "major-changed",
				key,
				`registry latest major ${r.latestMajor}, listed ${p.latestMajor}`,
				p.registryUrl,
				key,
			);
		if (p.status === "deprecated" && r.deprecated !== p.statement)
			push(
				"deprecation-changed",
				key,
				r.deprecated
					? `deprecation message now: ${r.deprecated}`
					: "the registry no longer marks it deprecated",
				p.registryUrl,
				key,
			);
		if (p.status !== "deprecated" && r.deprecated)
			push(
				"deprecation-unlisted",
				key,
				`the registry marks it deprecated: ${r.deprecated}`,
				p.registryUrl,
				key,
			);
		const listedW = new Set(p.withdrawnVersions);
		const upW = new Set(r.withdrawnVersions);
		const added = r.withdrawnVersions.filter((v) => !listedW.has(v));
		const gone = p.withdrawnVersions.filter((v) => !upW.has(v));
		if (added.length)
			push(
				"withdrawn-unlisted",
				key,
				`withdrawn upstream: ${added.join(", ")}`,
				p.registryUrl,
				key,
			);
		if (gone.length)
			push(
				"withdrawn-changed",
				key,
				`no longer withdrawn: ${gone.join(", ")}`,
				p.registryUrl,
				key,
			);
	}

	// Release notes past the reviewed date that name a deprecation.
	const reviewed = Date.parse(IDIOMS_REVIEWED_THROUGH);
	for (const repoName of IDIOM_RELEASE_REPOS)
		for (const r of up.releases[repoName] ?? [])
			if (
				!r.prerelease &&
				r.deprecates &&
				Date.parse(r.publishedAt) >= reviewed
			)
				push(
					"idiom-review",
					`${repoName} ${r.tag}`,
					`released ${r.publishedAt}, not before the idioms were reviewed (${IDIOMS_REVIEWED_THROUGH}); its notes mention a deprecation`,
					r.url,
					`releases:${repoName}`,
				);

	return rows;
}

/** The source keys this run could not read (DriftRow.source values). */
export function unreadSources(up: SdkUpstream): string[] {
	return [
		...(up.database ? [] : ["advisory-database"]),
		...Object.entries(up.repositories)
			.filter(([, v]) => !v)
			.map(([k]) => `repository:${k}`),
		...Object.entries(up.registries)
			.filter(([, v]) => !v)
			.map(([k]) => k),
		...Object.entries(up.releases)
			.filter(([, v]) => !v)
			.map(([k]) => `releases:${k}`),
		...(up.crateIndex ? [] : ["crates.io-index"]),
	];
}

/**
 * This run's rows plus every prior row whose source went unread, so a week the
 * check could not look never reads as a repair: the ledger closes a finding
 * when its detector stops reporting it, and an unread source reports nothing.
 * A carried row keeps the generatedAt of the run that last saw it.
 */
export function carryForward(
	prior: DriftRow[],
	rows: DriftRow[],
	unread: string[],
	priorGeneratedAt: string,
): DriftRow[] {
	const seen = new Set(rows.map((r) => `${r.kind} ${r.subject}`));
	const carried = prior
		.filter(
			(r) => unread.includes(r.source) && !seen.has(`${r.kind} ${r.subject}`),
		)
		.map((r) => ({ ...r, carriedFrom: r.carriedFrom ?? priorGeneratedAt }));
	return [...rows, ...carried];
}
