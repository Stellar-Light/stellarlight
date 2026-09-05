/** Propagate an already-earned deployment basis onto the STATUS record.
 *
 * A project row carries two provenance records for "is it live on Stellar":
 *
 *   STATUS      status, statusBasis, statusAsOf, statusSourceUrl
 *   DEPLOYMENT  deployment.network/.basis/.sourceUrl/.asOf  (added 2026-08-28)
 *
 * /quality and every consumer weigh the STATUS one. The deployment group was
 * added later, with its own receipts under improvements/receipts/, and nothing
 * ever carried its verdict across. On 2026-09-05 a pull of all served rows
 * found 20 rows whose deployment.basis is a STRONG tier while statusBasis is
 * still weak — evidence earned, receipted, and then stranded on the record
 * nobody reads.
 *
 * THIS IS NOT A CLASSIFIER. It invents no evidence and re-probes nothing. The
 * strong basis was already decided by the deployment pass with a citable
 * artifact; this lane copies that decision — and its DATE and its URL — onto
 * the field the board reads. Its output is "propagated N", never "verified N".
 *
 * Rules, in the order they matter:
 *   - status must be "Live". This lane speaks about live rows only.
 *   - deployment.network must be "mainnet". A testnet deployment is real
 *     evidence of a testnet deployment and says nothing about mainnet, so it
 *     never upgrades a live-status basis (dia is the standing example).
 *   - deployment.basis must be a strong tier AND a value statusBasis can hold.
 *     The two vocabularies overlap but are not the same: deployment.basis is
 *     free text carrying mainnet-contract-join and operator-toml, which are
 *     not status tiers; statusBasis is a select, so an unlisted value would be
 *     rejected at write time. Both checks, or the lane throws mid-run.
 *   - statusBasis must be weak or null. Never a downgrade, never a re-write of
 *     a strong status basis someone else earned.
 *   - the deployment evidence must be REAL and citable. A basis with no
 *     artifact behind it is a label, and copying a label is how an unsourced
 *     claim launders itself into a stronger one. Three accepted artifacts, in
 *     precedence order:
 *       1. deployment.sourceUrl        — the citation the deployment pass kept
 *       2. improvements/receipts/<slug>-deployment-*.json — its receipt; the
 *          receipt's own url and fetchedAt are used, not the row's
 *       3. onchain.assetPayments > 0 with assetCode + issuer — payments are an
 *          observation, and stellar.expert is where a reader re-checks it
 *     A row with none of the three is reported as COULD-NOT-PROPAGATE with the
 *     reason and is NOT written. It is never counted as done.
 *
 * Write-set, and nothing else, ever: statusBasis, statusAsOf, statusSourceUrl.
 * status, the deployment group and every other field are left untouched —
 * this lane moves evidence between records, it does not decide liveness.
 *
 * statusAsOf is the EVIDENCE date (deployment.asOf, or the receipt's
 * fetchedAt when the receipt supplied the evidence), never now. Stamping today
 * onto a 2026-08-28 observation would launder an old look into a fresh one.
 *
 * Every write is read back through the Payload API in the same run: an update
 * reports success while silently dropping a key it does not recognise, so the
 * only proof a write landed is reading it again. A mismatch fails the run.
 *
 * Dry-run by default; --execute writes.
 */
import "./load-env";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import type { Project } from "../src/payload-types";

const EXECUTE = process.argv.includes("--execute");

/** The board's strong tiers (STRONG_BASES in build-quality-artifact.ts). */
const STRONG = new Set([
	"human-verified",
	"onchain-activity",
	"official-record",
	"product-integration",
	"repo-activity",
]);
/** What the statusBasis select will actually accept. The board's strong list
 *  is NOT a subset of it — official-record is scored as strong and is not an
 *  enum option — so a value has to clear both gates. `satisfies` against the
 *  generated type makes tsc, not a comment, keep this list honest. */
type StatusBasis = NonNullable<Project["statusBasis"]>;
const STATUS_BASIS_OPTIONS = [
	"operator-announcement",
	"site-liveness",
	"repo-activity",
	"product-integration",
	"onchain-activity",
	"human-verified",
	"source-inherited",
	"unverified",
] as const satisfies readonly StatusBasis[];
const isStatusBasis = (v: string): v is StatusBasis =>
	(STATUS_BASIS_OPTIONS as readonly string[]).includes(v);

const RECEIPTS = join(process.cwd(), "improvements", "receipts");
/** Receipt filenames are `<slug>-deployment-<date>.json`; newest wins. */
function receiptFor(slug: string): { url: string; asOf: string } | null {
	let names: string[];
	try {
		names = readdirSync(RECEIPTS);
	} catch {
		return null;
	}
	const mine = names
		.filter((n) => n.startsWith(`${slug}-deployment-`) && n.endsWith(".json"))
		.sort();
	for (const n of mine.reverse()) {
		try {
			const r = JSON.parse(readFileSync(join(RECEIPTS, n), "utf8"));
			if (typeof r?.url === "string" && r.url) {
				const asOf = typeof r?.fetchedAt === "string" ? r.fetchedAt : null;
				if (asOf) return { url: r.url, asOf };
			}
		} catch {
			// an unreadable receipt is not evidence; try the next one
		}
	}
	return null;
}

