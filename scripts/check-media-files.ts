/**
 * Media files: does every media record's file answer, and which served rows
 * point at one that does not.
 *
 * Measured live on 2026-11-13: 400 of 1,232 media records answered 404 on
 * GET /api/media/file/<filename>, and 137 project rows served one of them as
 * their logo. Nothing looked: the link checker reads external URLs, and a
 * HEAD on a media file answered 404 for files that exist.
 *
 *   pnpm exec tsx scripts/check-media-files.ts              # probe + artifact
 *   pnpm exec tsx scripts/check-media-files.ts --out <file> # artifact elsewhere
 *   --prev <file>   # the last run's artifact (default: the --out path)
 *   BASE_URL=https://www.stellarlight.xyz ...               # the site to read
 *
 * Reads only the public API, with GET: every media record, and every row of
 * the collections that can point at one (MEDIA_SOURCES, src/lib/media-files.ts:
 * project logos, entity logos, carousel images, blog images and rich text).
 * One GET per media file; the body is not downloaded.
 *
 *   hit        200
 *   missing    404, or a row pointing at a record the media list does not hold
 *   unchecked  anything else: never reported as missing
 *
 * A row whose file is missing is a finding (the ledger reads `missing`). A
 * missing file no row points at is listed in `unreferencedMissing` and is not
 * a finding. A file that could not be checked this run keeps the finding the
 * last artifact recorded for it.
 *
 * Exits: 0 nothing new, 1 a served row points at a missing file the last run
 * did not record, 2 could not look (a list did not answer in full, no file
 * answered 200, or more than half the files gave no verdict). A run that
 * could not look writes nothing. The standing set lives in the ledger; the
 * red is for a change.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
	foldMediaRun,
	getMediaStatus,
	MEDIA_SOURCES,
	type MediaDoc,
	type MediaRef,
	type MissingRef,
	mediaRefsIn,
	readAllRows,
} from "../src/lib/media-files";

const BASE = (process.env.BASE_URL || "https://www.stellarlight.xyz").replace(
	/\/$/,
	"",
);
const flag = (name: string) => {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT =
	flag("--out") ??
	join(process.cwd(), "improvements/audits/media-files-latest.json");
const PREV = flag("--prev") ?? OUT;
const CONCURRENCY = 4;

type Row = Record<string, unknown>;

async function main(): Promise<number> {
	// Rows first, records second: a record created in between is in the list
	// its row points into.
	const refRows: Array<{
		source: (typeof MEDIA_SOURCES)[number];
		rows: Row[];
	}> = [];
	for (const source of MEDIA_SOURCES) {
		const select = (source.select ?? [])
			.map((f) => `select[${f}]=true`)
			.join("&");
		const rows = await readAllRows(
			BASE,
			`/api/${source.collection}${select ? `?${select}` : ""}`,
		);
		if (!rows) {
			console.error(
				`INCONCLUSIVE: ${BASE}/api/${source.collection} did not answer in full. No artifact written, no verdict.`,
			);
			return 2;
		}
		refRows.push({ source, rows });
	}
	const media = await readAllRows(BASE, "/api/media");
	if (!media) {
		console.error(
			`INCONCLUSIVE: ${BASE}/api/media did not answer in full. No artifact written, no verdict.`,
		);
		return 2;
	}
	const docs: MediaDoc[] = media.map((d) => ({
		id: String(d.id),
		filename: typeof d.filename === "string" ? d.filename : null,
		url: typeof d.url === "string" ? d.url : null,
		createdAt: typeof d.createdAt === "string" ? d.createdAt : null,
	}));
	const ids = new Set(docs.map((d) => d.id));
	const refs: MediaRef[] = refRows.flatMap(({ source, rows }) =>
		rows.flatMap((row) =>
			mediaRefsIn(source.collection, row, ids, source.uploadFields),
		),
	);
	console.log(
		`media-files: ${docs.length} media record(s), ${refs.length} pointer(s) from ${refRows.map((r) => `${r.rows.length} ${r.source.collection}`).join(", ")} at ${BASE}`,
	);

	const statusOf = new Map<string, number | null>();
	for (let i = 0; i < docs.length; i += CONCURRENCY)
		await Promise.all(
			docs.slice(i, i + CONCURRENCY).map(async (d) => {
				// A record with no filename has no file to ask for: unchecked.
				const path =
					d.url ??
					(d.filename
						? `/api/media/file/${encodeURIComponent(d.filename)}`
						: null);
				statusOf.set(
					d.id,
					path ? await getMediaStatus(`${BASE}${path}`) : null,
				);
			}),
		);

	let prevMissing: MissingRef[] = [];
	try {
		prevMissing = JSON.parse(readFileSync(PREV, "utf8")).missing ?? [];
	} catch {
		/* first run: nothing to carry */
	}
	const run = foldMediaRun({ refs, docs, statusOf, prevMissing });
	const t = run.tally;
	const line = `${t.hit} served, ${t.missing} missing, ${t.unchecked} unchecked of ${t.records} record(s); ${t.refsMissing} served row(s) point at a missing file (${t.refsNewlyMissing} new since the last run), ${t.refsUnchecked} at one not checked; ${t.unreferencedMissing} missing file(s) no row points at`;
	if (run.blind) {
		console.error(
			`BLIND: ${line}\nINCONCLUSIVE: ${t.hit === 0 ? "no file answered 200, so the site may have lost its file store and a 404 proves nothing" : "more than half the files gave no verdict"}. No artifact written.`,
		);
		return 2;
	}

	const report = {
		generatedAt: new Date().toISOString(),
		source: "scripts/check-media-files.ts",
		base: BASE,
		rule: "One GET per media record's file: 200 served, 404 missing, anything else unchecked and never reported as missing. A served row (project, entity, carousel item, blog post) pointing at a missing file is a finding. A missing file no row points at is listed and is not a finding. A file not checked this run keeps the finding the last run recorded. A run in which no file answered 200, or more than half gave no verdict, writes nothing.",
		tally: t,
		missing: run.missing,
		unchecked: run.unchecked,
		unreferencedMissing: run.unreferencedMissing,
	};
	mkdirSync(dirname(OUT), { recursive: true });
	writeFileSync(OUT, `${JSON.stringify(report, null, "\t")}\n`);

	for (const m of run.missing)
		console.log(
			`  ✗ ${m.ref.padEnd(52)} ${String(m.filename ?? m.mediaId).padEnd(40)} ${m.reason}${m.rowStatus ? ` (${m.rowStatus})` : ""}${m.carried ? " (carried)" : ""}`,
		);
	for (const u of run.unchecked) console.log(`  ? ${u.ref} not checked`);
	console.log(`\n${t.refsNewlyMissing ? "RED" : "GREEN"}: ${line}`);
	return t.refsNewlyMissing ? 1 : 0;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error(
			"INCONCLUSIVE (the sweep did not complete):",
			e?.message ?? e,
		);
		process.exit(2);
	});
