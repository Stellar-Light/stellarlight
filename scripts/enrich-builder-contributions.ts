/**
 * GitHub contributor pass for builders.
 *
 * For every builder with a GitHub login, ask GitHub (GraphQL, public data) which
 * repositories they committed to in the last 12 months and how many commits,
 * then keep only the repos WE index (the Stellar ecosystem set) and write them
 * to builders.contributions. This is how a person who works in an org repo
 * (stellar/js-stellar-sdk, a project's own org) but never declared it on their
 * Passport profile gets connected to that repo and its project on the site.
 *
 *   pnpm exec tsx scripts/enrich-builder-contributions.ts             # dry run
 *   pnpm exec tsx scripts/enrich-builder-contributions.ts --execute   # write
 *   ... --only fazzatti,pedro-pelicioni                                # subset
 *
 * Needs GITHUB_TOKEN (the Actions token is enough: contributionsCollection is
 * public). One GraphQL call per builder; 5000 points/hour, ~150 builders.
 * Rows are REPLACED per builder on each run (the source is authoritative for
 * "last 12 months"); a GitHub error leaves the previous rows untouched.
 */
import { getPayload } from "payload";
import configPromise from "@/payload.config";

const EXECUTE = process.argv.includes("--execute");
const onlyIdx = process.argv.indexOf("--only");
const ONLY =
	onlyIdx > -1
		? new Set(
				String(process.argv[onlyIdx + 1])
					.split(",")
					.map((s) => s.trim().toLowerCase()),
			)
		: null;
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";
if (!TOKEN) {
	console.error("GITHUB_TOKEN is required");
	process.exit(1);
}

type Contribution = {
	fullName: string;
	commits12m: number;
	projectSlug: string | null;
};

const QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner isPrivate }
        contributions { totalCount }
      }
    }
  }
}`;

async function githubContributions(
	login: string,
): Promise<{ nameWithOwner: string; commits: number }[] | null> {
	const res = await fetch("https://api.github.com/graphql", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${TOKEN}`,
			"Content-Type": "application/json",
			"User-Agent": "stellarlight-builders",
		},
		body: JSON.stringify({ query: QUERY, variables: { login } }),
	});
	if (res.status === 403 || res.status === 429) {
		const reset = Number(res.headers.get("x-ratelimit-reset") ?? 0) * 1000;
		const wait = Math.max(5_000, reset - Date.now() + 1_000);
		console.log(`  rate limited; sleeping ${Math.round(wait / 1000)}s`);
		await new Promise((r) => setTimeout(r, wait));
		return githubContributions(login);
	}
	if (!res.ok) {
		console.log(`  github ${res.status} for ${login}`);
		return null;
	}
	const body = (await res.json()) as any;
	if (body.errors?.length) {
		// NOT_FOUND = renamed/deleted account; leave prior rows alone
		console.log(
			`  ${login}: ${body.errors.map((e: any) => e.type ?? e.message).join(", ")}`,
		);
		return null;
	}
	const rows =
		body.data?.user?.contributionsCollection?.commitContributionsByRepository ??
		[];
	return rows
		.filter((r: any) => r?.repository && !r.repository.isPrivate)
		.map((r: any) => ({
			nameWithOwner: String(r.repository.nameWithOwner),
			commits: Number(r.contributions?.totalCount ?? 0),
		}));
}

async function main() {
	const payload = await getPayload({ config: configPromise });
	console.log(`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}`);

	const builders = await payload.find({
		collection: "builders",
		where: { github_username: { exists: true } },
		limit: 2000,
		depth: 0,
		select: { github_username: true, contributions: true },
	} as any);
	// index of everything we track: fullName (lower) -> projectSlug
	const indexed = new Map<string, string | null>();
	let page = 1;
	for (;;) {
		const r = await payload.find({
			collection: "repos",
			where: { tier: { not_equals: "archive" } },
			limit: 2000,
			page,
			depth: 0,
			select: { fullName: true, projectSlug: true },
		} as any);
		for (const d of r.docs as any[])
			if (d.fullName)
				indexed.set(String(d.fullName).toLowerCase(), d.projectSlug ?? null);
		if (!r.hasNextPage) break;
		page++;
	}
	console.log(
		`${builders.docs.length} builders, ${indexed.size} indexed repos`,
	);

	let written = 0,
		checked = 0,
		connected = 0;
	for (const b of builders.docs as any[]) {
		const login = String(b.github_username ?? "");
		if (!login || (ONLY && !ONLY.has(login.toLowerCase()))) continue;
		checked++;
		const gh = await githubContributions(login);
		if (!gh) continue;
		const mine: Contribution[] = gh
			.filter((r) => indexed.has(r.nameWithOwner.toLowerCase()))
			.map((r) => ({
				fullName: r.nameWithOwner,
				commits12m: r.commits,
				projectSlug: indexed.get(r.nameWithOwner.toLowerCase()) ?? null,
			}))
			.sort((a, b) => b.commits12m - a.commits12m);
		const before = (b.contributions ?? []).length;
		if (mine.length) connected++;
		console.log(
			`  ${login}: ${gh.length} repos on GitHub (12mo), ${mine.length} in our index${before ? ` (had ${before})` : ""}${
				mine.length
					? ` -> ${mine
							.slice(0, 4)
							.map((m) => `${m.fullName}:${m.commits12m}`)
							.join(", ")}${mine.length > 4 ? ", ..." : ""}`
					: ""
			}`,
		);
		if (EXECUTE) {
			await payload.update({
				collection: "builders",
				id: b.id,
				data: {
					contributions: mine,
					contributions_synced_at: new Date().toISOString(),
				},
				overrideAccess: true,
			});
			written++;
		}
	}
	console.log(
		`\nchecked ${checked}, connected to indexed repos ${connected}, ${EXECUTE ? `wrote ${written}` : "DRY RUN, nothing written"}`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
