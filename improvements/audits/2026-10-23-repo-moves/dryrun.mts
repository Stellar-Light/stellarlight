// This tree's linker (src/lib/hackathon-build-links.ts linkBuild) over the
// captured directory rows, the way scripts/sync-hackathon-builds.ts step 3
// runs it: every DoraHacks submission, once without current repos and once
// with the current repos resolve.mts read. Curated submissions are left
// out: the sync lane never links them. Reports:
//   parity: the linker without current repos against the link each
//     submission serves today (stored by the lane's last run);
//   every link gained, lost or changed by the current repos, with the
//     submission, project, rule, stored and current repo, and the project's
//     listing that matched.
// The capture and resolve.mts's output stay in scratch (they hold upstream
// titles and repo names); the committed dryrun.json lists moved submissions
// by id.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-repo-moves/dryrun.mts <capture.json> <resolved.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import {
	githubOwnerOf,
	indexProjectOwners,
	indexProjectRepos,
	indexProjectSites,
	type LinkedProject,
	linkBuild,
	type ProjectRepoRow,
	repoFullNameOf,
} from "../../../src/lib/hackathon-build-links";

const [, , capturePath, resolvedPath, outPath] = process.argv;
if (!capturePath || !resolvedPath || !outPath)
	throw new Error(
		"usage: dryrun.mts <capture.json> <resolved.json> <out.json>",
	);

type Build = {
	id: string;
	name: string;
	githubUrl: string | null;
	demoUrl: string | null;
	security: unknown;
	project: { slug: string; name: string; basis?: string } | null;
};
const capture = JSON.parse(readFileSync(capturePath, "utf8")) as {
	start: unknown;
	end: unknown;
	builds: Build[];
	projects: ProjectRepoRow[];
};
const resolved = new Map(
	(
		JSON.parse(readFileSync(resolvedPath, "utf8")) as Array<{
			repo: string;
			http: number | null;
			current: string | null;
		}>
	).map((r) => [r.repo, r]),
);

const idx = {
	repos: indexProjectRepos(capture.projects),
	sites: indexProjectSites(capture.projects),
	owners: indexProjectOwners(capture.projects),
};
const bySlug = new Map(capture.projects.map((p) => [p.slug, p]));

const dora = capture.builds.filter((b) => b.id.startsWith("dorahacks-buidl-"));
const key = (p: LinkedProject | null | undefined) =>
	p ? `${p.slug}|${p.basis ?? "repo"}` : "none";

/** The project's listing a link matched: the repo entry or GitHub link that
 * names the repo, or for owner and name, every listing under the owner. */
function listing(slug: string, repo: string, byOwner: boolean): string[] {
	const rows = capture.projects.filter(
		(p) => p.slug === slug || p.canonicalSlug === slug,
	);
	const out: string[] = [];
	for (const p of rows) {
		for (const r of p.github?.repos ?? []) {
			const full = `${r.owner}/${r.name}`.toLowerCase();
			if (
				byOwner ? r.owner?.toLowerCase() === repo.split("/")[0] : full === repo
			)
				out.push(`${p.slug} github.repos ${r.owner}/${r.name}`);
		}
		const g = p.links?.github;
		if (
			g &&
			(byOwner
				? githubOwnerOf(g) === repo.split("/")[0]
				: repoFullNameOf(g) === repo)
		)
			out.push(`${p.slug} links.github ${g}`);
	}
	return out;
}

