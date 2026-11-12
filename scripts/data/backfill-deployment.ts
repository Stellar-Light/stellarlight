/**
 * Backfill projects.deployment from EVIDENCE (sls-079, sls-024).
 *
 * `status: Live` conflates "operating for users" with "deployed on mainnet".
 * This pass writes the second fact separately, and only where something
 * actually evidences it. sls-024's rule: a mainnet or testnet value is written
 * only together with its own basis, sourceUrl and asOf, kept apart from the
 * lifecycle record and from repository activity. Candidates, in precedence
 * order (decideDeployment in src/lib/project-deployment.ts walks them):
 *
 *   1. human-verified          curated entries in DEPLOYMENT_VERIFIED. An entry
 *                              with network "unknown" retracts a claim, with
 *                              its dated reason kept in the map.
 *   2. onchain-activity        the row's own onchain group: each contract is
 *                              looked up on the mainnet ledger (Soroban RPC
 *                              getLedgerEntries, live or archived), the issued
 *                              asset on Horizon, and an asset counts only when
 *                              its issuer's home_domain names the row's own
 *                              website or docs domain. sourceUrl is the
 *                              explorer page of the first one found.
 *   3. mainnet-contract-join   a repo attributed to the project publishes a
 *                              mainnetContractId the mainnet ledger holds;
 *                              sourceUrl is the repo. A gone repo is no source.
 *   4. the status evidence     only when statusBasis is onchain-activity: an
 *                              explorer link (contract, asset, account,
 *                              transaction) is checked on the network it names
 *                              and becomes onchain-activity, under the same
 *                              seed and home_domain rules; a DefiLlama page
 *                              counts only while the row's own DefiLlama
 *                              Stellar reading is fresh and above zero
 *                              (defillama-tvl). A docs or repo link, or an
 *                              explorer link whose id fits no artifact,
 *                              evidences nothing here.
 *   5. rwa-registry            a minted product in the verified RWA registry
 *                              (the same deploymentFromRegistry the API uses),
 *                              written only to replace a stored mainnet or
 *                              testnet claim; an unknown row is left to the
 *                              serve-time fill, which follows the registry.
 *   6. operator-toml           for gap-pool rows (Live, on-chain product types)
 *                              only: the project's OWN stellar.toml declares a
 *                              currency, Horizon holds that code and issuer,
 *                              and the issuer's home_domain names the project's
 *                              domain back. Full chain or abstain. A domain two
 *                              rows share is skipped: its toml cannot say which
 *                              project an asset belongs to (estrela read
 *                              Allbridge Classic's assets off allbridge.io).
 *
 * A contract that a hand-verified seed (src/data/onchain-contracts.ts) gives
 * to ANOTHER project is never this project's evidence: a README that cites
 * Blend's pool as an example is not a deployment.
 *
 * Trinary: every check is found, checked-absent or could-not-check. A check
 * that could not run before any candidate was found leaves the row as stored
 * (a failed read never changes a claim), and a run in which every ledger read
 * failed exits 2 (BLIND), not 0.
 *
 * This pass never retracts on its own: a stored positive claim that no
 * candidate re-derives is reported and kept, because the evidence behind it
 * can vanish for reasons that are not its absence (a scan that erased a
 * verified contract id, a paywalled reader). A retraction is a curated
 * DEPLOYMENT_VERIFIED entry with network "unknown" and a dated reason.
 *
 * Everything else is left with NO deployment group (the API serializes that
 * as network "unknown"): absence of evidence is never proof of disuse.
 *
 * Dry-run by default; --execute writes, each write read back.
 *
 *   pnpm exec tsx scripts/data/backfill-deployment.ts [--execute]
 */
import "../load-env";
import { Contract } from "@stellar/stellar-sdk";
import { ONCHAIN_SEEDS } from "../../src/data/onchain-contracts";
import { rpcProbes } from "../../src/lib/hackproof";
import {
	type DeploymentCandidate,
	decideDeployment,
	deploymentFromRegistry,
	explorerUrl,
	type OnchainKind,
	onchainArtifact,
	type ProbeState,
} from "../../src/lib/project-deployment";
import { NOT_GONE } from "../../src/lib/repo-grade";
import { tvlStaleOf } from "../../src/lib/status-checks";
import { fetchText, parseStellarToml } from "../lib/stellar-toml";
import { DEPLOYMENT_VERIFIED } from "./curation-maps";

