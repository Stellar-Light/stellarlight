/**
 * Refresh projects.onchain: the on-chain readings of a directory row, from
 * sources that answer without a key or a payment (src/lib/onchain-sources.ts
 * says which, and what each can and cannot prove).
 *
 *   per asset:    accounts holding a balance, supply in whole units, open
 *                 trustlines, and the date of the newest movement.
 *   per contract: the newest event, the count of ledgers with an event, the
 *                 TTL state, and the repo its deployed WASM is attested to.
 *
 * Until 2026-11-03 this lane read stellar.expert, whose API went paid on
 * 2026-11-06; every row froze. The fields nothing free can supply (payment
 * and trade counts of an asset, event totals, sub-calls and storage size of
 * a contract) are gone, not zeroed. A contract's creation date does not
 * change: the on-chain map's, proved in the ledger, is written; otherwise the
 * date a row holds is kept.
 *
 * Join keys come from verified-only sources:
 *   1. src/data/onchain-contracts.ts: hand-verified seeds, each with its
 *      primary-source URL.
 *   2. src/data/onchain-map.json: contracts and accounts linked to a row by
 *      evidence of their own, with tier, evidence kind and source (rules in
 *      src/lib/onchain-map.ts). Accounts are written to onchain.accounts.
 *   3. repos.codeVerified.mainnetContractId: the contract the code scan
 *      proved to be a repo's own, for repos linked to a directory project.
 *   4. partner records, the stablecoin registry and a project's own
 *      stellar.toml, for the issued asset.
 *
 * Each week every contract's instance is looked up on mainnet (read-only RPC
 * getLedgerEntries) and every map account on Horizon: an address read absent
 * is marked endedAt with the day it was first read so; one that could not be
 * checked keeps what it had, and the run exits red.
 *
 * A row is refreshed whole or left as it was: a read that fails skips the
 * project, nothing is zeroed, and the run exits red.
 *
 * Usage:
 *   pnpm exec tsx scripts/data/enrich-onchain-projects.ts             # dry run
 *   pnpm exec tsx scripts/data/enrich-onchain-projects.ts --execute   # write
 */

import "../load-env";
import { getPayload } from "payload";
import {
	ONCHAIN_NOT_THIS_ROW,
	ONCHAIN_SEEDS,
} from "../../src/data/onchain-contracts";
import onchainMap from "../../src/data/onchain-map.json";
import { STABLECOIN_REGISTRY } from "../../src/data/stablecoin-registry";
import { attestedSourceRepos } from "../../src/lib/contract-ownership";
import {
	addressesIn,
	repoContractJoins,
	rollupRepoOf,
	verifiedRepoOf,
} from "../../src/lib/onchain-join";
import {
	endedAtOf,
	type OnchainMapLink,
	type Presence,
	selectLinks,
	settledElsewhere,
} from "../../src/lib/onchain-map";
import {
	accountPresence,
	contractPresence,
	type FetchJson,
	indexHeadAt,
	MAX_INDEX_LAG_MINUTES,
	readAsset,
	readContract,
} from "../../src/lib/onchain-sources";
import { diffWritten, formatMismatches } from "../../src/lib/utils/read-back";
import configPromise from "../../src/payload.config";
import { exitAfterFlush } from "../lib/exit-after-flush";
import { tomlChains } from "./backfill-deployment";
import { DEPLOYMENT_VERIFIED } from "./curation-maps";

const execute = process.argv.includes("--execute");
/** Served as onchain.source. A delta is only taken between two readings of
 * the same source: the explorer counted contracts that hold an asset as
 * holders and the index counts accounts, so a delta across the switch would
 * be the change of definition, not of holders. */
const SOURCE = "stellarindex.io, horizon.stellar.org";
const PAUSE_MS = 400; // be polite: keyless public APIs

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// A 429 or a 5xx is "slow down" or "try again", not "no data": back off and
// retry, honouring Retry-After when the server sends one. Every run from
// 2026-09-08 to 09-28 ended with 22 to 26 unanswered 429s and reported
// success.
const RETRY_DELAYS_MS = [5_000, 15_000, 45_000];

const fetchJson: FetchJson = async (url) => {
	for (let attempt = 0; ; attempt++) {
		try {
			const r = await fetch(url, {
				headers: {
					"user-agent": "stellarlight-onchain-enrich",
					accept: "application/json",
				},
				signal: AbortSignal.timeout(30_000),
			});
			if (r.ok) {
				const body = await r.json();
				await sleep(PAUSE_MS);
				return body;
			}
			const retryable = r.status === 429 || r.status >= 500;
			if (retryable && attempt < RETRY_DELAYS_MS.length) {
				const header = Number(r.headers.get("retry-after"));
				const wait =
					Number.isFinite(header) && header > 0
						? header * 1000
						: RETRY_DELAYS_MS[attempt];
				console.log(
					`    … ${url} → HTTP ${r.status}, retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${Math.round(wait / 1000)}s`,
				);
				await sleep(wait);
				continue;
			}
			console.log(`    ✗ ${url} → HTTP ${r.status}`);
			return null;
		} catch (e) {
			if (attempt < RETRY_DELAYS_MS.length) {
				await sleep(RETRY_DELAYS_MS[attempt]);
				continue;
			}
			console.log(`    ✗ ${url} → ${(e as Error).message}`);
			return null;
		}
	}
};

const day = (v: unknown) =>
	typeof v === "string" && v ? v.slice(0, 10) : "none";

