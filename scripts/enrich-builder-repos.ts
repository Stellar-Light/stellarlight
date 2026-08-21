/**
 * Index the Stellar repos that tracked BUILDERS own personally.
 *
 *   npx tsx scripts/enrich-builder-repos.ts            # DRY RUN
 *   npx tsx scripts/enrich-builder-repos.ts --execute
 *
 * THE GAP: we only learn about a person's own repos two ways, and both lag or
 * miss. enrich-repos walks `projects` and indexes what each LINKS to, so an
 * individual shipping under their own account is invisible to it. The EC
 * taxonomy ingest catches some of them, but it is a periodic third-party
 * snapshot — by the time a repo appears there it is months old.
 *
 * The case that found it: an SDF engineer with 112 repos. Ten were indexed,
 * all via the EC snapshot. Missing were the newest and most relevant — a ★30
 * one-command Stellar dev installer that consumes OUR ecosystem data, an
 * x402/MPP agent spend-control library, and a six-wallet-kit comparison
 * pushed the day we noticed. An index that learns about individuals only
 * through a third party is always describing last quarter.
 *
 * enrich-builder-contributions already READS this index to attribute commits,
 * so a builder's own repos were invisible to their own contribution counts
 * too — their most relevant work could never be credited to them.
 *
 * WHY THIS IS ITS OWN PASS, not a branch inside enrich-repos: one shared PAT
 * hourly budget feeds every GitHub-touching job, and the main enrich pass
 * already starves mid-corpus. 146 extra owner listings inside that pass would
 * push it over; on its own schedule it fails alone and harmlessly.
 *
 * THE FILTER IS DELIBERATELY STRICTER THAN THE ORG PASS. An org linked from a
 * curated project can be treated as dedicated and keep everything. A personal
 * account never can — people work on many chains and many hobbies, and
 * indexing all of it would flood the index with someone's dotfiles. Every
 * repo must carry a Stellar signal in its name, description or topics. The
 * same regex the org pass uses, with the small-org bypass deliberately absent.
 */

import "./load-env";
import { getPayload } from "payload";
import { listOwnerRepos, type OwnerRepo } from "../src/lib/github";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const onlyIdx = process.argv.indexOf("--only");
/** Pin the pass to one builder login — cheap re-runs while iterating. */
const ONLY =
	onlyIdx >= 0 ? (process.argv[onlyIdx + 1] ?? "").toLowerCase() : "";

/** Per-person cap. listOwnerRepos returns most-recently-pushed first. */
const PER_BUILDER_CAP = Number(process.env.BUILDER_REPO_CAP || "15") || 15;

/**
 * Accounts walked per run — one GitHub listing each, so this is the run's
 * whole API cost. The unbounded set is 6,540 owners, which would eat an
 * hourly allowance shared with the every-2h scan waves and starve them.
 * 400 is ~9% of the hourly budget, once a week.
 */
const SWEEP_CAP = Number(process.env.BUILDER_SWEEP_CAP || "400") || 400;

/**
 * Indexed repos a code-derived owner needs before we walk their account.
 * Owners with exactly one indexed repo are overwhelmingly forks and
 * hackathon one-offs: across all 11,446 non-archive repos 6,540 owners
 * appear, and only 1,508 of them have two or more. The curated roster bypasses this entirely.
 */
const MIN_INDEXED_REPOS = Number(process.env.BUILDER_MIN_REPOS || "2") || 2;

/** Same gate the org pass uses for multi-chain orgs. */
const STELLAR_SIGNAL =
	/\b(stellar|soroban|lumen|xlm|sep-?\d|sdf|reflector|soroswap|aquarius|blend|freighter|passkey-?kit|scf)\b/i;

const isStellarRepo = (r: OwnerRepo) =>
	STELLAR_SIGNAL.test(`${r.name} ${r.description ?? ""} ${r.topics.join(" ")}`);

const VALID_IDENT = /^[A-Za-z0-9_.-]+$/;

