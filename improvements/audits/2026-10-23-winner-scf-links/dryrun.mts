// This tree's linker over a capture.mts output, the way
// scripts/sync-hackathon-builds.ts step 3 runs it, then the page rules
// (namedCandidate, pageRuleLink) over the page reads from pages.mts.
// Curated submissions are left out: the sync lane never links them.
// Reports:
//   parity: linkBuild without current repos against the link each
//     submission serves today (stored by the lane's last run);
//   forecast: linkBuild with the current repos the repo-moves lane read
//     (<resolved.json>, its resolve.mts output), which the lane's next run
//     stores; the baseline for the page rules;
//   the page rules: every named candidate, every link gained (with its
//     evidence), every candidate rejected and why, and every link lost or
//     changed (0 by construction: the rules only fill a winner the others
//     leave unlinked);
//   what the rules leave out on purpose (recall view): SCF pages that link
//     a stored winner the rules do not link, and winners whose page lists
//     a project's website or X account under another name;
//   beyond winners (not shipped): the same rules on every non-winner they
//     would consider without the winner limit.
// Submissions are named by id and projects by slug; no upstream title or
// personal account is written.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-winner-scf-links/dryrun.mts <capture.json> <pages.json> <resolved.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import {
	indexProjectNames,
	indexProjectOwners,
	indexProjectRepos,
	indexProjectSites,
	type LinkedProject,
	linkBuild,
	type NamedProject,
	namedCandidate,
	type PageEvidence,
	type ProjectRepoRow,
	pageRuleLink,
	productKeyOf,
	repoFullNameOf,
	scfPageOf,
	siteKeyOf,
	xHandleOf,
} from "../../../src/lib/hackathon-build-links";

const [, , capturePath, pagesPath, resolvedPath, outPath] = process.argv;
if (!capturePath || !pagesPath || !resolvedPath || !outPath)
	throw new Error(
		"usage: dryrun.mts <capture.json> <pages.json> <resolved.json> <out.json>",
	);

type Build = {
	id: string;
	name: string;
	isWinner: boolean;
	placement: string | null;
	hackathonSlug: string | null;
	githubUrl: string | null;
	demoUrl: string | null;
	project: { slug: string; name: string; basis?: string } | null;
};
type Row = ProjectRepoRow & {
	scf?: {
		sourceUrl?: string | null;
		awarded?: boolean | null;
		awardedRounds?: number[] | null;
		totalAwarded?: number | null;
	} | null;
};
const capture = JSON.parse(readFileSync(capturePath, "utf8")) as {
	start: unknown;
	end: unknown;
	builds: Build[];
	projects: Row[];
};
const pages = JSON.parse(readFileSync(pagesPath, "utf8")) as {
	startedAt: string;
	finishedAt?: string;
	dora: Record<string, { http: number | null; links: string[] | null }>;
	scf: Record<
		string,
		{
			http: number | null;
			hasSiteUrls?: boolean;
			buidls: string[] | null;
			inSiteUrls: string[] | null;
		}
	>;
};
const resolved = new Map(
	(
		JSON.parse(readFileSync(resolvedPath, "utf8")) as Array<{
			repo: string;
			current: string | null;
		}>
	).map((r) => [r.repo, r.current]),
);

const rows = capture.projects;
const idx = {
	repos: indexProjectRepos(rows),
	sites: indexProjectSites(rows),
	owners: indexProjectOwners(rows),
};
const names = indexProjectNames(rows);
const bySlug = new Map(rows.map((p) => [p.slug, p]));
const key = (p: LinkedProject | null | undefined) =>
	p ? `${p.slug}|${p.basis ?? "repo"}` : "none";
const num = (id: string) => id.replace("dorahacks-buidl-", "");
const scfFacts = (slug: string) => {
	const s = bySlug.get(slug)?.scf;
	return {
		scfAwarded: !!s?.awarded,
		scfRounds: s?.awardedRounds ?? [],
		scfTotalUSD: s?.totalAwarded ?? null,
		scfPage: scfPageOf(s?.sourceUrl),
	};
};
/** What the lane would read for a candidate: the DoraHacks numbers in the
 * SCF page's siteUrls record (null when the project has none; absent when
 * the read failed) and the submission page. */
