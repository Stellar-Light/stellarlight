/**
 * Which repos PUBLISH something you can install — verified against the registry.
 *
 *   pnpm exec tsx scripts/verify-published-packages.ts [--execute] [--limit=N] [--only owner/repo]
 *
 * A package.json `name` is not evidence: 18 of 25 sampled judged-hackathon
 * repos declare one. The evidence is the REGISTRY serving that package and
 * naming this repo as its source — jsr.io returns `githubRepository:
 * {owner,name}`, npm returns `repository.url`. Neither can be produced without
 * controlling both the repo and the namespace, which is what makes this harder
 * to fake than a test file or a CI badge. In that same 25-repo sample: zero
 * verified-published. In the top 30 by score: three (js-stellar-sdk,
 * js-stellar-base, smart-account-kit).
 *
 * This is the package-registry evidence gate applied to repos: a name match is
 * a hypothesis, the registry's own backlink is the evidence. 26 of 31 name
 * matches were collisions the last time we skipped that step.
 *
 * TRINARY, and the distinction reaches the write:
 *   verified        → publishedPackages = [...]  (a claim: it ships these)
 *   checked, none   → publishedPackages = []     (a claim: it ships nothing)
 *   could-not-check → NOT WRITTEN                (an admission, not a claim)
 * An empty array asserts emptiness, so a network failure must never produce one.
 */
import "./load-env";
import config from "@payload-config";
import { getPayload } from "payload";

