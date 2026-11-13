/**
 * Enrich projects with data from the Stellar Community Fund (SCF).
 *
 * Fetches the public SCF projects API and matches against our DB by name/slug.
 * Pulls in: thumbnail images, category mapping, award status.
 *
 * For matched projects with detail pages, scrapes additional data:
 * description, links (website, X, github), team info, funding amounts.
 *
 * Pages outside the listing (sls-116): SCF's round pages name every numbered
 * round's awards by project record id, so each run reads them and each record
 * outside the listing off its own page, and joins it (joinOffListing).
 *
 * Usage:
 *   npx tsx scripts/enrich-from-scf.ts                  # Dry run
 *   npx tsx scripts/enrich-from-scf.ts --execute        # Write to DB
 *   npx tsx scripts/enrich-from-scf.ts --rows-from https://www.stellarlight.xyz
 *     # Dry run over the rows the public API serves, no database: the plan
 *     # anyone can reproduce before an execute
 *   --plan-out <file>                                   # the planned writes as JSON
 */
import "./load-env";
import { writeFileSync } from "node:fs";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import { curatedFieldsFor } from "./data/curation-maps";
import {
	couldNotCheck,
	foldLinkNote,
	joinOffListing,
	matchListingRow,
	SCF_PAGES_BEYOND_CAP,
	SCF_SHARED_CLAIMS,
	SCF_SLUG_OVERRIDES,
	STRANDED_CEILING,
	strandedAwards,
	strandedWrites,
} from "./data/scf-joins";
import {
	foldPageDetails,
	offListingAwardees,
	readOffListingPages,
	readScfPage,
	readScfRounds,
	SCF,
	type ScfPage,
	scfHold,
	showsAward,
	storedLastRound,
	storedTotal,
	uniqueNames,
} from "./eval/scf-official";

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const flagValue = (name: string) => {
	const i = args.indexOf(name);
	return i >= 0 ? args[i + 1] : undefined;
};
const rowsFrom = flagValue("--rows-from")?.replace(/\/$/, "");
const planOut = flagValue("--plan-out");
// More stranded removals than STRANDED_CEILING are written only when this
// names their count (read them in the dry run first).
const allowStrandedArg = flagValue("--allow-stranded");
if (allowStrandedArg !== undefined && !/^\d+$/.test(allowStrandedArg)) {
	console.error(
		`--allow-stranded takes the count of removals the dry run printed, not "${allowStrandedArg}"`,
	);
	process.exit(1);
}
const allowStranded =
	allowStrandedArg === undefined ? undefined : Number(allowStrandedArg);
if (rowsFrom && !dryRun) {
	console.error(
		"--rows-from reads the public API and only plans; it cannot --execute",
	);
	process.exit(1);
}

const stats = {
	scfProjects: 0,
	matched: 0,
	unmatched: 0,
	enriched: 0,
	scfDataUpdated: 0,
	thumbnailsFetched: 0,
	descriptionsAdded: 0,
	linksAdded: 0,
	skipped: 0,
	held: 0,
	stranded: 0,
	errors: 0,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Joined pages that could not be read this run (could not check). */
const pagesUnread: string[] = [];
/** Every write this run plans, for --plan-out. */
const planned: Array<{ slug: string; data: Record<string, unknown> }> = [];

/** Download image buffer */
async function downloadImage(
	url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
			},
			redirect: "follow",
		});
		if (!res.ok) return null;
		const ct = res.headers.get("content-type") || "image/jpeg";
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length < 500) return null;
		return { buffer: buf, contentType: ct };
	} catch {
		return null;
	}
}

function getExtension(ct: string): string {
	const map: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/jpg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
	};
	return map[ct.split(";")[0]] || ".jpg";
}

/** One SCF page per slug per run: the round discovery reads some pages the
 * beyond-cap map and the fold read again. */
const pageMemo = new Map<string, ScfPage | null>();

/** An SCF page's HTML, or null; one retry, since one dropped request of a
 * few hundred would otherwise read as could-not-check. */
async function scfText(url: string): Promise<string | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			const res = await fetch(url, {
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
					Accept: "text/html",
				},
			});
			if (res.ok) return await res.text();
			if (res.status === 404) return null;
		} catch {
			/* retried once below */
		}
		await sleep(2000);
	}
	return null;
}

/** Scrape project detail page for additional data */
async function scrapeDetailPage(slug: string): Promise<ScfPage | null> {
	if (pageMemo.has(slug)) return pageMemo.get(slug) ?? null;
	const html = await scfText(
		`https://communityfund.stellar.org/project/${slug}`,
	);
	const page = html === null ? null : readScfPage(html, slug);
	pageMemo.set(slug, page);
	return page;
}