const EXECUTE = process.argv.includes("--execute");
const UA = { "User-Agent": "stellarlight-deployment-lane" };
const RPC = {
	mainnet: "https://mainnet.sorobanrpc.com",
	testnet: "https://soroban-testnet.stellar.org",
} as const;
const HORIZON = {
	mainnet: "https://horizon.stellar.org",
	testnet: "https://horizon-testnet.stellar.org",
} as const;
type Net = keyof typeof RPC;

/** The on-chain product types the gap matrix pools (deployment is a
 * meaningful question for these; never for an SDK or a wallet). */
const GAP_TYPES = new Set([
	"DEX",
	"DeFi",
	"Lending",
	"Derivatives",
	"Oracle",
	"Bridge",
	"Stablecoin",
	"RWA",
]);

/** Every ledger or Horizon read this run made, and how many could not run.
 * All of them failing is a blind run, never a clean one. */
let probesAttempted = 0;
let probesFailed = 0;
/** This process's ledger and Horizon read counts (a test reads them). */
export const probeCounts = () => ({
	attempted: probesAttempted,
	failed: probesFailed,
});

/** getLedgerEntries for each contract id on one network, 100 keys a call.
 * An id that is not a contract address is checked-absent: it cannot exist. */
async function contractProbes(
	net: Net,
	ids: string[],
): Promise<Map<string, ProbeState>> {
	const out = new Map<string, ProbeState>();
	const keyOf = new Map<string, string>();
	for (const id of new Set(ids)) {
		try {
			keyOf.set(id, new Contract(id).getFootprint().toXDR("base64"));
		} catch {
			console.log(`  ${id} is not a contract address: checked-absent`);
			out.set(id, "checked-absent");
		}
	}
	const keys = [...new Set(keyOf.values())];
	const byKey = new Map<string, ProbeState>();
	for (let i = 0; i < keys.length; i += 100) {
		const batch = keys.slice(i, i + 100);
		let answer: unknown = null;
		// A 429, a 5xx or a dropped connection is "try again", never absence.
		for (const wait of [0, 5_000, 15_000]) {
			await new Promise((r) => setTimeout(r, wait));
			try {
				const r = await fetch(RPC[net], {
					method: "POST",
					headers: { "content-type": "application/json", ...UA },
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "getLedgerEntries",
						params: { keys: batch },
					}),
					signal: AbortSignal.timeout(30000),
				});
				answer = r.ok ? await r.json() : null;
				if (r.ok || (r.status !== 429 && r.status < 500)) break;
			} catch {
				answer = null;
			}
		}
		for (const [k, p] of rpcProbes(batch, answer)) {
			probesAttempted++;
			if (p.state === "could-not-check") probesFailed++;
			byKey.set(k, p.state);
		}
	}
	for (const [id, key] of keyOf)
		out.set(id, byKey.get(key) ?? "could-not-check");
	return out;
}

/** Horizon's answer for an asset, account or transaction: a 404 or an empty
 * asset list is checked-absent; any other failure is could-not-check, never
 * absence. A transaction counts only when it succeeded. */
