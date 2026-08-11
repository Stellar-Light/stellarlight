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
	// biome-ignore lint/suspicious/noExplicitAny: spec walking
	).json()) as any;

	let failures = 0;
	const check = (label: string, name: string) => {
		if (ref.includes(name)) console.log(`  ✓ ${label}`);
		else {
			failures++;
			console.log(`  ✗ ${label} — "${name}" absent from api-reference.md (sk-009 class)`);
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
	for (const name of Object.keys(cvProps))
		check(`codeVerified.${name}`, name);

	for (const name of ["activity", "semantic", "tvlUSD", "repo-docs"])
		check(`historic-drift name "${name}"`, name);

	console.log(
		`\n${failures ? `${failures} missing — FAILING` : "reference covers the live surface"}`,
	);
	process.exit(failures ? 1 : 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