function evidence(buildId: string, scfPage: string | null): PageEvidence {
	const s = scfPage ? pages.scf[scfPage] : undefined;
	const d = pages.dora[num(buildId)];
	return {
		scfBuidls: scfPage
			? s?.http === 200 && s.hasSiteUrls && s.inSiteUrls
				? new Set(s.inSiteUrls)
				: undefined
			: null,
		pageLinks: d?.http === 200 && d.links ? d.links : undefined,
	};
}

const dora = capture.builds.filter((b) => b.id.startsWith("dorahacks-buidl-"));
const winners = dora.filter((b) => b.isWinner);
const fieldsOf = (b: Build) => {
	const repoFullName = repoFullNameOf(b.githubUrl);
	const current = repoFullName ? resolved.get(repoFullName) : undefined;
	return {
		name: b.name,
		isWinner: b.isWinner,
		githubUrl: b.githubUrl,
		demoUrl: b.demoUrl,
		repoFullName,
		repoCurrentFullName: current && current !== repoFullName ? current : null,
	};
};

// parity and forecast over every DoraHacks submission
const parityDiffers: unknown[] = [];
const movesGained: unknown[] = [];
let paritySame = 0;
for (const b of dora) {
	const f = fieldsOf(b);
	const base = linkBuild({ ...f, repoCurrentFullName: null }, idx).project;
	const served = b.project
		? {
				slug: b.project.slug,
				name: b.project.name,
				basis: b.project.basis as LinkedProject["basis"],
			}
		: null;
	if (key(base) === key(served)) paritySame++;
	else parityDiffers.push({ id: b.id, served: key(served), tree: key(base) });
	const withMoves = linkBuild(f, idx).project;
	if (key(withMoves) !== key(base))
		movesGained.push({ id: b.id, before: key(base), after: key(withMoves) });
}

/** One named candidate as the lane would judge it: what each page shows
 * and the link pageRuleLink makes. Projects are named by slug and whether
 * they have an X account, never by the account (some are personal). */
function judge(b: Build, p: NamedProject) {
	const ev = evidence(b.id, p.scfPage);
	const s = p.scfPage ? pages.scf[p.scfPage] : undefined;
	const read = {
		scfPage: p.scfPage
			? s?.http === 200 && s.hasSiteUrls
				? "read"
				: `not read (${s?.http === 200 ? "no siteUrls record" : (s?.http ?? "no response")})`
			: "none",
		scfLinksThisSubmission: ev.scfBuidls ? ev.scfBuidls.has(num(b.id)) : null,
		scfLinkInSiteUrls: s?.inSiteUrls?.includes(num(b.id)) ?? null,
		scfLinksOtherSubmissions: ev.scfBuidls
			? [...ev.scfBuidls].filter((n) => n !== num(b.id)).length
			: null,
		submissionPage: ev.pageLinks?.length
			? "read"
			: `not read (${pages.dora[num(b.id)]?.http ?? "no response"})`,
		submissionListsWebsite: ev.pageLinks
			? ev.pageLinks.some((l) => !!p.site && siteKeyOf(l) === p.site)
			: null,
		submissionListsX: ev.pageLinks
			? ev.pageLinks.some((l) => !!p.xHandle && xHandleOf(l) === p.xHandle)
			: null,
	};
	const row = {
		id: b.id,
		placement: b.placement,
		event: b.hackathonSlug,
		nameNorm: productKeyOf(b.name),
		project: p.slug,
		projectStatus: bySlug.get(p.slug)?.status ?? null,
		...scfFacts(p.slug),
		projectSite: p.site,
		projectHasX: !!p.xHandle,
		read,
	};
	return { row, link: pageRuleLink(b.id, p, ev) };
}

