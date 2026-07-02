/**
 * Enrich anchor partners from their stellar.toml (SEP-1) — the same
 * authoritative source anchors.stellar.org is built on — plus a small curated
 * backfill for the audit firms. Closes the "0/24 partners have service tags /
 * contact / assets" gap that made concierge matching run on description luck.
 *
 *   pnpm exec tsx scripts/enrich-partners-toml.ts            # DRY RUN (report only)
 *   pnpm exec tsx scripts/enrich-partners-toml.ts --execute  # write
 *
 * Per anchor (partnerType anchor|on-off-ramp), from
 * https://<websiteUrl domain>/.well-known/stellar.toml:
 *   CURRENCIES[].code            → assets[]           (+ lowercase service tags)
 *   TRANSFER_SERVER              → seps: sep-6
 *   TRANSFER_SERVER_SEP0024      → seps: sep-24
 *   DIRECT_PAYMENT_SERVER        → seps: sep-31
 *   transfer server /info        → rampTypes on-ramp/off-ramp (REAL deposit/
 *                                  withdraw flags — not guessed from SEP presence)
 *   DOCUMENTATION.ORG_LOGO       → logoUrl        (only if empty)
 *   DOCUMENTATION.ORG_OFFICIAL_EMAIL → contactEmail (only if empty — never
 *                                  overwrites partner-claimed data)
 *   DOCUMENTATION.ORG_DESCRIPTION → tagline       (only if empty, ≤140)
 *
 * Rules of engagement (house rules):
 *   - DRY RUN by default; per-anchor report of exactly what would change.
 *   - System-owned fields (assets/seps/rampTypes) are overwritten from source;
 *     partner-owned fields (tagline/contact/logo) are filled ONLY when empty.
 *   - No deletes. A missing/unreachable toml = "skipped", never a wipe.
 */

import { config as loadEnv } from "dotenv";
import { getPayload } from "payload";
import config from "@payload-config";

loadEnv({ path: ".env.local" });

const EXECUTE = process.argv.includes("--execute");
const FETCH_TIMEOUT_MS = 10_000;

/* ── minimal stellar.toml parsing (no TOML dep) ─────────────────────────── */

interface StellarToml {
	topLevel: Record<string, string>;
	documentation: Record<string, string>;
	currencyCodes: string[];
}

/** Parse just the shapes we need: top-level `KEY = "v"`, the [DOCUMENTATION]
 *  table, and `code = "X"` inside [[CURRENCIES]] blocks. */
function parseStellarToml(text: string): StellarToml {
	const topLevel: Record<string, string> = {};
	const documentation: Record<string, string> = {};
	const currencyCodes: string[] = [];
	let section: "top" | "doc" | "currency" | "other" = "top";

	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith("#")) continue;
		if (line.startsWith("[")) {
			if (/^\[\[\s*CURRENCIES\s*\]\]/i.test(line)) section = "currency";
			else if (/^\[\s*DOCUMENTATION\s*\]/i.test(line)) section = "doc";
			else section = "other";
			continue;
		}
		const m = line.match(/^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/);
		if (!m) continue;
		const [, key, value] = m;
		if (section === "top") topLevel[key.toUpperCase()] = value;
		else if (section === "doc") documentation[key.toUpperCase()] = value;
		else if (section === "currency" && key.toLowerCase() === "code") {
			const code = value.trim().toUpperCase();
			if (code && !currencyCodes.includes(code)) currencyCodes.push(code);
		}
	}
	return { topLevel, documentation, currencyCodes };
}

async function fetchText(url: string): Promise<string | null> {
	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { "User-Agent": "stellarlight-enrich/1.0" },
			redirect: "follow",
		});
		if (!res.ok) return null;
		return await res.text();
	} catch {
		return null;
	}
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
	try {
		const res = await fetch(url, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			headers: { "User-Agent": "stellarlight-enrich/1.0", Accept: "application/json" },
		});
		if (!res.ok) return null;
		return (await res.json()) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function domainOf(websiteUrl: string): string | null {
	try {
		return new URL(websiteUrl).hostname.replace(/^www\./, "");
	} catch {
		return null;
	}
}

/**
 * Anchors whose stellar.toml lives on a different host than their marketing
 * site. Sourced from the official anchors.stellar.org dataset (its RSC payload
 * embeds each anchor's real toml URL) — verified live 2026-07-02.
 */
const TOML_DOMAIN_OVERRIDES: Record<string, string> = {
	"anchor-moneygram": "stellar.moneygram.com", // moneygram.com serves a stub toml
	"anchor-clickspesa": "connect.clickpesa.com",
};

/** A parse result only counts when it actually carries data — some sites
 *  return HTML/soft-404s for /.well-known/stellar.toml, which would otherwise
 *  read as an empty-but-present toml. */
