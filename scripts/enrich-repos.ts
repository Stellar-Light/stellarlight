/**
 * Enrich the `repos` code-reference index from the projects directory.
 * For every repo a project points at (github.repos owner/name pairs + a
 * github.com/owner/repo in links.github), fetch GitHub topics / description /
 * language / stars / last-commit, fuse with the owning project's hackathon /
 * SCF / prominence signals into a repoScore grade, and upsert into `repos`.
 *
 * Powers /api/repos/search (Tyler's "show me zk repos" gap). Needs GITHUB_TOKEN
 * for the GraphQL calls. Dry-run by default; --execute writes.
 *
 *   GITHUB_TOKEN=... DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/enrich-repos.ts [--execute]
 */
import "dotenv/config";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import { fetchRepoInfo } from "../src/lib/github";
import { repoGrade } from "../src/lib/repo-grade";

const EXECUTE = process.argv.includes("--execute");
const LIMIT = Number(process.env.ENRICH_LIMIT || "0") || 0; // 0 = all

type Doc = Record<string, any>;

// owner/name must look like real GitHub idents — kills bad link data like
// "soo (private repo, can share if needed)" or org/section URLs.
const VALID_IDENT = /^[A-Za-z0-9_.-]+$/;
const NOT_A_USER = new Set([
	"orgs", "sponsors", "marketplace", "settings", "topics", "search",
	"about", "features", "pricing", "apps", "collections",
]);
function reposOf(p: Doc): Array<{ owner: string; name: string }> {
	const out: Array<{ owner: string; name: string }> = [];
	const add = (rawOwner: string, rawName: string) => {
		const owner = rawOwner.trim();
		const name = rawName.replace(/\.git$/, "").trim();
		if (!VALID_IDENT.test(owner) || !VALID_IDENT.test(name)) return;
		if (NOT_A_USER.has(owner.toLowerCase())) return;
		out.push({ owner, name });
	};
	for (const r of p.github?.repos ?? []) {
		if (r?.owner && r?.name) add(String(r.owner), String(r.name));
	}
	const gh = p.links?.github;
	if (typeof gh === "string" && gh) {
		const m = gh
			.replace(/^https?:\/\//, "")
			.replace(/^www\./, "")
			.match(/github\.com\/([^/\s]+)\/([^/?#\s]+)/i);
		if (m) add(m[1], m[2]);
	}
	return out;
}

// 0-1 reputation from a builder's Stellar Passport: SCF tier, featured status,
// recent commit activity. Conservative + tolerant of unknown tier strings.
function builderRep(b: Doc): number {
	let r = 0;
	const tier = String(b.scf_tier || "").toLowerCase();
	if (/gold|platinum|tier\s*3|^3$/.test(tier)) r = Math.max(r, 0.9);
	else if (/silver|tier\s*2|^2$/.test(tier)) r = Math.max(r, 0.7);
	else if (/bronze|tier\s*1|^1$/.test(tier)) r = Math.max(r, 0.55);
	else if (tier) r = Math.max(r, 0.45);
	if (b.is_featured) r = Math.max(r, 0.8);
	const commits = b.stats?.totalCommits30d ?? 0;
	if (commits >= 50) r = Math.max(r, 0.7);
	else if (commits >= 10) r = Math.max(r, 0.55);
	return Math.min(1, r);
}

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"}`);
	if (!process.env.GITHUB_TOKEN?.trim() && !process.env.NEXT_PUBLIC_GITHUB_TOKEN?.trim()) {
		console.log("⚠ No GITHUB_TOKEN set — GitHub calls will be unauthenticated (rate-limited).");
	}

	const projects = (
		await payload.find({ collection: "projects", pagination: false, depth: 0 })
	).docs as Doc[];

	// Builder reputation (Stellar Passport): index by github_username AND by each
	// builder's listed repo full_names, so a repo by a credentialed/active builder
	// grades higher — Raph's "tied to builder history/reputation."
	const builders = (
		await payload.find({ collection: "builders", pagination: false, depth: 0 })
	).docs as Doc[];
	const repByGithub = new Map<string, number>();
	const repByRepo = new Map<string, number>();
	for (const b of builders) {
		const rep = builderRep(b);
		if (rep <= 0) continue;
		const gh = String(b.github_username || "").toLowerCase();
		if (gh) repByGithub.set(gh, Math.max(rep, repByGithub.get(gh) ?? 0));
		for (const proj of b.projects ?? []) {
			for (const r of proj?.repos ?? []) {
				const fn = String(r?.full_name || "").toLowerCase();
				if (fn) repByRepo.set(fn, Math.max(rep, repByRepo.get(fn) ?? 0));
			}
		}
	}
	console.log(`Loaded ${builders.length} builders (${repByGithub.size} github + ${repByRepo.size} repo reputation keys).`);

	// Dedupe repos across projects; keep the highest-prominence owning project.
	const byFull = new Map<string, { owner: string; name: string; full: string; project: Doc }>();
	for (const p of projects) {
		for (const { owner, name } of reposOf(p)) {
			const full = `${owner}/${name}`;
			const key = full.toLowerCase();
			const prev = byFull.get(key);
			if (!prev || (p.prominence ?? 0) > (prev.project.prominence ?? 0)) {
				byFull.set(key, { owner, name, full, project: p });
			}
		}
	}
	let entries = [...byFull.values()];
	if (LIMIT > 0) entries = entries.slice(0, LIMIT);
	console.log(`${entries.length} unique repos from ${projects.length} projects.\n`);

	let created = 0, updated = 0, failed = 0;
	for (const { owner, name, full, project } of entries) {
		let info: Awaited<ReturnType<typeof fetchRepoInfo>> | null = null;
		let enrichError: string | null = null;
		try {
			info = await fetchRepoInfo(owner, name);
		} catch (e) {
			enrichError = e instanceof Error ? e.message : String(e);
			failed++;
		}
		// Don't seed un-fetchable repos (private/gone/garbage) into the public
		// index — only index references we could actually verify. Re-runs pick
		// up anything transiently rate-limited.
		if (!info) {
			console.log(`  skip   ${full.padEnd(42)} ⚠ ${enrichError?.slice(0, 50) ?? "no data"}`);
			continue;
		}
		const builderReputation = Math.max(
			repByGithub.get(owner.toLowerCase()) ?? 0,
			repByRepo.get(full.toLowerCase()) ?? 0,
		);
		const grade = info
			? repoGrade({
					lastCommitAt: info.lastCommitAt,
					stargazerCount: info.stargazerCount,
					isFork: info.isFork,
					isArchived: info.isArchived,
					hackathonWinner: !!project.hackathonPlacement,
					scfAwarded: !!project.scf?.awarded,
					projectProminence: project.prominence ?? 0,
					builderReputation,
				})
			: { score: 0, label: "low" as const };

		const data: Doc = {
			fullName: full,
			owner,
			name,
			url: info?.url ?? `https://github.com/${full}`,
			...(info
				? {
						description: info.description ?? null,
						topics: info.topics ?? [],
						primaryLanguage: info.primaryLanguage ?? null,
						stars: info.stargazerCount ?? 0,
						openIssues: info.openIssues ?? 0,
						lastCommitAt: info.lastCommitAt ?? null,
						homepageUrl: info.homepageUrl ?? null,
						isFork: !!info.isFork,
						isArchived: !!info.isArchived,
						readmeExcerpt: info.readme ?? null,
					}
				: {}),
			projectSlug: project.slug,
			projectName: project.name,
			hackathonWinner: !!project.hackathonPlacement,
			scfAwarded: !!project.scf?.awarded,
			builderReputation,
			repoScore: grade.score,
			repoScoreLabel: grade.label,
			lastEnrichedAt: new Date().toISOString(),
			enrichError,
		};

		const existing = (
			await payload.find({ collection: "repos", where: { fullName: { equals: full } }, limit: 1, depth: 0 })
		).docs[0] as Doc | undefined;
		const verb = existing ? "update" : "create";
		console.log(
			`  ${verb.padEnd(6)} ${full.padEnd(42)} score=${grade.score} ${info?.primaryLanguage ?? "?"} ★${info?.stargazerCount ?? "?"}${enrichError ? `  ⚠ ${enrichError.slice(0, 40)}` : ""}`,
		);
		if (EXECUTE) {
			if (existing) {
				await payload.update({ collection: "repos", id: existing.id, data });
				updated++;
			} else {
				await payload.create({ collection: "repos", data });
				created++;
			}
		}
	}
	console.log(
		`\n${EXECUTE ? `DONE: ${created} created, ${updated} updated, ${failed} fetch-failed.` : `DRY RUN — ${entries.length} repos, ${failed} would fail fetch.`}`,
	);
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
