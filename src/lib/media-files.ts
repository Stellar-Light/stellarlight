/**
 * Media files: the store guard, the served-file verdict and the fold the
 * daily detector writes.
 *
 * Why this exists. A media record and its file are written by two different
 * systems: the record goes to the database, the file to the object store
 * (Cloudflare R2 through the S3 adapter). The adapter is loaded only when all
 * four R2 variables are set (src/payload.config.ts). Without it Payload falls
 * back to the local disk, so a process with database access and no store
 * wrote a record whose file lived on that machine and vanished with it.
 * Measured on 2026-11-13: 400 of 1,232 media records answered 404, and 137
 * project rows served one of them as their logo. Seven runs of the SCF sync
 * between 2026-06-14 and 2026-09-06 wrote 160 of them, and one run of the
 * curation lane on 2026-09-23 two more, from a GitHub Actions runner whose
 * R2 secrets did not exist until later that day (the run logs print the four
 * variables empty). The other 238 date from 2025-11 and 2025-12, before any
 * lane held the database.
 *
 * The guard, the verdict, the fold and the repair plan are pure. The two
 * readers at the foot (getMediaStatus, readAllRows) fetch, and take the fetch
 * to use so tests can stand in for the network. The Payload hook type is a
 * type-only import.
 */
import type { CollectionBeforeOperationHook } from "payload";

/** All four must be set, or the S3 adapter is not loaded. */
export const MEDIA_STORE_ENV = [
	"R2_ACCESS_KEY_ID",
	"R2_SECRET_ACCESS_KEY",
	"R2_BUCKET",
	"R2_ENDPOINT",
] as const;

type Env = Record<string, string | undefined>;

/** True when an upload has a file store that outlives this process. */
export const mediaStoreConfigured = (env: Env = process.env): boolean =>
	MEDIA_STORE_ENV.every((k) => !!env[k]);

/** Throws, naming the unset variables (never a value), when there is no store. */
export function assertMediaStore(env: Env = process.env): void {
	const unset = MEDIA_STORE_ENV.filter((k) => !env[k]);
	if (unset.length)
		throw new Error(
			`Media upload refused: no file store is configured here (${unset.join(", ")} not set). The file would land on this machine's disk and the record would point at nothing.`,
		);
}

/**
 * Media collection hook. beforeOperation is the first thing a create or an
 * update runs, before the file is generated, written or recorded, so a
 * refusal here leaves no file and no record. An update that carries no new
 * file (an alt text edit) needs no store.
 */
export const requireMediaStore: CollectionBeforeOperationHook = ({
	args,
	operation,
	req,
}) => {
	if (operation === "create" || (operation === "update" && req?.file))
		assertMediaStore();
	return args;
};

// ── the served-file verdict ─────────────────────────────────────────────

/**
 * hit        GET answered 200: the file is served.
 * missing    GET answered 404: the store holds no such file.
 * unchecked  anything else (5xx, 429, a timeout, a thrown fetch): no verdict.
 */
export type MediaVerdict = "hit" | "missing" | "unchecked";

export const mediaFileVerdict = (status: number | null): MediaVerdict =>
	status === 200 ? "hit" : status === 404 ? "missing" : "unchecked";

/** Collections whose served rows can point at a media record: their upload
 *  fields, and the fields to ask for (projects rows are large; the rest are
 *  read whole so an upload inside rich text is seen too). Pinned against
 *  src/collections by a test. */
export const MEDIA_SOURCES: Array<{
	collection: string;
	uploadFields: string[];
	select?: string[];
}> = [
	{
		collection: "projects",
		uploadFields: ["logo"],
		select: ["slug", "status", "logo"],
	},
	{ collection: "entities", uploadFields: ["logo"] },
	{ collection: "carousel", uploadFields: ["image"] },
	{ collection: "blog", uploadFields: ["featuredImage"] },
];

export interface MediaDoc {
	id: string;
	filename: string | null;
	url: string | null;
	createdAt: string | null;
}

export interface MediaRef {
	/** `<collection>/<slug> <field>`: the ledger's probe, stable across runs. */
	ref: string;
	collection: string;
	slug: string;
	field: string;
	rowStatus: string | null;
	mediaId: string;
}

