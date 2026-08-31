/**
 * Is the scout-mcp distribution mirror byte-identical to the monorepo?
 *
 * No secret needed — which is the point. The sync lane's PAT expired
 * 2026-07-03 and the mirror went two months stale with nothing noticing;
 * when the operator declined to mint another credential, the automation was
 * retired (sync-scout-mcp.yml is dispatch-only now) and the WATCHING moved
 * here, where it needs only public reads: the mirror's git tree via the
 * GitHub API against `git ls-tree` of scout-mcp/ in this checkout. Blob
 * shas are content-addressed, so equal shas ARE equal bytes.
 *
 * Red means one thing: run the manual sync (the retired workflow's own
 * steps — clone mirror, rsync scout-mcp/ over it with --delete, push).
 */
import { execFileSync } from "node:child_process";

const MIRROR = "Stellar-Light/scout-mcp";
const EXCLUDE = /^(node_modules|dist)\/|(^|\/)\.DS_Store$/;

async function main() {
	const local = new Map<string, string>();
	for (const line of execFileSync(
		"git",
		["ls-tree", "-r", "HEAD", "scout-mcp/"],
		{ encoding: "utf8" },
	)
		.trim()
		.split("\n")
		.filter(Boolean)) {
		const m = /^\d+ blob ([0-9a-f]{40})\t(.+)$/.exec(line.replace(/^(\d+) (\w+) /, "$1 $2 "));
		if (!m) continue;
		const path = m[2].replace(/^scout-mcp\//, "");
		if (!EXCLUDE.test(path)) local.set(path, m[1]);
	}
	if (local.size === 0) {
		console.error("INCONCLUSIVE: git ls-tree returned nothing for scout-mcp/ — wrong cwd or shallow tree.");
		process.exit(2);
	}

	const res = await fetch(
		`https://api.github.com/repos/${MIRROR}/git/trees/HEAD?recursive=1`,
		{
			headers: {
				accept: "application/vnd.github+json",
				"user-agent": "stellarlight-mirror-drift",
				...(process.env.GITHUB_TOKEN
					? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
					: {}),
			},
		},
	);
	if (!res.ok) {
		console.error(`INCONCLUSIVE: mirror tree fetch HTTP ${res.status} — no verdict.`);
		process.exit(2);
	}
	const tree = (await res.json()) as {
		truncated?: boolean;
		tree?: Array<{ path: string; type: string; sha: string }>;
	};
	if (tree.truncated) {
		console.error("INCONCLUSIVE: mirror tree truncated by the API — no verdict.");
		process.exit(2);
	}
	const remote = new Map<string, string>();
	for (const t of tree.tree ?? [])
		if (t.type === "blob" && !EXCLUDE.test(t.path)) remote.set(t.path, t.sha);

	const missing = [...local.keys()].filter((p) => !remote.has(p));
	const extra = [...remote.keys()].filter((p) => !local.has(p));
	const changed = [...local.keys()].filter(
		(p) => remote.has(p) && remote.get(p) !== local.get(p),
	);

	if (missing.length || extra.length || changed.length) {
		console.error(
			`RED: scout-mcp mirror has drifted from the monorepo — run the manual sync (see sync-scout-mcp.yml header).`,
		);
		for (const p of missing.slice(0, 5)) console.error(`  missing in mirror: ${p}`);
		for (const p of changed.slice(0, 5)) console.error(`  differs: ${p}`);
		for (const p of extra.slice(0, 5)) console.error(`  extra in mirror: ${p}`);
		process.exit(1);
	}
	console.log(
		`GREEN: mirror byte-identical to monorepo scout-mcp/ (${local.size} files).`,
	);
}

main().catch((e) => {
	console.error("INCONCLUSIVE:", e?.message ?? e);
	process.exit(2);
});