/** The on-chain map's fields of one contract or account (null where the map
 * holds none: a seed or repo join), and its existence: endedAt is the day
 * the address was first read absent, kept while that cannot be checked. */
const mapFields = (
	m: OnchainMapLink | undefined,
	// biome-ignore lint/suspicious/noExplicitAny: stored array row
	old: any,
	presence: Presence,
	now: string,
) => ({
	tier: m?.tier ?? null,
	evidence: m?.evidence ?? null,
	sourceUrl: m?.sourceUrl ?? null,
	createdLedger: m?.createdLedger ?? null,
	dateBasis: m?.dateBasis ?? null,
	sharedWithinFamily: m?.sharedWithinFamily ?? null,
	endedAt: endedAtOf(old?.endedAt, presence, now),
});

async function run() {
	const now = new Date();
	const asOf = now.toISOString();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log(`source: ${SOURCE}\n`);

	// The index stamps every answer with the time it answered, not the age of
	// its data, so a stalled ingestion would be written under today's date.
	// The native asset moves in nearly every ledger: its newest event is the
	// index's own clock. Behind by more than an hour, nothing is read.
	const head = await indexHeadAt(fetchJson);
	const lagMinutes = head
		? (now.getTime() - Date.parse(head)) / 60_000
		: Number.NaN;
	if (!(lagMinutes <= MAX_INDEX_LAG_MINUTES)) {
		console.error(
			`RED: Stellar Index is behind or did not answer (newest native-asset event: ${head ?? "none read"}${Number.isFinite(lagMinutes) ? `, ${Math.round(lagMinutes)} minutes old` : ""}). Nothing was read or written.`,
		);
		process.exitCode = 1;
		return;
	}
	console.log(`index head: ${head} (${Math.round(lagMinutes)} minutes old)\n`);

	const payload = await getPayload({ config: configPromise });

	// Merge join keys: seeds first, then repo-derived contract IDs.
	const bySlug = new Map<
		string,
		{
			contracts: Array<{
				address: string;
				label: string | null;
				/** The repo this contract rolls up to: its seed names it, or the
				 * scan proved the repo's source defines it. */
				sourceRepo?: string;
				/** Set from a seed only: the repo served as verifiedRepo where
				 * the WASM carries no build metadata to attest. */
				curatedRepo?: string;
				/** The on-chain map's link (src/data/onchain-map.json). */
				map?: OnchainMapLink;
			}>;
			asset?: { code: string; issuer: string };
			/** The on-chain map's accounts for this row. */
			accounts?: OnchainMapLink[];
		}
	>();
	for (const seed of ONCHAIN_SEEDS) {
		bySlug.set(seed.slug, {
			contracts: (seed.contracts ?? []).map((c) => ({
				address: c.address,
				label: c.label,
				...(c.sourceRepo
					? { sourceRepo: c.sourceRepo, curatedRepo: c.sourceRepo }
					: {}),
			})),
			asset: seed.asset,
		});
	}

	// Every repo, a page at a time, two small fields each. A fixed limit of
	// 3000 read the first fifth of the index (13,900 rows by 2026-11), so the
	// write-back below could not find most repos and said only "no indexed
	// repo matches".
	type RepoRow = {
		id: string | number;
		fullName?: string | null;
		projectSlug?: string | null;
		mainnetContractId?: string | null;
		mainnetContractBasis?: string | null;
		codeScanState?: string | null;
		// biome-ignore lint/suspicious/noExplicitAny: stored group shape
		codeInUse?: any;
	};
	const repoRows: RepoRow[] = [];
	for (let page = 1; ; page++) {
		const r = await payload.find({
			collection: "repos",
			limit: 1000,
			page,
			depth: 0,
			select: {
				fullName: true,
				projectSlug: true,
				mainnetContractId: true,
				// isOwnContract reads an absent basis as not judged: select it, or
				// a cited id passes as the repo's own.
				mainnetContractBasis: true,
				codeScanState: true,
				codeInUse: true,
			},
		});
		repoRows.push(...(r.docs as unknown as RepoRow[]));
		if (!r.hasNextPage) break;
	}
	// Case-insensitive repo index for the codeInUse write-back (identity
	// lesson: never trust iteration-spelling equality on fullName).
	const repoIndex = new Map<
		string,
		// biome-ignore lint/suspicious/noExplicitAny: stored group shape
		{ id: string | number; fullName: string; codeInUse?: any }
	>();
	for (const r of repoRows) {
		if (r.fullName)
			repoIndex.set(r.fullName.toLowerCase(), {
				id: r.id,
				fullName: r.fullName,
				codeInUse: r.codeInUse,
			});
	}
	// Per-repo usage rollup accumulated across ALL projects this run.
	const byRepo = new Map<
		string,
		{
			contracts: number;
			activeLedgers: number | null;
			lastEventAt: string | null;
		}
	>();
	const rolledUp = new Set<string>();
	// Repo-derived contracts: the id the code scan proved to be a repo's own,
	// joined by src/lib/onchain-join.ts under the rule the deployment pass
	// uses. Until 2026-11 this read codeVerified.mainnetContractId, a path the
	// scan had stopped writing, and joined nothing ("0 repo-derived" every
	// week).
	const seedOwner = new Map<string, string>();
	for (const seed of ONCHAIN_SEEDS)
		for (const c of seed.contracts ?? []) seedOwner.set(c.address, seed.slug);
	// What a curator said is not a row's own: the artifact a deployment
	// retraction names (DEPLOYMENT_VERIFIED, network "unknown": PayLoop's
	// contract under the IDE row, AgentSmith's under the timelock row), and
	// the contracts ONCHAIN_NOT_THIS_ROW lists. Only the named address is
	// held back, so a deployment of the row's own that comes later joins.
	// Hand-verified keys (seeds, partner records, the registry) are not
	// derived and stay.
	const heldBack = (slug: string): Set<string> => {
		const entry = DEPLOYMENT_VERIFIED[slug];
		return new Set([
			...(entry?.network === "unknown" ? addressesIn(entry.note) : []),
			...ONCHAIN_NOT_THIS_ROW.filter((x) => x.slug === slug).map(
				(x) => x.address,
			),
		]);
	};
	// The on-chain map: contracts and accounts linked to a row by evidence of
	// their own (src/data/onchain-map.json, rules in src/lib/onchain-map.ts).
	// A contract it gives to one row is settled like a seed's, so a repo link
	// never files it under another row; what a curator held back stays back.
	let mapContracts = 0;
	let mapAccounts = 0;
	for (const l of selectLinks(onchainMap.links as OnchainMapLink[]).kept) {
		if (heldBack(l.slug).has(l.address)) {
			console.log(
				`  held back: map ${l.kind} ${l.address.slice(0, 8)}… is not joined to ${l.slug} (a curator named it as another product's)`,
			);
			continue;
		}
		const entry = bySlug.get(l.slug) ?? { contracts: [] };
		bySlug.set(l.slug, entry);
		if (l.kind === "account") {
			entry.accounts = [...(entry.accounts ?? []), l];
			mapAccounts += 1;
			continue;
		}
		const owner = seedOwner.get(l.address);
		if (owner && owner !== l.slug) {
			console.log(
				`  map contract ${l.address.slice(0, 8)}… names ${l.slug}, a seed gives it to ${owner}: not joined`,
			);
			continue;
		}
		const held = entry.contracts.find((c) => c.address === l.address);
		if (held) held.map = l;
		else {
			entry.contracts.push({ address: l.address, label: l.label, map: l });
			mapContracts += 1;
		}
		if (!l.sharedWithinFamily) seedOwner.set(l.address, l.slug);
	}
	const repoJoin = repoContractJoins(repoRows, { seedOwner, heldBack });
	for (const j of repoJoin.retracted)
		console.log(
			`  held back: ${j.repo} ${j.address.slice(0, 8)}… is not joined to ${j.slug} (a curator named it as another product's)`,
		);
	for (const j of repoJoin.shared)
		console.log(
			`  shared: ${j.address.slice(0, 8)}… is held by repos of ${j.slugs.join(", ")}; joined to none (${j.repo})`,
		);
	let repoDerived = 0;
	for (const j of repoJoin.joins) {
		const entry = bySlug.get(j.slug) ?? { contracts: [] };
		const held = entry.contracts.find((c) => c.address === j.address);
		if (held) {
			held.sourceRepo ??= j.sourceRepo;
		} else {
			entry.contracts.push({
				address: j.address,
				label: `from ${j.repo}`,
				...(j.sourceRepo ? { sourceRepo: j.sourceRepo } : {}),
			});
			repoDerived += 1;
		}
		bySlug.set(j.slug, entry);
	}
	// Partner-asset auto-join: partner records carry domain-matched, live
	// on-chain assets (enrichment-owned, holders-sorted — the top entry is the
	// canonical asset) plus an explicit projectSlug link. Verified-grade
	// already; no new judgment here.
	let partnerDerived = 0;
	try {
		const partners = await payload.find({
			collection: "partner-accounts",
			limit: 500,
			depth: 0,
			// Auth collection: match the proven enrich-partner-onchain access mode.
			overrideAccess: true,
		});
		for (const pt of partners.docs as unknown as Array<{
			projectSlug?: string | null;
			onchain?: Array<{ code?: string; issuer?: string | null }> | null;
		}>) {
			const slug = pt.projectSlug;
			const top = pt.onchain?.[0];
			if (!slug || !top?.code || !top.issuer) continue;
			const entry = bySlug.get(slug) ?? { contracts: [] };
			if (!entry.asset) {
				entry.asset = { code: top.code, issuer: top.issuer };
				bySlug.set(slug, entry);
				partnerDerived += 1;
			}
		}
		// Diagnostics: the join failed silently twice (wrong slug, then a race);
		// make its inputs visible so a zero is explainable from the log alone.
		const pdocs = partners.docs as unknown as Array<{
			projectSlug?: string | null;
			onchain?: unknown[] | null;
		}>;
		console.log(
			`  partner join inputs: ${pdocs.length} docs, ${pdocs.filter((x) => x.projectSlug).length} with projectSlug, ${pdocs.filter((x) => Array.isArray(x.onchain) && x.onchain.length).length} with onchain assets`,
		);
	} catch (e) {
		console.log(`partner-asset join skipped: ${(e as Error).message}`);
	}

	// Stablecoin-registry auto-join (P4 evidence expansion, 2026-08-31): the
	// registry's 29 hand-verified (code, issuer) identities carry the issuer's
	// home domain. Joined to directory rows by registered-host equality against
	// links.website — a registry asset joins ONLY when exactly one project
	// matches its domain, and only fills an EMPTY asset slot (seeds, repo- and
	// partner-derived keys outrank). Every join and every ambiguity is printed
	// so the dry run shows the mapping before anything writes. This is what
	// lets the basis upgrader see issuer-class rows: evidence first, label
	// after, one weekly observation apart (deltas need two readings).
	let registryDerived = 0;
	{
		const allProjects = await payload.find({
			collection: "projects",
			limit: 5000,
			depth: 0,
			select: { slug: true, links: true },
		});
		const host = (u?: string | null) => {
			if (!u) return null;
			try {
				return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
			} catch {
				return null;
			}
		};
		const byHost = new Map<string, string[]>();
		for (const p of allProjects.docs as unknown as Array<{
			slug?: string;
			links?: { website?: string | null } | null;
		}>) {
			const h = host(p.links?.website);
			if (!h || !p.slug) continue;
			byHost.set(h, [...(byHost.get(h) ?? []), p.slug]);
		}
		for (const a of STABLECOIN_REGISTRY) {
			const dom = a.domain.toLowerCase().replace(/^www\./, "");
			// exact host, or the project site living on a subdomain of it
			const slugs = new Set<string>();
			for (const [h, ss] of byHost)
				if (h === dom || h.endsWith(`.${dom}`))
					for (const s of ss) slugs.add(s);
			if (slugs.size === 0) {
				console.log(`  registry ${a.code} (${dom}): no directory row — skip`);
				continue;
			}
			// Multi-asset issuers keep per-asset directory rows on ONE domain
			// (vnx.li → veur + vchf; stablecoin.z.com → gyen + zusd; circle.com
			// → usdc + eurc + …). The first dry run skipped every one of these
			// as AMBIGUOUS while the disambiguator was in the row itself: the
			// asset-code-named row IS the asset's row. Exact canon(code) ==
			// canon(slug) wins within the domain set; with no code-named row a
			// single domain match joins as before; anything else stays an
			// honest skip.
			let slug: string;
			if (slugs.size === 1) {
				slug = [...slugs][0];
			} else {
				const codeCanon = a.code.toLowerCase().replace(/[^a-z0-9]/g, "");
				const codeMatches = [...slugs].filter(
					(s) => s.toLowerCase().replace(/[^a-z0-9]/g, "") === codeCanon,
				);
				if (codeMatches.length !== 1) {
					console.log(
						`  registry ${a.code} (${dom}): AMBIGUOUS → ${[...slugs].join(", ")} — skip`,
					);
					continue;
				}
				slug = codeMatches[0];
			}
			const entry = bySlug.get(slug) ?? { contracts: [] };
			if (entry.asset) {
				console.log(
					`  registry ${a.code} (${dom}): ${slug} already keyed (${entry.asset.code}) — skip`,
				);
				continue;
			}
			entry.asset = { code: a.code, issuer: a.issuer };
			bySlug.set(slug, entry);
			registryDerived += 1;
			console.log(`  registry ${a.code} (${dom}) → ${slug}`);
		}
	}

	// stellar.toml auto-join: anchor/stablecoin-class rows publish their
	// issuer accounts in their OWN domain's /.well-known/stellar.toml. The
	// join holds only when the chain holds BOTH ways (tomlChain): the
	// project's toml declares a live currency, that code and issuer exist on
	// Horizon, and the issuer account's home_domain points back at the
	// project's domain. Until 2026-11 this join read one direction only, so a
	// toml that copied another issuer's currency block keyed that issuer's
	// asset to the row (found 2026-11-12, improvements/TODO.md). Only fills an
	// EMPTY asset slot (every other source outranks); a page on a third-party
	// host, an unreachable or HTML soft-404 toml, or a currency the operator
	// marks dead is a skip, never a guess.
	let tomlDerived = 0;
	{
		const candidates = await payload.find({
			collection: "projects",
			where: {
				or: [
					{ types: { contains: "Anchor" } },
					{ types: { contains: "Stablecoin" } },
				],
			},
			limit: 2000,
			depth: 0,
			select: { slug: true, links: true, name: true, canonicalSlug: true },
		});
		const rows = candidates.docs as unknown as Array<{
			slug?: string;
			name?: string;
			canonicalSlug?: string | null;
			links?: { website?: string | null } | null;
		}>;
		console.log(`  toml join: ${rows.length} anchor/stablecoin-class rows`);
		for (const p of rows) {
			if (!p.slug) continue;
			// A hidden duplicate (Draft + canonicalSlug) shares its canonical's
			// domain; keying it would fetch and write the same asset twice.
			if (p.canonicalSlug) continue;
			const existing = bySlug.get(p.slug);
			if (existing?.asset) continue; // a stronger source already keyed it
			if (!p.links?.website) continue;
			const named = heldBack(p.slug);
			const chains = (await tomlChains(p.links.website)).filter(
				(c) => !named.has(c.issuer),
			);
			await sleep(150); // be polite across many small operators
			// An issuer with several coins keeps a row per coin on one domain
			// (stablecoin.z.com: gyen and zusd): the row named like a currency
			// takes that currency, any other row takes the first that holds.
			const canon = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
			const chain =
				chains.find((c) => canon(c.code) === canon(p.slug ?? "")) ?? chains[0];
			if (!chain) continue;
			const entry = existing ?? { contracts: [] };
			entry.asset = { code: chain.code, issuer: chain.issuer };
			bySlug.set(p.slug, entry);
			tomlDerived += 1;
			console.log(
				`  toml ${chain.tomlUrl} → ${p.slug}: ${chain.code}-${chain.issuer.slice(0, 6)}… (the issuer's home_domain names the same domain)${chains.length > 1 ? `, of ${chains.map((c) => c.code).join(", ")}` : ""}`,
			);
		}
	}

	console.log(
		`Join keys: ${ONCHAIN_SEEDS.length} seeded + ${mapContracts} map contracts and ${mapAccounts} map accounts + ${repoDerived} repo-derived (${repoJoin.retracted.length} more held back, ${repoJoin.shared.length} shared by two rows) + ${partnerDerived} partner-asset + ${registryDerived} registry + ${tomlDerived} toml → ${bySlug.size} projects\n`,
	);

	// The weekly existence check: each contract's instance on mainnet (one
	// read-only RPC pass) and each map account on Horizon. An address read
	// absent is ended with the day it was first read so; one that could not
	// be checked keeps what the row holds and turns the run red.
	const contractState = await contractPresence([
		...new Set(
			[...bySlug.values()].flatMap((k) => k.contracts.map((c) => c.address)),
		),
	]);
	const accountState = new Map<string, Presence>();
	for (const a of new Set(
		[...bySlug.values()].flatMap((k) =>
			(k.accounts ?? []).map((x) => x.address),
		),
	)) {
		let p = await accountPresence(a);
		if (p === null) {
			await sleep(5_000);
			p = await accountPresence(a);
		}
		accountState.set(a, p);
		await sleep(150);
	}
	const unchecked = [
		...(contractState ? [] : ["every contract (the RPC could not be read)"]),
		...[...accountState].filter(([, p]) => p === null).map(([a]) => a),
	];
	const tally = (m: Map<string, Presence>) =>
		`${[...m.values()].filter((p) => p === "present").length} present, ${[...m.values()].filter((p) => p === "absent").length} absent, ${[...m.values()].filter((p) => p === null).length} could not check`;
	console.log(
		`existence: contracts ${contractState ? tally(contractState) : "could not check"}; accounts ${tally(accountState)}\n`,
	);

	// The repo each contract's deployed WASM is attested to, read once for
	// every contract. A contract the RPC does not list is missing from the
	// map: could not check, and the row keeps what it holds.
	const attested = await attestedSourceRepos(
		[...bySlug.values()].flatMap((k) => k.contracts.map((c) => c.address)),
	);
	const allContracts = new Set(
		[...bySlug.values()].flatMap((k) => k.contracts.map((c) => c.address)),
	);
	console.log(
		`source attestation: ${attested.size} of ${allContracts.size} contracts read, ${[...attested.values()].filter(Boolean).length} attested\n`,
	);

	// The repo a contract rolls up to and the verifiedRepo it is served with:
	// one rule (src/lib/onchain-join.ts) for every reader below.
	const evidenceOf = (
		c: { address: string; sourceRepo?: string; curatedRepo?: string },
		stored: unknown,
	) => ({
		// undefined = the code could not be read; null = read, names no repo
		attested: attested.has(c.address)
			? (attested.get(c.address) ?? null)
			: undefined,
		curatedRepo: c.curatedRepo,
		sourceRepo: c.sourceRepo,
		stored,
	});
	// When a project is not read (a failed read, or a join key whose slug no
	// row has), each repo its contracts roll up to would get a rollup short
	// of that project's contracts, so none of them is written or cleared.
	const dirtyRepos = new Set<string>();
	const markDirty = (
		contracts: Array<{
			address: string;
			sourceRepo?: string;
			curatedRepo?: string;
		}>,
		// biome-ignore lint/suspicious/noExplicitAny: stored array rows
		stored: any[] = [],
	) => {
		for (const c of contracts) {
			const repo = rollupRepoOf(
				evidenceOf(
					c,
					stored.find((p) => p?.address === c.address)?.verifiedRepo,
				),
			);
			if (repo) dirtyRepos.add(repo);
		}
	};
	// Live contracts whose source could not be checked this run (the RPC did
	// not list the code, or the attestation read failed): their verifiedRepo
	// is kept as it was, and the run says so with its exit code.
	const unreadLive: string[] = [];
	const noRow: string[] = [];

	let updated = 0;
	let skipped = 0;
	let fetchSkipped = 0; // projects left stale because a source did not answer
	let projectReadBackFailed = 0; // onchain writes that did not persist as sent
	for (const [slug, keys] of bySlug) {
		const proj = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			select: { slug: true, name: true, onchain: true },
		});
		if (!proj.docs.length) {
			console.log(`SKIP ${slug}: no directory project with this slug`);
			skipped += 1;
			noRow.push(slug);
			markDirty(keys.contracts);
			continue;
		}
		// biome-ignore lint/suspicious/noExplicitAny: stored group shape
		const prior: any = (proj.docs[0] as any)?.onchain;
		// biome-ignore lint/suspicious/noExplicitAny: stored array rows
		const priorContracts: any[] = Array.isArray(prior?.contracts)
			? prior.contracts
			: [];

		const contracts: Array<Record<string, unknown>> = [];
		let failed = false;
		for (const c of keys.contracts) {
			const old = priorContracts.find((p) => p?.address === c.address);
			const presence = contractState?.get(c.address) ?? null;
			// An address that holds no contract has no activity to read: the
			// row keeps the last reading it had.
			const reading =
				presence === "absent"
					? {
							lastEventAt: old?.lastEventAt ?? null,
							activeLedgers: old?.activeLedgers ?? null,
							ttlState: old?.ttlState ?? null,
						}
					: await readContract(c.address, fetchJson, now);
			if (!reading) {
				failed = true;
				break;
			}
			// A contract whose code the RPC did not list keeps the repo the row
			// holds. For one archived on chain that is expected (its entries
			// leave the live ledger state); for a live one it is a failed read.
			if (
				presence !== "absent" &&
				!attested.has(c.address) &&
				reading.ttlState !== "archived"
			)
				unreadLive.push(`${slug} ${c.label}`);
			contracts.push({
				address: c.address,
				label: c.label,
				lastEventAt: reading.lastEventAt,
				activeLedgers: reading.activeLedgers,
				ttlState: reading.ttlState,
				// The map's creation is proved in the ledger; otherwise the date
				// the first reading recorded is kept.
				createdAt: c.map?.createdAt ?? old?.createdAt ?? null,
				verifiedRepo: verifiedRepoOf(evidenceOf(c, old?.verifiedRepo)),
				...mapFields(c.map, old, presence, asOf),
			});
		}
		const accounts = (keys.accounts ?? []).map((a) => {
			const old = (Array.isArray(prior?.accounts) ? prior.accounts : []).find(
				// biome-ignore lint/suspicious/noExplicitAny: stored array rows
				(p: any) => p?.address === a.address,
			);
			return {
				address: a.address,
				label: a.label,
				createdAt: a.createdAt,
				...mapFields(a, old, accountState.get(a.address) ?? null, asOf),
			};
		});

		const asset =
			!failed && keys.asset
				? await readAsset(keys.asset.code, keys.asset.issuer, fetchJson, now)
				: null;
		if (keys.asset && !asset) failed = true;

		if (failed) {
			console.log(`SKIP ${slug}: a read failed, existing data left untouched`);
			skipped += 1;
			fetchSkipped += 1;
			markDirty(keys.contracts, priorContracts);
			continue;
		}

		const assetHolders = asset?.holders ?? null;
		// Whole units, floored: a display figure, not money math.
		const assetSupply = asset ? Math.floor(asset.supply) : null;
		const assetTrustlines = asset?.trustlines ?? null;
		const assetLastMovedAt = asset?.lastMovementAt ?? null;
		const sameSource = prior?.source === SOURCE;
		const priorAsOf =
			sameSource && prior?.asOf ? new Date(prior.asOf).getTime() : null;
		const deltaDays = priorAsOf
			? Math.round(((now.getTime() - priorAsOf) / 86_400_000) * 100) / 100
			: null;
		const assetHoldersDelta =
			priorAsOf &&
			typeof prior?.assetHolders === "number" &&
			typeof assetHolders === "number"
				? assetHolders - prior.assetHolders
				: null;

		// codeInUse attribution, by the one rule above.
		for (const c of contracts) {
			const k = rollupRepoOf(
				evidenceOf(
					keys.contracts.find((x) => x.address === c.address) ?? {
						address: String(c.address),
					},
					priorContracts.find((p) => p?.address === c.address)?.verifiedRepo,
				),
			);
			// A contract an issuer and its tokens share sits on each of their
			// rows: count it once.
			if (!k || rolledUp.has(`${k} ${c.address}`)) continue;
			rolledUp.add(`${k} ${c.address}`);
			const cur = byRepo.get(k) ?? {
				contracts: 0,
				activeLedgers: null,
				lastEventAt: null,
			};
			cur.contracts += 1;
			if (typeof c.activeLedgers === "number")
				cur.activeLedgers = (cur.activeLedgers ?? 0) + c.activeLedgers;
			if (
				typeof c.lastEventAt === "string" &&
				(!cur.lastEventAt || c.lastEventAt > cur.lastEventAt)
			)
				cur.lastEventAt = c.lastEventAt;
			byRepo.set(k, cur);
		}

		// The plan, old value beside new, so a dry run shows what would change.
		console.log(`${execute ? "WRITE" : "would write"} ${slug}`);
		if (!keys.asset && prior?.assetCode)
			console.log(
				`    ASSET DROPPED: ${String(prior.assetCode)}-${String(prior.issuer)} no longer joins to this row`,
			);
		if (keys.asset)
			console.log(
				`    ${keys.asset.code}: holders ${prior?.assetHolders ?? "none"} → ${assetHolders} | supply ${prior?.assetSupply ?? "none"} → ${assetSupply} | trustlines ${prior?.assetTrustlines ?? "none"} → ${assetTrustlines} | last moved ${day(assetLastMovedAt)}`,
			);
		for (const c of contracts) {
			const old = priorContracts.find((p) => p?.address === c.address);
			console.log(
				`    ${String(c.label ?? c.address)}: last event ${day(c.lastEventAt)} | ${c.activeLedgers ?? "no"} active ledgers | ${c.ttlState ?? "ttl unread"}${old ? "" : " | NEW"}${c.createdAt ? "" : " | no creation date"}${old?.createdAt && c.createdAt && Date.parse(old.createdAt) !== Date.parse(String(c.createdAt)) ? ` | created ${old.createdAt} → ${c.createdAt}` : ""}${(old?.verifiedRepo ?? null) !== c.verifiedRepo ? ` | source repo ${old?.verifiedRepo ?? "none"} → ${c.verifiedRepo ?? "none"}` : ""}${c.tier ? ` | map ${c.tier} (${(c.evidence as string[]).join(", ")})` : ""}${c.endedAt ? ` | ENDED ${day(c.endedAt)}` : ""}`,
			);
		}
		for (const gone of priorContracts.filter(
			(p) => !contracts.some((c) => c.address === p?.address),
		))
			console.log(
				`    DROPPED ${String(gone?.label)} ${String(gone?.address)}`,
			);
		// biome-ignore lint/suspicious/noExplicitAny: stored array rows
		const priorAccounts: any[] = Array.isArray(prior?.accounts)
			? prior.accounts
			: [];
		for (const a of accounts)
			console.log(
				`    account ${a.address}${a.label ? ` (${a.label})` : ""}: map ${a.tier} (${(a.evidence ?? []).join(", ")}) | opened ${day(a.createdAt)}${priorAccounts.some((p) => p?.address === a.address) ? "" : " | NEW"}${a.endedAt ? ` | ENDED ${day(a.endedAt)}` : ""}${accountState.get(a.address) === null ? " | could not check" : ""}`,
			);
		for (const gone of priorAccounts.filter(
			(p) => !accounts.some((a) => a.address === p?.address),
		))
			console.log(`    DROPPED account ${String(gone?.address)}`);

		if (execute) {
			const onchain = {
				assetCode: keys.asset?.code ?? null,
				issuer: keys.asset?.issuer ?? null,
				assetHolders,
				assetSupply,
				assetHoldersDelta,
				assetTrustlines,
				assetLastMovedAt,
				contracts,
				accounts,
				source: SOURCE,
				asOf,
				prevAsOf: priorAsOf ? new Date(priorAsOf).toISOString() : null,
				deltaDays,
			};
			const projectId = (proj.docs[0] as { id: string | number }).id;
			await payload.update({
				collection: "projects",
				id: projectId,
				data: { onchain },
			});
			// Read back what was sent: a field the schema lacks is dropped
			// silently by payload.update (#615).
			const back = await payload.findByID({
				collection: "projects",
				id: projectId,
				depth: 0,
			});
			const mm = diffWritten(
				slug,
				onchain as unknown as Record<string, unknown>,
				// biome-ignore lint/suspicious/noExplicitAny: stored group shape
				(back as any).onchain,
				[
					"asOf",
					"source",
					"assetHolders",
					"assetSupply",
					"assetTrustlines",
					"assetLastMovedAt",
				],
			);
			// biome-ignore lint/suspicious/noExplicitAny: stored array rows
			const backContracts: any[] = (back as any).onchain?.contracts ?? [];
			for (const c of contracts) {
				const got = backContracts.find((b) => b?.address === c.address);
				mm.push(
					...diffWritten(`${slug} ${String(c.label)}`, c, got, [
						"lastEventAt",
						"activeLedgers",
						"ttlState",
						"verifiedRepo",
						"tier",
						"evidence",
						"endedAt",
					]),
				);
			}
			// biome-ignore lint/suspicious/noExplicitAny: stored array rows
			const backAccounts: any[] = (back as any).onchain?.accounts ?? [];
			for (const a of accounts)
				mm.push(
					...diffWritten(
						`${slug} account ${a.address.slice(0, 8)}`,
						a,
						backAccounts.find((b) => b?.address === a.address),
						["address", "tier", "evidence", "createdAt", "endedAt"],
					),
				);
			if (mm.length) {
				console.error(formatMismatches(mm));
				projectReadBackFailed += 1;
				continue;
			}
			updated += 1;
		}
	}

	// A row that holds an on-chain block and has no join key this run keeps
	// its old block. Named here, never cleared: a join can also drop out
	// because a toml or Horizon read failed, and a failed read is not
	// evidence that the asset stopped being the row's. The one exception is a
	// contract a seed or the map now gives to another row: that is a reading,
	// not a failed read, so it leaves (comet, 2026-11-24: its three registry
	// contracts were Blend's pool and BLNT's two pools).
	const held = await payload.find({
		collection: "projects",
		where: { "onchain.asOf": { exists: true } },
		limit: 2000,
		depth: 0,
		select: { slug: true, onchain: true },
	});
	let orphans = 0;
	// biome-ignore lint/suspicious/noExplicitAny: stored group shape
	for (const d of held.docs as any[]) {
		if (!d.slug || bySlug.has(d.slug)) continue;
		orphans += 1;
		const stored: Array<{ address?: unknown; label?: unknown }> = Array.isArray(
			d.onchain?.contracts,
		)
			? d.onchain.contracts
			: [];
		const { keep, gone } = settledElsewhere(d.slug, stored, seedOwner);
		for (const g of gone)
			console.log(
				`    DROPPED ${String(g.contract?.label)} ${String(g.contract?.address)} from ${d.slug}: ${g.to} holds it now (a seed or the map)`,
			);
		console.log(
			`ORPHAN ${d.slug}: holds ${d.onchain?.assetCode ? `${d.onchain.assetCode} ` : ""}${keep.length} contract(s) read ${day(d.onchain?.asOf)}, no join key this run; ${gone.length ? `${gone.length} given to another row ${execute ? "removed" : "would be removed"}, the rest ` : ""}left as it was`,
		);
		if (!gone.length || !execute) continue;
		await payload.update({
			collection: "projects",
			id: d.id,
			data: { onchain: { ...d.onchain, contracts: keep } },
		});
		const back = await payload.findByID({
			collection: "projects",
			id: d.id,
			depth: 0,
		});
		// biome-ignore lint/suspicious/noExplicitAny: stored group shape
		const got = ((back as any).onchain?.contracts ?? []).map(
			// biome-ignore lint/suspicious/noExplicitAny: stored array rows
			(c: any) => c?.address,
		);
		if (
			got.join() !== keep.map((c: { address?: unknown }) => c?.address).join()
		) {
			console.error(
				`READ-BACK ${d.slug}: contracts ${got.join(", ") || "none"} after removing ${gone.length}`,
			);
			projectReadBackFailed += 1;
		}
	}
	if (orphans)
		console.log(
			`${orphans} row(s) hold an on-chain block with no join key: decide each by hand.`,
		);

	// codeInUse write-back: static depth says "serious code"; this says the
	// deployed contract is live on mainnet and when it last emitted an event.
	// Only-changed, read-back verified; unmatched repos reported, never
	// guessed.
	let repoWrites = 0;
	let repoUnchanged = 0;
	let repoUnknown = 0;
	let repoFailed = 0;
	const writeCodeInUse = async (
		hit: { id: string | number; fullName: string },
		sent: Record<string, unknown>,
	) => {
		if (!execute) return true;
		await payload.update({
			collection: "repos",
			id: hit.id,
			data: { codeInUse: sent },
		});
		const back = await payload.findByID({
			collection: "repos",
			id: hit.id,
			depth: 0,
		});
		const mm = diffWritten(
			hit.fullName,
			sent,
			// biome-ignore lint/suspicious/noExplicitAny: stored group shape
			(back as any).codeInUse,
			["contracts", "activeLedgers", "lastEventAt", "asOf"],
		);
		if (mm.length) console.error(formatMismatches(mm));
		return mm.length === 0;
	};
	for (const [k, agg] of byRepo) {
		if (dirtyRepos.has(k)) {
			console.log(
				`  ? codeInUse ${k}: a project that holds one of its contracts was not read, kept as it was`,
			);
			continue;
		}
		const hit = repoIndex.get(k);
		if (!hit) {
			console.log(`  ? codeInUse: no indexed repo matches ${k}`);
			repoUnknown += 1;
			continue;
		}
		const sent = { ...agg, asOf };
		const cur = hit.codeInUse ?? {};
		if (
			cur.contracts === sent.contracts &&
			(cur.activeLedgers ?? null) === sent.activeLedgers &&
			(cur.lastEventAt ?? null) === sent.lastEventAt
		) {
			repoUnchanged += 1;
			continue;
		}
		console.log(
			`${execute ? "WRITE" : "would write"} codeInUse ${hit.fullName}: contracts ${cur.contracts ?? "none"} → ${sent.contracts} | active ledgers ${sent.activeLedgers ?? "none"} | last event ${day(sent.lastEventAt)}`,
		);
		if (await writeCodeInUse(hit, sent)) repoWrites += 1;
		else repoFailed += 1;
	}
	// A repo that held a rollup and has no attributed contract now keeps a
	// stale "N contracts in use" forever unless it is cleared. Only after a
	// run that read every project and every attestation: a failed read is not
	// evidence that an attribution ended.
	let repoCleared = 0;
	const wholeRun = fetchSkipped === 0 && noRow.length === 0;
	for (const [k, hit] of repoIndex) {
		if (
			byRepo.has(k) ||
			dirtyRepos.has(k) ||
			typeof hit.codeInUse?.contracts !== "number"
		)
			continue;
		if (!wholeRun) {
			console.log(
				`  ? codeInUse ${hit.fullName}: no attributed contract this run, kept (the run did not read everything)`,
			);
			continue;
		}
		console.log(
			`${execute ? "CLEAR" : "would clear"} codeInUse ${hit.fullName}: contracts ${hit.codeInUse.contracts} → none (no contract is attributed to it now)`,
		);
		const cleared = {
			contracts: null,
			activeLedgers: null,
			lastEventAt: null,
			asOf: null,
		};
		if (await writeCodeInUse(hit, cleared)) repoCleared += 1;
		else repoFailed += 1;
	}
	console.log(
		`codeInUse: ${repoWrites} ${execute ? "written" : "would write"} · ${repoCleared} ${execute ? "cleared" : "would clear"} · ${repoUnchanged} unchanged · ${repoUnknown} unmatched-repo · ${repoFailed} read-back failures`,
	);
	if (repoFailed) process.exitCode = 1;

	console.log(
		`\n${execute ? "Updated" : "Would update"}: ${execute ? updated : bySlug.size - skipped} | skipped: ${skipped} (${fetchSkipped} by a failed read)`,
	);
	if (projectReadBackFailed) {
		console.error(
			`RED: ${projectReadBackFailed} project onchain write(s) did not read back as sent.`,
		);
		process.exitCode = 1;
	}
	if (unreadLive.length) {
		console.error(
			`RED: the source of ${unreadLive.length} live contract(s) could not be checked: the RPC did not list the code or GitHub's attestation read failed (${unreadLive.slice(0, 5).join("; ")}${unreadLive.length > 5 ? "; ..." : ""}); their verifiedRepo was kept as it was.`,
		);
		process.exitCode = 1;
	}
	if (noRow.length) {
		// A join key that names no row is a mistake in the key, not in the
		// chain: it holds back every repo its contracts roll up to until it
		// is corrected, so the run says so with its exit code.
		console.error(
			`RED: ${noRow.length} join key(s) name a slug no project row has: ${noRow.join(", ")}. Correct the seed or the repo link.`,
		);
		process.exitCode = 1;
	}
	if (unchecked.length) {
		// Could-not-check ends nothing, and the run says so with its exit code.
		console.error(
			`RED: existence could not be checked for ${unchecked.length} address(es) (${unchecked.slice(0, 5).join("; ")}${unchecked.length > 5 ? "; ..." : ""}); each keeps the endedAt it had.`,
		);
		process.exitCode = 1;
	}
	if (fetchSkipped) {
		// A stale row is a silent failure; the run says so with its exit code.
		console.error(
			`RED: ${fetchSkipped} project(s) kept stale on-chain data because a source did not answer after retries.`,
		);
		process.exitCode = 1;
	}
	if (!execute) console.log("Dry run. --execute to write.");
}

run()
	.then(() => exitAfterFlush(process.exitCode ?? 0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