// the page rules over every DoraHacks submission (they act on winners only)
const gained: unknown[] = [];
const lostOrChanged: unknown[] = [];
const rejected: unknown[] = [];
const candidates: string[] = [];
for (const b of dora) {
	const f = fieldsOf(b);
	const before = linkBuild(f, idx).project;
	const p = namedCandidate(f, idx, names);
	const judged = !before && p ? judge(b, p) : null;
	const after = before ?? judged?.link ?? null;
	if (before && key(before) !== key(after))
		lostOrChanged.push({ id: b.id, before: key(before), after: key(after) });
	if (!judged || !p) continue;
	candidates.push(b.id);
	if (judged.link) gained.push({ ...judged.row, basis: judged.link.basis });
	else rejected.push({ ...judged.row, reason: "no corroborating page signal" });
}

// beyond winners (not shipped): the same rules on every non-winner they
// would consider if the winner limit were lifted
const beyondWinners: unknown[] = [];
for (const b of dora) {
	if (b.isWinner) continue;
	const f = { ...fieldsOf(b), isWinner: true };
	if (linkBuild(f, idx).project) continue;
	const p = namedCandidate(f, idx, names);
	if (!p) continue;
	const { row, link } = judge(b, p);
	beyondWinners.push({ ...row, wouldLink: link?.basis ?? null });
}

// winners left unlinked and never named for one project: why
const unlinkedWhy: Record<string, string[]> = {};
for (const b of winners) {
	const f = fieldsOf(b);
	const r = linkBuild(f, idx);
	if (r.project || candidates.includes(b.id)) continue;
	const k = productKeyOf(b.name);
	const site = siteKeyOf(b.demoUrl);
	const why = r.ambiguous
		? "repo listed by two projects"
		: site && idx.sites.get(site) === null
			? "demo site two projects share"
			: !k
				? "name too short to compare"
				: names.get(k) === null
					? "name carried by two projects"
					: "name carried by no project";
	unlinkedWhy[why] = [...(unlinkedWhy[why] ?? []), b.id];
}

// recall view: what the rules leave out on purpose
const winnerByNum = new Map(winners.map((b) => [num(b.id), b]));
const linkedAfter = new Map<string, string | null>();
for (const b of dora) {
	const f = fieldsOf(b);
	const before = linkBuild(f, idx).project;
	const p = namedCandidate(f, idx, names);
	const after =
		before ?? (p ? pageRuleLink(b.id, p, evidence(b.id, p.scfPage)) : null);
	linkedAfter.set(b.id, after?.slug ?? null);
}
const slugOfScfPage = new Map<string, string>();
for (const p of rows) {
	const page = scfPageOf(p.scf?.sourceUrl);
	const slug = p.canonicalSlug || (p.status === "Draft" ? null : p.slug);
	if (page && slug) slugOfScfPage.set(page, slug);
}
const scfLinksLeftOut: unknown[] = [];
for (const [page, s] of Object.entries(pages.scf)) {
	for (const n of s.buidls ?? []) {
		const b = winnerByNum.get(n);
		const slug = slugOfScfPage.get(page);
		if (!b || !slug || linkedAfter.get(b.id) === slug) continue;
		scfLinksLeftOut.push({
			id: b.id,
			placement: b.placement,
			event: b.hackathonSlug,
			project: slug,
			...scfFacts(slug),
			inSiteUrls: s.inSiteUrls?.includes(n) ?? false,
			linkedTo: linkedAfter.get(b.id) ?? null,
			nameNorm: productKeyOf(b.name),
			projectNameNorm: productKeyOf(bySlug.get(slug)?.name),
		});
	}
}
const siteOrXLeftOut: unknown[] = [];
const projectBySite = new Map<string, string>();
const projectByX = new Map<string, string>();
for (const p of rows) {
	const slug = p.canonicalSlug || (p.status === "Draft" ? null : p.slug);
	if (!slug) continue;
	const site = siteKeyOf(p.links?.website);
	const x = xHandleOf(p.links?.twitter);
	if (site) projectBySite.set(site, slug);
	if (x) projectByX.set(x, slug);
}
for (const b of winners) {
	const links = pages.dora[num(b.id)]?.links ?? [];
	const hits = new Map<string, string>();
	for (const l of links) {
		const s = siteKeyOf(l);
		const x = xHandleOf(l);
		if (s && projectBySite.has(s))
			hits.set(projectBySite.get(s) as string, "website");
		if (x && projectByX.has(x)) hits.set(projectByX.get(x) as string, "x");
	}
	for (const [slug, via] of hits) {
		if (linkedAfter.get(b.id) === slug) continue;
		siteOrXLeftOut.push({
			id: b.id,
			placement: b.placement,
			event: b.hackathonSlug,
			project: slug,
			via,
			...scfFacts(slug),
			linkedTo: linkedAfter.get(b.id) ?? null,
			nameNorm: productKeyOf(b.name),
			projectNameNorm: productKeyOf(bySlug.get(slug)?.name),
		});
	}
}

