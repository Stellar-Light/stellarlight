// Replays a tree's searchRepos over the captured repos corpus, with a mock
// payload that answers searchRepos' find calls the way the MongoDB adapter
// does (node_modules/@payloadcms/db-mongodb/dist/queries/buildSearchParams.js
// and buildSortParam.js):
//   like: the value split on spaces, every word an escaped case-insensitive
//         substring of the field, any element of an array field;
//   in: exact; not_equals: no element equal; or / and;
//   sort: the given field, then -createdAt (Payload's fallback sort for a
//         collection with timestamps); limit.
// For every captured query it records the route's first page (limit 20, the
// default) and the whole ranking (fullNames only).
// Usage, from the repository root (run it with the tree's root as the cwd so
// its tsconfig paths resolve):
//   pnpm exec tsx improvements/audits/2026-10-23-repos-ranking/replay.mts \
//     <treeRoot> <corpus.json> <live.json> <out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [, , treeRoot, corpusPath, livePath, outPath] = process.argv;
if (!treeRoot || !corpusPath || !livePath || !outPath)
	throw new Error(
		"usage: replay.mts <treeRoot> <corpus.json> <live.json> <out.json>",
	);
const { searchRepos } = await import(join(treeRoot, "src/lib/repo-search.ts"));

// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
type Doc = any;
const corpus: Doc[] = JSON.parse(readFileSync(corpusPath, "utf8"));
const live = JSON.parse(readFileSync(livePath, "utf8"));

const LIKE_FIELDS = [
	"fullName",
	"name",
	"description",
	"topics",
	"codeSymbols",
	"stellarDeps",
	"primaryLanguage",
	"codeDomains",
	"sdkCapabilities",
];
// Lowercased text per field, array elements joined by a newline: a word holds
// no space or newline, so a substring hit in the joined text is a hit in one
// element, the same as Mongo's per-element regex.
const text = (v: unknown): string =>
	Array.isArray(v)
		? v.filter((x) => typeof x === "string").join("\n")
		: typeof v === "string"
			? v
			: "";
const prepped = corpus.map((doc) => ({
	doc,
	lc: Object.fromEntries(
		LIKE_FIELDS.map((f) => [f, text(doc[f]).toLowerCase()]),
	) as Record<string, string>,
}));
const values = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);

type P = (typeof prepped)[number];
// biome-ignore lint/suspicious/noExplicitAny: Payload Where shape
function matches(p: P, where: any): boolean {
	for (const [key, cond] of Object.entries(where ?? {})) {
		if (key === "or") {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where shape
			if (!(cond as any[]).some((w) => matches(p, w))) return false;
			continue;
		}
		if (key === "and") {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where shape
			if (!(cond as any[]).every((w) => matches(p, w))) return false;
			continue;
		}
		for (const [op, arg] of Object.entries(cond as Record<string, unknown>)) {
			if (op === "like") {
				const hay = p.lc[key];
				if (hay === undefined) throw new Error(`like on unprepared ${key}`);
				const words = String(arg).toLowerCase().split(" ");
				if (!words.every((w) => hay.includes(w))) return false;
			} else if (op === "in") {
				const want = arg as unknown[];
				if (!values(p.doc[key]).some((v) => want.includes(v))) return false;
			} else if (op === "not_equals") {
				if (values(p.doc[key]).includes(arg)) return false;
			} else if (op === "equals") {
				if (!values(p.doc[key]).includes(arg)) return false;
			} else throw new Error(`unsupported operator ${op} on ${key}`);
		}
	}
	return true;
}

const num = (v: unknown) => (typeof v === "number" ? v : -Infinity);
const mockPayload = {
	// biome-ignore lint/suspicious/noExplicitAny: Payload find args
	async find(args: any) {
		if (args.collection !== "repos") throw new Error(args.collection);
		const hits = prepped.filter((p) => matches(p, args.where));
		const sort: string | undefined = args.sort;
		hits.sort((a, b) => {
			if (sort) {
				const desc = sort.startsWith("-");
				const f = desc ? sort.slice(1) : sort;
				const d = num(a.doc[f]) - num(b.doc[f]);
				if (d !== 0) return desc ? -d : d;
			}
			return String(b.doc.createdAt).localeCompare(String(a.doc.createdAt));
		});
		const docs = hits
			.slice(0, args.limit ?? hits.length)
			.map((p) => structuredClone(p.doc));
		return { docs, totalDocs: hits.length };
	},
};

const out: unknown[] = [];
for (const x of live.live) {
	const page = await searchRepos(mockPayload, x.q, { limit: 20 });
	const all = await searchRepos(mockPayload, x.q, { limit: 5000 });
	out.push({
		set: x.set,
		id: x.id,
		q: x.q,
		matchMode: page.matchMode,
		total: page.total,
		tokens: page.searched.tokens,
		warnings: page.warnings,
		// biome-ignore lint/suspicious/noExplicitAny: RepoResult
		page: page.repos.map((r: any) => ({
			fullName: r.fullName,
			score: r.score,
		})),
		// biome-ignore lint/suspicious/noExplicitAny: RepoResult
		ranking: all.repos.map((r: any) => r.fullName),
	});
}
writeFileSync(outPath, JSON.stringify({ treeRoot, results: out }));
console.log(`replayed ${out.length} queries over ${corpus.length} rows`);