async function horizonProbe(
	net: Net,
	kind: Exclude<OnchainKind, "contract">,
	id: string,
): Promise<ProbeState> {
	const url =
		kind === "asset"
			? (() => {
					const i = id.lastIndexOf("-");
					return `${HORIZON[net]}/assets?asset_code=${encodeURIComponent(id.slice(0, i))}&asset_issuer=${encodeURIComponent(id.slice(i + 1))}`;
				})()
			: `${HORIZON[net]}/${kind === "account" ? "accounts" : "transactions"}/${encodeURIComponent(id)}`;
	probesAttempted++;
	try {
		const r = await fetch(url, {
			headers: UA,
			signal: AbortSignal.timeout(15000),
		});
		if (r.status === 404) return "checked-absent";
		if (!r.ok) {
			probesFailed++;
			return "could-not-check";
		}
		const d = (await r.json()) as {
			_embedded?: { records?: unknown[] };
			successful?: boolean;
		};
		if (kind === "asset")
			return (d._embedded?.records ?? []).length ? "found" : "checked-absent";
		if (kind === "tx") return d.successful ? "found" : "checked-absent";
		return "found";
	} catch {
		probesFailed++;
		return "could-not-check";
	}
}

/** An account's home_domain from Horizon: found with the domain (null when
 * the account sets none), checked-absent on a 404, could-not-check on any
 * other failure. */
async function issuerDomain(
	net: Net,
	account: string,
): Promise<{ state: ProbeState; domain: string | null }> {
	probesAttempted++;
	try {
		const r = await fetch(
			`${HORIZON[net]}/accounts/${encodeURIComponent(account)}`,
			{ headers: UA, signal: AbortSignal.timeout(15000) },
		);
		if (r.status === 404) return { state: "checked-absent", domain: null };
		if (!r.ok) {
			probesFailed++;
			return { state: "could-not-check", domain: null };
		}
		const d = (await r.json()) as { home_domain?: string };
		return { state: "found", domain: d.home_domain || null };
	} catch {
		probesFailed++;
		return { state: "could-not-check", domain: null };
	}
}

/** Two-label endings that many unrelated owners share: country second-level
 * domains and hosting platforms. Under one of these, two hosts are the same
 * operator only when they are the same host (a.com.mx is not b.com.mx, and
 * two *.vercel.app sites are two owners). */
const SHARED_SUFFIXES = new Set([
	"com.mx",
	"com.br",
	"com.ar",
	"co.uk",
	"com.au",
	"co.za",
	"co.jp",
	"vercel.app",
	"netlify.app",
	"github.io",
	"pages.dev",
	"web.app",
	"herokuapp.com",
	"gitbook.io",
]);
/** The part of a host that names its owner: the last two labels, or the
 * whole host (www dropped) when those two labels are a shared suffix. */
