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
 * It re-reads its own stamps every run. A product-integration row in this
 * scope whose cited stellar.toml the probe read and rejected (it declares the
 * test network, is an HTML document, or is no longer served), twice with a
 * pause between, and where nothing else was found has the basis withdrawn to
 * unverified with no source, as curated withdrawals do. This lane writes no
 * status. A withdrawn row is then a weak row like any other: the site-liveness
 * lane may stamp site-liveness, the Lumenloop sync may write its label and
 * stamp source-inherited, and the weak-basis liveness check may queue it for
 * a person. A marker merely not found again never withdraws: loop's contract
 * id sat 2.5 MB into a bundle the probe reads only 400 KB of (2026-11-23).
 * Nor does could-not-check.
 *
 * Dry-run by default; --execute writes.
 */
import "./load-env";
import { type ProbeResult, probeProduct } from "../src/lib/product-probe";
import { STRONG_STATUS_BASES } from "../src/lib/project-status";

const EXECUTE = process.argv.includes("--execute");
const LIMIT = Number(
	process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? "0",
);
/** A probe never awards over any strong basis (the one canonical list): a
 *  person, on-chain evidence, its own award, or a repo or package reading.
 *  Its own award is re-read separately (`stamped` in main). */
export const NEVER_OVERWRITE: ReadonlySet<string> = new Set(
	STRONG_STATUS_BASES,
);
/** What one probe of a row writes, or null for nothing. Never `status`. A
 *  row this lane stamped keeps its stamp while the probe finds the same
 *  evidence, is re-cited when the evidence moved, and is withdrawn only when
 *  the probe read the source it cites and rejected it. */
export function basisWrite(
	row: { statusBasis?: string | null; statusSourceUrl?: string | null },
	r: ProbeResult,
	now: string,
): {
	statusBasis: "product-integration" | "unverified";
	statusAsOf: string;
	statusSourceUrl?: string | null;
} | null {
	if (r.couldNotCheck) return null;
	const own = row.statusBasis === "product-integration";
	if (r.kind)
		return own && r.url === row.statusSourceUrl
			? null
			: {
					statusBasis: "product-integration",
					statusAsOf: now,
					...(r.url ? { statusSourceUrl: r.url } : {}),
				};
	return own && !!r.rejected && r.rejected === row.statusSourceUrl
		? { statusBasis: "unverified", statusAsOf: now, statusSourceUrl: null }
		: null;
}

/** Long enough that a 404 mid-deploy or a one-off error page has passed. */
const REREAD_PAUSE_MS = 30_000;

/** Probe a row and plan its write. A withdrawal needs a second read, after a
 *  pause, that agrees; otherwise the second read is the reading. */
export async function readRow(
	row: { statusBasis?: string | null; statusSourceUrl?: string | null },
	url: string,
	now: string,
	probe: (url: string) => Promise<ProbeResult> = probeProduct,
	pause: () => Promise<unknown> = () =>
		new Promise((r) => setTimeout(r, REREAD_PAUSE_MS)),
): Promise<{ r: ProbeResult; write: ReturnType<typeof basisWrite> }> {
	const r = await probe(url);
	const write = basisWrite(row, r, now);
	if (write?.statusBasis !== "unverified") return { r, write };
	await pause();
	const again = await probe(url);
	return { r: again, write: basisWrite(row, again, now) };
}

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

