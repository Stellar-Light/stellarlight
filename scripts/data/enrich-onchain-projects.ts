/**
 * Populate projects.onchain from stellar.expert — the on-chain metrics the
 * Q2 review flagged as missing, scoped to what is VERIFIABLE today:
 *
 *   per contract: lifetime events, subinvocations, storage entries, created
 *     date, and the wasm-validation repo when the team ran validation.
 *     (stellar.expert's direct `invocations` counter is null service-wide —
 *     a known aggregation bug on their side — so events/subinvocations are
 *     the honest activity signals. We never serve a number we can't trust.)
 *   per asset: trustline holders and circulating supply in whole units
 *     (raw values are 7-decimal integers; we divide, we don't guess).
 *
 * Join keys come from two verified-only sources:
 *   1. src/data/onchain-contracts.ts — hand-verified seeds (each with its
 *      primary-source URL).
 *   2. repos.codeVerified.mainnetContractId — README-claimed addresses the
 *      code scanner already echo-verified against stellar.expert, merged in
 *      for repos linked to a directory project.
 *
 * Fetch failures SKIP the project (previous data stays; nothing zeroed).
 *
 * Usage:
 *   pnpm exec tsx scripts/data/enrich-onchain-projects.ts             # dry run
 *   pnpm exec tsx scripts/data/enrich-onchain-projects.ts --execute   # write
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { getPayload } from "payload";
import { ONCHAIN_SEEDS } from "../../src/data/onchain-contracts";
import configPromise from "../../src/payload.config";

const execute = process.argv.includes("--execute");
const EXPERT = "https://api.stellar.expert/explorer/public";
const PAUSE_MS = 400; // be polite — unauthenticated, unpublished rate limits

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson<T>(url: string): Promise<T | null> {
	try {
		const r = await fetch(url, {
			headers: { "user-agent": "stellarlight-onchain-enrich" },
		});
		if (!r.ok) {
			console.log(`    ✗ ${url} → HTTP ${r.status}`);
			return null;
		}
		return (await r.json()) as T;
	} catch (e) {
		console.log(`    ✗ ${url} → ${(e as Error).message}`);
		return null;
	}
}

interface ExpertContract {
	contract: string;
	created?: number;
	subinvocation?: number | null;
	events?: number | null;
	storage_entries?: number | null;
	validation?: { status?: string; repository?: string };
}

interface ExpertAsset {
	supply?: string | number;
	/** Object {total, authorized, funded} on the current API (verified live
	 * 2026-07-20 on AQUA); older/partner-era responses used an array. */
	trustlines?: { total?: number; funded?: number } | number[] | number;
	decimals?: number;
	/** Lifetime count of payment operations — an unambiguous integer, so it is
	 * the honest "transaction volume" for an asset. */
	payments?: number | null;
	/** Lifetime payment volume in RAW 7-decimal asset units. The /1e7 convention
	 * is verified against `supply` on AQUA (both divide to the same magnitude as
	 * the published circulating figure), so this is safe to convert. */
	payments_amount?: string | number | null;
	/** Lifetime count of trades — unambiguous integer. */
	trades?: number | null;
	/** NOT captured: `volume7d` and `traded_amount`. volume7d's denomination is
	 * ambiguous on inspection (2.26e12 raw divides to either ~226k AQUA or
	 * ~$226k USD, and the API does not state which). Shipping a number whose
	 * unit we can't prove is the "ambiguous metric" bug class we already guard
	 * against — left out until the denomination is confirmed upstream. */
}

/** 7-decimal raw integer → whole units (floored; display metric, not money math). */
function toWholeUnits(raw: string | number | undefined): number | null {
	if (raw == null) return null;
	const n = typeof raw === "string" ? Number(raw) : raw;
	if (!Number.isFinite(n)) return null;
	return Math.floor(n / 1e7);
}

