/**
 * Capture what the prize-labels replay needs from the live API, read-only
 * (lane PL).
 *
 *   pnpm exec tsx improvements/audits/2026-10-23-prize-labels/capture.ts <out-dir>
 *
 * GETs only, one at a time, 2 s apart, apiVersion read at the start and the
 * end. Writes the raw bodies to <out-dir>, kept out of the repo (they carry
 * third-party project text):
 *   status-start.json, status-end.json   apiVersion
 *   list.json                            getHackathons, every listed event
 *   analyze-category.json                each category type's precision and recall
 *   detail/<slug>.json                   getHackathon, the replay's events
 *   builds/<slug>.json                   searchHackathonBuilds rows, the replay's events
 *   build/<id>.json                      getHackathonSubmission, the hand-checked winners
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Seven events whose award text winners of different placements share,
 * and three whose award text is each winner's own prize. */
export const EVENTS = [
	"stellar-hacks-zk",
	"stellar-agents-x402-stripe-mpp",
	"scaffoldstellar",
	"stellar-hacks-blend",
	"stellar-hacks-kale-reflector",
	"stellar-hacks-paltalabs",
	"build-on-stellar",
	"stellar-hacks-zk-gaming",
	"buildonstellarchile",
	"stellar-latam",
];
/** One winner of each event, in EVENTS order: the hand check. */
export const WINNERS = [
	"dorahacks-buidl-46541",
	"dorahacks-buidl-42585",
	"dorahacks-buidl-36328",
	"dorahacks-buidl-27456",
	"dorahacks-buidl-32712",
	"dorahacks-buidl-30677",
	"dorahacks-buidl-25335",
	"dorahacks-buidl-39840",
	"dorahacks-buidl-40191",
	"dorahacks-buidl-28436",
];

const BASE = "https://stellarlight.xyz";

async function main(out: string) {
	for (const d of ["detail", "builds", "build"])
		mkdirSync(join(out, d), { recursive: true });
	let last = 0;
	let gets = 0;
	const get = async (path: string): Promise<unknown> => {
		const wait = last + 2_000 - Date.now();
		if (wait > 0) await new Promise((r) => setTimeout(r, wait));
		last = Date.now();
		gets++;
		const res = await fetch(`${BASE}${path}`, {
			headers: { accept: "application/json" },
		});
		if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
		return res.json();
	};
	const save = (name: string, body: unknown) =>
		writeFileSync(join(out, name), `${JSON.stringify(body, null, 1)}\n`);
	type Status = { apiVersion: string; generatedAt: string };
	const start = (await get("/api/status")) as Status;
	save("status-start.json", {
		apiVersion: start.apiVersion,
		generatedAt: start.generatedAt,
	});
	save("list.json", await get("/api/hackathons?limit=300"));
	save(
		"analyze-category.json",
		await get("/api/hackathons/analyze?facet=category&top=30"),
	);
	for (const slug of EVENTS) {
		save(
			join("detail", `${slug}.json`),
			await get(`/api/hackathons/${encodeURIComponent(slug)}`),
		);
		const rows: unknown[] = [];
		let matched = Number.POSITIVE_INFINITY;
		for (let offset = 0; offset < matched; offset += 100) {
			const page = (await get(
				`/api/hackathons/builds?hackathon=${encodeURIComponent(slug)}&limit=100&offset=${offset}`,
			)) as { builds: unknown[]; meta: { counts: { matched: number } } };
			matched = page.meta.counts.matched;
			rows.push(...page.builds);
		}
		if (rows.length !== matched)
			throw new Error(`${slug}: ${rows.length} rows read, ${matched} matched`);
		save(join("builds", `${slug}.json`), rows);
	}
	for (const id of WINNERS)
		save(
			join("build", `${id}.json`),
			await get(`/api/hackathons/builds/${id}`),
		);
	const end = (await get("/api/status")) as Status;
	save("status-end.json", {
		apiVersion: end.apiVersion,
		generatedAt: end.generatedAt,
	});
	console.log(
		`${gets} GETs; apiVersion ${start.apiVersion} at ${start.generatedAt}, ${end.apiVersion} at ${end.generatedAt}`,
	);
}

// Run only as a script: the replay imports EVENTS and WINNERS.
if (process.argv[1]?.endsWith("capture.ts")) {
	const out = process.argv[2];
	if (!out) throw new Error("usage: capture.ts <out-dir>");
	await main(out);
}