const parity = { same: 0, differ: [] as unknown[] };
const gained: unknown[] = [];
const lost: unknown[] = [];
const changed: unknown[] = [];
const moved: unknown[] = [];
let withRepo = 0;
for (const b of dora) {
	const repoFullName = repoFullNameOf(b.githubUrl);
	if (repoFullName) withRepo++;
	const r = repoFullName ? resolved.get(repoFullName) : undefined;
	const current = r?.current && r.current !== repoFullName ? r.current : null;
	const fields = { name: b.name, githubUrl: b.githubUrl, demoUrl: b.demoUrl };
	const base = linkBuild({ ...fields, repoFullName }, idx).project;
	const withMoves = linkBuild(
		{ ...fields, repoFullName, repoCurrentFullName: current },
		idx,
	).project;
	if (current && repoFullName) {
		// What became of a moved submission: linked already by its stored
		// repo, site or owner; linked now; or still unlinked, with or without
		// a project under the owner it moved to (owner alone never links).
		const owner = current.split("/")[0];
		// By id only: submission titles are upstream text.
		moved.push({
			id: b.id,
			stored: repoFullName,
			current,
			move: owner === repoFullName.split("/")[0] ? "renamed" : "transferred",
			outcome: base
				? "linked before"
				: withMoves
					? "linked now"
					: idx.owners.get(owner)?.length
						? "unlinked, a project sits under the new owner"
						: "unlinked, no project lists the new repo or owner",
		});
	}
	const served = b.project
		? {
				slug: b.project.slug,
				name: b.project.name,
				basis: b.project.basis as LinkedProject["basis"],
			}
		: null;
	if (key(base) === key(served)) parity.same++;
	else
		parity.differ.push({
			id: b.id,
			name: b.name,
			served: key(served),
			tree: key(base),
			repo: repoFullName,
			held: !!b.security,
		});
	if (key(base) === key(withMoves)) continue;
	const row = {
		id: b.id,
		name: b.name,
		storedRepo: repoFullName,
		currentRepo: current,
		before: key(base),
		after: key(withMoves),
		project: withMoves
			? {
					slug: withMoves.slug,
					name: withMoves.name,
					basis: withMoves.basis,
					status: bySlug.get(withMoves.slug)?.status ?? null,
					listing: current
						? listing(
								withMoves.slug,
								current,
								withMoves.basis === "moved-owner-and-name",
							)
						: [],
				}
			: null,
	};
	if (!base) gained.push(row);
	else if (!withMoves) lost.push(row);
	else changed.push(row);
}
const unknown = [...resolved.values()].filter((r) => !r.current);
type Moved = { move: string; outcome: string };
const tally = (f: (m: Moved) => string) =>
	Object.fromEntries(
		[
			...(moved as Moved[])
				.reduce((t, m) => t.set(f(m), (t.get(f(m)) ?? 0) + 1), new Map())
				.entries(),
		].sort(),
	);
const summary = {
	apiVersion: { start: capture.start, end: capture.end },
	directoryRows: capture.projects.length,
	submissions: capture.builds.length,
	dorahacks: dora.length,
	curatedLeftOut: capture.builds.length - dora.length,
	withRepo,
	heldWithoutLink: dora.filter((b) => b.security).length,
	repos: resolved.size,
	reposMoved: [...resolved.values()].filter(
		(r) => r.current && r.current !== r.repo,
	).length,
	reposUnknown: unknown.length,
	repos404: unknown.filter((r) => r.http === 404).length,
	submissionsMoved: moved.length,
	movedBy: tally((m) => m.move),
	movedOutcome: tally((m) => m.outcome),
	linkedBefore: dora.filter(
		(b) =>
			linkBuild({ ...b, repoFullName: repoFullNameOf(b.githubUrl) }, idx)
				.project,
	).length,
	parity: { same: parity.same, differ: parity.differ.length },
	gained: gained.length,
	lost: lost.length,
	changed: changed.length,
};
writeFileSync(
	outPath,
	JSON.stringify(
		{ summary, gained, lost, changed, parityDiffers: parity.differ, moved },
		null,
		1,
	),
);
console.log(JSON.stringify(summary, null, 1));
for (const g of gained) console.log("GAINED", JSON.stringify(g));
for (const g of [...lost, ...changed])
	console.log("LOST/CHANGED", JSON.stringify(g));
for (const d of parity.differ) console.log("PARITY", JSON.stringify(d));
