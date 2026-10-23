// Each stored DoraHacks submission repo's current owner/name, from
// github.com's own redirect: one unauthenticated HEAD per repo, redirects
// not followed, at most one request started every 1.1 s, backing off on 429
// and stopping after repeated blocks.
//   301/302 to github.com/<owner>/<name>  moved; the Location is the current repo
//   200                                    not moved
//   404                                    unknown (private and deleted look the same), never moved
//   anything else                          unknown
// An earlier read-only review today followed redirects for some of these
// repos (curl -L GET); a repo it read with a 200 at a final URL is reused,
// with source "review". Everything else is read here.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-repo-moves/resolve.mts <capture.json> <out.json> [<review evidence.json> <review local_match.json>]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { repoFullNameOf } from "../../../src/lib/hackathon-build-links";

const [, , capturePath, outPath, reviewEvidence, reviewLocal] = process.argv;
if (!capturePath || !outPath)
	throw new Error("usage: resolve.mts <capture.json> <out.json>");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Resolved = {
	repo: string;
	http: number | null;
	current: string | null;
	source: "head" | "review";
	at: string;
};

const capture = JSON.parse(readFileSync(capturePath, "utf8")) as {
	builds: Array<{ id: string; githubUrl: string | null }>;
};
const repos = [
	...new Set(
		capture.builds
			.filter((b) => b.id.startsWith("dorahacks-buidl-"))
			.map((b) => repoFullNameOf(b.githubUrl))
			.filter((r): r is string => !!r),
	),
].sort();

const out = new Map<string, Resolved>(
	existsSync(outPath)
		? (JSON.parse(readFileSync(outPath, "utf8")) as Resolved[]).map((r) => [
				r.repo,
				r,
			])
		: [],
);

// Reuse the review's redirect reads (same day), keyed by submission id.
if (reviewEvidence && reviewLocal) {
	const ev = JSON.parse(readFileSync(reviewEvidence, "utf8")) as Record<
		string,
		{ repoHttp?: string; repoFinalUrl?: string }
	>;
	const local = JSON.parse(readFileSync(reviewLocal, "utf8")) as Array<{
		id: string;
		owner?: string | null;
		repo?: string | null;
	}>;
	for (const l of local) {
		const e = ev[l.id.replace(/^dorahacks-buidl-/, "")];
		if (!l.owner || !l.repo || e?.repoHttp !== "200") continue;
		const repo = `${l.owner}/${l.repo}`.toLowerCase();
		const current = repoFullNameOf(e.repoFinalUrl);
		if (!current || out.has(repo) || !repos.includes(repo)) continue;
		out.set(repo, {
			repo,
			http: 200,
			current,
			source: "review",
			at: "2026-10-23T08:32:00Z",
		});
	}
}

const save = () => writeFileSync(outPath, JSON.stringify([...out.values()]));
// One request starts every 1.1 s at most; up to 4 wait on GitHub at once so
// its latency does not stretch the run. A 429 pushes every later start back.
let nextAt = 0;
let blocked = 0;
let done = 0;
const slot = async () => {
	const at = Math.max(Date.now(), nextAt);
	nextAt = at + 1100;
	await sleep(at - Date.now());
};
const todo = repos.filter((r) => !out.has(r));
let i = 0;
await Promise.all(
	Array.from({ length: 4 }, async () => {
		while (i < todo.length && blocked < 6) {
			const repo = todo[i++];
			let resolved: Resolved | null = null;
			for (
				let attempt = 0;
				attempt < 4 && !resolved && blocked < 6;
				attempt++
			) {
				await slot();
				let res: Response;
				try {
					res = await fetch(`https://github.com/${repo}`, {
						method: "HEAD",
						redirect: "manual",
						headers: {
							"user-agent": "stellarlight-lane-n-dry-run (read-only)",
						},
						signal: AbortSignal.timeout(20_000),
					});
				} catch {
					nextAt = Math.max(nextAt, Date.now() + 5000 * (attempt + 1));
					continue;
				}
				if (res.status === 429) {
					blocked++;
					const after = Number(res.headers.get("retry-after"));
					nextAt = Math.max(
						nextAt,
						Date.now() +
							(Number.isFinite(after) && after > 0
								? after * 1000
								: 30_000 * (attempt + 1)),
					);
					continue;
				}
				blocked = 0;
				const loc = res.headers.get("location");
				const current =
					res.status === 200
						? repo
						: res.status === 301 || res.status === 302
							? repoFullNameOf(loc)
							: null;
				resolved = {
					repo,
					http: res.status,
					current,
					source: "head",
					at: new Date().toISOString(),
				};
			}
			if (resolved) out.set(repo, resolved);
			if (++done % 50 === 0) {
				save();
				console.log(`${out.size} of ${repos.length}`);
			}
		}
	}),
);
if (blocked >= 6) console.error(`stopped: ${blocked} 429s in a row`);
save();
const all = [...out.values()];
const by = (f: (r: Resolved) => boolean) => all.filter(f).length;
console.log(
	`${repos.length} repos; resolved ${all.length} (review ${by((r) => r.source === "review")}, head ${by((r) => r.source === "head")}); moved ${by((r) => !!r.current && r.current !== r.repo)}, not moved ${by((r) => r.current === r.repo)}, unknown ${by((r) => !r.current)} (404 ${by((r) => r.http === 404)})`,
);