async function main() {
	// Imported here, not at module scope, so a unit test can import this
	// lane's protected set without booting Payload or opening a DB connection.
	const { getPayload } = await import("payload");
	const configPromise = (await import("../src/payload.config")).default;
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
			statusSourceUrl: true,
			links: true,
			onchain: true,
			deployment: true,
		},
	});
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const all = res.docs as any[];
	// biome-ignore lint/suspicious/noExplicitAny: stored doc shape
	const inScope = (p: any) =>
		!hasOnchain(p) &&
		!(p.types ?? []).some((t: string) => LIBRARY_TYPES.has(t)) &&
		productUrl(p);
	const eligible = all.filter(
		(p) => !NEVER_OVERWRITE.has(String(p.statusBasis ?? "")) && inScope(p),
	);
	// This lane's own stamps. A row with an on-chain footprint holds this basis
	// from basis-from-deployment (operator-toml), which owns it.
	const stamped = all.filter(
		(p) => p.statusBasis === "product-integration" && inScope(p),
	);
	const queue = [...eligible, ...stamped];
	const todo = LIMIT > 0 ? queue.slice(0, LIMIT) : queue;
	console.log(
		`${all.length} active rows · ${eligible.length} eligible (weak basis, no on-chain footprint, not a library, has a URL) + ${stamped.length} own product-integration stamps re-read · probing ${todo.length}, ${EXECUTE ? "EXECUTING" : "dry run"}\n`,
	);

	const t = {
		awarded: 0,
		recited: 0,
		stillSupported: 0,
		withdrawn: 0,
		notFoundAgain: 0,
		noEvidence: 0,
		placeholder: 0,
		couldNotCheck: 0,
		thirdParty: 0,
	};
	const byKind: Record<string, number> = {};
	for (const p of todo) {
		const url = productUrl(p) as string;
		const { r, write } = await readRow(p, url, new Date().toISOString());
		const own = p.statusBasis === "product-integration";
		if (r.couldNotCheck) {
			t.couldNotCheck++;
			console.log(`  CNC   ${String(p.slug).padEnd(28)} ${r.detail}`);
		} else if (r.kind && !write) {
			t.stillSupported++;
		} else if (r.kind && own) {
			t.recited++;
			console.log(
				`  RECITE ${String(p.slug).padEnd(27)} ${p.statusSourceUrl} -> ${r.url} · ${r.detail}`,
			);
		} else if (r.kind) {
			t.awarded++;
			byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
			console.log(
				`  AWARD ${String(p.slug).padEnd(28)} ${String(p.statusBasis ?? "(none)").padEnd(18)} -> product-integration · ${r.detail}`,
			);
		} else if (own && write) {
			t.withdrawn++;
			console.log(
				`  WITHDRAW ${String(p.slug).padEnd(25)} product-integration -> unverified (status ${p.status} kept; was ${p.statusSourceUrl}) · ${r.detail}`,
			);
		} else if (own) {
			t.notFoundAgain++;
			console.log(
				`  KEEP  ${String(p.slug).padEnd(28)} not found again, cited ${p.statusSourceUrl} not rejected · ${r.detail}`,
			);
		} else if (r.detail.startsWith("third-party host")) {
			t.thirdParty++;
			console.log(`  HOST  ${String(p.slug).padEnd(28)} ${r.detail}`);
		} else if (/placeholder|parked/.test(r.detail)) {
			t.placeholder++;
			console.log(`  PARKED ${String(p.slug).padEnd(27)} ${r.detail}`);
		} else {
			t.noEvidence++;
		}
		if (EXECUTE && write)
			await payload.update({
				collection: "projects",
				id: p.id,
				data: write,
				context: { internal: true },
			});
		await new Promise((r) => setTimeout(r, PACE_MS));
	}
	console.log(
		`\nawarded ${t.awarded} ${JSON.stringify(byKind)} | own stamps: still supported ${t.stillSupported}, re-cited ${t.recited}, withdrawn ${t.withdrawn}, not found again (kept) ${t.notFoundAgain} | no marker found ${t.noEvidence} | parked/placeholder ${t.placeholder} | third-party host ${t.thirdParty} | could-not-check ${t.couldNotCheck}`,
	);
	// A run that could not look at most of the set proves nothing about it.
	if (todo.length && t.couldNotCheck > todo.length / 2) {
		console.error(
			`FAILED TO LOOK at ${t.couldNotCheck}/${todo.length} — do not read this run as evidence about the rest.`,
		);
		process.exit(2);
	}
	process.exit(0);
}

if (process.argv[1]?.includes("basis-from-product")) main();