function hasUsableData(toml: StellarToml): boolean {
	return (
		Boolean(
			toml.topLevel.TRANSFER_SERVER ||
				toml.topLevel.TRANSFER_SERVER_SEP0024 ||
				toml.topLevel.DIRECT_PAYMENT_SERVER,
		) ||
		toml.currencyCodes.length > 0 ||
		Object.keys(toml.documentation).length > 0
	);
}

/**
 * Anchors/issuers listed on the OFFICIAL anchors.stellar.org directory that
 * are missing from ours — seeded create-only (same curated provenance rules
 * as scripts/seed-partners.ts: published, verified:false, plain facts only,
 * subjective fields left for the partner to claim + fill). The toml pass
 * right after seeding fills assets/SEPs/ramps/contact from source.
 */
const OFFICIAL_ANCHOR_SEEDS: Array<{
	name: string;
	tomlDomain: string;
	websiteUrl: string;
	sectors: string[];
	description: string;
}> = [
	{
		name: "Franklin Templeton",
		tomlDomain: "franklintempleton.com",
		websiteUrl: "https://www.franklintempleton.com/",
		sectors: ["rwa"],
		description:
			"Global investment manager issuing the tokenized Franklin OnChain U.S. Government Money Fund (BENJI) on Stellar.",
	},
	{
		name: "AUDD",
		tomlDomain: "audd.digital",
		websiteUrl: "https://www.audd.digital",
		sectors: ["stablecoins", "payments"],
		description:
			"Australian-dollar fiat-backed stablecoin (AUDD) issued by AUDC Pty Ltd, with NZDSC for New Zealand.",
	},
	{
		name: "nTokens",
		tomlDomain: "ntokens.com",
		websiteUrl: "https://ntokens.com",
		sectors: ["stablecoins", "payments"],
		description:
			"Brazilian Real (BRL) currency anchor — regulated BRL on/off ramp and stablecoin issuer on Stellar.",
	},
	{
		name: "GMO-Z.com Trust",
		tomlDomain: "stablecoin.z.com",
		websiteUrl: "https://stablecoin.z.com",
		sectors: ["stablecoins"],
		description:
			"GMO Internet Group's NY-regulated trust company issuing GYEN (JPY) and ZUSD stablecoins on Stellar.",
	},
	{
		name: "Zeam Money",
		tomlDomain: "mint.zeam.money",
		websiteUrl: "https://zeam.money",
		sectors: ["stablecoins", "payments"],
		description:
			"Multi-asset issuer (ZARZ, USDZ, XAUZ and more) with SEP-24/31 rails, issued by Zeam Limited (UK).",
	},
	{
		name: "FinClusive",
		tomlDomain: "finclusive.com",
		websiteUrl: "https://finclusive.com",
		sectors: ["payments", "identity"],
		description:
			"Compliance-first banking-as-a-service with SEP-6/24/31 rails on Stellar — AML/KYC-gated fiat access.",
	},
	{
		name: "CLPX",
		tomlDomain: "clpx.finance",
		websiteUrl: "https://clpx.finance",
		sectors: ["stablecoins"],
		description:
			"Chilean Peso stablecoin (CLPX) with SEP-6/24/31 anchor services.",
	},
	{
		name: "APS Money",
		tomlDomain: "aps.money",
		websiteUrl: "https://www.aps.money",
		sectors: ["stablecoins", "payments"],
		description:
			"Advanced Payment Solutions — multi-currency stablecoin issuer (BRL, CLP, EUR, IDR, INR, KZT variants) on Stellar.",
	},
	{
		name: "Transparent Network",
		tomlDomain: "dcm.systems",
		websiteUrl: "https://prozora.network",
		sectors: ["stablecoins", "payments"],
		description:
			"Ukrainian Hryvnia (UAH) digital-currency anchor powering instant public-blockchain payments.",
	},
];

/** Real on/off-ramp capability from the transfer server's /info (deposit =
 *  on-ramp, withdraw = off-ramp). SEP-6 and SEP-24 share the /info shape. */
async function rampsFromInfo(transferServer: string): Promise<string[]> {
	const info = await fetchJson(
		`${transferServer.replace(/\/+$/, "")}/info`,
	);
	if (!info) return [];
	const anyEnabled = (side: unknown): boolean =>
		!!side &&
		typeof side === "object" &&
		Object.values(side as Record<string, { enabled?: boolean }>).some(
			(a) => a && a.enabled !== false,
		);
	const ramps: string[] = [];
	if (anyEnabled(info.deposit)) ramps.push("on-ramp");
	if (anyEnabled(info.withdraw)) ramps.push("off-ramp");
	return ramps;
}

/* ── curated audit-firm backfill (public facts only) ────────────────────── */

const AUDIT_BACKFILL: Record<
	string,
	{ services: string[]; regions?: string[]; tagline?: string }
