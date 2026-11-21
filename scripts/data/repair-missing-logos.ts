/**
 * Repair project logos whose file is missing.
 *
 * Measured live on 2026-11-13: 137 project rows serve a logo whose file
 * answers 404. Each was written by the SCF sync from a GitHub Actions runner
 * that had no file store (src/lib/media-files.ts tells it), so the media
 * record exists and the file never reached R2. The sync never comes back: it
 * fetches a thumbnail only for a row with no logo, and these rows have one.
 *
 *   pnpm exec tsx scripts/data/repair-missing-logos.ts             # dry run
 *   pnpm exec tsx scripts/data/repair-missing-logos.ts --only <slug>
 *   pnpm exec tsx scripts/data/repair-missing-logos.ts --execute   # write
 *
 * The plan is read from the public API and SCF's public listing, with GET, in
 * a dry run and an execute alike, so the dry run anyone can reproduce is the
 * plan the execute carries out.
 *
 *   1. Every project row and its logo record; one GET per logo file. Only a
 *      404 is a missing file. A file that could not be checked is left alone.
 *   2. The one source: the image on the row's own SCF page, read from SCF's
 *      listing by the exact page the row stores, and only when the page
 *      confirms the row: a reviewed join, a site on the same full host, a
 *      GitHub owner both link when no other project links it, or the same
 *      repository (pageConfirmsRow, scripts/data/scf-joins.ts). The
 *      stored page alone is not enough: many were joined by name. A row with
 *      no SCF page, a page that confirms nothing or confirms two projects, a
 *      page SCF no longer lists, lists with no image or does not serve
 *      today, and an image that does not download as PNG or JPEG are all
 *      COULD NOT REPAIR: the row is left as it is and the reason is printed.
 *      (Payload re-encodes WebP and GIF on upload, so such a file could
 *      never be read back byte for byte.) Never another project's mark,
 *      never a made image.
 *   3. --execute, per row (runLogoRepairs, src/lib/media-files.ts, where the
 *      order is tested): upload the image as a new media record, GET the new
 *      file back from the site and compare it byte for byte, and only then
 *      point the row's logo at it and read the row back from the API. A file
 *      that does not read back leaves the row untouched. The run stops at
 *      the first upload or file read-back that fails: a store that is not
 *      the one the site serves from must not leave a new record per row. A
 *      row whose own update or read-back fails is counted and the run goes
 *      on, so a retry is not held at one bad row.
 *
 * Nothing is deleted: the old media record stays, with no row pointing at it.
 *
 * Exits: 0 done (rows it could not repair are listed, not a failure),
 * 1 a write or a read-back failed (the last line names the rows), 2 could not
 * look (the API or SCF's listing did not answer in full, or the logo files
 * could not be checked).
 */
import "../load-env";
import { writeFileSync } from "node:fs";
import {
	assertMediaStore,
	getMediaStatus,
	type LogoImage,
	type LogoRow,
	logoSourceType,
	mediaFileVerdict,
	planLogoRepairs,
	readAllRows,
	runLogoRepairs,
	type ScfPageLinks,
	scfThumbnailUrl,
} from "../../src/lib/media-files";
import { readScfPage } from "../eval/scf-official";
import { githubOwnersOfManyRows, pageConfirmsRow } from "./scf-joins";

const BASE = (process.env.BASE_URL || "https://www.stellarlight.xyz").replace(
	/\/$/,
	"",
);
const flag = (name: string) => {
	const i = process.argv.indexOf(name);
	return i >= 0 ? process.argv[i + 1] : undefined;
};
const EXECUTE = process.argv.includes("--execute");
const ONLY = flag("--only") || undefined;
const PLAN_OUT = flag("--plan-out");
const SCF_LISTING = "https://communityfund.stellar.org/backend/projects";
const SCF_PAGE = "https://communityfund.stellar.org/project/";
const UA = "stellarlight-logo-repair/1.0 (+https://stellarlight.xyz)";
const CONCURRENCY = 4;
/** The SCF sync's own floor: anything smaller is an error page, not a logo. */
const MIN_BYTES = 500;
const MAX_BYTES = 15 * 1024 * 1024;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const str = (v: unknown): string | null =>
	typeof v === "string" && v ? v : null;