export interface MissingRef extends MediaRef {
	filename: string | null;
	mediaCreatedAt: string | null;
	/** file-404: the record exists, its file answers 404. no-media-record: the
	 *  row points at an id the media list does not hold. */
	reason: "file-404" | "no-media-record";
	httpStatus: number | null;
	/** Not re-checked this run (its GET gave no verdict); kept from the last. */
	carried?: true;
}

/**
 * Every place a row (read at depth 0, so a relation is its id) points at a
 * media record, one ref per top-level field. A value in an upload field is a
 * ref whatever it holds, so a pointer at a deleted record is seen; anywhere
 * else (an upload inside rich text, a group) a string is a ref when it is the
 * id of a known media record.
 */
export function mediaRefsIn(
	collection: string,
	row: Record<string, unknown>,
	mediaIds: ReadonlySet<string>,
	uploadFields: readonly string[] = [],
): MediaRef[] {
	const slug = String(row.slug ?? row.id ?? "");
	const out = new Map<string, MediaRef>();
	const add = (field: string, mediaId: string) =>
		out.set(`${field}|${mediaId}`, {
			ref: `${collection}/${slug} ${field}`,
			collection,
			slug,
			field,
			rowStatus: typeof row.status === "string" ? row.status : null,
			mediaId,
		});
	const walk = (v: unknown, field: string) => {
		if (typeof v === "string") {
			if (mediaIds.has(v)) add(field, v);
		} else if (Array.isArray(v)) for (const x of v) walk(x, field);
		else if (v && typeof v === "object")
			for (const x of Object.values(v)) walk(x, field);
	};
	for (const [field, v] of Object.entries(row)) {
		if (field === "id") continue;
		if (uploadFields.includes(field) && typeof v === "string" && v)
			add(field, v);
		else walk(v, field);
	}
	return [...out.values()];
}

export interface MediaRun {
	/** True when the run cannot speak: no file answered 200 (the serving side
	 *  has lost its store, so every 404 is suspect) or more than half the
	 *  files gave no verdict. A blind run writes nothing. */
	blind: boolean;
	tally: {
		records: number;
		hit: number;
		missing: number;
		unchecked: number;
		refs: number;
		refsMissing: number;
		/** Of refsMissing, the ones the last run did not record. */
		refsNewlyMissing: number;
		refsUnchecked: number;
		unreferencedMissing: number;
	};
	missing: MissingRef[];
	unchecked: MediaRef[];
	unreferencedMissing: string[];
}

/**
 * One run's verdicts. `statusOf` maps a media record id to its GET status
 * (null: the fetch threw). A ref whose file could not be checked this run
 * keeps the finding the last run recorded for the same record: silence from
 * a failed read is not a repair.
 */
export function foldMediaRun(input: {
	refs: MediaRef[];
	docs: MediaDoc[];
	statusOf: ReadonlyMap<string, number | null>;
	prevMissing?: MissingRef[];
}): MediaRun {
	const { refs, docs, statusOf } = input;
	const byId = new Map(docs.map((d) => [d.id, d]));
	const prev = new Map(
		(input.prevMissing ?? []).map((m) => [`${m.ref}|${m.mediaId}`, m]),
	);
	const verdictOf = (id: string) => mediaFileVerdict(statusOf.get(id) ?? null);
	const count = (v: MediaVerdict) =>
		docs.filter((d) => verdictOf(d.id) === v).length;

	const missing: MissingRef[] = [];
	const unchecked: MediaRef[] = [];
	const referenced = new Set<string>();
	for (const r of refs) {
		referenced.add(r.mediaId);
		const doc = byId.get(r.mediaId);
		if (!doc) {
			missing.push({
				...r,
				filename: null,
				mediaCreatedAt: null,
				reason: "no-media-record",
				httpStatus: null,
			});
			continue;
		}
		const v = verdictOf(doc.id);
		if (v === "hit") continue;
		if (v === "missing")
			missing.push({
				...r,
				filename: doc.filename,
				mediaCreatedAt: doc.createdAt,
				reason: "file-404",
				httpStatus: 404,
			});
		else {
			const was = prev.get(`${r.ref}|${r.mediaId}`);
			if (was) missing.push({ ...was, carried: true });
			else unchecked.push(r);
		}
	}
	const unreferencedMissing = docs
		.filter((d) => verdictOf(d.id) === "missing" && !referenced.has(d.id))
		.map((d) => String(d.filename ?? d.id))
		.sort();
	const tally = {
		records: docs.length,
		hit: count("hit"),
		missing: count("missing"),
		unchecked: count("unchecked"),
		refs: refs.length,
		refsMissing: missing.length,
		refsNewlyMissing: missing.filter((m) => !prev.has(`${m.ref}|${m.mediaId}`))
			.length,
		refsUnchecked: unchecked.length,
		unreferencedMissing: unreferencedMissing.length,
	};
	const blind = tally.hit === 0 || tally.unchecked * 2 > tally.records;
	missing.sort((a, b) => a.ref.localeCompare(b.ref));
	return { blind, tally, missing, unchecked, unreferencedMissing };
}

