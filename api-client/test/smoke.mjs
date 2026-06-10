/**
 * Smoke test — every ScoutClient method against the live API.
 *
 *   pnpm test          (builds first via the test script)
 *
 * Exercises all 13 read methods + validates response shapes have the
 * fields each method's consumers depend on. submit_feedback is excluded
 * (write op) — its transport path is identical to the read methods.
 */

import { ScoutApiError, ScoutClient } from "../dist/index.js";

const scout = new ScoutClient({
	headers: { "x-smoke-test": "api-client" },
});

let passed = 0;
let failed = 0;

async function check(name, fn) {
	try {
		await fn();
		console.log(`  ✓ ${name}`);
		passed++;
	} catch (err) {
		console.error(`  ✗ ${name}: ${err.message}`);
		failed++;
	}
}

function assert(cond, msg) {
	if (!cond) throw new Error(msg);
}

console.log("@stellar-light/api-client smoke test\n");

await check("getStatus", async () => {
	const s = await scout.getStatus();
	assert(s.ok === true, "status not ok");
	assert(Array.isArray(s.endpoints) && s.endpoints.length >= 14, "endpoint enumeration missing");
});

await check("searchProjects", async () => {
	const r = await scout.searchProjects({ q: "stablecoin", limit: 3 });
	assert(Array.isArray(r.projects), "no projects array");
	assert(r.projects.length > 0, "zero results for stablecoin");
	assert(typeof r.projects[0].name === "string", "project missing name");
});

await check("searchProjects scfAwarded filter", async () => {
	const r = await scout.searchProjects({ q: "payments", scfAwarded: true, limit: 3 });
	assert(Array.isArray(r.projects), "no projects array");
});

await check("getHackathons", async () => {
	const r = await scout.getHackathons({ limit: 3 });
	assert(Array.isArray(r.hackathons), "no hackathons array");
	assert(r.hackathons.length > 0, "zero hackathons");
});

await check("getHackathon + compareHackathons", async () => {
	const list = await scout.getHackathons({ limit: 2 });
	const slugs = list.hackathons.map((h) => h.slug).filter(Boolean);
	assert(slugs.length >= 2, "need 2 slugs to compare");
	const detail = await scout.getHackathon(slugs[0]);
	assert(detail.hackathon, "no hackathon detail");
	const cmp = await scout.compareHackathons(slugs.slice(0, 2));
	assert(cmp && typeof cmp === "object", "no comparison body");
});

await check("getBuilders", async () => {
	const r = await scout.getBuilders({ limit: 3 });
	assert(Array.isArray(r.builders), "no builders array");
});

await check("getRfps", async () => {
	const r = await scout.getRfps({ status: "open", limit: 5 });
	assert(Array.isArray(r.rfps), "no rfps array");
});

await check("searchResearch", async () => {
	const r = await scout.searchResearch({ q: "agentic payments", limit: 2 });
	assert(Array.isArray(r.results), "no results array");
	assert(r.results.length > 0, "zero research hits");
});

await check("listSkills + getSkill", async () => {
	const list = await scout.listSkills({ kind: "sdk" });
	assert(Array.isArray(list.skills), "no skills array");
	const one = await scout.getSkill("soroban");
	assert(one.skill, "no skill detail");
});

await check("getClusters", async () => {
	const r = await scout.getClusters({ dimension: "category" });
	assert(Array.isArray(r.clusters), "no clusters array");
});

await check("analyzeEcosystem", async () => {
	const r = await scout.analyzeEcosystem({ dimension: "all" });
	assert(r && typeof r === "object", "no analytics body");
});

await check("getLeaderboard", async () => {
	const r = await scout.getLeaderboard();
	assert(r && typeof r === "object", "no leaderboard body");
});

await check("404 raises ScoutApiError", async () => {
	try {
		await scout.getSkill("definitely-not-a-real-skill-slug");
		throw new Error("expected ScoutApiError, got success");
	} catch (err) {
		assert(err instanceof ScoutApiError, `wrong error type: ${err.constructor.name}`);
		assert(err.status === 404, `expected 404, got ${err.status}`);
	}
});

await check("timeout aborts", async () => {
	const impatient = new ScoutClient({ timeoutMs: 1 });
	try {
		await impatient.getStatus();
		throw new Error("expected abort");
	} catch (err) {
		assert(err.name === "AbortError" || err.name === "TimeoutError", `wrong error: ${err.name}`);
	}
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