/** The source image, or why it cannot be used. */
async function download(url: string): Promise<LogoImage | { why: string }> {
	let why = "";
	// One retry: a timeout or a 5xx on one of 100 images is not a verdict.
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt) await sleep(2_000);
		try {
			const res = await fetch(url, {
				headers: { "user-agent": UA },
				signal: AbortSignal.timeout(60_000),
			});
			if (!res.ok) {
				why = `the image answered HTTP ${res.status}`;
				if (res.status < 500) break;
				continue;
			}
			const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
			const kind = logoSourceType(type);
			if ("why" in kind) return kind;
			const buffer = new Uint8Array(await res.arrayBuffer());
			if (buffer.length < MIN_BYTES || buffer.length > MAX_BYTES)
				return { why: `the image is ${buffer.length} bytes` };
			return { buffer, type, ext: kind.ext };
		} catch (e) {
			why = `the image did not download (${e instanceof Error ? e.message : e})`;
		}
	}
	return { why };
}

/** The links on an SCF project page, or null when it could not be read. */
async function readPage(slug: string): Promise<ScfPageLinks | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(`${SCF_PAGE}${slug}`, {
				headers: { accept: "text/html", "user-agent": UA },
				signal: AbortSignal.timeout(30_000),
			});
			if (res.ok) return readScfPage(await res.text(), slug);
			if (res.status === 404) return null;
		} catch {
			/* retried once below */
		}
		await sleep(2_000);
	}
	return null;
}

