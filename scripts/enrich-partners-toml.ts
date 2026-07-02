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
			const domain = doc.websiteUrl ? domainOf(doc.websiteUrl) : null;
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
		`\n${EXECUTE ? "enriched" : "would enrich"}: ${enriched} · skipped: ${skipped} · scanned: ${res.docs.length}`,
	);
	process.exit(0);
}

main().catch((e) => {
	console.error("FAILED:", e?.message ?? e);
	process.exit(1);
});
