/** Award statusBasis=product-integration by probing the deployed product.
 *
 * site-liveness records only that a page answered — a parked domain, a "coming
 * soon" splash and a dead product's marketing site all pass it. This looks at
 * what the live surface actually contains: a SEP-1 stellar.toml, a Horizon or
 * Soroban RPC endpoint, an on-chain address, or a Stellar SDK in the product's
 * own bundle. That moves the claim from "the domain resolves" to "the deployed
 * product references Stellar infrastructure".
 *
 * It is NOT verification and is deliberately not named as such. It observes an
 * integration; it never exercises a user flow and is never evidence the product
 * WORKS. human-verified stays a separate, higher tier because a person looked —
 * relabelling machine work as a human attestation would be a lie about
 * provenance, which is the class of defect this whole surface exists to avoid.
 *
 * Scope: rows with a weak basis and NO on-chain footprint (the on-chain ones
 * are served by basis-from-onchain, which has stronger evidence). Library and
 * SDK rows are skipped — a website probe says nothing about whether a package
 * is alive; registry/repo recency is the right instrument for those, and
 * pointing this one at them would manufacture false negatives.
 *
 * Dry-run by default; --execute writes.
 */
import "./load-env";
import { getPayload } from "payload";
import { probeProduct } from "../src/lib/product-probe";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const LIMIT = Number(
	process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0",
);
/** A probe never overwrites a person, nor stronger on-chain evidence. */
const NEVER_OVERWRITE = new Set([
	"human-verified",
	"onchain-activity",
	"product-integration",
]);
/** Types whose liveness is a package/repo question, not a website question. */
const LIBRARY_TYPES = new Set([
	"SDK",
	"RPC",
	"Indexer",
	"Infrastructure",
	"Analytics",
	"Education",
	"Faucet",
]);
/** Politeness between probes — this walks other people's sites. */
const PACE_MS = 700;

// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
const productUrl = (p: any): string | null => {
	const l = p?.links ?? {};
	for (const k of ["website", "site", "web", "homepage", "url"]) {
		const v = l?.[k] ?? (k === "url" ? p?.url : undefined);
		if (typeof v === "string" && /^https?:\/\//i.test(v)) return v;
	}
	return null;
};

// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
const hasOnchain = (p: any) =>
	!!p?.onchain?.assetCode ||
	(Array.isArray(p?.onchain?.contracts) && p.onchain.contracts.length > 0) ||
	p?.deployment?.network === "mainnet" ||
	p?.deployment?.network === "testnet";

(async () => {
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "projects",
		where: { status: { in: ["Live", "Development", "Pre-Release"] } },
		limit: 2000,
		depth: 0,
		select: {
			slug: true,
			name: true,
			types: true,
			status: true,
			statusBasis: true,
			links: true,
			onchain: true,
			deployment: true,
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const all = res.docs as any[];
	const eligible = all.filter(
		(p) =>
			!NEVER_OVERWRITE.has(String(p.statusBasis ?? "")) &&
			!hasOnchain(p) &&
			!(p.types ?? []).some((t: string) => LIBRARY_TYPES.has(t)) &&
			productUrl(p),
	);
	const todo = LIMIT > 0 ? eligible.slice(0, LIMIT) : eligible;
	console.log(
		`${all.length} active rows · ${eligible.length} eligible (weak basis, no on-chain footprint, not a library, has a URL) · probing ${todo.length} — ${EXECUTE ? "EXECUTING" : "dry run"}\n`,
	);

	const t = { awarded: 0, noEvidence: 0, placeholder: 0, couldNotCheck: 0 };
	const byKind: Record<string, number> = {};
	for (const p of todo) {
		const url = productUrl(p) as string;
		const r = await probeProduct(url);
		if (r.couldNotCheck) {
			t.couldNotCheck++;
			console.log(`  CNC   ${String(p.slug).padEnd(28)} ${r.detail}`);
		} else if (r.kind) {
			t.awarded++;
			byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
			console.log(
				`  AWARD ${String(p.slug).padEnd(28)} ${String(p.statusBasis ?? "(none)").padEnd(18)} -> product-integration · ${r.detail}`,
			);
			if (EXECUTE)
				await payload.update({
					collection: "projects",
					id: p.id,
					data: {
						statusBasis: "product-integration",
						statusAsOf: new Date().toISOString(),
						...(r.url ? { statusSourceUrl: r.url } : {}),
					},
					context: { internal: true },
				});
		} else if (/placeholder|parked/.test(r.detail)) {
			t.placeholder++;
			console.log(`  PARKED ${String(p.slug).padEnd(27)} ${r.detail}`);
		} else {
			t.noEvidence++;
		}
		await new Promise((r) => setTimeout(r, PACE_MS));
	}
	console.log(
		`\nawarded ${t.awarded} ${JSON.stringify(byKind)} | no marker found ${t.noEvidence} | parked/placeholder ${t.placeholder} | could-not-check ${t.couldNotCheck}`,
	);
	// A run that could not look at most of the set proves nothing about it.
	if (todo.length && t.couldNotCheck > todo.length / 2) {
		console.error(
			`FAILED TO LOOK at ${t.couldNotCheck}/${todo.length} — do not read this run as evidence about the rest.`,
		);
		process.exit(2);
	}
	process.exit(0);
})();
