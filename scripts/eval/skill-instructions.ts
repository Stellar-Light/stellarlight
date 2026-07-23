/**
 * Skill-instruction eval — do our published skills actually WORK if followed?
 *
 * A skill is a set of instructions an agent executes literally. If it names a
 * field that doesn't exist, or a curl that 404s, every agent following it is
 * confidently wrong — and nothing in CI notices, because the skill is prose.
 *
 * This is not hypothetical. `scf-claim-verifier` shipped telling reviewers to
 * read `scf.awarded`; the API serves `scfAwarded`. Following it, an SCF Pilot
 * would have read `undefined` on every applicant and concluded "no funding
 * history" for all 393 awarded projects. It was caught by a hand-probe after
 * publication. This turns that probe into a gate.
 *
 * What it checks, per skill:
 *   1. content is served at all (an unreadable skill is invisible to agents)
 *   2. every `curl` in the instructions returns a non-error response
 *   3. every `row.field` the prose tells an agent to read EXISTS on a live row
 *
 * Usage:
 *   pnpm exec tsx scripts/eval/skill-instructions.ts
 *   pnpm exec tsx scripts/eval/skill-instructions.ts --base http://localhost:3000
 *
 * Exit 1 on any failure — by design, so it can gate a PR.
 */

const argBase = process.argv.indexOf("--base");
const BASE = (
	argBase > -1 ? process.argv[argBase + 1] : "https://stellarlight.xyz"
).replace(/\/$/, "");

/** Skills whose instructions are executable and therefore checkable. */
const SKILLS = ["scf-claim-verifier", "scf-live-context", "stellar-scout"];

/**
 * Field names a skill may tell an agent to read off a project row, mapped to
 * the probe that proves they exist. Guards the exact class of bug above: prose
 * naming a field the API does not serve.
 */
const FIELD_PROBES: Array<{ path: string; fields: string[] }> = [
	{
		path: "/api/projects/search?q=blend&limit=1",
		fields: [
			"scfAwarded",
			"scfAwardedRounds",
			"scfTotalAwardedUSD",
			"lastActivityAt",
			"repos",
			"status",
		],
	},
];

/**
 * Field spellings that LOOK right and are not. The shipped bug was prose saying
 * `scf.awarded` when the API serves `scfAwarded` — an agent following it reads
 * undefined and reports "no funding history" for every applicant. Checking that
 * the API has the right field is not enough; the skill has to NAME it right.
 */
const WRONG_FIELD_SPELLINGS: Array<{ wrong: RegExp; right: string }> = [
	{ wrong: /\bscf\.awarded\b/, right: "scfAwarded" },
	{ wrong: /\bscf\.awardedRounds\b/, right: "scfAwardedRounds" },
	{ wrong: /\bscf\.totalAwardedUSD\b/, right: "scfTotalAwardedUSD" },
	{ wrong: /\bonchain\.events\b/, right: "onchain.contracts[].events" },
	// repos[0].lastCommitAt reads as "when this team last worked" and is not:
	// repos[] is score-sorted, so [0] is the flagship, often the least recent.
	{ wrong: /repos\[0\]\.lastCommitAt/, right: "lastActivityAt" },
];

interface Failure {
	skill: string;
	kind: "no-content" | "dead-call" | "missing-field" | "wrong-field-name";
	detail: string;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
		if (!res.ok) return null;
		return (await res.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

async function main() {
	const failures: Failure[] = [];
	let calls = 0;

	console.log(`skill-instructions eval → ${BASE}\n`);

	for (const slug of SKILLS) {
		const doc = await getJson(`${BASE}/api/skills/${slug}`);
		const content = String(
			(doc?.skill as Record<string, unknown> | undefined)?.content ?? "",
		);

		if (!content) {
			failures.push({
				skill: slug,
				kind: "no-content",
				detail:
					"content is null — an agent can see it exists but not follow it",
			});
			console.log(`✗ ${slug}: no content served`);
			continue;
		}

		// Every executable call the instructions hand an agent. Skip placeholder
		// URLs (<project>, {topic}) — those are templates, not literal calls.
		const urls = [...content.matchAll(/curl -s(?:i)? "([^"]+)"/g)]
			.map((m) => m[1])
			.filter((u) => !/[<{]/.test(u))
			.filter((u) => u.startsWith("http"));

		let dead = 0;
		for (const u of urls) {
			calls += 1;
			const body = await getJson(u.replace("https://stellarlight.xyz", BASE));
			if (!body || body.error) {
				dead += 1;
				failures.push({
					skill: slug,
					kind: "dead-call",
					detail: u.replace(BASE, ""),
				});
			}
		}
		// Does the prose NAME its fields correctly? A skill telling an agent to
		// read a field that doesn't exist is silently wrong on every row.
		// Ignore fenced blocks that deliberately quote the wrong spelling as a
		// warning — only flag it when the skill is instructing, not cautioning.
		const wrong = WRONG_FIELD_SPELLINGS.filter(
			(w) =>
				w.wrong.test(content) &&
				!new RegExp(
					`[Nn]ever\\s+\`?${w.wrong.source.replace(/\\b/g, "")}`,
				).test(content),
		);
		for (const w of wrong) {
			failures.push({
				skill: slug,
				kind: "wrong-field-name",
				detail: `instructs reading a field that does not exist — use \`${w.right}\``,
			});
		}

		console.log(
			`${dead || wrong.length ? "✗" : "✓"} ${slug}: ${urls.length - dead}/${urls.length} calls live · ${content.length} chars${wrong.length ? ` · ${wrong.length} bad field name(s)` : ""}`,
		);
	}

	// Field existence — the bug class that shipped.
	for (const probe of FIELD_PROBES) {
		const body = await getJson(`${BASE}${probe.path}`);
		const row = (body?.projects as Record<string, unknown>[] | undefined)?.[0];
		if (!row) {
			failures.push({
				skill: "(field probe)",
				kind: "dead-call",
				detail: probe.path,
			});
			continue;
		}
		const missing = probe.fields.filter((f) => !(f in row));
		if (missing.length) {
			failures.push({
				skill: "(field probe)",
				kind: "missing-field",
				detail: `${probe.path} lacks: ${missing.join(", ")}`,
			});
		}
		console.log(
			`${missing.length ? "✗" : "✓"} fields: ${probe.fields.length - missing.length}/${probe.fields.length} present on a live row`,
		);
	}

	console.log(
		`\n${SKILLS.length} skills · ${calls} instruction calls · ${failures.length} failures`,
	);
	if (failures.length) {
		console.log("\nFAILURES");
		for (const f of failures)
			console.log(`  [${f.kind}] ${f.skill}: ${f.detail}`);
		process.exit(1);
	}
	console.log("\nEvery published instruction resolves against the live API.");
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