// ── the prober (one per question: the detector and the repair both use it) ──

type Fetch = typeof fetch;
const UA = "stellarlight-media-files/1.0 (+https://stellarlight.xyz)";

/**
 * One GET of a media file; the status is the answer and the body is dropped.
 * A try that gave no verdict (not 200, not 404, or a thrown fetch) is retried
 * once after `retryMs`, so one dropped request is not a blind spot. Never
 * HEAD: until 2026-11-13 a HEAD here answered 404 for files that exist.
 */
export async function getMediaStatus(
	url: string,
	fetchImpl: Fetch = fetch,
	retryMs = 2_000,
): Promise<number | null> {
	let last: number | null = null;
	for (let attempt = 0; attempt < 2; attempt++) {
		if (attempt) await new Promise((r) => setTimeout(r, retryMs));
		try {
			const res = await fetchImpl(url, {
				headers: { "user-agent": UA },
				signal: AbortSignal.timeout(30_000),
			});
			await res.body?.cancel().catch(() => {});
			last = res.status;
			if (last === 200 || last === 404) return last;
		} catch {
			last = null;
		}
	}
	return last;
}

/**
 * Every row of a public Payload list at depth `depth`, or null when it did
 * not answer in full: a page that failed, or a count short of the total. Null
 * is "could not look", never an empty list.
 */
export async function readAllRows(
	base: string,
	path: string,
	depth = 0,
	fetchImpl: Fetch = fetch,
): Promise<Array<Record<string, unknown>> | null> {
	const rows: Array<Record<string, unknown>> = [];
	for (let page = 1; page < 200; page++) {
		try {
			const res = await fetchImpl(
				`${base}${path}${path.includes("?") ? "&" : "?"}depth=${depth}&limit=200&page=${page}`,
				{
					headers: { accept: "application/json", "user-agent": UA },
					signal: AbortSignal.timeout(60_000),
				},
			);
			if (!res.ok) return null;
			const body = (await res.json()) as {
				docs?: Array<Record<string, unknown>>;
				hasNextPage?: boolean;
				totalDocs?: number;
			};
			rows.push(...(body.docs ?? []));
			if (!body.hasNextPage)
				return rows.length === body.totalDocs ? rows : null;
		} catch {
			return null;
		}
	}
	return null;
}

// ── repairing a project logo from its recorded source ───────────────────

/** The image an SCF listing row shows, as the SCF sync reads it. */
// biome-ignore lint/suspicious/noExplicitAny: SCF's listing row
export const scfThumbnailUrl = (scf: any): string | null =>
	scf?.thumbnail?.url ||
	scf?.thumbnail?.file?.thumbnails?.large?.url ||
	scf?.thumbnail?.file?.url ||
	null;

export interface LogoRow {
	id: string;
	slug: string;
	name: string;
	status: string | null;
	/** A lineage shadow names its canonical row; the two are one project. */
	canonicalSlug: string | null;
	links: { website?: string | null; github?: string | null } | null;
	/** The row's SCF page, as the SCF sync stored it. */
	scfSlug: string | null;
	logo: { id: string; filename: string | null; filesize: number | null } | null;
}

