/**
 * i³ Awards — reconcile the RELAY against the record, daily.
 *
 *   pnpm exec tsx scripts/data/award-reconcile.ts --round=i3-2026            # dry run
 *   pnpm exec tsx scripts/data/award-reconcile.ts --round=i3-2026 --execute  # repair
 *   pnpm exec tsx scripts/data/award-reconcile.ts --round=current [--execute]
 *
 * Ballots live on ONE relay account under random ids; the record is the only
 * place an id meets an address. The two can disagree in exactly these ways:
 *
 *   unconfirmed  a row was RESERVED (the one-ballot gate) and the relay's
 *                confirmation never landed. If the relay holds the id, the
 *                ballot is real and the row is confirmed with its tx hash. If
 *                not, and the reservation is older than a submit could
 *                possibly take, it is released so the voter can vote.
 *   orphan       a ballot on the relay that no row names. Counted by the
 *                tally as an anonymous voter; it cannot be attributed here.
 *   chain-empty  a confirmed row whose ballot the relay no longer holds —
 *                after a testnet reset that is every row, and those rows are
 *                the point. Kept, reported.
 *   differs      confirmed row and relay hold different picks. The relay
 *                writes exactly what was signed, so the RECORD changed.
 *                Reported loudly, never overwritten.
 *
 * This log is world-readable (public repo): counts only, never an address.
 * Dry-run by default; --execute confirms and releases as described and
 * nothing else. Exits non-zero on `differs`, on unreachable Horizon, or on
 * a suspected reset, so a red run means a human should look.
 */

import "../load-env";
import { getPayload } from "payload";
import { decodeRelayBallots } from "../../src/lib/awards/ballot";
import { planReconcile, summarizeReconcile } from "../../src/lib/awards/mirror";
import {
	confirmBallot,
	findRoundId,
	readRecordRows,
	releaseBallot,
} from "../../src/lib/awards/record";
import { loadRoundOrThrow } from "../../src/lib/awards/round";
import {
	fetchLatestBallotOp,
	fetchTestnetAccount,
	relayKeypair,
} from "../../src/lib/awards/stellar";
import configPromise from "../../src/payload.config";

const args = process.argv.slice(2);
const arg = (k: string) => {
	const hit = args.find((a) => a.startsWith(`--${k}=`));
	return hit ? hit.slice(k.length + 3) : null;
};
const EXECUTE = args.includes("--execute");
const ROUND = arg("round");

// This log is PUBLIC (public repo → public Actions logs). The results API is
// aggregate-only by design — no address→choice — and this lane must not be
// the place that mapping leaks. Addresses are truncated, picks never printed;
// a diff is described by category name only.
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const cats = (s: Record<string, string[]>) => Object.keys(s).length;
const differing = (a: Record<string, string[]>, b: Record<string, string[]>) =>
	[...new Set([...Object.keys(a), ...Object.keys(b)])]
		.filter(
			(c) =>
				[...(a[c] ?? [])].sort().join() !== [...(b[c] ?? [])].sort().join(),
		)
		.sort()
		.join(", ");

/** A reservation older than this with nothing on the relay is abandoned. */
const ABANDONED_AFTER_MS = 15 * 60_000;

async function main(): Promise<number> {
	if (!ROUND) {
		console.error("usage: --round=<slug|current> [--execute]");
		return 2;
	}
	const payload = await getPayload({ config: configPromise });
	const loaded = await loadRoundOrThrow(ROUND === "current" ? null : ROUND);
	if (!loaded) {
		console.error(`no round for "${ROUND}"`);
		return 1;
	}
	const { round, nominees } = loaded;
	const roundId = await findRoundId(payload, round.slug);
	if (!roundId) {
		console.error(`no round with slug "${round.slug}"`);
		return 1;
	}
	console.log(
		`\naward-reconcile — ${EXECUTE ? "EXECUTE" : "DRY-RUN"} — round ${round.slug} (${round.status}) · ${nominees.length} nominees`,
	);

	const relayPub = relayKeypair()?.publicKey() ?? null;
	if (!relayPub) {
		console.error("AWARDS_RELAY_SECRET is not set — cannot read the relay.");
		return 1;
	}
	const probe = await fetchTestnetAccount(relayPub);
	if (probe.funded === null) {
		console.error(
			`relay unreachable: ${probe.error} — this run cannot judge anything (exit 1).`,
		);
		return 1;
	}
	const relay =
		probe.funded === true
			? decodeRelayBallots(round, nominees, probe.account.data)
			: new Map();
	const rows = await readRecordRows(payload, roundId);
	const actions = planReconcile(rows, relay);
	const summary = summarizeReconcile(actions);
	const c = summary.counts;
	console.log(
		`relay ${relay.size} ballot(s) · record ${rows.length} row(s) → ok ${c.ok} · differs ${c.differs} · chain-empty ${c["chain-empty"]} · unconfirmed ${c.unconfirmed} · orphan ${c.orphan}`,
	);

	if (summary.resetSuspected) {
		console.error(
			`\nRESET SUSPECTED: the record holds confirmed ballots and the relay holds none of them. Nothing to reconcile from; the record IS the round now. Exit 1 so someone reads this.`,
		);
		return 1;
	}
	if (c.differs > 0) {
		console.error(
			`\n${c.differs} row(s) DIFFER from the relay. The relay writes exactly what was signed, so the record changed after the fact. Not touched; a human decides.`,
		);
	}

	// the only writes this lane makes: confirm or release a reservation
	let confirmed = 0;
	let released = 0;
	let left = 0;
	const now = Date.now();
	for (const a of actions) {
		if (a.kind !== "unconfirmed") continue;
		const row = rows.find((r) => r.ballotId === a.ballotId);
		if (!row) continue;
		if (a.onRelay) {
			const op = await fetchLatestBallotOp(
				relayPub,
				`i3.${round.slug}.${a.ballotId}.`,
			);
			if (!op) {
				left++;
				continue;
			}
			if (EXECUTE) await confirmBallot(row.id, op.txHash);
			confirmed++;
			continue;
		}
		const age = row.reservedAt ? now - Date.parse(row.reservedAt) : Number.NaN;
		if (Number.isNaN(age) || age < ABANDONED_AFTER_MS) {
			left++; // may still be in flight
			continue;
		}
		if (EXECUTE) await releaseBallot(row.id);
		released++;
	}
	if (c.unconfirmed > 0) {
		console.log(
			`unconfirmed: ${confirmed} ${EXECUTE ? "confirmed" : "would confirm"} from the relay · ${released} ${EXECUTE ? "released" : "would release"} (abandoned) · ${left} left (in flight, or undatable)`,
		);
	}
	if (!EXECUTE)
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
	return c.differs > 0 ? 1 : 0;
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
