/**
 * Backfill projects.deployment from EVIDENCE (sls-079).
 *
 * `status: Live` conflates "operating for users" with "deployed on mainnet".
 * This pass writes the second fact separately, and only where something
 * actually evidences it — in priority order:
 *
 *   1. human-verified          — curated entries in DEPLOYMENT_VERIFIED
 *                                (e.g. an operator bundle whose mainnet
 *                                config is empty ⇒ testnet)
 *   2. onchain-activity        — the row's own onchain group holds contracts
 *                                or an issued asset (stellar.expert-enriched)
 *   3. mainnet-contract-join   — a repo attributed to the project carries a
 *                                verified mainnetContractId
 *   4. onchain-activity basis  — statusBasis itself is onchain-activity
 *   5. operator-toml           — QUALITY.md P3's first BOUNDED AGENT LANE:
 *                                for gap-pool rows (Live, on-chain product
 *                                types, deployment unknown) the pass runs
 *                                the same chain a human ran on the
 *                                2026-08-28 queue, mechanically: fetch the
 *                                project's own /.well-known/stellar.toml,
 *                                take its DECLARED currencies, confirm that
 *                                exact code+issuer exists on Horizon
 *                                mainnet. Full chain or abstain — a partial
 *                                chain never stamps, and the basis label
 *                                says a machine did it.
 *
 * Everything else is left with NO deployment group (the API serializes that
 * as network "unknown") — absence of evidence is never proof of disuse, and
 * an unknown must stay visibly unknown rather than defaulting to a guess.
 *
 * Dry-run by default; --execute writes, each write read back.
 *
 *   pnpm exec tsx scripts/data/backfill-deployment.ts [--execute]
 */
import "../load-env";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";
import { DEPLOYMENT_VERIFIED } from "./curation-maps";

const EXECUTE = process.argv.includes("--execute");

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

/** Full-chain-or-nothing: the project's OWN stellar.toml must declare a
 * currency, and that EXACT code+issuer must exist on Horizon mainnet. The
 * 2026-08-28 lesson's rule mechanized — an asset_code match alone proves
 * nothing, and a reachable site proves less. */
