/** READ-ONLY by default. On-chain "live on Stellar" enrichment for anchors.
 *
 * The git-free trust signal for closed-source issuer-anchors: their OWN issued
 * assets' live on-chain reality (holders, payment activity, stellar.expert
 * rating). Sourced from stellar.expert's public asset API and attributed ONLY
 * when the asset's issuer `domain` matches the partner's own domain — so an
 * anchor that merely USES Circle's USDC never gets Circle's stats, and MYKOBO's
 * own EURC is distinguished from Circle's. NOTHING is fabricated or guessed;
 * assets with no domain-matched record are simply skipped.
 *
 *   pnpm exec tsx scripts/data/enrich-partner-onchain.ts            # dry run
 *   pnpm exec tsx scripts/data/enrich-partner-onchain.ts --execute  # writes
 *
 * Writes partner.onchain (curator-maintained; overwritten each run). Hook-safe:
 * doesn't touch status/email, so the invite afterChange hook never fires.
 */
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const EXPERT = "https://api.stellar.expert/explorer/public/asset";

interface OnchainAsset {
	code: string;
	issuer: string;
	holders: number;
	payments: number;
	rating: number;
	asOf: string;
}

function host(url?: string | null): string {
	if (!url) return "";
	const h = url.split("//").pop()?.split("/")[0].toLowerCase() ?? "";
	return h.startsWith("www.") ? h.slice(4) : h;
}

function domainMatch(recordDomain: string, partnerDomain: string): boolean {
	if (!recordDomain || !partnerDomain) return false;
	return (
		recordDomain === partnerDomain ||
		recordDomain.endsWith(`.${partnerDomain}`) ||
		partnerDomain.endsWith(`.${recordDomain}`)
	);
}

async function resolveAsset(
	code: string,
	partnerDomain: string,
	asOf: string,
): Promise<OnchainAsset | null> {
	try {
		const r = await fetch(
			`${EXPERT}?search=${encodeURIComponent(code)}&limit=8&sort=rating&order=desc`,
			{ headers: { "user-agent": "stellarlight-onchain-enrich" } },
		);
		if (!r.ok) return null;
		const d = await r.json();
		// biome-ignore lint/suspicious/noExplicitAny: stellar.expert shape
		const recs: any[] = d?._embedded?.records ?? [];
		for (const rec of recs) {
			const dom = String(rec.domain ?? "").toLowerCase();
			if (!domainMatch(dom, partnerDomain)) continue;
			// asset field is "CODE-ISSUER-type"; issuer is the middle segment.
			const issuer = String(rec.asset ?? "").split("-")[1] ?? "";
			const tl = rec.trustlines;
			const holders = Array.isArray(tl) ? (tl[0] ?? 0) : (tl ?? 0);
			return {
				code,
				issuer,
				holders: Number(holders) || 0,
				payments: Number(rec.payments) || 0,
				rating: Math.round(((rec.rating?.average ?? 0) as number) * 10) / 10,
				asOf,
			};
		}
	} catch {
		// network/parse error → skip this asset (no data beats wrong data)
	}
	return null;
}

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const all = await payload.find({
		collection: "partner-accounts",
		where: { status: { equals: "published" } },
		limit: 300,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	const docs = all.docs as any[];
	console.log(`Mode: ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read-only)"}`);
	console.log(`Partners: ${docs.length}\n`);

	const asOf = new Date().toISOString().slice(0, 10);
	const writes: Array<{ id: string; slug: string; onchain: OnchainAsset[] }> =
		[];

	for (const d of docs) {
		const codes: string[] = (d.assets ?? [])
			.map((a: { code: string }) => a.code)
			.filter(Boolean);
		const dom = host(d.websiteUrl);
		if (codes.length === 0 || !dom) continue;
		const matched: OnchainAsset[] = [];
		for (const code of codes) {
			const oc = await resolveAsset(code, dom, asOf);
			if (oc) matched.push(oc);
		}
		if (matched.length === 0) continue;
		matched.sort((a, b) => b.holders - a.holders);
		console.log(
			`  ${d.name} (${d.slug}) [${dom}] — ${matched.length} asset(s):`,
		);
		for (const m of matched)
			console.log(
				`      ${m.code.padEnd(8)} holders=${String(m.holders).padStart(8)} payments=${String(m.payments).padStart(10)} rating=${m.rating}`,
			);
		writes.push({ id: d.id, slug: d.slug, onchain: matched });
	}

	console.log(
		`\n${writes.length} anchor(s) with domain-matched on-chain assets.`,
	);
	if (!EXECUTE) {
		console.log(`DRY RUN — ${writes.length} write(s) planned, none applied.`);
		process.exit(0);
	}
	for (const w of writes) {
		await payload.update({
			collection: "partner-accounts",
			id: w.id,
			data: { onchain: w.onchain },
			overrideAccess: true,
		});
		console.log(`  wrote: ${w.slug} [${w.onchain.length} on-chain assets]`);
	}
	console.log(`\nDONE: ${writes.length} write(s) applied.`);
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