const EXECUTE = process.argv.includes("--execute");
const argOf = (n: string, d: string) => {
	const i = process.argv.indexOf(n);
	return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
// Applied at PAGE granularity now that the work is pooled — the run stops after
// the first page that carries `read` past the limit, so it may overshoot by up
// to one page (100). A bound, not an exact count.
const LIMIT = Number(argOf("--limit", "0")) || 0;
const ONLY = argOf("--only", "");
const UA = { "User-Agent": "stellarlight-scout (published-package verifier)" };

type Found = { registry: string; name: string; version: string };

async function j(url: string, ms = 20_000): Promise<unknown | null> {
	try {
		const r = await fetch(url, {
			headers: UA,
			signal: AbortSignal.timeout(ms),
		});
		if (!r.ok) return null;
		return await r.json();
	} catch {
		return null;
	}
}

/** The repo's own declared package name, from whichever manifest it uses. */
async function declaredName(
	full: string,
): Promise<{ name: string | null; reachable: boolean }> {
	let reachable = false;
	for (const br of ["main", "master"]) {
		for (const f of ["package.json", "deno.json", "jsr.json"]) {
			try {
				const r = await fetch(
					`https://raw.githubusercontent.com/${full}/${br}/${f}`,
					{ headers: UA, signal: AbortSignal.timeout(15_000) },
				);
				if (r.status === 404) {
					reachable = true; // the host answered; this file just isn't there
					continue;
				}
				if (!r.ok) continue;
				reachable = true;
				const m = (await r.json()) as { name?: unknown };
				if (typeof m.name === "string" && m.name.trim())
					return { name: m.name.trim(), reachable: true };
			} catch {
				/* transport — leave reachable as-is */
			}
		}
	}
	return { name: null, reachable };
}

/** Does a registry serve this name AND name this repo as its source? */
async function verify(full: string, name: string): Promise<Found | null> {
	if (name.startsWith("@") && name.includes("/")) {
		const [scope, pkg] = name.slice(1).split("/", 2);
		const d = (await j(
			`https://jsr.io/api/scopes/${encodeURIComponent(scope)}/packages/${encodeURIComponent(pkg)}`,
		)) as {
			githubRepository?: { owner?: string; name?: string };
			latestVersion?: string;
		} | null;
		const g = d?.githubRepository;
		if (g && `${g.owner}/${g.name}`.toLowerCase() === full.toLowerCase())
			return { registry: "jsr", name, version: String(d?.latestVersion ?? "") };
	}
	const n = (await j(
		`https://registry.npmjs.org/${name.replace("/", "%2f")}`,
	)) as {
		repository?: { url?: string } | string;
		"dist-tags"?: { latest?: string };
	} | null;
	if (n) {
		const rep = n.repository;
		const url = typeof rep === "string" ? rep : (rep?.url ?? "");
		if (url.toLowerCase().includes(full.toLowerCase()))
			return {
				registry: "npm",
				name,
				version: String(n["dist-tags"]?.latest ?? ""),
			};
	}
	return null;
}

async function main() {
	const payload = await getPayload({ config });
	let read = 0;
	let ships = 0;
	let none = 0;
	let blind = 0;
	let wrote = 0;
	const samples: string[] = [];

	// CONCURRENCY. The first run was fully sequential — up to six HTTP round
	// trips per repo, one repo at a time. Over 13,169 repos that is hours, and
	// the job's 55-minute ceiling would kill it MID-WRITE: a partial pass that
	// looks like a finished one on every dashboard except the timestamp.
	// A pool of 8 is polite to jsr.io and registry.npmjs.org (both public, no
	// key) and brings a full pass inside the window.
	async function pooled<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
		let i = 0;
		await Promise.all(
			Array.from({ length: Math.min(n, items.length) }, async () => {
				while (i < items.length) {
					const idx = i++;
					await fn(items[idx]);
				}
			}),
		);
	}

	for (let page = 1; page < 200; page++) {
		const res = await payload.find({
			collection: "repos",
			where: ONLY
				? { fullName: { equals: ONLY } }
				: { isFork: { not_equals: true } },
			limit: 100,
			page,
			depth: 0,
			overrideAccess: true,
			context: { internal: true },
		});
		await pooled(
			res.docs as unknown as Array<Record<string, unknown>>,
			8,
			async (r) => {
				read++;
				const full = String(r.fullName);
				const { name, reachable } = await declaredName(full);
				// Could not reach GitHub at all: we learned nothing. Writing [] here
				// would assert "this repo publishes nothing", which we did not check.
				if (!reachable) {
					blind++;
					return;
				}
				const found = name ? await verify(full, name) : null;
				const next: Found[] = found ? [found] : [];
				if (found) {
					ships++;
					if (samples.length < 20)
						samples.push(
							`  ${full} → ${found.name}@${found.version} (${found.registry})`,
						);
				} else none++;

				const prev = Array.isArray(r.publishedPackages)
					? (r.publishedPackages as Found[])
					: null;
				const same =
					prev !== null &&
					prev.length === next.length &&
					prev.every(
						(p, i) =>
							p?.name === next[i]?.name && p?.registry === next[i]?.registry,
					);
				if (same) return;
				if (EXECUTE) {
					await payload.update({
						collection: "repos",
						id: String(r.id),
						data: {
							publishedPackages: next.map((f) => ({
								...f,
								verifiedAt: new Date().toISOString(),
							})),
						},
						overrideAccess: true,
						context: { internal: true },
					});
					wrote++;
				}
			},
		);
		if (!res.hasNextPage || (LIMIT && read >= LIMIT) || ONLY) break;
	}

	console.log(`\nread ${read} repos`);
	console.log(`  verified-published : ${ships}`);
	console.log(`  checked, publishes nothing : ${none}`);
	console.log(`  COULD NOT CHECK (not written) : ${blind}`);
	for (const s of samples) console.log(s);
	console.log(
		EXECUTE ? `\nWROTE ${wrote} rows` : "\nDRY RUN — pass --execute to write",
	);

	// End-state assertion: say what is true after this ran.
	if (read === 0) {
		console.error("FATAL: read zero repos — the query found nothing");
		process.exit(1);
	}
	if (blind * 2 > read) {
		console.error(
			`FATAL: could not check ${blind} of ${read} — a run that could not look must not read as a run that found nothing`,
		);
		process.exit(2);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
