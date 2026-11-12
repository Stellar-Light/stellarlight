/**
 * Are the dated SDK facts (src/data/sdk-facts.ts) still what their sources
 * say? Re-reads these sources and compares:
 *   GitHub Advisory Database, every listed package, types reviewed,
 *     unreviewed and malware            -> an advisory not listed, changed, gone
 *   published repository advisories of each listed package's repository
 *                                       -> an advisory outside the database
 *   npm, crates.io, JSR                 -> a new deprecation or changed
 *                                          message, a new major, a new yank
 *   crates.io index of soroban-sdk and the soroban-* and stellar-* crates
 *     its normal dependencies reach     -> alsoAffects re-derived
 *   rs-soroban-sdk and stellar-cli releases at or after
 *     IDIOMS_REVIEWED_THROUGH whose notes mention a deprecation
 *                                       -> idioms to review
 * Not re-read: the renamed and moved packages' statements and the idiom
 * source pages (read once, on each row's asOf).
 *
 *   pnpm exec tsx scripts/check-sdk-facts.ts
 *
 * Writes improvements/audits/sdk-facts-latest.json (fed to the improvement
 * ledger) on every run. A source this run could not read keeps the rows the
 * previous artifact held for it (carriedFrom), so an unread week never reads
 * as a repair. Exit 0: current. Exit 1: drift; update the row and its asOf
 * from the source the row names. Exit 2: no new drift, but a source could not
 * be read. The last line printed is always "sdk-facts verdict: ..."; a run
 * without it crashed. Read-only: about 20 GitHub calls (GITHUB_TOKEN when
 * set), 16 registry GETs and one crates.io index GET per walked crate.
 */

import { readFileSync, writeFileSync } from "node:fs";
import {
	ADVISORY_SOURCES,
	IDIOM_RELEASE_REPOS,
	SDK_FACTS_ASOF,
	SDK_PACKAGES,
} from "../src/data/sdk-facts";
import {
	carryForward,
	crateIndexUrl,
	type DriftRow,
	type IndexRow,
	readAdvisory,
	readCrate,
	readJsr,
	readNpm,
	type SdkUpstream,
	sdkFactsDrift,
	type UpstreamAdvisory,
	unreadSources,
	WALKED_CRATE,
	walkedDeps,
	watchedRepositories,
} from "../src/lib/sdk-facts";

const OUT = "improvements/audits/sdk-facts-latest.json";
// crates.io refuses requests without a User-Agent naming the client.
const UA = "stellarlight-sdk-facts-check (stellarlight.xyz)";
const unchecked: string[] = [];

async function getJson(url: string, headers: Record<string, string> = {}) {
	const res = await fetch(url, {
		headers: { "User-Agent": UA, ...headers },
		signal: AbortSignal.timeout(30_000),
	});
	if (!res.ok) throw new Error(`answered ${res.status}`);
	return res.json();
}

const gh = (path: string) =>
	getJson(`https://api.github.com${path}`, {
		Accept: "application/vnd.github+json",
		...(process.env.GITHUB_TOKEN
			? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
			: {}),
	});

/** A list endpoint read in one page: 100 rows means there may be more. */
async function onePage(path: string): Promise<unknown[]> {
	const rows = await gh(path);
	if (!Array.isArray(rows)) throw new Error("answered a non-list");
	if (rows.length >= 100) throw new Error("100 rows: paging not implemented");
	return rows;
}

/** The value, or null with the reason recorded: never a silent empty. */
async function attempt<T>(label: string, fn: () => Promise<T>) {
	try {
		const v = await fn();
		if (v === null) throw new Error("answered a body with no reading");
		return v;
	} catch (e) {
		unchecked.push(`${label}: ${e instanceof Error ? e.message : e}`);
		return null;
	}
}

async function readDatabase(): Promise<UpstreamAdvisory[]> {
	const out: UpstreamAdvisory[] = [];
	const names = (registry: string) =>
		SDK_PACKAGES.filter((p) => p.registry === registry)
			.map((p) => encodeURIComponent(p.name))
			.join(",");
	for (const [ecosystem, registry] of [
		["rust", "crates.io"],
		["npm", "npm"],
	])
		for (const type of ADVISORY_SOURCES.filter((s) => s !== "repository"))
			for (const raw of await onePage(
				`/advisories?ecosystem=${ecosystem}&affects=${names(registry)}&type=${type}&per_page=100`,
			)) {
				const a = readAdvisory(raw, type);
				if (!a) throw new Error(`unreadable ${type} advisory row`);
				out.push(a);
			}
	return out;
}

/** soroban-sdk's index file and every soroban-* or stellar-* crate its
 * normal, non-optional dependencies reach, at any version: the graph
 * deriveAlsoAffects walks. One GET per crate. */