async function main() {
	console.log(
		`builder-repo indexing — ${EXECUTE ? "EXECUTE" : "DRY RUN (no writes)"}\n`,
	);
	const payload = await getPayload({ config: await configPromise });

	// Two sources, because "a builder we track" has two meanings here. The
	// `builders` collection is the curated roster. But most people reach the
	// site as CODE-DERIVED builders — they exist because we indexed a repo
	// they own, never as a curated row. The engineer this pass was written
	// for is one of those (projectCount 0, no collection record), so sourcing
	// logins from the roster alone would have skipped exactly the case that
	// motivated it.
	const builders = await payload.find({
		collection: "builders",
		limit: 1000,
		depth: 0,
		select: { github_username: true },
	});
	const fromRoster = (
		builders.docs as Array<{ github_username?: string | null }>
	)
		.map((b) => (b.github_username ?? "").trim())
		.filter(Boolean);

	// Owners of repos we consider worth keeping: people we can see building,
	// whoever told us about them. `tier` rather than a codeVerified subfield —
	// Payload refuses to query into that group, and archive is exactly the
	// demoted long tail we do not want to walk 12k accounts for.
	const fromCode = new Map<string, number>();
	for (let page = 1; ; page++) {
		const r = await payload.find({
			collection: "repos",
			where: { tier: { not_equals: "archive" } },
			limit: 2000,
			page,
			depth: 0,
			select: { owner: true },
		});
		for (const d of r.docs as Array<{ owner?: string }>) {
			const o = (d.owner ?? "").trim();
			if (o) fromCode.set(o, (fromCode.get(o) ?? 0) + 1);
		}
		if (page >= r.totalPages) break;
	}
	const qualified = [...fromCode.entries()]
		.filter(([, n]) => n >= MIN_INDEXED_REPOS)
		.map(([o]) => o);
	console.log(
		`login sources — roster: ${fromRoster.length} · code-derived owners: ${fromCode.size} (${qualified.length} with >=${MIN_INDEXED_REPOS} indexed repos)`,
	);

	// The curated roster is small and hand-picked, so it is walked EVERY run.
	// The code-derived tail rotates: a deterministic slice per ISO week, so
	// each run costs the same and the whole set is still covered on a fixed
	// cycle. Stateless on purpose — a "last swept" column would be one more
	// thing to migrate, backfill and get wrong.
	const rosterKeys = new Map<string, string>();
	for (const l of fromRoster) {
		if (l && VALID_IDENT.test(l)) rosterKeys.set(l.toLowerCase(), l);
	}
	const tail = qualified
		.filter((l) => VALID_IDENT.test(l) && !rosterKeys.has(l.toLowerCase()))
		.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

	const slots = Math.max(1, SWEEP_CAP - rosterKeys.size);
	const slices = Math.max(1, Math.ceil(tail.length / slots));
	const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
	const slice = week % slices;
	const rotated = tail.slice(slice * slots, slice * slots + slots);
	console.log(
		`rotation — slice ${slice + 1}/${slices} of the code-derived tail (${rotated.length} accounts); full coverage every ${slices} run(s)`,
	);

	let logins = [...rosterKeys.values(), ...rotated];
	if (ONLY) {
		// A targeted run must not be filtered out by rotation or the repo-count
		// floor — those exist to bound a full sweep, not to refuse a request.
		logins = [ONLY];
	}
	console.log(`${logins.length} builder login(s) to walk\n`);
	if (logins.length === 0) {
		console.error("✗ no builder logins — instrument failure, not an empty set");
		process.exit(1);
	}

	// Everything already indexed, so this pass only ADDS what is missing and
	// never fights enrich-repos over a repo a project legitimately owns.
	const known = new Set<string>();
	for (let page = 1; ; page++) {
		const r = await payload.find({
			collection: "repos",
			limit: 2000,
			page,
			depth: 0,
			select: { fullName: true },
		});
		for (const d of r.docs as Array<{ fullName?: string }>) {
			if (d.fullName) known.add(d.fullName.toLowerCase());
		}
		if (page >= r.totalPages) break;
	}
	console.log(`${known.size} repos already indexed\n`);

	const add: Array<{ fullName: string; login: string; why: string }> = [];
	let listed = 0;
	let filteredOut = 0;
	let alreadyKnown = 0;
	let noRepos = 0;

	for (const login of logins) {
		let repos: OwnerRepo[] = [];
		try {
			repos = await listOwnerRepos(login);
		} catch (e) {
			console.error(`  ! ${login}: ${(e as Error).message.slice(0, 60)}`);
			continue;
		}
		if (!repos.length) {
			noRepos++;
			continue;
		}
		listed += repos.length;
		const signal = repos.filter(isStellarRepo);
		filteredOut += repos.length - signal.length;
		const keep = signal.slice(0, PER_BUILDER_CAP);
		const fresh = keep.filter(
			(r) =>
				VALID_IDENT.test(r.name) &&
				!known.has(`${login}/${r.name}`.toLowerCase()),
		);
		if (fresh.length) {
			console.log(
				`  ${login.padEnd(24)} ${repos.length} repos · ${signal.length} stellar · ${fresh.length} new`,
			);
		}
		alreadyKnown += keep.length - fresh.length;
		for (const r of fresh) {
			add.push({
				fullName: `${login}/${r.name}`,
				login,
				why: r.description ? r.description.slice(0, 70) : r.name,
			});
		}
	}

	console.log(`\nlisted            : ${listed} repos across ${logins.length}`);
	console.log(`no public repos   : ${noRepos}`);
	console.log(`dropped, no signal: ${filteredOut}`);
	console.log(`already indexed   : ${alreadyKnown}`);
	console.log(`\n→ ${add.length} NEW repos to index\n`);
	for (const a of add.slice(0, 15)) {
		console.log(`   ${a.fullName.padEnd(42)} ${a.why}`);
	}
	if (add.length > 15) console.log(`   …and ${add.length - 15} more`);

	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
		process.exit(0);
	}

	// Create the row as a bare reference only. enrich-repos owns every derived
	// field (stars, language, scan signals, repoScore) and runs on its own
	// cadence — writing them here would fork the ownership of those fields and
	// guarantee the two passes eventually disagree.
	let wrote = 0;
	for (const a of add) {
		const existing = await payload.find({
			collection: "repos",
			where: { fullName: { equals: a.fullName } },
			limit: 1,
			depth: 0,
		});
		if (existing.docs.length > 0) continue;
		await payload.create({
			collection: "repos",
			data: {
				fullName: a.fullName,
				owner: a.login,
				name: a.fullName.split("/")[1],
				url: `https://github.com/${a.fullName}`,
				// No owning project: this repo is indexed because a tracked
				// PERSON owns it, not because a directory record claims it.
				projectSlug: null,
				source: "builder-owned",
			},
		});
		wrote++;
	}

	const after = await payload.find({
		collection: "repos",
		where: { source: { equals: "builder-owned" } },
		limit: 2000,
		depth: 0,
		select: { fullName: true },
	});
	console.log(
		`\nwrote ${wrote} — ${after.totalDocs} builder-owned repos in the index`,
	);
	console.log(
		"enrich-repos fills stars/language/scan signals on its next pass.",
	);
	process.exit(after.totalDocs >= wrote ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