async function run() {
	const asOf = new Date().toISOString();
	console.log(execute ? "EXECUTE MODE" : "DRY RUN MODE");
	console.log(`source: ${EXPERT}\n`);

	const payload = await getPayload({ config: configPromise });

	// Merge join keys: seeds first, then repo-derived contract IDs.
	const bySlug = new Map<
		string,
		{
			contracts: Array<{ address: string; label: string }>;
			asset?: { code: string; issuer: string };
		}
	>();
	for (const seed of ONCHAIN_SEEDS) {
		bySlug.set(seed.slug, {
			contracts: [...(seed.contracts ?? [])],
			asset: seed.asset,
		});
	}

	const repos = await payload.find({
		collection: "repos",
		limit: 3000,
		depth: 0,
		select: { fullName: true, projectSlug: true, codeVerified: true },
	});
	let repoDerived = 0;
	for (const r of repos.docs as unknown as Array<{
		fullName: string;
		projectSlug?: string | null;
		codeVerified?: { mainnetContractId?: string | null } | null;
	}>) {
		const id = r.codeVerified?.mainnetContractId;
		if (!id || !r.projectSlug) continue;
		const entry = bySlug.get(r.projectSlug) ?? { contracts: [] };
		if (!entry.contracts.some((c) => c.address === id)) {
			entry.contracts.push({ address: id, label: `from ${r.fullName} README` });
			repoDerived += 1;
		}
		bySlug.set(r.projectSlug, entry);
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

	console.log(
		`Join keys: ${ONCHAIN_SEEDS.length} seeded + ${repoDerived} repo-derived + ${partnerDerived} partner-asset → ${bySlug.size} projects\n`,
	);

	let updated = 0;
	let skipped = 0;
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
			continue;
		}

		const contracts: Array<Record<string, unknown>> = [];
		let failed = false;
		for (const c of keys.contracts) {
			const d = await fetchJson<ExpertContract>(
				`${EXPERT}/contract/${c.address}`,
			);
			await sleep(PAUSE_MS);
			if (!d) {
				failed = true;
				break;
			}
			contracts.push({
				address: c.address,
				label: c.label,
				events: typeof d.events === "number" ? d.events : null,
				subinvocations:
					typeof d.subinvocation === "number" ? d.subinvocation : null,
				storageEntries:
					typeof d.storage_entries === "number" ? d.storage_entries : null,
				createdAt: d.created ? new Date(d.created * 1000).toISOString() : null,
				verifiedRepo:
					d.validation?.status === "verified"
						? (d.validation.repository ?? null)
						: null,
			});
		}

		let assetHolders: number | null = null;
		let assetSupply: number | null = null;
		// Q2 deliverable gap (PG review 2026-07-17): "transaction volumes and
		// active address counts on project profiles aren't evident." Both were
		// already in the stellar.expert responses we fetch — we were discarding
		// them. assetTrustlines = every account that ever opened a trustline;
		// assetHolders (funded) = accounts actually holding a balance today.
		// Keeping both is the honest pair: "reach" vs "active".
		let assetPayments: number | null = null;
		let assetPaymentsAmount: number | null = null;
		let assetTrades: number | null = null;
		let assetTrustlines: number | null = null;
		if (!failed && keys.asset) {
			const a = await fetchJson<ExpertAsset>(
				`${EXPERT}/asset/${keys.asset.code}-${keys.asset.issuer}`,
			);
			await sleep(PAUSE_MS);
			if (!a) failed = true;
			else {
				// Shape verified live 2026-07-20: object {total, authorized, funded}.
				// funded = accounts actually holding the asset — the honest
				// "holders" number. Array/number fallbacks for older shapes; a
				// non-numeric result stays null, never a stringified object (the
				// dry run caught exactly that).
				const tl = a.trustlines;
				const rawHolders =
					tl && typeof tl === "object" && !Array.isArray(tl)
						? (tl.funded ?? tl.total)
						: Array.isArray(tl)
							? tl[0]
							: tl;
				assetHolders = typeof rawHolders === "number" ? rawHolders : null;
				assetSupply = toWholeUnits(a.supply);
				assetTrustlines =
					tl && typeof tl === "object" && !Array.isArray(tl)
						? typeof tl.total === "number"
							? tl.total
							: null
						: null;
				assetPayments = typeof a.payments === "number" ? a.payments : null;
				assetTrades = typeof a.trades === "number" ? a.trades : null;
				assetPaymentsAmount = toWholeUnits(a.payments_amount ?? undefined);
			}
		}

		if (failed) {
			console.log(`SKIP ${slug}: fetch failure — existing data left untouched`);
			skipped += 1;
			continue;
		}

		// Deltas vs the previous snapshot (v2): activity-over-time is the signal
		// lifetime counts can't give. null until a real prior snapshot exists.
		// biome-ignore lint/suspicious/noExplicitAny: stored group shape
		const prior: any = (proj.docs[0] as any)?.onchain;
		const priorAsOf = prior?.asOf ? new Date(prior.asOf).getTime() : null;
		const deltaDays = priorAsOf
			? Math.round(((Date.now() - priorAsOf) / 86_400_000) * 100) / 100
			: null;
		if (priorAsOf && Array.isArray(prior?.contracts)) {
			for (const c of contracts) {
				// biome-ignore lint/suspicious/noExplicitAny: stored array row
				const old = prior.contracts.find((p: any) => p.address === c.address);
				if (
					old &&
					typeof old.events === "number" &&
					typeof c.events === "number"
				)
					c.eventsDelta = (c.events as number) - old.events;
				if (
					old &&
					typeof old.subinvocations === "number" &&
					typeof c.subinvocations === "number"
				)
					c.subinvocationsDelta =
						(c.subinvocations as number) - old.subinvocations;
			}
		}
		const assetHoldersDelta =
			priorAsOf &&
			typeof prior?.assetHolders === "number" &&
			typeof assetHolders === "number"
				? assetHolders - prior.assetHolders
				: null;
		// Payments-over-the-window is the actual "transaction volume" signal; the
		// lifetime count alone can't answer "is this still being used?"
		const assetPaymentsDelta =
			priorAsOf &&
			typeof prior?.assetPayments === "number" &&
			typeof assetPayments === "number"
				? assetPayments - prior.assetPayments
				: null;

		const summary = [
			contracts.length ? `${contracts.length} contracts` : null,
			keys.asset
				? `${keys.asset.code} holders=${assetHolders} trustlines=${assetTrustlines} payments=${assetPayments} trades=${assetTrades}`
				: null,
		]
			.filter(Boolean)
			.join(", ");
		console.log(`${execute ? "WRITE" : "would write"} ${slug}: ${summary}`);
		for (const c of contracts) {
			console.log(
				`    ${String(c.label)}: events=${c.events} subinv=${c.subinvocations}${c.verifiedRepo ? " repo-verified" : ""}`,
			);
		}

		if (execute) {
			await payload.update({
				collection: "projects",
				id: (proj.docs[0] as { id: string | number }).id,
				data: {
					onchain: {
						assetCode: keys.asset?.code ?? null,
						issuer: keys.asset?.issuer ?? null,
						assetHolders,
						assetSupply,
						assetHoldersDelta,
						assetTrustlines,
						assetPayments,
						assetPaymentsAmount,
						assetPaymentsDelta,
						assetTrades,
						contracts,
						source: "stellar.expert",
						asOf,
						prevAsOf: priorAsOf ? new Date(priorAsOf).toISOString() : null,
						deltaDays,
					},
				},
			});
			updated += 1;
		}
	}

	console.log(
		`\n${execute ? "Updated" : "Would update"}: ${execute ? updated : bySlug.size - skipped} | skipped: ${skipped}`,
	);
	if (!execute) console.log("Dry run. --execute to write.");
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