export function registrable(host: string): string | null {
	const h = host
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.split(/[/?#]/)[0]
		.replace(/^www\./, "")
		.replace(/\.$/, "");
	if (!h.includes(".")) return null;
	const two = h.split(".").slice(-2).join(".");
	if (!SHARED_SUFFIXES.has(two)) return two;
	return h === two ? null : h;
}

/** Full-chain-or-nothing, BOTH directions: the project's OWN stellar.toml
 * must declare a currency, that EXACT code+issuer must exist on Horizon
 * mainnet, AND the issuer account's own home_domain must point back at the
 * project's domain. The reverse link is what stops a copied toml block from
 * stamping someone else's asset as this project's deployment (first dry run:
 * usdc-swap's toml declared Circle's USDC and would have passed the
 * half-chain). An asset_code match alone proves nothing, a reachable site
 * proves less, and a declared-but-unowned issuer proves nothing either.
 * The toml is read through the shared reader (an off-origin redirect or an
 * HTML page is no toml), and a currency SEP-1 marks other than live (dead,
 * test, private) is no evidence, as in enrich-onchain: normalfinance.io marks
 * all its currencies dead. Its Horizon reads count toward a blind run. */
export async function tomlChain(
	website: string,
): Promise<{ code: string; issuer: string; tomlUrl: string } | null> {
	const host = website
		.replace(/^https?:\/\//, "")
		.split(/[/?#]/)[0]
		.replace(/^www\./, "");
	if (!host) return null;
	const tomlUrl = `https://${host}/.well-known/stellar.toml`;
	const text = await fetchText(tomlUrl);
	if (!text) return null;
	const live = parseStellarToml(text).currencies.filter(
		(c) => !c.status || c.status === "live",
	);
	for (const { code, issuer } of live.slice(0, 5)) {
		if (!/^G[A-Z2-7]{55}$/.test(issuer)) continue;
		if (
			(await horizonProbe("mainnet", "asset", `${code}-${issuer}`)) !== "found"
		)
			continue;
		// reverse link: the issuer must claim the project's domain back
		const acct = await issuerDomain("mainnet", issuer);
		const issuerReg = registrable(acct.domain ?? "");
		if (issuerReg && issuerReg === registrable(host))
			return { code, issuer, tomlUrl };
	}
	return null;
}

// biome-ignore lint/suspicious/noExplicitAny: minimal doc shapes
type Doc = Record<string, any>;

interface Target {
	network: "mainnet" | "testnet" | "unknown";
	basis: string | null;
	sourceUrl: string | null;
	asOf: string | null;
	why: string;
}

/** The network reads a plan makes; a test or an offline replay swaps them. */
export interface DeploymentIO {
	contracts: (net: Net, ids: string[]) => Promise<Map<string, ProbeState>>;
	horizon: (
		net: Net,
		kind: Exclude<OnchainKind, "contract">,
		id: string,
	) => Promise<ProbeState>;
	account: typeof issuerDomain;
	toml: typeof tomlChain;
}
export const networkIO: DeploymentIO = {
	contracts: contractProbes,
	horizon: horizonProbe,
	account: issuerDomain,
	toml: tomlChain,
};

export interface PlannedWrite {
	id: string;
	slug: string;
	was: Doc;
	to: Target;
}

/**
 * The pass's whole decision, with no database: every project's candidates in
 * precedence order, each one checked, and the writes that follow. repos are
 * the rows carrying a mainnetContractId (a gone repo already left out).
 */
export async function planDeployments(
	projects: Doc[],
	repos: Doc[],
	io: DeploymentIO = networkIO,
	now: string = new Date().toISOString(),
): Promise<{ plan: PlannedWrite[]; kept: string[]; abstained: string[] }> {
	// A contract a hand-verified seed gives to one project is never another's.
	const seedOwner = new Map<string, string>();
	for (const s of ONCHAIN_SEEDS)
		for (const c of s.contracts ?? []) seedOwner.set(c.address, s.slug);
	const ownedElsewhere = (address: string, slug: string) => {
		const owner = seedOwner.get(address);
		return !!owner && owner !== slug;
	};

	// Evidence source: repos with a mainnet contract id, by projectSlug.
	const joins = new Map<string, { fullName: string; contractId: string }>();
	for (const d of repos)
		if (
			d.projectSlug &&
			d.mainnetContractId &&
			!joins.has(d.projectSlug) &&
			!ownedElsewhere(d.mainnetContractId, d.projectSlug)
		)
			joins.set(d.projectSlug, {
				fullName: d.fullName,
				contractId: d.mainnetContractId,
			});

	// Rows per registrable website domain: a toml on a shared domain cannot
	// say which of them an asset belongs to.
	const domainOf = (website: unknown) => registrable(String(website ?? ""));
	const domainRows = new Map<string, string[]>();
	for (const p of projects) {
		const d = domainOf(p.links?.website);
		if (d) domainRows.set(d, [...(domainRows.get(d) ?? []), p.slug]);
	}

	// Every ledger read this run needs, batched by network up front.
	const contractIds: Record<Net, string[]> = { mainnet: [], testnet: [] };
	for (const p of projects) {
		for (const c of p.onchain?.contracts ?? [])
			if (c?.address && !ownedElsewhere(c.address, p.slug))
				contractIds.mainnet.push(c.address);
		const j = joins.get(p.slug);
		if (j) contractIds.mainnet.push(j.contractId);
		const art = onchainArtifact(p.statusSourceUrl);
		if (
			p.statusBasis === "onchain-activity" &&
			art?.kind === "contract" &&
			!ownedElsewhere(art.id, p.slug)
		)
			contractIds[art.network].push(art.id);
	}
	const contractState = {
		mainnet: await io.contracts("mainnet", contractIds.mainnet),
		testnet: await io.contracts("testnet", contractIds.testnet),
	};
	const horizonCache = new Map<string, ProbeState>();
	const probe = async (
		net: Net,
		kind: OnchainKind,
		id: string,
	): Promise<ProbeState> => {
		if (kind === "contract")
			return contractState[net].get(id) ?? "could-not-check";
		const key = `${net}/${kind}/${id}`;
		let s = horizonCache.get(key);
		if (!s) {
			s = await io.horizon(net, kind, id);
			horizonCache.set(key, s);
		}
		return s;
	};
	const domainCache = new Map<
		string,
		Awaited<ReturnType<DeploymentIO["account"]>>
	>();
	/** An asset is this row's evidence only when Horizon holds it AND its
	 * issuer's home_domain names the row's own website or docs domain: the
	 * onchain group's asset can come from a toml auto-join that never checked
	 * the issuer, and the status lane builds its asset links from that group.
	 * A mismatch is no claim from this candidate, said in the log. */
	const assetProbe = async (
		p: Doc,
		net: Net,
		id: string,
	): Promise<ProbeState> => {
		const held = await probe(net, "asset", id);
		if (held !== "found") return held;
		const issuer = id.slice(id.lastIndexOf("-") + 1);
		const key = `${net}/${issuer}`;
		let acct = domainCache.get(key);
		if (!acct) {
			acct = await io.account(net, issuer);
			domainCache.set(key, acct);
		}
		if (acct.state !== "found") return acct.state;
		const own = [p.links?.website, p.links?.docs]
			.map((u) => (u ? registrable(String(u)) : null))
			.filter(Boolean);
		if (acct.domain && own.includes(registrable(acct.domain))) return "found";
		console.log(
			`  asset ${p.slug}: ${id.slice(0, 20)}... issuer home_domain ${acct.domain ?? "(none)"} names none of the row's domains (${own.join(", ") || "none"}): no claim from it`,
		);
		return "checked-absent";
	};

	const plan: PlannedWrite[] = [];
	const abstained: string[] = [];
	const kept: string[] = [];
	for (const p of projects) {
		const cur = p.deployment ?? {};
		const curated = DEPLOYMENT_VERIFIED[p.slug];
		let to: Target | null = null;
		if (curated?.network === "unknown") {
			to = {
				network: "unknown",
				basis: null,
				sourceUrl: null,
				asOf: null,
				why: `retracted ${curated.checkedAt}: ${curated.note}`,
			};
		} else if (curated) {
			to = {
				network: curated.network,
				basis: "human-verified",
				sourceUrl: curated.sourceUrl,
				asOf: curated.checkedAt ?? now,
				why: "DEPLOYMENT_VERIFIED",
			};
		} else {
			const cands: DeploymentCandidate[] = [];
			for (const c of p.onchain?.contracts ?? [])
				if (c?.address && !ownedElsewhere(c.address, p.slug))
					cands.push({
						network: "mainnet",
						basis: "onchain-activity",
						sourceUrl: explorerUrl("mainnet", "contract", c.address),
						asOf: null,
						probe: await probe("mainnet", "contract", c.address),
					});
			const heldAsset = onchainArtifact(
				explorerUrl(
					"mainnet",
					"asset",
					`${p.onchain?.assetCode}-${p.onchain?.issuer}`,
				),
			);
			if (p.onchain?.assetCode && p.onchain?.issuer && heldAsset)
				cands.push({
					network: "mainnet",
					basis: "onchain-activity",
					sourceUrl: explorerUrl("mainnet", "asset", heldAsset.id),
					asOf: null,
					probe: await assetProbe(p, "mainnet", heldAsset.id),
				});
			const j = joins.get(p.slug);
			if (j)
				cands.push({
					network: "mainnet",
					basis: "mainnet-contract-join",
					sourceUrl: `https://github.com/${j.fullName}`,
					asOf: null,
					probe: await probe("mainnet", "contract", j.contractId),
				});
			if (p.statusBasis === "onchain-activity" && p.statusSourceUrl) {
				const url = String(p.statusSourceUrl);
				const art = onchainArtifact(url);
				if (art && !(art.kind === "contract" && ownedElsewhere(art.id, p.slug)))
					cands.push({
						network: art.network,
						basis: "onchain-activity",
						sourceUrl: url,
						asOf: null,
						probe:
							art.kind === "asset"
								? await assetProbe(p, art.network, art.id)
								: await probe(art.network, art.kind, art.id),
					});
				else if (/^https:\/\/defillama\.com\/protocol\//.test(url))
					// A DefiLlama page evidences a Stellar deployment while DefiLlama
					// holds value there now: tvlUSD > 0, as deriveNetworks reads it.
					cands.push({
						network: "mainnet",
						basis: "defillama-tvl",
						sourceUrl: url,
						asOf: p.tvlAsOf ? new Date(p.tvlAsOf).toISOString() : null,
						probe:
							p.tvlSource === "defillama" &&
							typeof p.tvlUSD === "number" &&
							p.tvlUSD > 0 &&
							tvlStaleOf(p.tvlUSD, p.tvlAsOf, new Date(now)) === false
								? "found"
								: "checked-absent",
					});
			}
			// The registry fills an unknown at serve time, and corrects itself
			// when the registry changes; it is written only to replace a stored
			// positive claim that nothing above evidences (spiko).
			const reg = deploymentFromRegistry(
				{ network: "unknown", basis: null, sourceUrl: null, asOf: null },
				p.slug,
			);
			if (
				(cur.network === "mainnet" || cur.network === "testnet") &&
				reg.network === "mainnet" &&
				reg.sourceUrl
			)
				cands.push({
					network: "mainnet",
					basis: "rwa-registry",
					sourceUrl: reg.sourceUrl,
					asOf: reg.asOf,
					probe: "found",
				});
			let decision = decideDeployment(cands);
			const gapPool =
				decision.kind === "none" &&
				p.status === "Live" &&
				(p.types ?? []).some((t: string) => GAP_TYPES.has(t)) &&
				!!p.links?.website;
			const sharers = domainRows.get(domainOf(p.links?.website) ?? "") ?? [];
			if (gapPool && sharers.length > 1)
				console.log(
					`  toml-chain skip ${p.slug}: ${domainOf(p.links.website)} is also the website of ${sharers.filter((x) => x !== p.slug).join(", ")}`,
				);
			else if (gapPool) {
				// The operator-toml chain, bounded and mechanical.
				const chain = await io.toml(String(p.links.website));
				if (chain) {
					console.log(
						`  toml-chain ${p.slug}: ${chain.code} by ${chain.issuer.slice(0, 10)}... confirmed on Horizon`,
					);
					decision = decideDeployment([
						{
							network: "mainnet",
							basis: "operator-toml",
							sourceUrl: chain.tomlUrl,
							asOf: null,
							probe: "found",
						},
					]);
				}
			}
			if (decision.kind === "abstain") {
				abstained.push(`${p.slug} (could not check ${decision.why})`);
				continue;
			}
			if (decision.kind === "claim")
				to = {
					...decision.claim,
					asOf: decision.claim.asOf ?? now,
					why: "",
				};
		}
		if (!to) {
			if (cur.network === "mainnet" || cur.network === "testnet")
				kept.push(
					`${p.slug} ${cur.network} (${cur.basis ?? "no basis"}) ${cur.sourceUrl ?? "NO SOURCE"}`,
				);
			continue;
		}
		if (
			(cur.network ?? "unknown") === to.network &&
			(to.network === "unknown" ||
				((cur.basis ?? null) === to.basis &&
					(cur.sourceUrl ?? null) === to.sourceUrl))
		)
			continue;
		plan.push({ id: String(p.id), slug: p.slug, was: cur, to });
	}

	plan.sort((a, b) => a.slug.localeCompare(b.slug));
	return { plan, kept, abstained };
}

async function main() {
	// Imported here, not at module scope, so a unit test can import the plan
	// without booting Payload or opening a database connection.
	const { getPayload } = await import("payload");
	const configPromise = (await import("../../src/payload.config")).default;
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`backfill-deployment: ${EXECUTE ? "EXECUTE (writes + read-backs)" : "DRY RUN"}\n`,
	);

	// A repo GitHub answers 404 for (codeScanState gone) is no citable source.
	const repos: Doc[] = [];
	for (let page = 1; ; page++) {
		const r = await payload.find({
			collection: "repos",
			where: { mainnetContractId: { exists: true }, ...NOT_GONE },
			limit: 200,
			page,
			depth: 0,
			select: { projectSlug: true, fullName: true, mainnetContractId: true },
		});
		repos.push(...(r.docs as Doc[]));
		if (!r.hasNextPage) break;
	}
	const projects = (
		await payload.find({
			collection: "projects",
			pagination: false,
			depth: 0,
			select: {
				slug: true,
				status: true,
				statusBasis: true,
				statusSourceUrl: true,
				types: true,
				links: true,
				deployment: true,
				onchain: true,
				tvlUSD: true,
				tvlAsOf: true,
				tvlSource: true,
			},
		})
	).docs as Doc[];
	console.log(`${repos.length} repo(s) carry a mainnet contract id`);
	const { plan, kept, abstained } = await planDeployments(projects, repos);

	for (const w of plan)
		console.log(
			`  ${w.slug.padEnd(30)} ${w.was.network ?? "unknown"} (${w.was.basis ?? "-"}) ${w.was.sourceUrl ?? "no source"}\n  ${"".padEnd(30)} -> ${w.to.network} (${w.to.basis ?? "-"}) ${w.to.sourceUrl ?? ""}${w.to.why ? ` [${w.to.why}]` : ""}`,
		);
	console.log(
		`\n${plan.length} row(s) to stamp of ${projects.length}; the rest stay as stored (unknown stays visible).`,
	);
	console.log(
		`${kept.length} stored mainnet/testnet claim(s) no candidate re-derived this run (kept, never retracted by this pass):`,
	);
	for (const k of kept) console.log(`  kept ${k}`);
	console.log(
		`${abstained.length} row(s) left as stored because a check could not run:`,
	);
	for (const a of abstained) console.log(`  could-not-check ${a}`);
	console.log(
		`ledger and Horizon reads: ${probesAttempted} attempted, ${probesFailed} could not run`,
	);
	const blind = probesAttempted > 0 && probesFailed === probesAttempted;
	if (blind)
		console.error(
			"BLIND: every ledger and Horizon read failed; nothing on-chain was checked",
		);
	if (!EXECUTE) {
		console.log("DRY RUN: nothing written. Re-run with --execute.");
		return blind ? 2 : 0;
	}

	let written = 0;
	const failed: string[] = [];
	for (const w of plan) {
		const data = {
			network: w.to.network,
			basis: w.to.basis,
			sourceUrl: w.to.sourceUrl,
			asOf: w.to.asOf,
		};
		try {
			await payload.update({
				collection: "projects",
				id: w.id,
				data: { deployment: data },
			});
			const back = (await payload.findByID({
				collection: "projects",
				id: w.id,
				depth: 0,
				select: { deployment: true },
			})) as Doc;
			if (
				back?.deployment?.network !== data.network ||
				(back?.deployment?.basis ?? null) !== data.basis ||
				(back?.deployment?.sourceUrl ?? null) !== data.sourceUrl
			)
				throw new Error(
					`read-back mismatch: got ${back?.deployment?.network} (${back?.deployment?.basis}) ${back?.deployment?.sourceUrl}`,
				);
			written++;
		} catch (err) {
			failed.push(w.slug);
			console.error(`  x ${w.slug}: ${(err as Error).message}`);
		}
	}
	console.log(
		`\nDONE: ${written}/${plan.length} stamped + read back verified; ${failed.length} failed.`,
	);
	if (failed.length) return 1;
	return blind ? 2 : 0;
}

if (process.argv[1]?.includes("backfill-deployment"))
	main()
		.then((code) => process.exit(code))
		.catch((err) => {
			console.error("FATAL:", err);
			process.exit(1);
		});