/** One page of rows as the public API serves them (--rows-from), in the
 * shape payload.find returns: the fields this script reads. */
async function publicRows(
	base: string,
	page: number,
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape, as payload.find
): Promise<{ docs: any[]; hasNextPage: boolean; totalDocs: number }> {
	const fields = [
		"slug",
		"name",
		"canonicalSlug",
		"scf",
		"links",
		"logo",
		"shortDescription",
	];
	const url = `${base}/api/projects?limit=100&page=${page}&depth=0&${fields.map((f) => `select[${f}]=true`).join("&")}`;
	const res = await fetch(url, { headers: { Accept: "application/json" } });
	if (!res.ok) {
		console.error(
			`✗ ${url} answered HTTP ${res.status}; exiting 2 (could not check).`,
		);
		process.exit(2);
	}
	return res.json();
}

// SCF encodes an award it does not number (Public Goods, Liquidity, RFP) as
// a NEGATIVE lastAwardedRound code on the page; the award detection below
// reads those codes deliberately, and only storedLastRound (scf-official.ts)
// turns the value into the stored round: six rows once served
// `lastAwardedRound: -326`.

async function main() {
	console.log("=== Enrich Projects from Stellar Community Fund ===");
	console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
	console.log("");

	// 1. Fetch SCF projects
	console.log("Fetching SCF projects...");
	const scfRes = await fetch(
		"https://communityfund.stellar.org/backend/projects",
	);
	if (!scfRes.ok) {
		console.error(`Failed to fetch SCF projects: ${scfRes.status}`);
		process.exit(1);
	}
	const scfProjects: any[] = await scfRes.json();
	stats.scfProjects = scfProjects.length;
	console.log(`Fetched ${scfProjects.length} SCF projects\n`);
	// An EMPTY listing is an outage, not a clean sweep (the silent-params /
	// empty-vs-empty class): 200-with-zero-rows must not exit green.
	if (scfProjects.length === 0) {
		console.error(
			"✗ SCF listing returned 0 projects — outage or contract change; exiting 1.",
		);
		process.exit(1);
	}

	// 2. Connect to Payload (none with --rows-from: the plan reads the
	// public API, which serves every row, Drafts included, with its scf group)
	const payload = rowsFrom
		? null
		: await (async () => {
				console.log("Connecting to database...");
				const p = await getPayload({ config: configPromise });
				console.log("Connected.\n");
				return p;
			})();

	// 3. Build lookup of our projects by normalized name and slug
	let page = 1;
	const ourProjects: any[] = [];
	while (true) {
		const r = payload
			? await payload.find({
					collection: "projects",
					limit: 100,
					page,
					depth: 0,
				})
			: await publicRows(String(rowsFrom), page);
		ourProjects.push(...r.docs);
		if (!r.hasNextPage) {
			if (ourProjects.length !== r.totalDocs) {
				console.error(
					`✗ read ${ourProjects.length} rows of a total ${r.totalDocs}; exiting 2 (could not check).`,
				);
				process.exit(2);
			}
			break;
		}
		page++;
	}
	console.log(
		`Loaded ${ourProjects.length} projects from ${rowsFrom ? `${rowsFrom}/api/projects` : "DB"}\n`,
	);

	const bySlug = new Map<string, any>();
	for (const p of ourProjects) bySlug.set(p.slug, p);
	// a lineage shadow and its canonical row are one project
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	const identityOf = (p: any) =>
		p.canonicalSlug && bySlug.has(p.canonicalSlug) ? p.canonicalSlug : p.slug;
	// One exact name, one project (sls-111): a name two projects carry joins
	// neither. The map used to keep whichever row loaded last.
	const byNormName = uniqueNames(ourProjects, identityOf, (name, rows) =>
		console.log(
			`  shared name "${name}": ${rows.map((r) => r.slug).join(", ")}; no page joins either by name, a person decides`,
		),
	);

	// 4. Match and enrich (SCF_SLUG_OVERRIDES: scripts/data/scf-joins.ts)

	// SCF_PAGES_BEYOND_CAP and SCF_SLUG_OVERRIDES: scripts/data/scf-joins.ts

	const matched: { scf: any; ours: any }[] = [];
	const unmatched: string[] = [];

	for (const scf of scfProjects) {
		let ours = matchListingRow(
			scf,
			{ rows: ourProjects, bySlug, byNormName, identityOf },
			(proj, why) =>
				console.log(
					`  partial REJECTED (${why}): ours "${proj.name}" vs SCF "${scf.title}"`,
				),
		);

		// A lineage shadow (Draft + canonicalSlug, #1337) is not a record. The
		// name matcher joined "Liqvid" to the parked duplicate `liqvid` and wrote
		// the page there, while the canonical `liqvidxyz` kept a dead slug and no
		// round awards. Re-key to the canonical row — one page, one row.
		if (ours?.canonicalSlug) {
			const canon = bySlug.get(String(ours.canonicalSlug));
			if (canon) {
				console.log(
					`  ${ours.slug}: shadow of ${canon.slug} — page ${scf.slug} re-keyed to the canonical row`,
				);
				ours = canon;
			}
		}
		if (ours) {
			matched.push({ scf, ours });
		} else {
			unmatched.push(scf.title);
		}
	}

	stats.matched = matched.length;
	stats.unmatched = unmatched.length;

	console.log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}\n`);

	if (unmatched.length > 0) {
		console.log("Unmatched SCF projects:");
		for (const name of unmatched) {
			console.log(`  - ${name}`);
		}
		console.log("");
	}

	// 4b. Beyond-cap pages: fetched here, parsed by the SAME scrapeDetailPage,
	// queued as synthetic listing rows for the loop below. Trinary on purpose
	// (awarded / not-awarded-on-page / could-not-parse): a page that cannot be
	// read is reported and exits 2 — never a silent "not awarded".
	const beyondCap = {
		queued: [] as string[],
		notAwarded: [] as string[],
		unparseable: [] as string[],
	};
	const listedSlugs = new Set(scfProjects.map((p) => String(p.slug)));
	const matchedOurSlugs = new Set(matched.map((m) => m.ours.slug));
	for (const [ourSlug, scfSlug] of Object.entries(SCF_PAGES_BEYOND_CAP)) {
		if (listedSlugs.has(scfSlug) || matchedOurSlugs.has(ourSlug)) {
			console.log(
				`  beyond-cap ${scfSlug}: now served by the listing — the normal path owns it`,
			);
			continue;
		}
		const ours = bySlug.get(ourSlug);
		if (!ours) {
			beyondCap.unparseable.push(`${scfSlug} (our row ${ourSlug} missing)`);
			continue;
		}
		const detail = await scrapeDetailPage(scfSlug);
		await sleep(300);
		if (!detail) {
			beyondCap.unparseable.push(
				`${scfSlug} (HTTP error, network failure or no project payload at that slug)`,
			);
			continue;
		}
		if (!showsAward(detail)) {
			if ((detail.verdictSubmissions ?? 0) > 0)
				beyondCap.notAwarded.push(scfSlug);
			else beyondCap.unparseable.push(`${scfSlug} (page verdicts nothing)`);
			continue;
		}
		beyondCap.queued.push(scfSlug);
		matched.push({
			scf: {
				slug: scfSlug,
				title: detail.title ?? ours.name,
				// NOT storedLastRound() here: this value is the award SIGNAL that
				// isAwarded reads below, and a non-numbered award is encoded as a
				// negative code. Clamping it here flipped every Public Goods row
				// (the four Stellar SDKs, opengrants, scaffold-stellar) to
				// awarded=false in the 2026-09-06 dry run. The clamp belongs only
				// where the value is STORED.
				lastAwardedRound: detail.lastAwardedRound ?? null,
				detail,
			},
			ours,
		});
	}
	console.log(
		`Beyond-cap pages: ${beyondCap.queued.length} awarded (queued) · ${beyondCap.notAwarded.length} not awarded on page (no write) · ${beyondCap.unparseable.length} could not parse\n`,
	);

	// 4c. Pages outside the listing, found on SCF's round pages (sls-116).
	// Each numbered round's page names its awards by project record id; a
	// record the listing does not carry is read off its own page and joined
	// by a reviewed entry or a name a shared link confirms (joinOffListing).
	// A name alone joins nothing: it is printed for a person. Trinary like the
	// beyond-cap pages: a round page or record page that cannot be read is
	// could-not-check (exit 2), never "no award".
	const offList = {
		joined: [] as string[],
		unjoined: [] as string[],
		noAward: 0,
		unread: [] as string[],
	};
	const rounds = await readScfRounds(scfText, 1000);
	if (!rounds) offList.unread.push(`${SCF}/awards (the round index)`);
	for (const r of rounds ?? [])
		if (!r.submissions) offList.unread.push(`the SCF #${r.round} round page`);
	const offIds = offListingAwardees(
		rounds ?? [],
		new Set(scfProjects.map((p) => String(p.id))),
	);
	const off = await readOffListingPages(offIds, scfText, 300);
	for (const id of off.unread) offList.unread.push(`${SCF}/project/${id}`);
	const queued = new Set(matched.map((m) => String(m.scf.slug)));
	const joinIndex = { rows: ourProjects, bySlug, byNormName, identityOf };
	for (const p of off.pages) {
		pageMemo.set(p.slug, p.page);
		if (queued.has(p.slug)) continue; // the beyond-cap map queued it above
		if (!showsAward(p.page)) {
			offList.noAward++;
			continue;
		}
		const label = `#${(p.page.awardedRounds ?? []).join(" #") || " (an award SCF does not number)"}`;
		const j = joinOffListing(
			{
				slug: p.slug,
				title: p.title,
				website: p.page.website,
				github: p.page.github,
			},
			joinIndex,
		);
		if ("why" in j) {
			offList.unjoined.push(
				`${p.slug} ${label}: ${j.why}${j.candidate ? `; check ${j.candidate.slug}` : ""}`,
			);
			continue;
		}
		const ours =
			j.row.canonicalSlug && bySlug.has(j.row.canonicalSlug)
				? bySlug.get(j.row.canonicalSlug)
				: j.row;
		offList.joined.push(`${p.slug} ${label} -> ${ours.slug} (${j.how})`);
		matched.push({
			scf: {
				slug: p.slug,
				title: p.title,
				// the award SIGNAL, unclamped (see the beyond-cap loop above)
				lastAwardedRound: p.page.lastAwardedRound ?? null,
				detail: p.page,
			},
			ours,
		});
	}
	console.log(
		`Off-listing pages (SCF's round pages): ${rounds?.length ?? 0} rounds read, ${offIds.length} records outside the listing, ${offList.joined.length} joined, ${offList.unjoined.length} not joined, ${offList.noAward} with no award on the page, ${offList.unread.length} could not read`,
	);
	for (const s of offList.joined) console.log(`  joined:     ${s}`);
	for (const s of offList.unjoined) console.log(`  not joined: ${s}`);
	console.log("");

	// One row, several pages (2026-09-06). A project with a submission-named
	// second page (ctx, untangled, lobster, coala-pay) was written once PER
	// PAGE and the last page won: the exact-replace dropped the other page's
	// award on every execute, curate's promote-only linkage put it back, and
	// the row flipped between runs. Pages mapped to one row are read first and
	// folded into one record: rounds and round awards are the union, the total
	// is the sum of the pages' own totals (undefined when any page withholds
	// it — never derived from round sums), and the citable slug is the page the
	// name matcher joined (the project-named one), else the page with the
	// latest numbered round.
	const byRow = new Map<string, { scf: any; ours: any }[]>();
	for (const m of matched) {
		const list = byRow.get(m.ours.slug) ?? [];
		list.push(m);
		byRow.set(m.ours.slug, list);
	}
	const folded: { scf: any; ours: any }[] = [];
	for (const list of byRow.values()) {
		if (list.length === 1) {
			folded.push(list[0]);
			continue;
		}
		for (const m of list) {
			if (m.scf.detail === undefined) {
				m.scf.detail = await scrapeDetailPage(String(m.scf.slug));
				await sleep(300);
			}
		}
		const ours = list[0].ours;
		const viaOverride = (p: any) =>
			Number(SCF_SLUG_OVERRIDES[String(p.slug)] === ours.slug);
		const top = (p: any) =>
			Math.max(0, ...((p.detail?.awardedRounds ?? []) as number[]));
		const pages = list
			.map((m) => m.scf)
			.sort(
				(a, b) =>
					viaOverride(a) - viaOverride(b) ||
					top(b) - top(a) ||
					String(a.slug).localeCompare(String(b.slug)),
			);
		const primary = pages[0];
		// Two NAME-matched pages on one row are two SCF records titled alike:
		// a second submission of one project (swiftex), a second product of
		// one company (cashabroad's Smart Treasury), or another project's page
		// retitled (wellspring-xuv, RampMeDaddy's page, folded into wellspring
		// until 2026-11-07). A link every page shares with the row (its site,
		// or its exact GitHub repo) confirms the fold; without one a reader
		// must, so the log says WARN.
		const byName = pages.filter((p) => !viaOverride(p));
		if (byName.length > 1) {
			const names = byName.map((p) => p.slug).join(", ");
			const shared = foldLinkNote(
				byName.map((p) => ({
					website: p.detail?.website,
					github: p.detail?.github,
				})),
				ours,
			);
			console.log(
				shared
					? `  ${ours.slug}: ${byName.length} pages joined by name, confirmed by links (${shared}): ${names}`
					: `  WARN ${ours.slug}: ${byName.length} pages joined by NAME alone (${names}), and no link confirms they are one project; confirm before trusting the fold`,
			);
		}
		const detail = foldPageDetails(pages.map((p) => p.detail));
		if (!detail) {
			// one member page unread: an exact write of the rest would drop its
			// awards, so the row keeps what it stores and the run exits 2
			for (const p of pages)
				if (!p.detail)
					pagesUnread.push(
						`${p.slug} (fold member of ${ours.slug}; the row is left as stored)`,
					);
			continue;
		}
		const lastAwardedRound =
			Math.max(...pages.map((p) => Number(p.lastAwardedRound) || 0)) ||
			primary.lastAwardedRound;
		console.log(
			`  ${ours.slug}: ${pages.length} SCF pages folded → ${primary.slug} (${pages
				.map(
					(p) =>
						`${p.slug} ${p.detail ? `#${(p.detail.awardedRounds ?? []).join(" #") || "—"}` : "unread"}`,
				)
				.join(" + ")})`,
		);
		folded.push({ scf: { ...primary, lastAwardedRound, detail }, ours });
	}

	// 5. Enrich matched projects
	for (const { scf, ours } of folded) {
		console.log(
			`  ${ours.name} ← SCF "${scf.title}" (round ${scf.lastAwardedRound})`,
		);
		const updateData: any = {};

		// --- SCF round data: always update ---
		const currentScf = ours.scf || {};

		// Scrape detail page early so we can include totalAwarded in SCF data
		const detail: Awaited<ReturnType<typeof scrapeDetailPage>> =
			scf.detail ?? (await scrapeDetailPage(scf.slug));
		// could not check: the row keeps what it stores, and the summary
		// names the page, never "no award"
		if (!detail) pagesUnread.push(`${scf.slug} (${ours.slug})`);

		// The SCF API encodes special award types (Liquidity / Public Goods / RFP)
		// as NEGATIVE lastAwardedRound codes — those ARE awards. The old
		// `lastAwardedRound > 0` check silently dropped Blend, Soroswap, Aquarius,
		// FxDAO, Phoenix, Slender, Scaffold Stellar, SoroPG, the Stellar SDKs, etc.
		// Treat any non-zero round, or a positive totalAwarded / any awarded rounds,
		// as funded.
		const isAwarded =
			(typeof scf.lastAwardedRound === "number" &&
				scf.lastAwardedRound !== 0) ||
			(detail?.totalAwarded ?? 0) > 0 ||
			(detail?.awardedRounds?.length ?? 0) > 0;

		const pageDiffers =
			// provenance first-stamp: a row missing the citation trio IS new data
			// (the trio ships 2026-08-12; without this the stamp only rides award
			// deltas and an already-converged corpus never gets it — the
			// advertised-but-never-persisted class, on the provenance feature
			// itself)
			!currentScf.basis ||
			currentScf.sourceUrl !==
				`https://communityfund.stellar.org/project/${scf.slug}` ||
			currentScf.awarded !== isAwarded ||
			// Compare like with like: the stored field is clamped by storedLastRound,
			// so testing it against the RAW page signal made every non-numbered
			// award row differ forever — it wrote null, still saw -326, and
			// re-planned on the next run. The Idempotence step caught exactly
			// that: 6 rows (the four Stellar SDKs, opengrants, scaffold-stellar)
			// still planned after the 2026-09-06 execute.
			currentScf.lastAwardedRound !==
				storedLastRound(scf.lastAwardedRound, detail?.awardedRounds) ||
			currentScf.slug !== scf.slug ||
			// the page's total, cleared when the page discloses none (sls-116:
			// StellarPay kept $148,400 beside a page whose total is 0)
			(storedTotal(detail?.totalAwarded, detail?.roundAwards) !== undefined &&
				(currentScf.totalAwarded ?? null) !==
					storedTotal(detail?.totalAwarded, detail?.roundAwards)) ||
			(detail?.awardedRounds &&
				JSON.stringify(currentScf.awardedRounds) !==
					JSON.stringify(detail.awardedRounds)) ||
			// roundAwards drift: compare on the value tuple only — the stored
			// rows carry Payload array-row ids the scrape doesn't have.
			// awardName is part of the tuple: a non-numbered award has round
			// null, so without the name two different Liquidity Awards compare
			// equal and a real change would read as no drift.
			(detail?.roundAwards &&
				JSON.stringify(
					(currentScf.roundAwards ?? []).map(
						(r: {
							round: number | null;
							awardName?: string | null;
							amountUSD?: number | null;
							awardType?: string | null;
						}) => [
							r.round ?? null,
							r.awardName ?? null,
							r.amountUSD ?? null,
							r.awardType ?? null,
						],
					),
				) !==
					JSON.stringify(
						detail.roundAwards.map((r) => [
							r.round ?? null,
							r.awardName ?? null,
							r.amountUSD,
							r.awardType,
						]),
					));

		// One field, one writer: a human-verified block (curate SCF_FIX) is the
		// writer of record for its values. The page's total can include an
		// ineligible round (aquarius: page $391k, paid $291k), and curate syncs
		// the rounds exactly, so this lane writes nothing to such a row
		// (scfHold below). What the page shows that the block lacks is logged
		// for a human to carry into SCF_FIX (sls-111; until then the lane
		// added it, and curate took it away again).
		const humanOwned = currentScf.basis === "human-verified";
		const storedRounds: number[] = (currentScf.awardedRounds ?? []).map(Number);
		// biome-ignore lint/suspicious/noExplicitAny: Payload array rows
		const storedRA: any[] = currentScf.roundAwards ?? [];
		// biome-ignore lint/suspicious/noExplicitAny: scrape + Payload rows
		const raKey = (r: any) => `${r.round ?? ""}|${r.awardName ?? ""}`;
		const storedRAKeys = new Set(storedRA.map(raKey));
		const addRounds = (detail?.awardedRounds ?? []).filter(
			(r) => !storedRounds.includes(r),
		);
		const addRA = (detail?.roundAwards ?? []).filter(
			(r) => !storedRAKeys.has(raKey(r)),
		);
		const pageUrl = `https://communityfund.stellar.org/project/${scf.slug}`;
		const hasNewData = humanOwned
			? addRounds.length > 0 ||
				addRA.length > 0 ||
				currentScf.slug !== scf.slug ||
				currentScf.sourceUrl !== pageUrl
			: pageDiffers;

		// scfHold (scf-official.ts): curate's rows, a removal an SCF correction
		// made (fix-scf-rounds' poison clears), and an unread false on a page
		// that awards nothing (the coopstable no-resurrect class) all stand. An
		// official-record false (the boolean fix) yields to an award in a round
		// after the rounds the page marks lost. An unread false yields to a
		// page that shows an award in any form: the Awarded-card count alone
		// held enable at false over its page-pinned #45 (2026-10-03).
		const hold = scfHold(currentScf, detail, isAwarded);

		if (hasNewData && hold) {
			console.log(
				`    SCF: HOLD (${hold}); page shows +rounds [${addRounds.join(", ")}] +awards ${addRA.map((r) => `#${r.round ?? r.awardName}:$${r.amountUSD ?? "?"}`).join(" ") || "none"}, slug=${scf.slug}`,
			);
			stats.held++;
		} else if (hasNewData) {
			updateData.scf = {
				awarded: isAwarded,
				lastAwardedRound: storedLastRound(
					scf.lastAwardedRound,
					detail?.awardedRounds,
				),
				slug: scf.slug,
				// provenance trio: parsed from the official page, dated, citable.
				// human-verified (curate SCF_FIX) outranks the page and must survive
				// enrich passes — the curation-reverted-by-sync class.
				basis:
					currentScf.basis === "human-verified"
						? "human-verified"
						: "official-record",
				asOf: new Date().toISOString().slice(0, 10),
				sourceUrl: `https://communityfund.stellar.org/project/${scf.slug}`,
				...(storedTotal(detail?.totalAwarded, detail?.roundAwards) !== undefined
					? {
							totalAwarded: storedTotal(
								detail?.totalAwarded,
								detail?.roundAwards,
							),
						}
					: {}),
				...(detail?.awardedRounds
					? { awardedRounds: detail.awardedRounds }
					: {}),
				...(detail?.roundAwards?.length
					? { roundAwards: detail.roundAwards }
					: {}),
			};
			console.log(
				`    SCF: awarded=${isAwarded}, round=${scf.lastAwardedRound}, slug=${scf.slug}, totalAwarded=${detail?.totalAwarded ?? "N/A"}, roundAwards=${detail?.roundAwards?.map((r) => `#${r.round}:$${r.amountUSD ?? "?"}`).join(" ") ?? "N/A"}`,
			);
			stats.scfDataUpdated++;
		}

		// --- Thumbnail: use SCF image if project has no logo ---
		if (!ours.logo && scf.thumbnail) {
			const imgUrl =
				scf.thumbnail.url ||
				scf.thumbnail.file?.thumbnails?.large?.url ||
				scf.thumbnail.file?.url;
			if (imgUrl) {
				if (dryRun || !payload) {
					console.log(`    WOULD FETCH thumbnail: ${imgUrl.slice(0, 80)}...`);
					stats.thumbnailsFetched++;
				} else {
					const img = await downloadImage(imgUrl);
					if (img) {
						try {
							const ext = getExtension(img.contentType);
							const media = await payload.create({
								collection: "media",
								data: { alt: `${ours.name} logo` },
								file: {
									data: img.buffer,
									name: `${ours.slug}-scf${ext}`,
									mimetype: img.contentType,
									size: img.buffer.length,
								},
							});
							updateData.logo = media.id;
							stats.thumbnailsFetched++;
							console.log(
								`    THUMBNAIL: ${(img.buffer.length / 1024).toFixed(1)}KB`,
							);
						} catch (err) {
							console.log(
								`    THUMBNAIL ERROR: ${err instanceof Error ? err.message : String(err)}`,
							);
						}
					}
				}
			}
		}

		// --- Use scraped detail page for richer data ---
		if (detail) {
			// Add description if we don't have one
			if (detail.description && !ours.shortDescription) {
				updateData.shortDescription = detail.description;
				stats.descriptionsAdded++;
				console.log(`    DESC: "${detail.description.slice(0, 60)}..."`);
			}

			// Add links we're missing. A field a curation registry owns (a
			// removed dead or hijacked link) is never refilled from the page, or
			// this lane and curate would flip it on alternate runs.
			const currentLinks = ours.links || {};
			const newLinks: any = { ...currentLinks };
			let linksChanged = false;
			const owned = curatedFieldsFor(String(ours.slug ?? ""));

			if (
				detail.website &&
				!currentLinks.website &&
				!owned.has("links.website")
			) {
				newLinks.website = detail.website;
				linksChanged = true;
			}
			if (
				detail.twitter &&
				!currentLinks.twitter &&
				!owned.has("links.twitter")
			) {
				newLinks.twitter = detail.twitter;
				linksChanged = true;
			}
			if (detail.github && !currentLinks.github && !owned.has("links.github")) {
				newLinks.github = detail.github;
				linksChanged = true;
			}

			if (linksChanged) {
				updateData.links = newLinks;
				stats.linksAdded++;
				console.log(`    LINKS: ${JSON.stringify(newLinks)}`);
			}
		}

		// --- Apply ---
		if (Object.keys(updateData).length > 0) {
			planned.push({ slug: ours.slug, data: updateData });
			if (!dryRun && payload) {
				try {
					await payload.update({
						collection: "projects",
						id: ours.id,
						data: updateData,
					});
				} catch (err) {
					console.log(
						`    UPDATE ERROR: ${err instanceof Error ? err.message : String(err)}`,
					);
					stats.errors++;
					continue;
				}
			}
			stats.enriched++;
		} else {
			stats.skipped++;
			console.log(`    SKIP: nothing new to add`);
		}

		await sleep(300); // Be respectful to SCF server
	}

	// 6. One page, one row (sls-116). A row whose stored award was copied
	// from a page another project joins this run loses it (strandedAwards):
	// StellarPay served Arculus's SCF #30 and $148,400 because nothing re-read
	// a row no page joins. The cleared record is an unread one (basis null),
	// not a finding that SCF never funded the row, so a page of its own can
	// still join it later.
	const joinedPage = new Map(
		matched.map((m) => [String(m.scf.slug), identityOf(m.ours)]),
	);
	const joinedIds = new Set(folded.map((f) => identityOf(f.ours)));
	// Folds join every member page even when the row was skipped for an
	// unread one, so the row stays its pages' owner.
	for (const list of byRow.values())
		for (const m of list) joinedIds.add(identityOf(m.ours));
	for (const [slug, c] of Object.entries(SCF_SHARED_CLAIMS))
		if (bySlug.get(slug)?.scf?.slug === c.page)
			console.log(
				`  ${slug}: KEEP the SCF award from ${c.page}, which joins ${c.joinedTo} (reviewed shared claim: ${c.why})`,
			);
	const unchecked = couldNotCheck({
		beyondCap: beyondCap.unparseable,
		roundPath: offList.unread,
		joinedPages: pagesUnread,
	});
	const stranded = strandedAwards(
		ourProjects,
		joinedPage,
		joinedIds,
		identityOf,
	);
	const { write: strandedToWrite, refused: strandedRefused } = strandedWrites(
		stranded,
		{
			ceiling: STRANDED_CEILING,
			allow: allowStranded,
			couldNotCheck: unchecked,
		},
	);
	if (strandedRefused) {
		console.log(
			`  STRANDED PASS SKIPPED (${strandedRefused}); nothing below is written:`,
		);
		for (const { row, page, owner } of stranded)
			console.log(
				`    ${row.slug}: would remove the SCF award copied from ${page}, which joins ${owner}`,
			);
	}
	for (const { row, page, owner } of strandedToWrite) {
		console.log(
			`  ${row.name} (${row.slug}): REMOVE the SCF award copied from ${page}, which joins ${owner}: rounds [${(row.scf?.awardedRounds ?? []).join(", ")}], total ${row.scf?.totalAwarded ?? "none"}`,
		);
		const data = {
			scf: {
				awarded: false,
				lastAwardedRound: null,
				slug: null,
				totalAwarded: null,
				awardedRounds: [],
				roundAwards: [],
				basis: null,
				asOf: null,
				sourceUrl: null,
			},
		};
		planned.push({ slug: row.slug, data });
		if (!dryRun && payload) {
			try {
				await payload.update({ collection: "projects", id: row.id, data });
			} catch (err) {
				console.log(
					`    UPDATE ERROR: ${err instanceof Error ? err.message : String(err)}`,
				);
				stats.errors++;
				continue;
			}
		}
		stats.stranded++;
		stats.enriched++;
	}
	// A stored page that joins no row this run: the award stands, unread, so
	// a person can join it (the six rows sls-116 found this way were missing
	// joins, not wrong ones).
	const unreadAwards = ourProjects.filter(
		(r) =>
			r.scf?.awarded &&
			r.scf?.slug &&
			r.scf?.basis !== "human-verified" &&
			!joinedPage.has(String(r.scf.slug)) &&
			!joinedIds.has(identityOf(r)),
	);
	for (const r of unreadAwards)
		console.log(
			`  ${r.slug}: its stored page ${r.scf.slug} joins no row this run; rounds [${(r.scf.awardedRounds ?? []).join(", ")}] stand, unread`,
		);

	if (planOut) {
		writeFileSync(planOut, `${JSON.stringify(planned, null, 1)}\n`);
		console.log(
			`\nPlanned writes: ${planned.length} rows, written to ${planOut}`,
		);
	}

	console.log("\n=== SUMMARY ===");
	console.log(`Mode:               ${dryRun ? "DRY RUN" : "EXECUTED"}`);
	console.log(`SCF projects:       ${stats.scfProjects}`);
	console.log(`Matched to DB:      ${stats.matched}`);
	console.log(`Unmatched:          ${stats.unmatched}`);
	console.log(`Enriched:           ${stats.enriched}`);
	console.log(`  SCF data:         ${stats.scfDataUpdated}`);
	console.log(`  Thumbnails:       ${stats.thumbnailsFetched}`);
	console.log(`  Descriptions:     ${stats.descriptionsAdded}`);
	console.log(`  Links:            ${stats.linksAdded}`);
	console.log(`Skipped (no new):   ${stats.skipped}`);
	console.log(`SCF held (scfHold): ${stats.held}`);
	console.log(`Stranded removed:   ${stats.stranded}`);
	console.log(`Stored page unread: ${unreadAwards.length}`);
	console.log(`Joined page unread: ${pagesUnread.length}`);
	for (const s of pagesUnread) console.log(`  could not read:      ${s}`);
	console.log(`Errors:             ${stats.errors}`);
	console.log(
		`Beyond-cap pages:   ${beyondCap.queued.length} awarded · ${beyondCap.notAwarded.length} not awarded on page · ${beyondCap.unparseable.length} could not parse`,
	);
	for (const s of beyondCap.notAwarded)
		console.log(`  not awarded on page: ${s}`);
	for (const s of beyondCap.unparseable)
		console.log(`  could not parse:     ${s}`);
	console.log(
		`Off-listing pages:  ${offList.joined.length} joined · ${offList.unjoined.length} not joined · ${offList.unread.length} could not read`,
	);
	for (const s of offList.unread) console.log(`  could not read:      ${s}`);

	if (dryRun) {
		console.log(
			"\n*** DRY RUN — no changes made. Run with --execute to apply. ***",
		);
	}

	// Failed writes must not exit green (2026-08-08 sweep).
	if (stats.errors > 0) {
		console.error(
			`\n✗ ${stats.errors} write error(s) — exiting 1 so the run shows red.`,
		);
		process.exit(1);
	}
	// A curated page that reads not-awarded or cannot be parsed means the map
	// is stale or the page moved — its own exit code, so "could not look"
	// never reads as "checked, absent".
	if (beyondCap.notAwarded.length > 0 || beyondCap.unparseable.length > 0) {
		console.error(
			`\n✗ ${beyondCap.notAwarded.length + beyondCap.unparseable.length} beyond-cap page(s) disagree with the map — exiting 2.`,
		);
		process.exit(2);
	}
	if (unchecked.length > 0 || strandedRefused) {
		console.error(
			`\n✗ ${unchecked.length} SCF page(s) could not be read, so their awards were not checked${strandedRefused ? `, and the stranded pass was skipped (${strandedRefused})` : ""}; exiting 2.`,
		);
		process.exit(2);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