async function tomlChain(
	website: string,
): Promise<{ code: string; issuer: string; tomlUrl: string } | null> {
	const host = website
		.replace(/^https?:\/\//, "")
		.split(/[/?#]/)[0]
		.replace(/^www\./, "");
	if (!host) return null;
	const tomlUrl = `https://${host}/.well-known/stellar.toml`;
	let toml: string;
	try {
		const r = await fetch(tomlUrl, {
			headers: { "User-Agent": "stellarlight-deployment-lane" },
			signal: AbortSignal.timeout(15000),
		});
		if (!r.ok) return null;
		toml = await r.text();
	} catch {
		return null;
	}
	const pairs = [
		...toml.matchAll(
			/code\s*=\s*"([A-Za-z0-9]{1,12})"[\s\S]{0,200}?issuer\s*=\s*"(G[A-Z0-9]{55})"/g,
		),
	];
	for (const [, code, issuer] of pairs.slice(0, 5)) {
		try {
			const r = await fetch(
				`https://horizon.stellar.org/assets?asset_code=${encodeURIComponent(code)}&asset_issuer=${issuer}`,
				{
					headers: { "User-Agent": "stellarlight-deployment-lane" },
					signal: AbortSignal.timeout(15000),
				},
			);
			if (!r.ok) continue;
			const d = (await r.json()) as {
				_embedded?: { records?: unknown[] };
			};
			if ((d._embedded?.records ?? []).length > 0)
				return { code, issuer, tomlUrl };
		} catch {}
	}
	return null;
}

// biome-ignore lint/suspicious/noExplicitAny: minimal doc shapes
type Doc = Record<string, any>;

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`backfill-deployment — ${EXECUTE ? "EXECUTE (writes + read-backs)" : "DRY RUN"}\n`,
	);

	// Evidence source: repos with a verified mainnet contract, by projectSlug.
	const joinSlugs = new Map<string, string>();
	{
		let page = 1;
		for (;;) {
			const r = await payload.find({
				collection: "repos",
				where: { mainnetContractId: { exists: true } },
				limit: 200,
				page,
				depth: 0,
				select: { projectSlug: true, fullName: true },
			});
			for (const d of r.docs as Doc[]) {
				if (d.projectSlug && !joinSlugs.has(d.projectSlug))
					joinSlugs.set(d.projectSlug, d.fullName);
			}
			if (!r.hasNextPage) break;
			page++;
		}
	}
	console.log(`${joinSlugs.size} project(s) with a mainnet-contract repo join`);

	const projects = (
		await payload.find({
			collection: "projects",
			pagination: false,
			depth: 0,
			select: {
				slug: true,
				status: true,
				statusBasis: true,
				types: true,
				links: true,
				deployment: true,
				onchain: true,
			},
		})
	).docs as Doc[];

	const plan: Array<{
		id: string;
		slug: string;
		network: string;
		basis: string;
		sourceUrl: string | null;
	}> = [];
	for (const p of projects) {
		const curated = DEPLOYMENT_VERIFIED[p.slug];
		const hasOnchain =
			(Array.isArray(p.onchain?.contracts) && p.onchain.contracts.length > 0) ||
			!!p.onchain?.issuer;
		let network: string | null = null;
		let basis = "";
		let sourceUrl: string | null = null;
		if (curated) {
			network = curated.network;
			basis = "human-verified";
			sourceUrl = curated.sourceUrl;
		} else if (hasOnchain) {
			network = "mainnet";
			basis = "onchain-activity";
			sourceUrl = null;
		} else if (joinSlugs.has(p.slug)) {
			network = "mainnet";
			basis = "mainnet-contract-join";
			sourceUrl = `https://github.com/${joinSlugs.get(p.slug)}`;
		} else if (p.statusBasis === "onchain-activity") {
			network = "mainnet";
			basis = "onchain-activity";
		} else if (
			p.status === "Live" &&
			(p.types ?? []).some((t: string) => GAP_TYPES.has(t)) &&
			p.links?.website
		) {
			// Lane 5: the operator-toml chain, bounded and mechanical.
			const chain = await tomlChain(String(p.links.website));
			if (chain) {
				network = "mainnet";
				basis = "operator-toml";
				sourceUrl = chain.tomlUrl;
				console.log(
					`  toml-chain ${p.slug}: ${chain.code} by ${chain.issuer.slice(0, 10)}… confirmed on Horizon`,
				);
			}
		}
		if (!network) continue;
		const cur = p.deployment ?? {};
		if (cur.network === network && cur.basis === basis) continue;
		plan.push({ id: String(p.id), slug: p.slug, network, basis, sourceUrl });
	}

	plan.sort((a, b) => a.slug.localeCompare(b.slug));
	for (const w of plan)
		console.log(
			`  ${w.slug.padEnd(30)} → ${w.network.padEnd(8)} (${w.basis})${w.sourceUrl ? ` ${w.sourceUrl}` : ""}`,
		);
	console.log(
		`\n${plan.length} row(s) to stamp of ${projects.length}; the rest stay unknown (no evidence, and unknown must stay visible).`,
	);
	if (!EXECUTE) {
		console.log("DRY RUN — nothing written. Re-run with --execute.");
		return;
	}

	let written = 0;
	const failed: string[] = [];
	const asOf = new Date().toISOString();
	for (const w of plan) {
		try {
			await payload.update({
				collection: "projects",
				id: w.id,
				data: {
					deployment: {
						network: w.network,
						basis: w.basis,
						sourceUrl: w.sourceUrl,
						asOf,
					},
				},
			});
			const back = (await payload.findByID({
				collection: "projects",
				id: w.id,
				depth: 0,
				select: { deployment: true },
			})) as Doc;
			if (back?.deployment?.network !== w.network)
				throw new Error(
					`read-back mismatch: got "${back?.deployment?.network}"`,
				);
			written++;
		} catch (err) {
			failed.push(w.slug);
			console.error(`  ✗ ${w.slug}: ${(err as Error).message}`);
		}
	}
	console.log(
		`\nDONE: ${written}/${plan.length} stamped + read back verified; ${failed.length} failed.`,
	);
	if (failed.length) process.exitCode = 1;
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((err) => {
		console.error("FATAL:", err);
		process.exit(1);
	});