async function main(): Promise<number> {
	// Before anything is read: an execute with no file store would repeat the
	// defect it repairs.
	if (EXECUTE) assertMediaStore();
	console.log(
		`repair-missing-logos: ${EXECUTE ? "EXECUTE" : "DRY RUN"} against ${BASE}${ONLY ? `, only ${ONLY}` : ""}`,
	);

	const fields = [
		"slug",
		"name",
		"status",
		"canonicalSlug",
		"links",
		"scf",
		"logo",
	];
	const raw = await readAllRows(
		BASE,
		`/api/projects?${fields.map((f) => `select[${f}]=true`).join("&")}`,
		1,
	);
	if (!raw) {
		console.error(
			`INCONCLUSIVE: ${BASE}/api/projects did not answer in full. Nothing planned, nothing written.`,
		);
		return 2;
	}
	const rows: LogoRow[] = raw.map((r) => {
		const logo = r.logo as Record<string, unknown> | string | null | undefined;
		const scf = r.scf as { slug?: unknown } | null | undefined;
		return {
			id: String(r.id),
			slug: String(r.slug),
			name: String(r.name ?? r.slug),
			status: str(r.status),
			canonicalSlug: str(r.canonicalSlug),
			links: (r.links as LogoRow["links"]) ?? null,
			scfSlug: str(scf?.slug),
			logo:
				logo && typeof logo === "object"
					? {
							id: String(logo.id),
							filename: str(logo.filename),
							filesize:
								typeof logo.filesize === "number" ? logo.filesize : null,
						}
					: null,
		};
	});

	// One GET per logo file, through the detector's prober.
	const withLogo = rows.filter((r) => r.logo?.filename);
	const verdicts = new Map<string, ReturnType<typeof mediaFileVerdict>>();
	for (let i = 0; i < withLogo.length; i += CONCURRENCY)
		await Promise.all(
			withLogo.slice(i, i + CONCURRENCY).map(async (r) => {
				const status = await getMediaStatus(
					`${BASE}/api/media/file/${encodeURIComponent(String(r.logo?.filename))}`,
				);
				verdicts.set(r.slug, mediaFileVerdict(status));
			}),
		);
	const count = (v: string) =>
		[...verdicts.values()].filter((x) => x === v).length;
	const unchecked = count("unchecked");
	console.log(
		`  ${rows.length} project row(s), ${withLogo.length} with a logo: ${count("hit")} served, ${count("missing")} missing, ${unchecked} not checked`,
	);
	if (count("hit") === 0 || unchecked * 2 > withLogo.length) {
		console.error(
			"INCONCLUSIVE: no logo file answered 200, or more than half could not be checked, so a 404 proves nothing. Nothing planned, nothing written.",
		);
		return 2;
	}
	const missing = new Set(
		[...verdicts].filter(([, v]) => v === "missing").map(([slug]) => slug),
	);

	// SCF's listing: one GET. An empty or failed listing is an outage, not
	// "no row has an image".
	let listing: unknown;
	try {
		const res = await fetch(SCF_LISTING, {
			headers: { accept: "application/json", "user-agent": UA },
			signal: AbortSignal.timeout(60_000),
		});
		listing = res.ok ? await res.json() : null;
	} catch {
		listing = null;
	}
	if (!Array.isArray(listing) || listing.length === 0) {
		console.error(
			`INCONCLUSIVE: ${SCF_LISTING} did not answer with its rows. Nothing planned, nothing written.`,
		);
		return 2;
	}
	const scfImage = new Map<string, string | null>(
		listing
			.filter((p) => typeof p?.slug === "string")
			.map((p) => [p.slug as string, scfThumbnailUrl(p)]),
	);

	// The page of every row that could be repaired: its links are what says
	// the page is that row's own. One GET each, spaced like the SCF sync's.
	const scfPage = new Map<string, ScfPageLinks | null>();
	for (const r of rows) {
		const slug = r.scfSlug;
		if (!slug || !missing.has(r.slug) || scfPage.has(slug)) continue;
		if (!scfImage.get(slug) || (ONLY && r.slug !== ONLY)) continue;
		scfPage.set(slug, await readPage(slug));
		await sleep(300);
	}

	const ownersOfManyRows = githubOwnersOfManyRows(rows);
	const plans = planLogoRepairs(rows, missing, {
		image: scfImage,
		page: scfPage,
		confirms: (slug, page, row) =>
			pageConfirmsRow(slug, page, row, ownersOfManyRows),
	}).filter((p) => !ONLY || p.row.slug === ONLY);
	if (ONLY && !plans.length)
		console.log(`  ${ONLY}: no project row by that slug serves a missing logo`);

	// Lazy: a dry run needs no database and no secrets.
	const payload = EXECUTE
		? await (async () => {
				const { getPayloadOrInconclusive } = await import(
					"../lib/payload-connect"
				);
				const config = (await import("../../src/payload.config")).default;
				return getPayloadOrInconclusive(await config);
			})()
		: null;

	const run = await runLogoRepairs(plans, {
		base: BASE,
		download: async (url) => {
			const img = await download(url);
			await sleep(150);
			return img;
		},
		write: payload && {
			createMedia: async (f) => {
				const media = await payload.create({
					collection: "media",
					data: { alt: f.alt },
					file: {
						data: Buffer.from(f.buffer),
						name: f.name,
						mimetype: f.type,
						size: f.buffer.length,
					},
					overrideAccess: true,
				});
				return { id: String(media.id), filename: String(media.filename) };
			},
			setLogo: async (rowId, mediaId) => {
				await payload.update({
					collection: "projects",
					id: rowId,
					data: { logo: mediaId },
					overrideAccess: true,
				});
			},
		},
		fetch: (url, init) =>
			fetch(url, {
				...init,
				headers: { ...init?.headers, "user-agent": UA },
			}),
		log: (line) => console.log(line),
	});

	if (PLAN_OUT)
		writeFileSync(PLAN_OUT, `${JSON.stringify(run.out, null, "\t")}\n`);
	const seen = plans.length - run.notAttempted;
	console.log(
		`\n${plans.length} row(s) serve a logo that answers 404${ONLY ? ` (only ${ONLY})` : ""}; ${run.cannot.length}${run.notAttempted ? ` of the ${seen} looked at` : ""} could not be repaired${run.cannot.length ? `: ${run.cannot.join(", ")}` : ""}.`,
	);
	if (unchecked)
		console.log(
			`${unchecked} logo file(s) could not be checked and were left alone.`,
		);
	// The dry run's last line is what the workflow's re-plan reads: after an
	// execute it must say 0.
	console.log(
		EXECUTE
			? `${run.written} repair(s) written, ${run.failed.length} failed${run.failed.length ? ` (${run.failed.join(", ")})` : ""}${run.stoppedAt ? `; STOPPED at ${run.stoppedAt} with ${run.notAttempted} row(s) not attempted` : ""}`
			: `${run.planned} repair(s) planned`,
	);
	return run.failed.length ? 1 : 0;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error("The run did not complete:", e?.message ?? e);
		process.exit(EXECUTE ? 1 : 2);
	});
