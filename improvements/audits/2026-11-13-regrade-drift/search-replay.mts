// Replays searchRepos over the public /api/repos snapshot with an in-memory
// stand-in for Payload's mongo find (like = AND of case-insensitive word
// regexes; sort -repoScore then the -createdAt fallback; not_equals admits a
// missing field). "before" uses stored scores, "after" the full regrade's.
import { readFileSync, writeFileSync } from "node:fs";
import { searchRepos } from "../../../src/lib/repo-search";

const dir = process.argv[2];
const rows0: any[] = JSON.parse(readFileSync(`${dir}/repos-all.json`, "utf8"));
const after: Record<string, { to: number; labelTo: string }> = JSON.parse(
	readFileSync(`${dir}/after-grades.json`, "utf8"),
);
const esc = (w: string) => w.replace(/[\\^$*+?.()|[\]{}]/g, "\\$&");
const get = (r: any, path: string) =>
	path.split(".").reduce((o, k) => (o == null ? o : o[k]), r);
function match(r: any, w: any): boolean {
	if (!w) return true;
	return Object.entries(w).every(([k, v]: [string, any]) => {
		if (k === "and") return v.every((x: any) => match(r, x));
		if (k === "or") return v.some((x: any) => match(r, x));
		const val = get(r, k);
		return Object.entries(v).every(([op, arg]: [string, any]) => {
			const vals = Array.isArray(val) ? val : [val];
			switch (op) {
				case "equals":
					return vals.some((x) => x === arg);
				case "not_equals":
					return !vals.some((x) => x === arg);
				case "in":
					return vals.some((x) => arg.includes(x));
				case "greater_than_equal":
					return typeof val === "number" && val >= arg;
				case "like":
					return String(arg)
						.split(" ")
						.every((word) => {
							const re = new RegExp(esc(word), "i");
							return vals.some((x) => typeof x === "string" && re.test(x));
						});
				default:
					throw new Error(`op ${op} not replayed`);
			}
		});
	});
}
function fakePayload(rows: any[]) {
	return {
		async find(args: any) {
			if (args.collection !== "repos")
				throw new Error(`collection ${args.collection}`);
			const hits = rows.filter((r) => match(r, args.where));
			const key =
				args.sort === "-repoScore" ? (r: any) => r.repoScore ?? 0 : () => 0;
			hits.sort(
				(a, b) =>
					key(b) - key(a) ||
					String(b.createdAt).localeCompare(String(a.createdAt)),
			);
			const drop = Object.entries(args.select ?? {})
				.filter(([, v]) => v === false)
				.map(([k]) => k);
			return {
				docs: hits.slice(0, args.limit ?? 10).map((r) => {
					const o = { ...r };
					for (const k of drop) delete o[k];
					return o;
				}),
				totalDocs: hits.length,
			};
		},
	};
}
const QUERIES = [
	"soroban rust sdk",
	"javascript sdk",
	"oracle",
	"anchor platform",
	"wallet kit",
	"stellar wallets kit",
	"soroswap",
	"blend lending protocol",
	"passkey smart wallet",
	"horizon api server",
	"stellar core consensus",
	"zk",
	"x402",
	"oracle price feed",
	"streaming payments",
	"escrow vault",
	"payments",
	"remittance",
	"nft marketplace",
	"wallet",
];
const before = fakePayload(rows0);
const afterRows = rows0.map((r) => {
	const a = after[r.fullName.toLowerCase()];
	return { ...r, repoScore: a.to, repoScoreLabel: a.labelTo };
});
const afterP = fakePayload(afterRows);
const out: any[] = [];
for (const q of QUERIES) {
	const b = await searchRepos(before as any, q, { limit: 10 });
	const a = await searchRepos(afterP as any, q, { limit: 10 });
	out.push({
		q,
		before: b.repos.map((r) => [r.fullName, r.repoScore]),
		after: a.repos.map((r) => [r.fullName, r.repoScore]),
		truncated: b.truncated,
		total: b.total,
		warnings: [...b.warnings, ...a.warnings],
	});
}
writeFileSync(`${dir}/search-replay.json`, JSON.stringify(out, null, 1));
console.log("done", out.length);