/** The links an SCF project page shows. */
export interface ScfPageLinks {
	website?: string | null;
	github?: string | null;
}

export type LogoRepair = {
	row: LogoRow;
} & (
	| {
			action: "repair";
			scfSlug: string;
			sourceUrl: string;
			/** What says the page is this row's: a reviewed join or a shared link. */
			confirmedBy: string;
	  }
	| { action: "could-not-repair"; reason: string }
);

/**
 * What to do about each row whose logo file is missing. The one source is
 * the image on the row's own SCF page. The page a row stores was often
 * joined by name alone (the bridge row, bridge.xyz, stores the page
 * "Bridge+Anchor XOF/USDC for lomi."), so the page must also confirm the
 * row: `confirms` answers what does (a reviewed join, a site on the same
 * host, a GitHub owner both link) or null. A page that confirms two projects repairs
 * neither. No source, no repair: the row is left as it is, with the reason.
 *
 * `image`: SCF page slug to its listing image (null: listed with no image;
 * absent: not in SCF's listing). `page`: page slug to the links read off the
 * page today (null or absent: the page could not be read).
 */
export function planLogoRepairs(
	rows: readonly LogoRow[],
	missing: ReadonlySet<string>,
	scf: {
		image: ReadonlyMap<string, string | null>;
		page: ReadonlyMap<string, ScfPageLinks | null>;
		confirms: (
			pageSlug: string,
			page: ScfPageLinks,
			row: LogoRow,
		) => string | null;
	},
): LogoRepair[] {
	const slugs = new Set(rows.map((r) => r.slug));
	const identityOf = (r: LogoRow) =>
		r.canonicalSlug && slugs.has(r.canonicalSlug) ? r.canonicalSlug : r.slug;
	return rows
		.filter((r) => missing.has(r.slug))
		.map((row): LogoRepair => {
			const no = (reason: string): LogoRepair => ({
				row,
				action: "could-not-repair",
				reason,
			});
			const slug = row.scfSlug;
			if (!slug) return no("the row records no SCF page");
			if (!scf.image.has(slug)) return no(`SCF's listing has no page ${slug}`);
			const sourceUrl = scf.image.get(slug);
			if (!sourceUrl) return no(`SCF lists ${slug} with no image`);
			const page = scf.page.get(slug);
			if (!page) return no(`SCF page ${slug} could not be read today`);
			const confirmedBy = scf.confirms(slug, page, row);
			if (!confirmedBy)
				return no(
					`SCF page ${slug} has no reviewed join to the row and shares no site or GitHub owner with it; a name alone is not enough`,
				);
			const others = rows
				.filter(
					(o) =>
						o.scfSlug === slug &&
						identityOf(o) !== identityOf(row) &&
						scf.confirms(slug, page, o),
				)
				.map((o) => o.slug);
			if (others.length)
				return no(
					`SCF page ${slug} also confirms ${others.sort().join(", ")}; whose mark its image is needs a person`,
				);
			return { row, action: "repair", scfSlug: slug, sourceUrl, confirmedBy };
		})
		.sort((a, b) => a.row.slug.localeCompare(b.row.slug));
}

/**
 * The extension of a source the repair uploads, or why it does not. Only PNG
 * and JPEG: Payload stores those as sent. It runs WebP, GIF and AVIF through
 * sharp on upload, so the stored bytes differ from the source, the read-back
 * could never pass and every attempt would leave a record no row points at.
 */
export function logoSourceType(
	contentType: string,
): { ext: string } | { why: string } {
	const type = contentType.split(";")[0].trim().toLowerCase();
	if (type === "image/png") return { ext: ".png" };
	if (type === "image/jpeg") return { ext: ".jpg" };
	if (["image/webp", "image/gif", "image/avif"].includes(type))
		return {
			why: `the source is ${type}, which Payload re-encodes on upload, so the stored file could not be read back byte for byte`,
		};
	return {
		why: `the source is not an image the repair stores (${type || "no type"})`,
	};
}

// ── the repair's write step ─────────────────────────────────────────────

/** A source image ready to upload. */
export interface LogoImage {
	buffer: Uint8Array;
	type: string;
	ext: string;
}

