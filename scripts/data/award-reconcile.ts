/**
 * i³ Awards — reconcile the DB mirror against the chain, before testnet resets.
 *
 *   pnpm exec tsx scripts/data/award-reconcile.ts --round=i3-2026-test
 *   pnpm exec tsx scripts/data/award-reconcile.ts --round=i3-2026-test --execute
 *   pnpm exec tsx scripts/data/award-reconcile.ts --round=current --execute
 *
 * `--round=current` = the open round, else the most recently updated one —
 * what the daily schedule runs, so the mirror is reconciled every day a round
 * exists and nobody has to remember to do it before the reset.
 *
 * WHY. Ballots live as manageData entries on each voter's TESTNET account and
 * the tally reads them from Horizon. Testnet is reset 2–4× a year, and a reset
 * clears every ledger entry and all history — the round's on-chain record is
 * gone at the first reset after it closes. `award-ballots` is written after
 * each successful submit, best-effort by design (a DB hiccup must never fail a
 * vote that already landed on-chain), so it can silently miss a ballot. While
 * the chain still exists this script finds those gaps and fills them; once the
 * chain is gone, the mirror is what /api/awards/results serves.
 *
 * Every whitelisted address (plus any the mirror knows) is read from Horizon
 * and classified: create (on-chain, not mirrored), update (mirror is stale),
 * ok, no-vote, chain-empty (mirrored but the chain shows nothing — NEVER
 * deleted), unfunded, unreachable (Horizon failed — the run cannot claim
 * completeness). A backfilled row carries the real tx hash and ledger time of
 * the vote when Horizon still has the operation.
 *
 * If the mirror holds ballots and the chain shows none for anyone, that is
 * what a reset looks like: nothing is written — there is nothing to reconcile
 * from, the mirror rows are the record — and the run says so and exits 0,
 * because a lane that stays red forever after the reset reads as noise.
 *
 * Dry-run by default. Every write is read back; unreachable addresses or a
 * read-back mismatch exit non-zero so a partial run never reads as success.
 */
