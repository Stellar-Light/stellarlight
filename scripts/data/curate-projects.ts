/** READ-ONLY by default. Targeted, owner-reviewed edits to project records —
 * the projects counterpart to curate-partners.ts. Only touches the exact slugs
 * listed below; never bulk-edits.
 *
 *   pnpm exec tsx scripts/data/curate-projects.ts            # dry run
 *   pnpm exec tsx scripts/data/curate-projects.ts --execute  # writes
 *
 * DESCRIPTION_FIXES — overwrite shortDescription for a specific slug. Used to
 * close directory-omission findings where a record's prose is stale/incomplete
 * (e.g. sls-017: LOBSTR's record omitted its XRP Ledger support, so a consumer
 * synthesizing from directory data alone concluded "Stellar-only" by omission).
 * Every value is grounded in the provider's own current site copy — no
 * fabrication.
 */
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const EXECUTE = process.argv.includes("--execute");

const DESCRIPTION_FIXES: Record<string, string> = {
	// sls-017: lobstr.co self-describes as a "Stellar & XRPL Wallet" (by Ultra
	// Stellar); the record previously said "Stellar wallet" only.
	lobstr:
		"LOBSTR is a widely used non-custodial wallet for the Stellar and XRP Ledger (XRPL) networks, by Ultra Stellar, on iOS, Android, web and a browser extension. Users hold, send, receive, buy and swap XLM, USDC, XRP and network assets, make peer-to-peer payments, trade on the DEX/SDEX, use fiat on/off-ramps, and claim a federation address (username*lobstr.co). LOBSTR Vault adds multisig.",
};

// sls-017 (durable half): chains a project supports, lowercase. Fill-if-empty —
// so omission ≠ negation on wallet/multichain records.
const SUPPORTED_NETWORKS: Record<string, string[]> = {
	lobstr: ["stellar", "xrpl"],
	"ultra-stellar": ["stellar", "xrpl"],
};

const ASOF = new Date().toISOString().slice(0, 10);
const csv = (s?: string | null): string[] =>
	s
		? String(s)
				.split(",")
				.map((x) => x.trim())
				.filter(Boolean)
		: [];

async function main() {
	if (
		Object.keys(DESCRIPTION_FIXES).length === 0 &&
		Object.keys(SUPPORTED_NETWORKS).length === 0
	) {
		console.error("Nothing to do — no fixes configured.");
		process.exit(1);
	}
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}\n`,
	);

	const writes: Array<{
		id: string;
		slug: string;
		data: Record<string, unknown>;
	}> = [];

	console.log("── Description fixes (overwrite shortDescription) ──");
	for (const [slug, desc] of Object.entries(DESCRIPTION_FIXES)) {
		const res = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = res.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project with slug "${slug}" — skipped`);
			continue;
		}
		if (d.shortDescription === desc) {
			console.log(`  ${slug}: already up to date, skip`);
			continue;
		}
		console.log(`  ${slug}:`);
		console.log(`    old: ${d.shortDescription ?? "(none)"}`);
		console.log(`    new: ${desc}`);
		writes.push({ id: d.id, slug, data: { shortDescription: desc } });
	}

	// ── sls-012: structured anchor coverage, synced from the partner record ──
	// The partner directory already carries structured seps / currencies /
	// country; project rows (searchProjects category=Anchor) only had prose.
	// Copy them onto the matching project (fill-if-empty), dated with asOf.
	console.log("\n── Coverage from partner records (fill-if-empty) ──");
	const partnersRes = await payload.find({
		collection: "partner-accounts",
		where: { status: { equals: "published" } },
		limit: 300,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	for (const pt of partnersRes.docs as any[]) {
		const seps: string[] = pt.seps ?? [];
		const currencies = csv(pt.compliance?.currencies);
		const countries = pt.country ? [String(pt.country)] : [];
		if (!seps.length && !currencies.length && !countries.length) continue;
		// Partner slug is often `anchor-<name>`; the project slug is `<name>`.
		const candidates = [pt.slug, String(pt.slug).replace(/^anchor-/, "")];
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		let proj: any = null;
		for (const slug of candidates) {
			const r = await payload.find({
				collection: "projects",
				where: { slug: { equals: slug } },
				limit: 1,
				depth: 0,
				overrideAccess: true,
			});
			if (r.docs[0]) {
				proj = r.docs[0];
				break;
			}
		}
		if (!proj) continue;
		const ex = proj.coverage ?? {};
		if (ex.countries?.length || ex.currencies?.length || ex.seps?.length) {
			console.log(`  ${proj.slug}: coverage already set, skip`);
			continue;
		}
		console.log(
			`  ${proj.slug} ← ${pt.slug}: seps=${seps.join("/") || "-"} ccy=${currencies.join("/") || "-"} countries=${countries.join("/") || "-"}`,
		);
		writes.push({
			id: proj.id,
			slug: proj.slug,
			data: { coverage: { countries, currencies, seps, asOf: ASOF } },
		});
	}

	// ── sls-017 (durable): supportedNetworks (fill-if-empty) ──
	console.log("\n── Supported networks (fill-if-empty) ──");
	for (const [slug, nets] of Object.entries(SUPPORTED_NETWORKS)) {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const d = r.docs[0] as any;
		if (!d) {
			console.log(`  WARN: no project "${slug}" — skipped`);
			continue;
		}
		if (Array.isArray(d.supportedNetworks) && d.supportedNetworks.length) {
			console.log(`  ${slug}: already set, skip`);
			continue;
		}
		console.log(`  ${slug} → ${nets.join(", ")}`);
		writes.push({ id: d.id, slug, data: { supportedNetworks: nets } });
	}

	console.log(`\n${writes.length} write(s) planned.`);
	if (!EXECUTE) {
		console.log("DRY RUN — none applied.");
		process.exit(0);
	}
	for (const w of writes) {
		await payload.update({
			collection: "projects",
			id: w.id,
			data: w.data,
			overrideAccess: true,
		});
		console.log(`  wrote: ${w.slug}`);
	}
	console.log(`\nDONE: ${writes.length} write(s) applied.`);
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
