// Which repo explainRepo routes each captured query to, offline, with a
// tree's own modules: the route's order (src/app/api/repos/explain/route.ts)
// is an explicit owner/name (with the rename fallback when the index holds no
// row for the old path), then the canonical map, then a curated knowledge
// trigger, then the search top row when it shares a query token in its own
// name, topics or description. The search top row is read from that tree's
// replay over the same corpus. With the mode `products-in-questions`, a
// developer product named inside a question (productNamedIn, when the tree
// exports it) routes before the trigger, as the decision under test would.
// Usage, from the repository root (run with the tree's root as the cwd):
//   pnpm exec tsx improvements/audits/2026-11-04-repo-canonical/explain-routing.mts \
//     <treeRoot> <corpus.json> <live.json> <replay.json> <out.json> [products-in-questions]
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , treeRoot, corpusPath, livePath, replayPath, outPath, mode] =
	process.argv;
if (!outPath)
	throw new Error(
		"usage: explain-routing.mts <treeRoot> <corpus> <live> <replay> <out.json> [products-in-questions]",
	);
const rs = await import(join(treeRoot, "src/lib/repo-search.ts"));
const rk = await import(join(treeRoot, "src/lib/repo-knowledge.ts"));
const rr = await import(join(treeRoot, "src/lib/repo-relations.ts"));
// biome-ignore lint/suspicious/noExplicitAny: captured shapes
type Any = any;
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const corpus: Any[] = read(corpusPath);
const live = read(livePath);
const replay = read(replayPath).results as Any[];
const lc = (s: string) => s.toLowerCase();
const byName = new Map(corpus.map((d) => [lc(d.fullName), d]));
const key = (x: Any) => `${x.set}\u0000${x.id}`;
const replayBy = new Map(replay.map((x) => [key(x), x]));

const out: Any[] = [];
for (const x of live.live as Any[]) {
	const q: string = x.q;
	let repo: string | null = null;
	let via: string | null = null;
	const named: string | null = rs.explicitRepoName(q);
	if (named) {
		repo = named;
		via = "explicit";
		const moved = rr.renamedTo ? rr.renamedTo(named) : named;
		if (moved !== named && !byName.has(lc(named)) && byName.has(lc(moved))) {
			repo = moved;
			via = "renamed";
		}
	} else {
		let canon: string[] = rs.canonicalFor(q);
		if (
			!canon.length &&
			mode === "products-in-questions" &&
			rs.productNamedIn
		) {
			const p = rs.productNamedIn(q);
			if (p) canon = [p];
		}
		if (canon.length) {
			repo = canon[0];
			via = "canonical";
		} else {
			const t = rk.findRepoByTrigger(q);
			if (t) {
				repo = t;
				via = "knowledge-trigger";
			} else {
				const top: string | undefined = replayBy.get(key(x))?.ranking?.[0];
				const d = top ? byName.get(lc(top)) : undefined;
				const tokens: string[] = rs.contentTokens(q);
				const hay = d
					? lc(
							`${d.fullName} ${(Array.isArray(d.topics) ? d.topics : []).join(" ")} ${d.description ?? ""}`,
						)
					: "";
				if (
					top &&
					(tokens.length === 0 || tokens.some((t) => hay.includes(t)))
				) {
					repo = top;
					via = "search";
				}
			}
		}
	}
	out.push({ set: x.set, id: x.id, q, repo, via });
}
writeFileSync(outPath, JSON.stringify({ treeRoot, mode: mode ?? null, out }));
console.log(`routed ${out.length} queries (${mode ?? "as served"})`);
