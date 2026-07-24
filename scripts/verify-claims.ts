/**
 * Verify every publicly advertised artifact actually works.
 *
 *   pnpm exec tsx scripts/verify-claims.ts            # report + exit 1 on blockers
 *   pnpm exec tsx scripts/verify-claims.ts --strict   # warnings also fail
 *
 * Born from the npx-before-npm-publish incident: we shipped
 * `npx @stellar-light/scout-mcp` install commands across the site before
 * the package (or the npm org) existed, and an external partner hit the
 * 404. This script is the automated gate so that class of bug can't
 * recur silently. Run by .github/workflows/verify-claims.yml weekly and
 * on PRs that touch marketing surfaces.
 *
 * What it checks:
 *
 *   1. npm packages we advertise exist on the registry, and the
 *      published version doesn't lag the monorepo package.json (lag =
 *      the README on npm is older than what we claim → warn)
 *   2. Every install command, repository / homepage / docs URL in the
 *      curated skills catalog resolves
 *   3. Every https URL in the public SKILL.md files resolves
 *   4. Every /api/* endpoint the SKILL.md + OpenAPI spec advertise
 *      responds 200 with JSON on production
 *   5. Distribution-repo drift: Stellar-Light/stellar-scout's SKILL.md
 *      matches public/skills/stellar-scout.md byte-for-byte (the
 *      auto-sync workflow's PAT is broken, so drift is a real risk)
 *   6. Every tool our skill docs name as "the `x` MCP tool" exists in the
 *      build npm actually serves — not merely in scout-mcp/src
 *
 * Design constraints: zero LLM calls, no DB, plain fetch — runs anywhere
 * Node 20+ runs. Bot-blocked URLs (403 with a browser UA) downgrade to
 * warn because we can't distinguish bot-blocking from a real 403.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CURATED_SKILLS } from "../src/lib/integrations/curated-skills";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROD = "https://stellarlight.xyz";
const STRICT = process.argv.includes("--strict");

/** Packages we publish + where their canonical package.json lives. */
const PUBLISHED_PACKAGES = [
	{ name: "@stellar-light/scout-mcp", manifest: "scout-mcp/package.json" },
	{ name: "@stellar-light/api-client", manifest: "api-client/package.json" },
];

/** Distribution mirrors that must not drift from their monorepo source. */
const MIRRORS = [
	{
		local: "public/skills/stellar-scout.md",
		remote:
			"https://raw.githubusercontent.com/Stellar-Light/stellar-scout/main/SKILL.md",
		label: "Stellar-Light/stellar-scout SKILL.md",
	},
	{
		local: "public/skills/references/api-reference.md",
		remote:
			"https://raw.githubusercontent.com/Stellar-Light/stellar-scout/main/references/api-reference.md",
		label: "Stellar-Light/stellar-scout references/api-reference.md",
	},
	{
		local: "public/skills/references/examples.md",
		remote:
			"https://raw.githubusercontent.com/Stellar-Light/stellar-scout/main/references/examples.md",
		label: "Stellar-Light/stellar-scout references/examples.md",
	},
];

/** Endpoints a SKILL.md or the OpenAPI spec tells agents to call. */
const ENDPOINT_PROBES = [
	"/api/status",
	"/api/openapi.json",
	"/api/projects/search?q=test&limit=1",
	"/api/hackathons?limit=1",
	"/api/hackathons/compare?slugs=__probe__", // expect 400 (route alive, validates)
	"/api/builders?limit=1",
	"/api/partners?limit=1",
	"/api/rfps?limit=1",
	"/api/research?q=test&limit=1",
	"/api/skills",
	"/api/skills/smart-contracts", // sls-053: soroban superseded — claim tracks the maintained successor
	"/api/clusters?dimension=category",
	"/api/analyze?dimension=all",
	"/api/leaderboard",
];

interface Finding {
	severity: "blocker" | "warn";
	claim: string;
	detail: string;
}
const findings: Finding[] = [];
let checked = 0;

const blocker = (claim: string, detail: string) =>
	findings.push({ severity: "blocker", claim, detail });
const warn = (claim: string, detail: string) =>
	findings.push({ severity: "warn", claim, detail });

const BROWSER_UA =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";

async function fetchStatus(url: string, ua?: string): Promise<number> {
	try {
		const res = await fetch(url, {
			method: "GET",
			redirect: "follow",
			headers: ua ? { "user-agent": ua } : {},
			signal: AbortSignal.timeout(15_000),
		});
		// Drain minimal body so connections free up
		await res.arrayBuffer().catch(() => {});
		return res.status;
	} catch {
		return 0; // network error / timeout / DNS
	}
}