/** Everything the repair run touches, handed in so a test can stand in for
 *  the store, the database and the site. */
export interface LogoRepairIO {
	/** The site the new file and the row are read back from. */
	base: string;
	/** The source image, or why it cannot be used. */
	download: (url: string) => Promise<LogoImage | { why: string }>;
	/** null in a dry run: nothing is written. */
	write: {
		/** Uploads the file as a new media record; answers the stored name. */
		createMedia: (file: {
			name: string;
			type: string;
			buffer: Uint8Array;
			alt: string;
		}) => Promise<{ id: string; filename: string }>;
		/** Points the row's logo at a media record. */
		setLogo: (rowId: string, mediaId: string) => Promise<void>;
	} | null;
	fetch: Fetch;
	log: (line: string) => void;
	/** A read-back GET is given up after this long (default 60 seconds). */
	readBackTimeoutMs?: number;
}

export interface LogoRepairRun {
	/** Rows with a confirmed source that downloaded. */
	planned: number;
	written: number;
	/** Rows whose write failed, at any step. Any entry fails the run. */
	failed: string[];
	/** The row at which the run stopped: its upload or its file read-back
	 *  failed, which puts the store itself in doubt. null: it ran to the end. */
	stoppedAt: string | null;
	/** Rows left as they are, with a reason printed. */
	cannot: string[];
	/** Rows after the stop that were not looked at. */
	notAttempted: number;
	/** One entry per row looked at, for --plan-out. */
	out: Array<Record<string, unknown>>;
}

const sameBytes = (a: Uint8Array, b: Uint8Array) =>
	a.length === b.length && a.every((v, i) => v === b[i]);
/** An error's message; a DOMException (a fetch timeout) is not always an Error. */
const message = (e: unknown) => {
	const m = (e as { message?: unknown } | null)?.message;
	return typeof m === "string" ? m : String(e);
};

/**
 * One row's write, in the only order that is safe: upload, GET the new file
 * back from the site and compare it byte for byte, and only then point the
 * row at it and read the row back from the public API. A file that does not
 * read back leaves the row untouched.
 *
 * A failure says which kind it is. `store`: the upload failed or the file
 * did not read back, so the store or the site's view of it is in doubt and
 * the next row would fail the same way. `row`: the file is stored and reads
 * back, and this one row would not take it or does not serve it.
 */
async function writeLogoRepair(
	row: LogoRow,
	img: LogoImage,
	name: string,
	sourceUrl: string,
	io: LogoRepairIO & { write: NonNullable<LogoRepairIO["write"]> },
): Promise<
	| { ok: true; mediaId: string; filename: string }
	| { ok: false; kind: "store" | "row"; why: string }
> {
	const timeout = () => AbortSignal.timeout(io.readBackTimeoutMs ?? 60_000);
	let media: { id: string; filename: string };
	try {
		media = await io.write.createMedia({
			name,
			type: img.type,
			buffer: img.buffer,
			alt: `${row.name} logo (${sourceUrl})`,
		});
	} catch (e) {
		return {
			ok: false,
			kind: "store",
			why: `the upload failed (${message(e)})`,
		};
	}

	const fileUrl = `${io.base}/api/media/file/${encodeURIComponent(media.filename)}`;
	let served: string;
	try {
		const back = await io.fetch(fileUrl, { signal: timeout() });
		const bytes = back.ok ? new Uint8Array(await back.arrayBuffer()) : null;
		served =
			bytes && sameBytes(bytes, img.buffer)
				? ""
				: `answered HTTP ${back.status}${bytes ? ` with ${bytes.length} bytes that are not the bytes sent` : ""}`;
	} catch (e) {
		served = `did not answer (${message(e)})`;
	}
	if (served)
		return {
			ok: false,
			kind: "store",
			why: `uploaded media ${media.id} but ${fileUrl} ${served}. The row is unchanged`,
		};

	try {
		await io.write.setLogo(row.id, media.id);
	} catch (e) {
		return {
			ok: false,
			kind: "row",
			why: `media ${media.id} read back, but the row update failed (${message(e)})`,
		};
	}
	let logoNow: unknown;
	try {
		const live = await io.fetch(
			`${io.base}/api/projects/${row.id}?depth=0&select[logo]=true`,
			{ headers: { accept: "application/json" }, signal: timeout() },
		);
		logoNow = live.ok ? (await live.json())?.logo : `HTTP ${live.status}`;
	} catch (e) {
		logoNow = `no answer (${message(e)})`;
	}
	if (String(logoNow) !== media.id)
		return {
			ok: false,
			kind: "row",
			why: `the row was sent logo ${media.id} and the API serves ${logoNow ?? "no logo"}`,
		};
	return { ok: true, mediaId: media.id, filename: media.filename };
}

