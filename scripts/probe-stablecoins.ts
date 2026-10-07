/**
 * Read-only probe: measure the whole registry from live sources and print it.
 * Writes nothing. Used to prove the ported pipeline agrees with the service it
 * replaces before anything depends on it.
 *
 *   npx tsx scripts/probe-stablecoins.ts
 */
import { STABLECOIN_REGISTRY } from "../src/data/stablecoin-registry";
import { measureRegistry } from "../src/lib/stablecoin-pipeline";

(async () => {
	const started = Date.now();
	const rows = await measureRegistry(STABLECOIN_REGISTRY);
	console.log(
		`measured ${rows.length} assets in ${((Date.now() - started) / 1000).toFixed(1)}s\n`,
	);
	for (const r of [...rows].sort(
		(a, b) => (b.marketCapUSD ?? 0) - (a.marketCapUSD ?? 0),
	)) {
		const cap =
			r.marketCapUSD == null
				? "—"
				: `$${Math.round(r.marketCapUSD).toLocaleString()}`;
		console.log(
			`${r.code.padEnd(7)} ${r.company.slice(0, 16).padEnd(17)} cap=${cap.padStart(14)} holders=${String(r.holders ?? "—").padStart(9)} ${r.basis}${r.note ? `  ⚠ ${r.note.slice(0, 60)}` : ""}`,
		);
	}
	const live = rows.filter((r) => r.basis === "live").length;
	console.log(
		`\n${live}/${rows.length} measured live; ${rows.length - live} static or unmeasured`,
	);
})();
