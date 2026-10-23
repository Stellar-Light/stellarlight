// Read-only page reads for the page rules, from a capture.mts output:
//   every stored DoraHacks winner's own page record
//   (dorahacks.io/api/v1/hub/buidls/<n>, the read the sync lane already
//   makes in step 2), keeping the links it lists (pageLinksOf);
//   every directory project's SCF page (scf.sourceUrl on
//   communityfund.stellar.org), keeping the DoraHacks submission numbers it
//   links (buidlNumbersIn over the rebuilt flight stream) and which of them
//   sit in the project's own siteUrls.
// Also the page of every non-winner the rules would consider if they were
// not limited to winners (namedCandidate with the winner flag forced, on
// the stored repo), for dryrun.mts's beyond-winners view, which is not
// shipped. The rule needs only the SCF pages of named candidates; all of
// them are read so the recall view can show SCF pages that link a winner
// under another name. One request at a time per host: DoraHacks 3 s apart,
// SCF 2.5 s apart. Resumable: entries already in <out.json> are kept.
// The output stays in scratch: it holds upstream links, personal social
// accounts among them.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-winner-scf-links/pages.mts <capture.json> <out.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { rebuildFlight } from "../../../scripts/eval/scf-official";
import {
	buidlNumbersIn,
	indexProjectNames,
	indexProjectOwners,
	indexProjectRepos,
	indexProjectSites,
	namedCandidate,
	type ProjectRepoRow,
	repoFullNameOf,
	scfPageOf,
} from "../../../src/lib/hackathon-build-links";
import { pageLinksOf } from "../../../src/lib/integrations/dorahacks";

const [, , capturePath, outPath] = process.argv;
if (!capturePath || !outPath)
	throw new Error("usage: pages.mts <capture.json> <out.json>");
const capture = JSON.parse(readFileSync(capturePath, "utf8")) as {
	builds: Array<{
		id: string;
		name: string;
		isWinner: boolean;
		githubUrl: string | null;
		demoUrl: string | null;
	}>;
	projects: ProjectRepoRow[];
};
type Dora = { http: number | null; links: string[] | null; error?: string };
type Scf = {
	http: number | null;
	/** The page carries its siteUrls record: the lane counts a read only then. */
	hasSiteUrls?: boolean;
	buidls: string[] | null;
	inSiteUrls: string[] | null;
	error?: string;
};
const out: {
	startedAt: string;
	finishedAt?: string;
	dora: Record<string, Dora>;
	scf: Record<string, Scf>;
} = existsSync(outPath)
	? JSON.parse(readFileSync(outPath, "utf8"))
	: { startedAt: new Date().toISOString(), dora: {}, scf: {} };
const save = () => writeFileSync(outPath, JSON.stringify(out));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DORA_HEADERS = {
	Accept: "application/json",
	"Accept-Language": "en-US,en;q=0.9",
	Referer: "https://dorahacks.io/",
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

/** The page's own `"siteUrls":{...}` object, brace-matched, as
 * scripts/enrich-from-scf.ts reads it. */
function siteUrlsText(txt: string): string {
	const at = txt.indexOf('"siteUrls":{');
	if (at < 0) return "";
	const start = txt.indexOf("{", at);
	let depth = 0;
	for (let i = start; i < txt.length; i++) {
		if (txt[i] === "{") depth++;
		else if (txt[i] === "}" && --depth === 0) return txt.slice(start, i + 1);
	}
	return "";
}

async function readDora() {
	const rows = capture.projects;
	const idx = {
		repos: indexProjectRepos(rows),
		sites: indexProjectSites(rows),
		owners: indexProjectOwners(rows),
	};
	const names = indexProjectNames(rows);
	const dora = capture.builds.filter((b) =>
		b.id.startsWith("dorahacks-buidl-"),
	);
	const ids = [
		...dora.filter((b) => b.isWinner),
		...dora.filter(
			(b) =>
				!b.isWinner &&
				namedCandidate(
					{ ...b, isWinner: true, repoFullName: repoFullNameOf(b.githubUrl) },
					idx,
					names,
				),
		),
	].map((b) => b.id.replace("dorahacks-buidl-", ""));
	for (const n of [...new Set(ids)]) {
		if (out.dora[n]?.http === 200 || out.dora[n]?.http === 404) continue;
		await sleep(3000);
		try {
			const res = await fetch(`https://dorahacks.io/api/v1/hub/buidls/${n}`, {
				headers: DORA_HEADERS,
				signal: AbortSignal.timeout(20_000),
			});
			out.dora[n] = {
				http: res.status,
				links: res.ok ? pageLinksOf(await res.json()) : null,
			};
		} catch (e) {
			out.dora[n] = { http: null, links: null, error: (e as Error).message };
		}
		save();
	}
}

async function readScf() {
	const pages = [
		...new Set(
			capture.projects
				.map((p) => scfPageOf(p.scf?.sourceUrl))
				.filter((x): x is string => !!x),
		),
	];
	for (const url of pages) {
		const had = out.scf[url];
		if (
			(had?.http === 200 && had.hasSiteUrls !== undefined) ||
			had?.http === 404
		)
			continue;
		await sleep(2500);
		try {
			const res = await fetch(url, {
				headers: { "User-Agent": "stellarlight-lane-lk (read-only)" },
				signal: AbortSignal.timeout(30_000),
			});
			if (!res.ok) {
				out.scf[url] = { http: res.status, buidls: null, inSiteUrls: null };
			} else {
				const txt = rebuildFlight(await res.text());
				out.scf[url] = {
					http: 200,
					hasSiteUrls: txt.includes('"siteUrls":'),
					buidls: [...buidlNumbersIn(txt)],
					inSiteUrls: [...buidlNumbersIn(siteUrlsText(txt))],
				};
			}
		} catch (e) {
			out.scf[url] = {
				http: null,
				buidls: null,
				inSiteUrls: null,
				error: (e as Error).message,
			};
		}
		save();
	}
}

await Promise.all([readDora(), readScf()]);
out.finishedAt = new Date().toISOString();
save();
const n = (o: Record<string, { http: number | null }>, h: number | null) =>
	Object.values(o).filter((x) => x.http === h).length;
console.log(
	`dora ${Object.keys(out.dora).length} (200: ${n(out.dora, 200)}, 404: ${n(out.dora, 404)}, failed: ${Object.keys(out.dora).length - n(out.dora, 200) - n(out.dora, 404)}); scf ${Object.keys(out.scf).length} (200: ${n(out.scf, 200)}, 404: ${n(out.scf, 404)}, failed: ${Object.keys(out.scf).length - n(out.scf, 200) - n(out.scf, 404)})`,
);