async function readCrateIndex(): Promise<Record<string, IndexRow[]>> {
	const out: Record<string, IndexRow[]> = {};
	const queue = ["soroban-sdk"];
	while (queue.length) {
		const name = queue.shift() as string;
		if (out[name]) continue;
		// ponytail: a closure past 60 crates means the walk set changed shape.
		if (Object.keys(out).length >= 60) throw new Error("more than 60 crates");
		const res = await fetch(crateIndexUrl(name), {
			headers: { "User-Agent": UA },
			signal: AbortSignal.timeout(30_000),
		});
		if (!res.ok) throw new Error(`${name} answered ${res.status}`);
		const rows = (await res.text())
			.trim()
			.split("\n")
			.map((l) => JSON.parse(l) as IndexRow);
		if (!rows.length || !rows.every((r) => r.vers && Array.isArray(r.deps)))
			throw new Error(`${name}: an index row without vers or deps`);
		out[name] = rows;
		for (const r of rows)
			for (const d of walkedDeps(r))
				if (WALKED_CRATE.test(d.name) && !out[d.name]) queue.push(d.name);
	}
	return out;
}

async function readRegistry(p: (typeof SDK_PACKAGES)[number]) {
	if (p.registry === "npm")
		return readNpm(
			await getJson(
				`https://registry.npmjs.org/${p.name.replace("/", "%2F")}`,
				{ Accept: "application/vnd.npm.install-v1+json" },
			),
		);
	if (p.registry === "crates.io")
		return readCrate(
			await getJson(`https://crates.io/api/v1/crates/${p.name}`),
		);
	return readJsr(await getJson(`https://jsr.io/${p.name}/meta.json`));
}

async function main() {
	const up: SdkUpstream = {
		database: await attempt("GitHub Advisory Database", readDatabase),
		repositories: {},
		registries: {},
		releases: {},
		crateIndex: await attempt("crates.io index", readCrateIndex),
	};
	for (const repo of watchedRepositories())
		up.repositories[repo] = await attempt(
			`${repo} security advisories`,
			async () =>
				(
					await onePage(
						`/repos/${repo}/security-advisories?state=published&per_page=100`,
					)
				).map((raw) => {
					const a = readAdvisory(raw, "repository", repo);
					if (!a) throw new Error("unreadable advisory row");
					return a;
				}),
		);
	for (const p of SDK_PACKAGES)
		up.registries[`${p.registry}:${p.name}`] = await attempt(
			`${p.registry} ${p.name}`,
			() => readRegistry(p),
		);
	for (const repo of IDIOM_RELEASE_REPOS)
		up.releases[repo] = await attempt(`${repo} releases`, async () =>
			// biome-ignore lint/suspicious/noExplicitAny: GitHub release JSON
			(await gh(`/repos/${repo}/releases?per_page=30`)).map((r: any) => ({
				tag: String(r.tag_name),
				publishedAt: String(r.published_at ?? ""),
				prerelease: !!r.prerelease || !!r.draft,
				deprecates: /deprecat/i.test(String(r.body ?? "")),
				url: String(r.html_url),
			})),
		);

	const fresh = sdkFactsDrift(up);
	let prior: { generatedAt?: string; rows?: DriftRow[] } = {};
	try {
		prior = JSON.parse(readFileSync(OUT, "utf8"));
	} catch {
		// first run: nothing to carry
	}
	const rows = carryForward(
		Array.isArray(prior.rows) ? prior.rows : [],
		fresh,
		unreadSources(up),
		prior.generatedAt ?? "unknown",
	);
	const report = {
		generatedAt: new Date().toISOString(),
		source: "scripts/check-sdk-facts.ts",
		factsAsOf: SDK_FACTS_ASOF,
		rule: "Every advisory, package deprecation, yank, latest major and inherited range in src/data/sdk-facts.ts is re-read from its own source; renamed and moved statements and idiom source pages are not. A row is drift between the source and the list. A source that could not be read is listed under unchecked, adds no row, and keeps the rows the previous run held for it (carriedFrom).",
		tally: {
			drift: fresh.length,
			carried: rows.length - fresh.length,
			unchecked: unchecked.length,
			advisoriesRead: up.database?.length ?? null,
			repositoriesRead: Object.values(up.repositories).filter(Boolean).length,
			registriesRead: Object.values(up.registries).filter(Boolean).length,
		},
		unchecked,
		rows,
	};
	writeFileSync(OUT, `${JSON.stringify(report, null, "\t")}\n`);

	for (const r of rows) console.log(`  ${r.kind}  ${r.subject}: ${r.detail}`);
	for (const u of unchecked) console.log(`  could not check  ${u}`);
	const verdict = fresh.length
		? "drift"
		: unchecked.length
			? "unchecked"
			: "current";
	console.log(
		`sdk-facts (as of ${SDK_FACTS_ASOF}): ${fresh.length} drift, ${rows.length - fresh.length} carried, ${unchecked.length} unchecked. Wrote ${OUT}.`,
	);
	console.log(`sdk-facts verdict: ${verdict}`);
	process.exitCode = fresh.length ? 1 : unchecked.length ? 2 : 0;
}

// A crash is no check: exit 2, never the 1 that means drift.
main().catch((err) => {
	console.log(`could not check: ${err instanceof Error ? err.message : err}`);
	process.exitCode = 2;
});