/**
 * The repair run over a plan: one printed line per row. A dry run (`write`
 * null) downloads each source and says what it would write. An execute
 * writes row by row. It stops at the first store failure (an upload that
 * fails, a file that does not read back): one that repeats, such as a store
 * the site does not serve from, must not leave a new record per row. A
 * failure that is one row's own (its update throws, or the API does not
 * serve it as sent) is counted and the run goes on: stopping there would
 * halt every retry at the same row. Either kind fails the run. A row with no
 * usable source is listed and the run goes on.
 */
export async function runLogoRepairs(
	plans: readonly LogoRepair[],
	io: LogoRepairIO,
): Promise<LogoRepairRun> {
	const run: LogoRepairRun = {
		planned: 0,
		written: 0,
		failed: [],
		stoppedAt: null,
		cannot: [],
		notAttempted: 0,
		out: [],
	};
	for (const [i, p] of plans.entries()) {
		const { row } = p;
		const head = `  ${row.slug} (${row.status ?? "no status"}): ${row.logo?.filename} answers 404.`;
		const giveUp = (reason: string) => {
			run.cannot.push(row.slug);
			run.out.push({
				slug: row.slug,
				status: row.status,
				action: "could-not-repair",
				reason,
			});
			io.log(`${head} COULD NOT REPAIR: ${reason}. Row unchanged.`);
		};
		if (p.action === "could-not-repair") {
			giveUp(p.reason);
			continue;
		}
		const img = await io.download(p.sourceUrl);
		if ("why" in img) {
			giveUp(`${img.why} at ${p.sourceUrl} (SCF page ${p.scfSlug})`);
			continue;
		}
		const name = `${row.slug}-scf${img.ext}`;
		// The lost file's size is still on its record: the same size means SCF
		// shows the image the sync fetched.
		const same =
			row.logo?.filesize === img.buffer.length
				? "the lost file's size"
				: `the lost file was ${row.logo?.filesize ?? "an unknown number of"} bytes`;
		const source = `Source ${p.sourceUrl} (SCF page ${p.scfSlug}, confirmed by ${p.confirmedBy}): ${img.type}, ${img.buffer.length} bytes, ${same}.`;
		run.planned++;
		run.out.push({
			slug: row.slug,
			status: row.status,
			action: "repair",
			lostFile: row.logo?.filename,
			sourceUrl: p.sourceUrl,
			scfSlug: p.scfSlug,
			confirmedBy: p.confirmedBy,
			type: img.type,
			bytes: img.buffer.length,
			upload: name,
		});
		if (!io.write) {
			io.log(
				`${head} ${source} WOULD upload ${name} and point projects/${row.slug} logo at it.`,
			);
			continue;
		}
		const res = await writeLogoRepair(row, img, name, p.sourceUrl, {
			...io,
			write: io.write,
		});
		if (!res.ok) {
			run.failed.push(row.slug);
			if (res.kind === "row") {
				io.log(
					`${head} ${source} FAILED: ${res.why}. The new file is stored; the run goes on.`,
				);
				continue;
			}
			run.stoppedAt = row.slug;
			run.notAttempted = plans.length - i - 1;
			io.log(
				`${head} ${source} FAILED: ${res.why}. STOPPED: ${run.notAttempted} row(s) after this one were not attempted.`,
			);
			break;
		}
		run.written++;
		io.log(
			`${head} ${source} WROTE ${res.filename} (media ${res.mediaId}, read back ${img.buffer.length} bytes) and projects/${row.slug} logo points at it.`,
		);
	}
	return run;
}