> = {
	veridise: {
		services: ["soroban-audit", "formal-verification", "rust-audit", "zk-audit"],
		regions: ["global"],
		tagline: "Formal verification + audits — audited Soroban core (V-SOR reports).",
	},
	ottersec: {
		services: ["soroban-audit", "rust-audit", "protocol-audit"],
		regions: ["global"],
		tagline: "Security audits across Rust chains — deep Soroban/Stellar track record.",
	},
	"runtime-verification": {
		services: ["formal-verification", "soroban-audit", "protocol-audit"],
		regions: ["global"],
		tagline: "Formal methods firm — verification tooling and audits for Soroban.",
	},
	certora: {
		services: ["formal-verification", "soroban-audit", "prover-tooling"],
		regions: ["global"],
		tagline: "Prover-based formal verification, extended to Soroban contracts.",
	},
	halborn: {
		services: ["soroban-audit", "pentest", "protocol-audit", "advisory"],
		regions: ["global"],
		tagline: "Full-stack blockchain security — audits, pentests, advisory.",
	},
};

/* ── main ───────────────────────────────────────────────────────────────── */

async function main() {
	console.log(
		`enrich-partners-toml — ${EXECUTE ? "EXECUTE (writing)" : "DRY RUN (no writes)"}\n`,
	);
	const payload = await getPayload({ config });

	// ── Pass 0: seed official-directory anchors we don't list yet ─────────
	// Create-only + idempotent (skips existing slugs), same provenance rules
	// as scripts/seed-partners.ts. Seeded docs are picked up by the enrichment
	// pass below in the same run. NOTE: created directly as published — the
	// invite hook only fires on draft→published UPDATES, so seeding never
	// emails anyone.
	let seeded = 0;
	{
		const { generateSlug } = await import("../src/lib/utils/normalize");
		const { randomBytes } = await import("node:crypto");
		for (const seed of OFFICIAL_ANCHOR_SEEDS) {
			const slug = generateSlug(seed.name);
			const existing = await payload.find({
				collection: "partner-accounts",
				where: {
					or: [{ slug: { equals: slug } }, { name: { equals: seed.name } }],
				},
				limit: 1,
				depth: 0,
				overrideAccess: true,
			});
			if (existing.docs.length > 0) {
				console.log(`· seed ${slug}: already listed`);
				continue;
			}
			if (EXECUTE) {
				try {
					await payload.create({
						collection: "partner-accounts",
						data: {
							name: seed.name,
							email: `curated+${slug}@stellarlight.xyz`,
							password: randomBytes(18).toString("base64url"),
							partnerType: "anchor",
							status: "published",
							// biome-ignore lint/suspicious/noExplicitAny: enum handled by Payload validation
							sectors: seed.sectors as any,
							description: seed.description,
							websiteUrl: seed.websiteUrl,
							lastPartnerUpdateAt: new Date().toISOString(),
						},
						overrideAccess: true,
						disableVerificationEmail: true,
					});
					console.log(`+ seeded ${slug} (${seed.tomlDomain})`);
					seeded++;
				} catch (err) {
					console.log(
						`✗ seed ${slug} failed — ${err instanceof Error ? err.message : err}`,
					);
				}
			} else {
				console.log(`→ would seed ${slug} (official directory: ${seed.tomlDomain})`);
				seeded++;
			}
		}
	}

	// Seed toml domains double as overrides for the enrichment pass.
	const seedOverrides: Record<string, string> = {};
	{
		const { generateSlug } = await import("../src/lib/utils/normalize");
		for (const seed of OFFICIAL_ANCHOR_SEEDS)
			seedOverrides[generateSlug(seed.name)] = seed.tomlDomain;
	}

	const res = await payload.find({
		collection: "partner-accounts",
		limit: 300,
		depth: 0,
		overrideAccess: true,
	});

	let enriched = 0;
	let skipped = 0;

	for (const p of res.docs) {
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const doc = p as any;
		const isAnchor =
			doc.partnerType === "anchor" || doc.partnerType === "on-off-ramp";
		const backfill = AUDIT_BACKFILL[doc.slug];

		if (!isAnchor && !backfill) continue;

		// biome-ignore lint/suspicious/noExplicitAny: heterogeneous update payload
		const update: Record<string, any> = {};
		const report: string[] = [];

		if (isAnchor) {
			// Overrides (from the official directory) beat the website domain.
			const domain =
				TOML_DOMAIN_OVERRIDES[doc.slug] ??
				seedOverrides[doc.slug] ??
				(doc.websiteUrl ? domainOf(doc.websiteUrl) : null);
			if (!domain) {
				console.log(`✗ ${doc.slug}: no usable websiteUrl — skipped`);
				skipped++;
				continue;
			}
			const tomlText = await fetchText(
				`https://${domain}/.well-known/stellar.toml`,
			);
			if (!tomlText) {
				console.log(`✗ ${doc.slug}: no stellar.toml at ${domain} — skipped`);
				skipped++;
				continue;
			}
			const toml = parseStellarToml(tomlText);
			if (!hasUsableData(toml)) {
				// Soft-404 / stub — treat like a missing toml, never as "nothing new".
				console.log(`✗ ${doc.slug}: stub/HTML at ${domain} — skipped`);
				skipped++;
				continue;
			}

			// SEPs from declared endpoints
			const seps: string[] = [];
			if (toml.topLevel.TRANSFER_SERVER) seps.push("sep-6");
			if (toml.topLevel.TRANSFER_SERVER_SEP0024) seps.push("sep-24");
			if (toml.topLevel.DIRECT_PAYMENT_SERVER) seps.push("sep-31");
			if (seps.length) {
				update.seps = seps;
				report.push(`seps=${seps.join(",")}`);
			}

			// Assets from CURRENCIES
			if (toml.currencyCodes.length) {
				update.assets = toml.currencyCodes
					.slice(0, 25)
					.map((code) => ({ code }));
				report.push(`assets=${toml.currencyCodes.slice(0, 8).join(",")}${toml.currencyCodes.length > 8 ? "…" : ""}`);
			}

			// Real ramp capability from /info (prefer SEP-24 server, else SEP-6)
			const transferServer =
				toml.topLevel.TRANSFER_SERVER_SEP0024 || toml.topLevel.TRANSFER_SERVER;
			if (transferServer) {
				const ramps = await rampsFromInfo(transferServer);
				if (ramps.length) {
					update.rampTypes = ramps;
					report.push(`ramps=${ramps.join(",")}`);
				}
			}

			// Fill-if-empty partner-owned fields from DOCUMENTATION
			const d = toml.documentation;
			if (!doc.logoUrl && d.ORG_LOGO) {
				update.logoUrl = d.ORG_LOGO;
				report.push("logo✓");
			}
			if (!doc.contactEmail && d.ORG_OFFICIAL_EMAIL) {
				update.contactEmail = d.ORG_OFFICIAL_EMAIL;
				report.push(`contact=${d.ORG_OFFICIAL_EMAIL}`);
			}
			if (!doc.tagline && d.ORG_DESCRIPTION) {
				update.tagline = d.ORG_DESCRIPTION.slice(0, 140);
				report.push("tagline✓");
			}

			// Derived service tags (merged, deduped, additive)
			const derivedTags = [
				...seps,
				...(update.rampTypes ?? []),
				...toml.currencyCodes.slice(0, 10).map((c: string) => c.toLowerCase()),
			];
			if (derivedTags.length) {
				const existing: string[] = (doc.services ?? [])
					.map((s: { tag: string }) => s.tag)
					.filter(Boolean);
				const merged = [...new Set([...existing, ...derivedTags])];
				if (merged.length !== existing.length) {
					update.services = merged.map((tag) => ({ tag }));
					report.push(`+${merged.length - existing.length} service tags`);
				}
			}
		}

		if (backfill) {
			const existing: string[] = (doc.services ?? [])
				.map((s: { tag: string }) => s.tag)
				.filter(Boolean);
			const merged = [...new Set([...existing, ...backfill.services])];
			if (merged.length !== existing.length) {
				update.services = merged.map((tag) => ({ tag }));
				report.push(`+${merged.length - existing.length} curated service tags`);
			}
			if (!doc.regions?.length && backfill.regions) {
				update.regions = backfill.regions;
				report.push(`regions=${backfill.regions.join(",")}`);
			}
			if (!doc.tagline && backfill.tagline) {
				update.tagline = backfill.tagline;
				report.push("tagline✓");
			}
		}

		if (Object.keys(update).length === 0) {
			console.log(`· ${doc.slug}: nothing new`);
			continue;
		}

		if (EXECUTE) {
			try {
				await payload.update({
					collection: "partner-accounts",
					id: doc.id,
					data: update,
					overrideAccess: true,
					depth: 0,
				});
				console.log(`✓ ${doc.slug}: ${report.join(" · ")}`);
				enriched++;
			} catch (err) {
				console.log(
					`✗ ${doc.slug}: update failed — ${err instanceof Error ? err.message : err}`,
				);
				skipped++;
			}
		} else {
			console.log(`→ ${doc.slug} would set: ${report.join(" · ")}`);
			enriched++;
		}
	}

	console.log(
		`\n${EXECUTE ? "seeded" : "would seed"}: ${seeded} · ${EXECUTE ? "enriched" : "would enrich"}: ${enriched} · skipped: ${skipped} · scanned: ${res.docs.length}`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error("FAILED:", e?.message ?? e);
	process.exit(1);
});