/**
 * 2xx/3xx ok; 403/405 retried with a browser UA and downgraded to warn if
 * persistent (bot-walls return both; a real browser usually loads the page).
 * 0/404/410/5xx = blocker.
 */
// Hosts that bot-wall ALL datacenter traffic with inconsistent statuses
// (x.com answers 200 to a residential IP and 400 to CI on the same minute) —
// a CI probe can NEVER verify them, so an unreachable result is a warn, not a
// blocker. Same conclusion the link-checker's `blocked` status encodes.
const BOT_WALLED_HOSTS =
	/^https?:\/\/(x\.com|twitter\.com|(www\.)?linkedin\.com|(www\.)?instagram\.com)\//i;

async function checkUrl(url: string, source: string) {
	checked++;
	let status = await fetchStatus(url);
	if (status >= 200 && status < 400) return;
	if (BOT_WALLED_HOSTS.test(url)) {
		warn(
			url,
			`HTTP ${status || "network-error"} from CI — bot-walled host, unverifiable from datacenter IPs; verify manually [${source}]`,
		);
		return;
	}
	if (status === 403 || status === 405 || status === 0) {
		status = await fetchStatus(url, BROWSER_UA);
		if (status >= 200 && status < 400) return;
		if (status === 403 || status === 405) {
			warn(
				url,
				`HTTP ${status} even with browser UA (likely bot-blocking) — verify manually [${source}]`,
			);
			return;
		}
	}
	blocker(url, `HTTP ${status || "network-error"} [${source}]`);
}

async function npmLatest(pkg: string): Promise<string | null> {
	try {
		const res = await fetch(
			`https://registry.npmjs.org/${encodeURIComponent(pkg).replace("%40", "@")}`,
			{ signal: AbortSignal.timeout(15_000) },
		);
		if (!res.ok) return null;
		const body = (await res.json()) as { "dist-tags"?: { latest?: string } };
		return body["dist-tags"]?.latest ?? null;
	} catch {
		return null;
	}
}

async function githubRepoExists(ownerRepo: string): Promise<boolean> {
	const status = await fetchStatus(`https://api.github.com/repos/${ownerRepo}`);
	return status === 200;
}

/** Pull every owner/repo or package target out of an install command. */
async function checkInstallCommand(cmd: string, source: string) {
	checked++;
	// npx skills add Owner/repo [-a agent]
	const skillsAdd = cmd.match(/skills add ([\w.-]+\/[\w.-]+)/);
	if (skillsAdd) {
		const repo = skillsAdd[1];
		if (!(await githubRepoExists(repo))) {
			blocker(cmd, `GitHub repo ${repo} not found [${source}]`);
			return;
		}
		// The skills CLI installs from two layouts, and this check only knew
		// the first: a SINGLE-skill repo with SKILL.md at the root
		// (Stellar-Light/stellar-scout), or a MULTI-skill repo holding
		// skills/<name>/SKILL.md (Stellar-Light/awesome-stellar-community-fund,
		// twelve of them). Verified 2026-07-23 by running the install: the CLI
		// resolved all twelve and reported them universal across Codex, Cursor,
		// Amp and Antigravity. Assuming root-only made a working command look
		// broken twelve times over — a checker that cries wolf on a verified
		// command is how a checker gets ignored.
		const rootSkill = await fetchStatus(
			`https://raw.githubusercontent.com/${repo}/main/SKILL.md`,
		);
		if (rootSkill === 200) return;
		// Multi-skill layout: the marketplace manifest is the reliable marker,
		// since skill directory names aren't knowable from the command alone.
		const manifest = await fetchStatus(
			`https://raw.githubusercontent.com/${repo}/main/.claude-plugin/marketplace.json`,
		);
		if (manifest === 200) return;
		blocker(
			cmd,
			`${repo} exists but has neither a root SKILL.md (HTTP ${rootSkill}) nor a skills manifest (HTTP ${manifest}) [${source}]`,
		);
		return;
	}
	// /plugin marketplace add owner/repo
	const plugin = cmd.match(/marketplace add ([\w.-]+\/[\w.-]+)/);
	if (plugin) {
		if (!(await githubRepoExists(plugin[1])))
			blocker(cmd, `GitHub repo ${plugin[1]} not found [${source}]`);
		return;
	}
	// npx [-y] @scope/pkg  |  npm install pkg [pkg2...]
	const pkgs =
		cmd
			.match(/(?:npx (?:-y )?|npm install )((?:@?[\w./-]+ ?)+)/)?.[1]
			?.split(/\s+/)
			.filter((p) => p && !p.startsWith("-")) ?? [];
	for (const pkg of pkgs) {
		if (!(await npmLatest(pkg)))
			blocker(cmd, `npm package ${pkg} not on registry [${source}]`);
	}
	// claude mcp add --transport http <name> <url>
	const mcpUrl = cmd.match(/--transport http \S+ (https:\/\/\S+)/);
	if (mcpUrl) {
		const status = await fetchStatus(mcpUrl[1]);
		// Any HTTP response (even 4xx) proves the host is alive; 0 = dead.
		if (status === 0)
			blocker(cmd, `MCP host ${mcpUrl[1]} unreachable [${source}]`);
	}
}

