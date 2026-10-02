/**
 * Daily snapshot of every published project as the directory serves it, and
 * the lifecycle report computed from every snapshot so far.
 *
 * The directory keeps current state only. This is the dated history that
 * makes "alive N days after launch" measurable, from the first snapshot on.
 *
 *   pnpm exec tsx scripts/data/snapshot-project-status.ts              dry run: counts and the headline
 *   pnpm exec tsx scripts/data/snapshot-project-status.ts --execute    write today's snapshot and the report
 *   add --with-listed-dates to read each project's first-listed date from the
 *   database (the lane does); without it the date is carried from the latest
 *   snapshot that has it.
 *
 * Writes data/snapshots/projects/<YYYY-MM-DD>.json.gz and
 * data/snapshots/projects/lifecycle-report.json. A page that cannot be read
 * aborts the run: a snapshot missing projects would read as deaths.
 */
import "../load-env";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";
import {
	lifecycleMetrics,
	type Snapshot,
	type SnapshotRow,
} from "../../src/lib/lifecycle-metrics";

const API = "https://stellarlight.xyz/api/projects/search";
const DIR = "data/snapshots/projects";
const EXECUTE = process.argv.includes("--execute");
const WITH_LISTED = process.argv.includes("--with-listed-dates");
const FIELDS =
	"slug,status,statusBasis,statusAsOf,lifecycle,lastActivityAt,scfAwarded,scfAwardedRounds,deployment,category,repos";

// biome-ignore lint/suspicious/noExplicitAny: the API's JSON
async function getJson(url: string): Promise<any> {
	let last: unknown;
	for (let attempt = 1; attempt <= 4; attempt++) {
		try {
			const r = await fetch(url, {
				headers: { "User-Agent": "stellarlight-snapshot" },
				signal: AbortSignal.timeout(30_000),
			});
			// A 400 is how the route lists its valid statuses.
			if (r.ok || r.status === 400) return await r.json();
			last = new Error(`${r.status} ${url}`);
		} catch (e) {
			last = e;
		}
		await new Promise((s) => setTimeout(s, 2000 * attempt));
	}
	throw last;
}

const day = (s: unknown) =>
	typeof s === "string" && s.length >= 10 ? s.slice(0, 10) : null;

async function servedProjects(): Promise<{
	rows: SnapshotRow[];
	byStatus: Record<string, number>;
}> {
	const probe = await getJson(`${API}?status=__list__&limit=1`);
	const statuses: string[] = probe.validStatuses ?? [];
	if (!statuses.length) throw new Error("could not read the valid statuses");
	const rows: SnapshotRow[] = [];
	const byStatus: Record<string, number> = {};
	for (const status of statuses) {
		// biome-ignore lint/suspicious/noExplicitAny: the API's JSON
		const got: any[] = [];
		let offset = 0;
		let total = Number.POSITIVE_INFINITY;
		while (offset < total) {
			const d = await getJson(
				`${API}?status=${encodeURIComponent(status)}&limit=100&offset=${offset}&fields=${FIELDS}`,
			);
			const page = d.projects ?? d.results ?? [];
			total = d.meta?.counts?.total ?? 0;
			got.push(...page);
			if (!page.length) break;
			offset += page.length;
		}
		if (got.length !== total)
			throw new Error(`${status}: read ${got.length} of ${total}`);
		byStatus[status] = got.length;
		for (const p of got) {
			rows.push({
				slug: p.slug,
				status: p.status ?? status,
				basis: p.statusBasis ?? null,
				asOf: day(p.statusAsOf),
				wasLive:
					typeof p.lifecycle?.wasLive === "boolean"
						? p.lifecycle.wasLive
						: null,
				lastActivity: day(p.lastActivityAt),
				scf: p.scfAwarded === true,
				scfRounds: (p.scfAwardedRounds ?? [])
					.filter((n: unknown): n is number => typeof n === "number" && n > 0)
					.sort((a: number, b: number) => a - b),
				network: p.deployment?.network ?? null,
				networkBasis: p.deployment?.basis ?? null,
				category: p.category ?? null,
				repos: Array.isArray(p.repos) ? p.repos.length : 0,
				listed: null,
			});
		}
	}
	return { rows, byStatus };
}