type Evidence = { url: string; asOf: string; via: string };

/** The citable artifact behind this row's deployment basis, or null. */
// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
function evidenceOf(d: any): Evidence | null {
	const depAsOf = d.deployment?.asOf ? String(d.deployment.asOf) : null;
	const src = d.deployment?.sourceUrl;
	if (typeof src === "string" && src && depAsOf)
		return { url: src, asOf: depAsOf, via: "deployment.sourceUrl" };
	const receipt = receiptFor(String(d.slug));
	if (receipt) return { url: receipt.url, asOf: receipt.asOf, via: "receipt" };
	const { assetPayments, assetCode, issuer } = d.onchain ?? {};
	if (
		typeof assetPayments === "number" &&
		assetPayments > 0 &&
		assetCode &&
		issuer &&
		depAsOf
	)
		return {
			url: `https://stellar.expert/explorer/public/asset/${assetCode}-${issuer}`,
			asOf: depAsOf,
			via: `${assetPayments} asset payments`,
		};
	return null;
}

(async () => {
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "projects",
		where: { "deployment.basis": { exists: true } },
		limit: 2000,
		depth: 0,
		select: {
			slug: true,
			name: true,
			status: true,
			statusBasis: true,
			statusAsOf: true,
			statusSourceUrl: true,
			canonicalSlug: true,
			deployment: true,
			onchain: true,
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const docs = res.docs as any[];
	console.log(
		`${docs.length} rows carry a deployment basis — ${EXECUTE ? "EXECUTING" : "dry run"}\n`,
	);

	let upgraded = 0;
	let unchanged = 0;
	let mismatched = 0;
	const blocked: string[] = [];

	for (const d of docs) {
		// The board measures SERVED rows only: drafts and folded lineage
		// shadows are not read by any consumer, so they are not this lane's
		// frame either.
		const served = d.slug && d.status !== "Draft" && !d.canonicalSlug;
		const depBasis = String(d.deployment?.basis ?? "");
		const statusBasis = String(d.statusBasis ?? "");
		if (
			!served ||
			d.status !== "Live" ||
			!STRONG.has(depBasis) ||
			STRONG.has(statusBasis)
		) {
			unchanged++;
			continue;
		}
		if (d.deployment?.network !== "mainnet") {
			unchanged++;
			console.log(
				`  SKIP    ${String(d.slug).padEnd(42)} deployment is ${d.deployment?.network ?? "unknown"}, not mainnet — a testnet deployment does not back a mainnet-live basis`,
			);
			continue;
		}
		if (!isStatusBasis(depBasis)) {
			blocked.push(`${d.slug}: "${depBasis}" is not a statusBasis option`);
			console.log(
				`  CANNOT  ${String(d.slug).padEnd(42)} "${depBasis}" is strong but statusBasis cannot hold it`,
			);
			continue;
		}
		const ev = evidenceOf(d);
		if (!ev) {
			blocked.push(
				`${d.slug}: no deployment.sourceUrl, no receipt, no asset payments`,
			);
			console.log(
				`  CANNOT  ${String(d.slug).padEnd(42)} ${depBasis} has no citable artifact — not propagating a bare label`,
			);
			continue;
		}

		console.log(
			`  PROPAGATE ${String(d.slug).padEnd(42)} ${statusBasis || "(none)"} -> ${depBasis} · asOf ${ev.asOf.slice(0, 10)} · via ${ev.via} · ${ev.url}`,
		);
		if (!EXECUTE) {
			upgraded++;
			continue;
		}

		const data = {
			statusBasis: depBasis,
			statusAsOf: new Date(ev.asOf).toISOString(),
			statusSourceUrl: ev.url,
		};
		await payload.update({
			collection: "projects",
			id: d.id,
			data,
			context: { internal: true },
		});
		// READ-BACK: payload.update() reports success while silently dropping
		// an unknown key, so the only proof a write landed is reading it again.
		const back = (await payload.findByID({
			collection: "projects",
			id: d.id,
			depth: 0,
			context: { internal: true },
			// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
		})) as any;
		const ok =
			back?.statusBasis === data.statusBasis &&
			back?.statusSourceUrl === data.statusSourceUrl &&
			Date.parse(String(back?.statusAsOf)) === Date.parse(data.statusAsOf);
		// A write only counts once it has been READ back. Counting at the
		// update call would report a silently-dropped key as work done.
		if (ok) upgraded++;
		else {
			mismatched++;
			console.error(
				`  read-back MISMATCH ${d.slug}: basis=${back?.statusBasis} asOf=${back?.statusAsOf} url=${back?.statusSourceUrl}`,
			);
		}
	}

	console.log(
		`\n${EXECUTE ? "propagated" : "would propagate"} ${upgraded} | could-not-propagate ${blocked.length} | unchanged ${unchanged}`,
	);
	for (const b of blocked) console.log(`  could-not-propagate — ${b}`);
	if (mismatched) console.error(`\nread-back mismatches: ${mismatched}`);
	// A blocked row is a reported gap, not a failure: only a write that did not
	// land is one.
	process.exit(mismatched > 0 ? 1 : 0);
})();
