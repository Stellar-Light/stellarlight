/**
 * Skill-reference coverage guard — sk-009 (stellar-raven's register).
 *
 * The served Scout SKILL's API reference lagged the live contract from 1.7.11
 * through 1.8.40 — every new enum value and served field shipped in the spec
 * but sat undocumented in the skill Raven actually reads, for a month at a
 * time. This asserts the LIVE spec's surface names appear in the repo's
 * reference source, so a new surface produces a red run before the skill lags
 * another release.
 *
 * Checks (live spec → public/skills/references/api-reference.md):
 *   1. every /api/research `source` enum value is named
 *   2. every searchRepos codeVerified property is named
 *   3. the historically-drifted names (activity, semantic, tvlUSD, repo-docs)
 *
 *   SCOUT_BASE=https://stellarlight.xyz npx tsx scripts/check-skill-reference.ts
 *
 * Exits 1 on any missing name. One fetch, local greps — runs in seconds.
 */

import { readFileSync } from "node:fs";

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";

async function main() {
	console.log(`Skill-reference coverage — ${BASE}\n`);
	const ref = readFileSync("public/skills/references/api-reference.md", "utf8");
	const spec = (await (
		await fetch(`${BASE}/api/openapi.json`, {
			headers: { "User-Agent": "stellarlight-skill-ref-guard" },
		})
	)
		// biome-ignore lint/suspicious/noExplicitAny: spec walking
		.json()) as any;

	let failures = 0;
	const check = (label: string, name: string) => {
		if (ref.includes(name)) console.log(`  ✓ ${label}`);
		else {
			failures++;
			console.log(
				`  ✗ ${label} — "${name}" absent from api-reference.md (sk-009 class)`,
			);
		}
	};

	const researchSources: string[] =
		spec?.paths?.["/api/research"]?.get?.parameters?.find(
			// biome-ignore lint/suspicious/noExplicitAny: spec walking
			(p: any) => p.name === "source",
		)?.schema?.enum ?? [];
	if (researchSources.length === 0) {
		failures++;
		console.log("  ✗ research source enum unreadable from live spec");
	}
	for (const v of researchSources) check(`research source "${v}"`, v);

	// codeVerified properties anywhere under the searchRepos path
	// biome-ignore lint/suspicious/noExplicitAny: spec walking
	const findProps = (obj: any): any => {
		if (!obj || typeof obj !== "object") return null;
		if (obj.codeVerified?.properties) return obj.codeVerified.properties;
		for (const v of Object.values(obj)) {
			const hit = findProps(v);
			if (hit) return hit;
		}
		return null;
	};
	// The fully-enumerated codeVerified shape lives on the explain path; the
	// search row uses the compact form without nested properties.
	const cvProps = findProps(spec?.paths?.["/api/repos/explain"]) ?? {};
	if (Object.keys(cvProps).length === 0) {
		failures++;
		console.log("  ✗ codeVerified properties unreadable from live spec");
	}
	for (const name of Object.keys(cvProps)) check(`codeVerified.${name}`, name);

	for (const name of ["activity", "semantic", "tvlUSD", "repo-docs"])
		check(`historic-drift name "${name}"`, name);

	// 4. OPERATION coverage — sk-018. Checks 1–3 catch new fields and enum
	//    values but never asked whether a whole new endpoint has an entry, so
	//    four composites (vetIdea, listContracts, getRepoTrust, scfPitch)
	//    shipped and sat undocumented in the skill Raven pins. Every read-only
	//    operation in the live spec must have a `## \`METHOD /path\`` heading.
	//    Side-effecting ops (partner onboarding, listing submission) are portal
	//    flows, not agent research calls, and are out of the reference's scope.
	console.log("\nOperation coverage (sk-018 class):");
	// biome-ignore lint/suspicious/noExplicitAny: spec walking
	const paths: Record<string, any> = spec?.paths ?? {};
	let opCount = 0;
	for (const [path, methods] of Object.entries(paths)) {
		for (const [method, op] of Object.entries(methods ?? {})) {
			// biome-ignore lint/suspicious/noExplicitAny: spec walking
			const o = op as any;
			if (!o || typeof o !== "object" || !o.operationId) continue;
			if (o["x-side-effecting"]) continue;
			opCount++;
			const heading = `## \`${method.toUpperCase()} ${path}\``;
			if (ref.includes(heading)) console.log(`  ✓ ${o.operationId}`);
			else {
				failures++;
				console.log(
					`  ✗ ${o.operationId} — no "${heading}" section in api-reference.md (sk-018 class)`,
				);
			}
		}
	}
	if (opCount === 0) {
		failures++;
		console.log("  ✗ no operations readable from live spec");
	}

	// 5. PARAM drift, the other direction (sls-065 class). Checks 1–4 all ask
	//    "does the reference cover the spec?" — none asked whether the
	//    reference documents a param the spec does NOT have. When three
	//    phantom filters were dropped from searchHackathonBuilds (#953), this
	//    file kept advertising them, so the skill Raven pins was telling agents
	//    to send params the API answers with 400. Documentation ahead of the
	//    API is the same lie as documentation behind it.
	console.log("\nParam drift (sls-065 class):");
	const NOT_PARAMS = new Set(["e.g", "i.e", "https", "http"]);
	let paramsChecked = 0;
	for (const section of ref.split(/^## /m).slice(1)) {
		const head = section.split("\n")[0].trim();
		const m = head.match(/^`(GET|POST) ([^`]+)`/);
		if (!m) continue;
		const [, method, path] = m;
		// biome-ignore lint/suspicious/noExplicitAny: spec walking
		const op = (spec?.paths?.[path] as any)?.[method.toLowerCase()];
		if (!op) continue;
		const specParams = new Set<string>(
			// biome-ignore lint/suspicious/noExplicitAny: spec walking
			(op.parameters ?? []).map((p: any) =>
				p.name
					? p.name
					: String(p.$ref ?? "")
							.split("/")
							.pop(),
			),
		);
		// Only the Params sentence: elsewhere `name=` shows up inside example
		// URLs for OTHER endpoints, which is not this operation's contract.
		const paramsLine = section.match(/\*\*Params[^:]*:\*\*(.*)/)?.[1] ?? "";
		for (const name of new Set(
			[...paramsLine.matchAll(/`([a-zA-Z][a-zA-Z0-9_]*)=/g)].map((x) => x[1]),
		)) {
			paramsChecked++;
			if (NOT_PARAMS.has(name) || specParams.has(name)) continue;
			failures++;
			console.log(
				`  ✗ ${method} ${path} — documents \`${name}=\` but the live spec has no such param (sls-065 class)`,
			);
		}
	}
	console.log(`  checked ${paramsChecked} documented params against the spec`);

	console.log(
		`\n${failures ? `${failures} missing — FAILING` : "reference covers the live surface"}`,
	);
	process.exit(failures ? 1 : 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