import "../load-env";
import { getPayload } from "payload";
import {
	planReconcile,
	sameSelections,
	summarizeReconcile,
} from "../../src/lib/awards/mirror";
import { ballotCountsAtTime } from "../../src/lib/awards/publish";
import {
	findRoundId,
	readCurrentBallots,
	writeBallotRecord,
} from "../../src/lib/awards/record";
import { type LoadedRound, loadRoundOrThrow } from "../../src/lib/awards/round";
import {
	fetchLatestBallotOp,
	fetchTestnetAccounts,
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

async function main() {
	if (!ROUND) {
		console.error("usage: --round=<slug> [--execute]");
		return 2;
	}
	console.log(
		`\ni³ awards reconcile — ${ROUND} — ${EXECUTE ? "EXECUTE" : "DRY-RUN (pass --execute to write)"}`,
	);

	// getPayload (not the safe wrapper) so a DB failure is FATAL, not "no round".
	const payload = await getPayload({ config: configPromise });

	// The throwing loader, retried: a transient DB error must surface as the
	// error it is, not as "no round" (run 35106331010 failed exactly that way).
	let loaded: LoadedRound | null = null;
	for (let attempt = 1; ; attempt++) {
		try {
			loaded = await loadRoundOrThrow(ROUND === "current" ? null : ROUND);
			break;
		} catch (err) {
			console.error(`loadRound attempt ${attempt}/3 failed:`, err);
			if (attempt === 3) return 1;
			await new Promise((r) => setTimeout(r, 2000 * attempt));
		}
	}
	if (!loaded) {
		console.error(
			ROUND === "current"
				? "\nno round exists"
				: `\nno round with slug "${ROUND}"`,
		);
		return 1;
	}
	const { round, nominees, whitelist } = loaded;
	const roundId = await findRoundId(payload, round.slug);
	if (!roundId) {
		console.error(`\nround ${round.slug} loaded but has no id?!`);
		return 1;
	}
	const mirror = await readCurrentBallots(payload, roundId);
	const addresses = [...new Set([...whitelist, ...mirror.keys()])].sort();

	console.log(
		`round ${round.slug} (${round.status}) · ${nominees.length} nominees · whitelist ${whitelist.size} · walking ${addresses.length} accounts on testnet`,
	);

	const probes = await fetchTestnetAccounts(addresses, 10);
	const actions = planReconcile(round, nominees, probes, mirror);
	const summary = summarizeReconcile(actions, mirror.size);
	const c = summary.counts;

	console.log(
		`\nchain voters ${summary.chainVoters}: ok ${c.ok} · CREATE ${c.create} · UPDATE ${c.update}` +
			` │ no-vote ${c["no-vote"]} · unfunded ${c.unfunded} · chain-empty ${c["chain-empty"]} · unreachable ${c.unreachable}`,
	);
	// Counts only. This log is world-readable (public repo), and a truncated
	// address re-identifies uniquely against a ~98-address whitelist that is
	// itself derived from a public contract — so a per-address line here was
	// the round's participation roll, published daily. Unreachable addresses
	// are the one class an operator needs to act on; they get a count and the
	// distinct error strings, not the addresses.
	const unreachableErrors = [
		...new Set(
			actions.flatMap((a) => (a.kind === "unreachable" ? [a.error] : [])),
		),
	];
	if (unreachableErrors.length) {
		console.log(`  unreachable errors: ${unreachableErrors.join(" | ")}`);
	}

	if (summary.resetSuspected) {
		console.log(
			`\nNOTICE: the mirror holds ${mirror.size} ballot(s) and Horizon answered for ${actions.length - c.unreachable} account(s), yet NONE carries a vote.`,
		);
		console.log(
			"  That is what testnet looks like after a reset. There is nothing to reconcile FROM —",
		);
		console.log(
			"  the mirror rows ARE the record now, and /api/awards/results serves them. Nothing written.",
		);
		return 0;
	}

	const todo = actions.filter(
		(a): a is Extract<typeof a, { kind: "create" | "update" }> =>
			a.kind === "create" || a.kind === "update",
	);
	if (todo.length === 0)
		console.log("\nmirror matches the chain — nothing to write.");

	if (!EXECUTE) {
		if (todo.length)
			console.log(
				`\nDRY RUN — ${todo.length} row(s) would be written. Re-run with --execute.`,
			);
		if (c.unreachable) {
			console.error(
				`\n${c.unreachable} address(es) unreachable — this run cannot claim the mirror is complete (exit 1).`,
			);
			return 1;
		}
		return 0;
	}

	const prefix = `i3.${round.slug}.`;
	const refusedAfterClose = new Set<string>();
	for (const a of todo) {
		const op = await fetchLatestBallotOp(a.address, prefix);
		// This lane is the one path by which an out-of-band ballot enters the
		// mirror — and the tally PREFERS the mirror. Writing a post-close
		// ballot here would launder it past the close-time guard in liveTally,
		// which only ever inspects addresses with no mirror row. So the guard
		// has to hold on both sides of that door.
		if (!ballotCountsAtTime(op?.at, round.closesAt ?? null)) {
			refusedAfterClose.add(a.address);
			console.log(
				`  refused ${short(a.address)}  ${
					op
						? `ballot op @ ${op.at} is after the round closed (${round.closesAt})`
						: "no datable ballot op — cannot show it was cast in time"
				}`,
			);
			continue;
		}
		const outcome = await writeBallotRecord(payload, {
			roundId,
			address: a.address,
			selections: a.selections,
			txHash: op?.txHash ?? null,
			at: op?.at ?? new Date().toISOString(),
		});
		console.log(
			`  ${outcome.padEnd(7)} ${short(a.address)}  ${
				op
					? `tx ${op.txHash.slice(0, 8)}… @ ${op.at}`
					: "(no ballot op in the last 200 — recorded from account state, no tx hash)"
			}`,
		);
	}

	const back = await readCurrentBallots(payload, roundId);
	let mismatches = 0;
	for (const a of todo) {
		// A refused ballot was deliberately not written; it is not a failure to
		// find it missing, and reporting it as one would train the reader to
		// ignore this lane's loudest signal.
		if (refusedAfterClose.has(a.address)) continue;
		const now = back.get(a.address);
		if (!now || !sameSelections(now, a.selections)) {
			mismatches++;
			console.error(
				`READ-BACK FAILED: ${short(a.address)} holds ${now ? `${cats(now)} categories` : "nothing"}`,
			);
		}
	}
	if (refusedAfterClose.size > 0) {
		console.log(
			`\n${refusedAfterClose.size} ballot(s) REFUSED — written to Horizon after the round closed, so they were not mirrored and are not counted.`,
		);
	}
	console.log(
		`\n✓ read back: ${todo.length - mismatches}/${todo.length} written rows match the chain · mirror now holds ${back.size} ballot(s)`,
	);
	if (c.unreachable) {
		console.error(
			`${c.unreachable} address(es) unreachable — mirror may still be incomplete (exit 1).`,
		);
	}
	return mismatches || c.unreachable ? 1 : 0;
}

main()
	.then((code) => process.exit(code))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