function extractUrls(markdown: string): string[] {
	const urls = markdown.match(/https:\/\/[^\s)`"'\]>]+/g) ?? [];
	return [
		...new Set(
			urls
				// strip markdown-bold glue (**url**) and trailing punctuation
				.map((u) => u.replace(/\*+$/, "").replace(/[.,;:!?]+$/, ""))
				// template placeholders ({slug}, {name}) aren't fetchable claims
				.filter((u) => !u.includes("{") && !u.includes("}")),
		),
	];
}

async function runBatch<T>(
	items: T[],
	fn: (item: T) => Promise<void>,
	size = 8,
) {
	for (let i = 0; i < items.length; i += size) {
		await Promise.all(items.slice(i, i + size).map(fn));
	}
}

/** Files that tell an agent "call the `x` MCP tool". */
const MCP_CLAIM_SOURCES = [
	"public/skills/stellar-scout.md",
	"public/skills/references/api-reference.md",
	"public/skills/references/examples.md",
];

/**
 * A documented MCP tool that the PUBLISHED package doesn't have is a broken
 * promise, and `scout-mcp/src` proves nothing about it: the tool exists in
 * our source the moment we write it, but an agent only ever runs
 * `npx @stellar-light/scout-mcp`, which resolves to the npm registry.
 *
 * Between them sits a publish step that can fail silently — and did: the
 * auto-publish token died four days after it was minted, six consecutive runs
 * failed unnoticed, and for those days our skill told every reader to call
 * `get_people` while the build npm served had no such tool. Version drift
 * (check 1) already warns, but "1.1.10 vs 1.1.12" doesn't read as urgent;
 * naming the tool an agent will reach for and not find does.
 *
 * So resolve what npm actually serves. jsDelivr mirrors the registry tarball
 * and lets us read one file without unpacking it; pin the version to the
 * registry's `latest` so we check the exact artifact consumers get. Any fetch
 * failure SKIPS the check rather than reporting drift — a CDN blip must never
 * be indistinguishable from a real broken claim, or the signal gets ignored.
 */
async function checkMcpToolClaims() {
	const claimed = new Set<string>();
	for (const file of MCP_CLAIM_SOURCES) {
		const md = readFileSync(path.join(ROOT, file), "utf8");
		for (const m of md.matchAll(/`([a-z][a-z0-9_]+)`\s+MCP tool/g))
			claimed.add(m[1]);
	}
	if (claimed.size === 0) {
		console.log("  no MCP tool claims found in skill docs — nothing to check");
		return;
	}

	const version = await npmLatest("@stellar-light/scout-mcp");
	if (!version) {
		console.log("  skip: registry did not resolve a published version");
		return;
	}
	let published: string;
	try {
		const res = await fetch(
			`https://cdn.jsdelivr.net/npm/@stellar-light/scout-mcp@${version}/dist/index.js`,
			{ signal: AbortSignal.timeout(20_000) },
		);
		if (!res.ok) {
			console.log(`  skip: published build unreadable (HTTP ${res.status})`);
			return;
		}
		published = await res.text();
	} catch {
		console.log("  skip: published build fetch failed (network)");
		return;
	}

	// Tool names appear as string literals in the registration table.
	const shipped = new Set(
		[...published.matchAll(/["']([a-z][a-z0-9_]+)["']/g)].map((m) => m[1]),
	);
	for (const tool of [...claimed].sort()) {
		checked++;
		if (shipped.has(tool)) {
			console.log(`  ok ${tool} present in ${version}`);
			continue;
		}
		warn(
			`${tool} MCP tool`,
			`documented in the skill, but @stellar-light/scout-mcp@${version} (what npx installs) has no such tool — an agent following our docs calls a tool that doesn't exist. Publish the pending version.`,
		);
	}
}

async function main() {
	console.log("verify-claims — auditing every advertised artifact\n");

	// 1. npm packages + version drift
	console.log("── npm packages ──");
	for (const { name, manifest } of PUBLISHED_PACKAGES) {
		checked++;
		const latest = await npmLatest(name);
		const local = JSON.parse(readFileSync(path.join(ROOT, manifest), "utf8"))
			.version as string;
		if (!latest) {
			blocker(
				name,
				`not on the npm registry, but ${manifest} v${local} is advertised`,
			);
		} else if (latest !== local) {
			warn(
				name,
				`registry has v${latest}, monorepo ${manifest} says v${local} — publish or release-note the drift`,
			);
		} else {
			console.log(`  ok ${name}@${latest}`);
		}
	}

	// 2. Curated skills catalog
	console.log("── curated skills catalog ──");
	const urlChecks: Array<{ url: string; source: string }> = [];
	const cmdChecks: Array<{ cmd: string; source: string }> = [];
	for (const s of CURATED_SKILLS) {
		const src = `curated:${s.slug}`;
		for (const u of [s.repository, s.homepage, s.docs].filter(
			(x): x is string => !!x,
		))
			urlChecks.push({ url: u, source: src });
		if (s.install && !s.install.startsWith("See "))
			cmdChecks.push({ cmd: s.install, source: src });
		for (const alt of s.installAlt ?? [])
			cmdChecks.push({ cmd: alt.command, source: src });
	}

	// 3. SKILL.md URLs
	console.log("── SKILL.md files ──");
	for (const file of [
		"public/skills/stellar-scout.md",
		"public/skills/stellar-developer-activity.md",
		"public/skills/references/api-reference.md",
		"public/skills/references/examples.md",
	]) {
		const md = readFileSync(path.join(ROOT, file), "utf8");
		for (const url of extractUrls(md)) {
			// GitHub blob/tree URLs of repos already checked elsewhere — still check, cheap
			urlChecks.push({ url, source: file });
		}
	}

	// Dedupe URLs
	const seenUrl = new Set<string>();
	const uniqueUrls = urlChecks.filter(({ url }) => {
		if (seenUrl.has(url)) return false;
		seenUrl.add(url);
		return true;
	});
	console.log(
		`  checking ${uniqueUrls.length} unique URLs + ${cmdChecks.length} install commands…`,
	);
	await runBatch(uniqueUrls, ({ url, source }) => checkUrl(url, source));
	await runBatch(
		cmdChecks,
		({ cmd, source }) => checkInstallCommand(cmd, source),
		4,
	);

	// 4. Production endpoints
	console.log("── production endpoints ──");
	for (const probe of ENDPOINT_PROBES) {
		checked++;
		const status = await fetchStatus(`${PROD}${probe}`);
		const expectValidation = probe.includes("__probe__");
		const ok = expectValidation ? status === 400 : status === 200;
		if (!ok)
			blocker(
				`${PROD}${probe}`,
				`HTTP ${status || "network-error"} (expected ${expectValidation ? 400 : 200})`,
			);
		else console.log(`  ok ${probe} → ${status}`);
	}

	// 5. Distribution mirror drift
	console.log("── distribution mirrors ──");
	for (const m of MIRRORS) {
		checked++;
		try {
			const res = await fetch(m.remote, {
				signal: AbortSignal.timeout(15_000),
			});
			if (!res.ok) {
				blocker(m.label, `mirror fetch failed: HTTP ${res.status}`);
				continue;
			}
			const remote = (await res.text()).trim();
			const local = readFileSync(path.join(ROOT, m.local), "utf8").trim();
			if (remote !== local)
				warn(
					m.label,
					`drifted from ${m.local} — auto-sync PAT is broken, run the manual sync`,
				);
			else console.log(`  ok ${m.label} in sync`);
		} catch (err) {
			blocker(m.label, `mirror check error: ${(err as Error).message}`);
		}
	}

	// 6. Documented MCP tools vs the build npm actually serves
	console.log("── MCP tool claims vs published package ──");
	await checkMcpToolClaims();

	// Report
	const blockers = findings.filter((f) => f.severity === "blocker");
	const warnings = findings.filter((f) => f.severity === "warn");
	console.log(
		`\n${checked} checks · ${blockers.length} blockers · ${warnings.length} warnings\n`,
	);
	for (const f of blockers)
		console.log(`  ✗ BLOCKER  ${f.claim}\n             ${f.detail}`);
	for (const f of warnings)
		console.log(`  ⚠ warn     ${f.claim}\n             ${f.detail}`);

	if (blockers.length > 0 || (STRICT && warnings.length > 0)) process.exit(1);
	console.log("all advertised artifacts verified ✓");
}

main();
