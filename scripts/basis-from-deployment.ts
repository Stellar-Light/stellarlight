/** Propagate an already-earned deployment basis onto the STATUS record.
 *
 * A project row carries two provenance records for "is it live on Stellar":
 *
 *   STATUS      status, statusBasis, statusAsOf, statusSourceUrl
 *   DEPLOYMENT  deployment.network/.basis/.sourceUrl/.asOf  (added 2026-08-28)
 *
 * /quality and every consumer weigh the STATUS one. The deployment group was
 * added later, with its own receipts under improvements/receipts/, and nothing
 * ever carried its verdict across, so a class of served rows carries a STRONG
 * deployment.basis while statusBasis is still weak — evidence earned,
 * receipted, and then stranded on the record nobody reads.
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
 *   - the artifact must SUPPORT the tier it licenses. An artifact is evidence
 *     of one KIND of fact, and a strong-sounding label does not turn it into
 *     evidence of another:
 *       asset payments        -> onchain-activity, and nothing else
 *       deployment.sourceUrl  -> human-verified, product-integration
 *       receipt               -> human-verified, product-integration
 *     A receipt that records its own `basis` is evidence for THAT basis only.
 *     Nothing here backs repo-activity: a deployment citation is not repo
 *     activity. When no available artifact supports the basis the row is
 *     reported as COULD-NOT-PROPAGATE and nothing is written.
 *     (2026-09-05: the 13 rows the first run wrote were already consistent
 *     under this gate — every asset-payment row was onchain-activity and every
 *     toml/receipt row human-verified — so it changes none of them, and they
 *     are NOT re-written.)
 *
 * Write-set, and nothing else, ever: statusBasis, statusAsOf, statusSourceUrl.
 * status, the deployment group and every other field are left untouched —
 * this lane moves evidence between records, it does not decide liveness.
 *
 * statusAsOf is the EVIDENCE date (deployment.asOf, or the receipt's
 * fetchedAt when the deployment record never recorded one), never now.
 * Stamping today onto a 2026-08-28 observation would launder an old look into
 * a fresh one. A citation with no date behind it anywhere is reported, not
 * dated by the clock.
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
import type { Project } from "../src/payload-types";

const EXECUTE = process.argv.includes("--execute");

/** The board's strong tiers (STRONG_BASES in build-quality-artifact.ts), plus
 *  the DEPLOYMENT-side labels that translate onto one of them.
 *
 *  operator-toml is the case: it is a strong deployment artifact and not a
 *  board tier, so without it here the five rows carrying one were skipped as
 *  "unchanged" before the translation below ever ran — the lane reported a
 *  clean pass over rows it had decided not to look at. See BASIS_TRANSLATION. */
const STRONG = new Set([
	"human-verified",
	"onchain-activity",
	"official-record",
	"product-integration",
	"repo-activity",
	"operator-toml",
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

/** The kinds of artifact this lane accepts, and the tiers each one can back.
 *  Payments observed on-chain are onchain-activity and nothing else; a citation
 *  or a receipt is somebody having looked, which is human-verified or
 *  product-integration. Nothing backs repo-activity. */
export type ArtifactKind =
	| "deployment.sourceUrl"
	| "receipt"
	| "asset payments";
/**
 * A deployment basis that is not itself a statusBasis option, but whose
 * evidence the status enum already recognises under another name.
 *
 * `operator-toml` is the only one. The statusBasis field documents
 * product-integration as "the LIVE product itself references Stellar
 * infrastructure — **a SEP-1 toml**, a Horizon/RPC endpoint, an on-chain
 * address, or a Stellar SDK in its own bundle; an integration OBSERVED, never
 * a claim the product works". A toml served from the project's own domain and
 * naming mainnet accounts is exactly that, so the tier is not an invention —
 * it is the definition already written on the field. The label still never
 * says human-verified: a machine stamp does not impersonate a human one.
 *
 * Measured 2026-09-07: five rows (agtrail, lumenswap, reyts, stellar-carbon,
 * xlmeme) carried operator-toml on their deployment and a weak status basis,
 * and this lane reported them CANNOT every run because no translation existed.
 */
const BASIS_TRANSLATION: Record<string, string> = {
	"operator-toml": "product-integration",
};

const SUPPORTS: Record<ArtifactKind, readonly string[]> = {
	"deployment.sourceUrl": ["human-verified", "product-integration"],
	receipt: ["human-verified", "product-integration"],
	"asset payments": ["onchain-activity"],
};
/** Can this artifact license this tier? Pure, so it is unit-tested. */
export const artifactSupports = (basis: string, kind: ArtifactKind): boolean =>
	SUPPORTS[kind].includes(basis);

const RECEIPTS = join(process.cwd(), "improvements", "receipts");
/** Receipt filenames are `<slug>-deployment-<date>.json`; newest wins. */
function receiptFor(
	slug: string,
): { url: string; asOf: string; basis: string | null } | null {
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
				if (asOf)
					return {
						url: r.url,
						asOf,
						basis: typeof r?.basis === "string" && r.basis ? r.basis : null,
					};
			}
		} catch {
			// an unreadable receipt is not evidence; try the next one
		}
	}
	return null;
}

type Evidence = { url: string; asOf: string; via: string; kind: ArtifactKind };

/** The citable artifact behind this row's deployment basis, or a
 *  could-not-propagate reason (a string).
 *
 *  Precedence order, but only among artifacts that actually SUPPORT the basis:
 *  an onchain-activity row that has both a sourceUrl and observed payments is
 *  backed by the payments, not by the URL that happens to rank first. */
// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
function evidenceOf(
	d: any,
	depBasis: string,
	targetBasis: string = depBasis,
): Evidence | string {
	const depAsOf = d.deployment?.asOf ? String(d.deployment.asOf) : null;
	const rawSrc = d.deployment?.sourceUrl;
	const src = typeof rawSrc === "string" && rawSrc ? rawSrc : null;
	const receipt = receiptFor(String(d.slug));
	// A receipt that records its own basis is evidence for THAT basis only.
	if (receipt?.basis && receipt.basis !== depBasis)
		return `receipt records basis "${receipt.basis}", not "${depBasis}"`;

	const candidates: Evidence[] = [];
	if (src) {
		// The evidence date is the deployment's own asOf, or the receipt's
		// fetchedAt when the row never recorded one. Never today.
		const asOf = depAsOf ?? receipt?.asOf;
		if (!asOf)
			return "deployment.sourceUrl has no evidence date (no deployment.asOf, no receipt) — not stamping today";
		candidates.push({
			url: src,
			asOf,
			kind: "deployment.sourceUrl",
			via: depAsOf
				? "deployment.sourceUrl"
				: "deployment.sourceUrl + receipt date",
		});
	}
	if (receipt)
		candidates.push({
			url: receipt.url,
			asOf: receipt.asOf,
			kind: "receipt",
			via: "receipt",
		});
	const { assetPayments, assetCode, issuer } = d.onchain ?? {};
	if (
		typeof assetPayments === "number" &&
		assetPayments > 0 &&
		assetCode &&
		issuer &&
		depAsOf
	)
		candidates.push({
			url: `https://stellar.expert/explorer/public/asset/${assetCode}-${issuer}`,
			asOf: depAsOf,
			kind: "asset payments",
			via: `${assetPayments} asset payments`,
		});

	if (!candidates.length)
		return "no deployment.sourceUrl, no receipt, no asset payments";
	return (
		candidates.find((c) => artifactSupports(targetBasis, c.kind)) ??
		`${targetBasis} not supported by ${candidates.map((c) => c.kind).join(" / ")}`
	);
}

async function main() {
	// Imported here, not at module scope, so a unit test can import
	// artifactSupports without booting Payload or opening a DB connection.
	const { getPayload } = await import("payload");
	const configPromise = (await import("../src/payload.config")).default;
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
	// A partial page would report a clean run over rows it never looked at,
	// which reads identically to "nothing to do". Refuse instead.
	if (res.totalDocs > docs.length) {
		console.error(
			`could-not-check: ${res.totalDocs} rows carry a deployment basis but the page returned ${docs.length} — raise the limit; refusing to scan a partial set`,
		);
		process.exit(1);
	}
	console.log(
		`${docs.length} rows carry a deployment basis — ${EXECUTE ? "EXECUTING" : "dry run"}\n`,
	);

	let propagated = 0;
	let unchanged = 0;
	let skippedTestnet = 0;
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
			skippedTestnet++;
			console.log(
				`  SKIP    ${String(d.slug).padEnd(42)} deployment is ${d.deployment?.network ?? "unknown"}, not mainnet — a testnet deployment does not back a mainnet-live basis`,
			);
			continue;
		}
		// A deployment basis the status enum spells differently (operator-toml
		// → product-integration) is translated, never invented: see
		// BASIS_TRANSLATION for the definition it is drawn from.
		const targetBasis = BASIS_TRANSLATION[depBasis] ?? depBasis;
		if (!isStatusBasis(targetBasis)) {
			blocked.push(`${d.slug}: "${depBasis}" is not a statusBasis option`);
			console.log(
				`  CANNOT  ${String(d.slug).padEnd(42)} "${depBasis}" is strong but statusBasis cannot hold it`,
			);
			continue;
		}
		const ev = evidenceOf(d, depBasis, targetBasis);
		if (typeof ev === "string") {
			blocked.push(`${d.slug}: ${ev}`);
			console.log(
				`  CANNOT  ${String(d.slug).padEnd(42)} ${ev} — nothing written`,
			);
			continue;
		}

		console.log(
			`  PROPAGATE ${String(d.slug).padEnd(42)} ${statusBasis || "(none)"} -> ${targetBasis}${targetBasis === depBasis ? "" : ` (from deployment ${depBasis})`} · asOf ${ev.asOf.slice(0, 10)} · via ${ev.via} · ${ev.url}`,
		);
		if (!EXECUTE) {
			propagated++;
			continue;
		}

		const data = {
			statusBasis: targetBasis,
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
		if (ok) propagated++;
		else {
			mismatched++;
			console.error(
				`  read-back MISMATCH ${d.slug}: basis=${back?.statusBasis} asOf=${back?.statusAsOf} url=${back?.statusSourceUrl}`,
			);
		}
	}

	console.log(
		`\n${EXECUTE ? "propagated" : "would propagate"} ${propagated} | could-not-propagate ${blocked.length} | skipped-testnet ${skippedTestnet} | unchanged ${unchanged}`,
	);
	for (const b of blocked) console.log(`  could-not-propagate — ${b}`);
	if (mismatched) console.error(`\nread-back mismatches: ${mismatched}`);
	// A blocked row is a reported gap, not a failure: only a write that did not
	// land is one.
	process.exit(mismatched > 0 ? 1 : 0);
}

if (process.argv[1]?.includes("basis-from-deployment")) main();