/** slug → first-listed date (provenance.firstSeenAt, else the row's creation). */
async function listedDates(): Promise<Map<string, string>> {
	const { getPayload } = await import("payload");
	const configPromise = (await import("../../src/payload.config")).default;
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "projects",
		limit: 0,
		pagination: false,
		depth: 0,
		select: { slug: true, provenance: true, createdAt: true },
	});
	const m = new Map<string, string>();
	for (const d of res.docs as Array<{
		slug?: string;
		provenance?: { firstSeenAt?: string | null } | null;
		createdAt?: string;
	}>) {
		const listed = day(d.provenance?.firstSeenAt) ?? day(d.createdAt);
		if (d.slug && listed) m.set(d.slug, listed);
	}
	return m;
}

function loadHistory(): Snapshot[] {
	let files: string[] = [];
	try {
		files = readdirSync(DIR).filter((f) =>
			/^\d{4}-\d{2}-\d{2}\.json\.gz$/.test(f),
		);
	} catch {
		return [];
	}
	return files.map((f) => {
		const doc = JSON.parse(gunzipSync(readFileSync(`${DIR}/${f}`)).toString());
		return { date: doc.meta.date, projects: doc.projects } as Snapshot;
	});
}

async function main() {
	const today = new Date().toISOString().slice(0, 10);
	const { rows, byStatus } = await servedProjects();
	const unique = new Set(rows.map((r) => r.slug)).size;
	if (unique !== rows.length)
		throw new Error(
			`${rows.length - unique} duplicate slug(s) across statuses`,
		);

	const history = loadHistory().filter((s) => s.date !== today);
	let listedFrom = "none";
	if (WITH_LISTED) {
		const m = await listedDates();
		for (const r of rows) r.listed = m.get(r.slug) ?? null;
		listedFrom = "database";
	} else {
		const prior = [...history]
			.sort((a, b) => b.date.localeCompare(a.date))
			.find((s) => s.projects.some((p) => p.listed));
		if (prior) {
			const m = new Map(prior.projects.map((p) => [p.slug, p.listed]));
			for (const r of rows) r.listed = m.get(r.slug) ?? null;
			listedFrom = `carried from ${prior.date}`;
		}
	}
	rows.sort((a, b) => a.slug.localeCompare(b.slug));

	const snapshot: Snapshot = { date: today, projects: rows };
	const report = lifecycleMetrics([...history, snapshot]);
	const g = report.groups;
	const pct = (n: number, d: number) =>
		d ? `${Math.round((100 * n) / d)}%` : "n/a";
	console.log(
		`snapshot ${today}: ${rows.length} published projects (${Object.entries(
			byStatus,
		)
			.map(([k, v]) => `${k} ${v}`)
			.join(", ")}) · listed dates: ${listedFrom}`,
	);
	for (const [name, c] of [
		["all", g.all],
		["scf", g.scf],
		["non-scf", g.nonScf],
	] as const) {
		console.log(
			`  ${name.padEnd(8)} listed ${c.listed} · launched ${c.launched} · marked live ${c.markedLive} (${pct(c.markedLive, c.launched)}) · live on strong evidence ${c.liveOnStrongEvidence} (${pct(c.liveOnStrongEvidence, c.launched)}) · observed active ${c.observedActive} (${pct(c.observedActive, c.launched)}) · no activity data ${c.noActivityData}`,
		);
	}
	console.log(
		`  history: ${report.snapshots} snapshot(s) since ${report.historyStart}; ${report.survival.windowDays}-day survival available from ${report.survival.availableFrom}`,
	);
	if (!EXECUTE) {
		console.log("\nDRY RUN: nothing written. Re-run with --execute.");
		return;
	}
	mkdirSync(DIR, { recursive: true });
	const takenAt = new Date().toISOString();
	writeFileSync(
		`${DIR}/${today}.json.gz`,
		gzipSync(
			JSON.stringify({
				meta: {
					date: today,
					takenAt,
					source: API,
					byStatus,
					total: rows.length,
					listedFrom,
				},
				projects: rows,
			}),
		),
	);
	writeFileSync(
		`${DIR}/lifecycle-report.json`,
		`${JSON.stringify({ generatedAt: takenAt, source: `${DIR}/*.json.gz`, ...report }, null, "\t")}\n`,
	);
	console.log(
		`\nwrote ${DIR}/${today}.json.gz and ${DIR}/lifecycle-report.json`,
	);
}

main()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
