/** Award statusBasis=repo-activity where the project IS its source.
 *
 * The product probe is the wrong instrument for a library: driving a website
 * says nothing about whether an SDK is alive. What answers that is whether the
 * source moved. So for library/SDK/RPC/indexer rows, a commit in the project's
 * own indexed repository inside a dated window IS liveness evidence, and it is
 * evidence we already hold.
 *
 * Deliberately NOT awarded to deployed products. There, a commit shows the
 * team is working; it does not show the service is running, and conflating the
 * two is how a dead product with a tidy repo would read as Live.
 *
 * Never downgrades, never overwrites a stronger basis or a person, and a repo
 * whose last commit is older than the window is reported rather than demoted —
 * a quiet library is not a dead one, and only a human-verified list may say
 * otherwise.
 *
 * Dry-run by default; --execute writes.
 */
import "./load-env";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
/** Outer bound on how old a commit may be and still evidence liveness NOW.
 *  A stable SDK legitimately goes quiet for months; beyond a year the claim is
 *  about history, not the present. The award records the real date either way,
 *  so a reader can apply a stricter bar than this one. */
const MAX_COMMIT_AGE_DAYS = 365;
/** Types whose liveness IS the source moving. */
const LIBRARY_TYPES = new Set([
	"SDK",
	"RPC",
	"Indexer",
	"Infrastructure",
	"Analytics",
	"Education",
	"Faucet",
]);
/** Stronger evidence, or a person — never replaced by a commit date. */
const NEVER_OVERWRITE = new Set([
	"human-verified",
	"onchain-activity",
	"product-integration",
	"repo-activity",
]);

(async () => {
	const payload = await getPayload({ config: await configPromise });
	const projects = await payload.find({
		collection: "projects",
		where: { status: { in: ["Live", "Development", "Pre-Release"] } },
		limit: 2000,
		depth: 0,
		select: { slug: true, name: true, types: true, statusBasis: true },
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const eligible = (projects.docs as any[]).filter(
		(p) =>
			!NEVER_OVERWRITE.has(String(p.statusBasis ?? "")) &&
			(p.types ?? []).some((t: string) => LIBRARY_TYPES.has(t)),
	);
	const slugs = eligible.map((p) => String(p.slug));
	console.log(
		`${eligible.length} library-typed rows with a weak basis — ${EXECUTE ? "EXECUTING" : "dry run"}\n`,
	);

	// Newest commit per project, via the EXACT projectSlug join.
	const newest = new Map<string, { at: number; repo: string }>();
	for (let i = 0; i < slugs.length; i += 100) {
		const batch = slugs.slice(i, i + 100);
		const repos = await payload.find({
			collection: "repos",
			where: { projectSlug: { in: batch } },
			limit: 1000,
			depth: 0,
			select: { fullName: true, projectSlug: true, lastCommitAt: true },
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		for (const r of repos.docs as any[]) {
			if (!r.lastCommitAt) continue;
			const at = Date.parse(String(r.lastCommitAt));
			if (Number.isNaN(at)) continue;
			const slug = String(r.projectSlug);
			const cur = newest.get(slug);
			if (!cur || at > cur.at)
				newest.set(slug, { at, repo: String(r.fullName) });
		}
	}

	const t = { awarded: 0, noRepo: 0, tooOld: 0 };
	for (const p of eligible) {
		const hit = newest.get(String(p.slug));
		if (!hit) {
			t.noRepo++;
			continue;
		}
		const ageDays = (Date.now() - hit.at) / 86_400_000;
		if (ageDays > MAX_COMMIT_AGE_DAYS) {
			t.tooOld++;
			console.log(
				`  QUIET ${String(p.slug).padEnd(28)} newest commit ${Math.round(ageDays)}d ago (${hit.repo}) — left as-is, quiet is not dead`,
			);
			continue;
		}
		t.awarded++;
		console.log(
			`  AWARD ${String(p.slug).padEnd(28)} ${String(p.statusBasis ?? "(none)").padEnd(18)} -> repo-activity · ${hit.repo} committed ${Math.round(ageDays)}d ago`,
		);
		if (EXECUTE)
			await payload.update({
				collection: "projects",
				id: p.id,
				data: {
					statusBasis: "repo-activity",
					statusAsOf: new Date(hit.at).toISOString(),
					statusSourceUrl: `https://github.com/${hit.repo}`,
				},
				context: { internal: true },
			});
	}
	console.log(
		`\nawarded ${t.awarded} | no indexed repo ${t.noRepo} | commit older than ${MAX_COMMIT_AGE_DAYS}d ${t.tooOld}`,
	);
	process.exit(0);
})();