const count = (o: Record<string, { http: number | null }>, h: number) =>
	Object.values(o).filter((x) => x.http === h).length;
const summary = {
	apiVersion: { start: capture.start, end: capture.end },
	pagesRead: {
		startedAt: pages.startedAt,
		finishedAt: pages.finishedAt ?? null,
		dora: Object.keys(pages.dora).length,
		dora200: count(pages.dora, 200),
		scf: Object.keys(pages.scf).length,
		scf200: count(pages.scf, 200),
	},
	directoryRows: rows.length,
	submissions: capture.builds.length,
	dorahacks: dora.length,
	winners: winners.length,
	curatedWinnersLeftOut: capture.builds.filter(
		(b) => b.isWinner && !b.id.startsWith("dorahacks-buidl-"),
	).length,
	parity: { same: paritySame, differ: parityDiffers.length },
	linkedServed: dora.filter((b) => b.project).length,
	linkedForecast: dora.filter((b) => linkBuild(fieldsOf(b), idx).project)
		.length,
	movesGained: movesGained.length,
	winnersLinkedForecast: winners.filter(
		(b) => linkBuild(fieldsOf(b), idx).project,
	).length,
	namedCandidates: candidates.length,
	gained: gained.length,
	gainedScfFunded: (gained as Array<{ scfAwarded: boolean }>).filter(
		(g) => g.scfAwarded,
	).length,
	gainedBy: Object.fromEntries(
		[...new Set((gained as Array<{ basis: string }>).map((g) => g.basis))].map(
			(b) => [
				b,
				(gained as Array<{ basis: string }>).filter((g) => g.basis === b)
					.length,
			],
		),
	),
	rejected: rejected.length,
	lostOrChanged: lostOrChanged.length,
	winnersUnlinkedNotNamed: Object.fromEntries(
		Object.entries(unlinkedWhy).map(([k, v]) => [k, v.length]),
	),
	recall: {
		scfPagesLinkingAWinnerLeftOut: scfLinksLeftOut.length,
		winnerPagesListingAProjectLeftOut: siteOrXLeftOut.length,
	},
	beyondWinnersNotShipped: {
		considered: beyondWinners.length,
		pagesRead: (
			beyondWinners as Array<{ read: { submissionPage: string } }>
		).filter((r) => r.read.submissionPage === "read").length,
		wouldLink: (beyondWinners as Array<{ wouldLink: string | null }>).filter(
			(r) => r.wouldLink,
		).length,
	},
};
writeFileSync(
	outPath,
	JSON.stringify(
		{
			summary,
			gained,
			rejected,
			lostOrChanged,
			parityDiffers,
			movesGained,
			unlinkedWhy,
			scfLinksLeftOut,
			siteOrXLeftOut,
			beyondWinners,
		},
		null,
		1,
	),
);
console.log(JSON.stringify(summary, null, 1));
for (const g of gained) console.log("GAINED", JSON.stringify(g));
for (const r of rejected) console.log("REJECTED", JSON.stringify(r));
for (const r of lostOrChanged) console.log("LOST/CHANGED", JSON.stringify(r));
for (const r of parityDiffers) console.log("PARITY", JSON.stringify(r));
for (const r of movesGained) console.log("MOVES", JSON.stringify(r));
for (const r of scfLinksLeftOut) console.log("RECALL-SCF", JSON.stringify(r));
for (const r of siteOrXLeftOut) console.log("RECALL-PAGE", JSON.stringify(r));
for (const r of beyondWinners) console.log("BEYOND", JSON.stringify(r));
