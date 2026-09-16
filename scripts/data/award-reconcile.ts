/**
 * i³ Awards — reconcile the DB mirror against the chain, before testnet resets.
 *
 *   pnpm exec tsx scripts/data/award-reconcile.ts --round=i3-2026-test
 *   pnpm exec tsx scripts/data/award-reconcile.ts --round=i3-2026-test --execute
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
 * what a reset looks like: the run REFUSES — there is nothing to reconcile
 * from, and the mirror rows are the record.
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
import {
	findRoundId,
	readMirroredBallots,
	writeBallotRecord,
} from "../../src/lib/awards/record";
import { loadRound } from "../../src/lib/awards/round";
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

const picks = (s: Record<string, string[]>) =>
	Object.entries(s)
		.map(([c, slugs]) => `${c}=${slugs.join("+")}`)
		.join(" ");

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
	const roundId = await findRoundId(payload, ROUND);
	if (!roundId) {
		console.error(`\nno round with slug "${ROUND}"`);
		return 1;
	}
	const loaded = await loadRound(ROUND);
	if (!loaded) {
		console.error("\nround exists but loadRound returned null");
		return 1;
	}
	const { round, nominees, whitelist } = loaded;
	const mirror = await readMirroredBallots(payload, roundId);
	const addresses = [...new Set([...whitelist, ...mirror.keys()])].sort();

	console.log(
		`round ${round.slug} (${round.status}) · ${nominees.length} nominees · whitelist ${whitelist.size} · mirror ${mirror.size} · walking ${addresses.length} accounts on testnet`,
	);

	const probes = await fetchTestnetAccounts(addresses, 10);
	const actions = planReconcile(round, nominees, probes, mirror);
	const summary = summarizeReconcile(actions, mirror.size);
	const c = summary.counts;

	console.log(
		`\nchain voters ${summary.chainVoters}: ok ${c.ok} · CREATE ${c.create} · UPDATE ${c.update}` +
			` │ no-vote ${c["no-vote"]} · unfunded ${c.unfunded} · chain-empty ${c["chain-empty"]} · unreachable ${c.unreachable}`,
	);
	for (const a of actions) {
		if (a.kind === "create")
			console.log(`  CREATE      ${a.address}  ${picks(a.selections)}`);
		else if (a.kind === "update")
			console.log(
				`  UPDATE      ${a.address}  ${picks(a.prior)}  →  ${picks(a.selections)}`,
			);
		else if (a.kind === "chain-empty")
			console.log(
				`  chain-empty ${a.address}  (mirror has a ballot, chain shows none — kept)`,
			);
		else if (a.kind === "unreachable")
			console.log(`  UNREACHABLE ${a.address}  ${a.error}`);
	}

	if (summary.resetSuspected) {
		console.error(
			`\nREFUSED: the mirror holds ${mirror.size} ballot(s) and Horizon answered for ${actions.length - c.unreachable} account(s), yet NONE carries a vote.`,
		);
		console.error(
			"  That is what testnet looks like after a reset. There is nothing to reconcile FROM —",
		);
		console.error(
			"  the mirror rows ARE the record now, and /api/awards/results serves them.",
		);
		return 1;
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
	for (const a of todo) {
		const op = await fetchLatestBallotOp(a.address, prefix);
		const outcome = await writeBallotRecord(payload, {
			roundId,
			address: a.address,
			selections: a.selections,
			txHash: op?.txHash ?? null,
			at: op?.at ?? new Date().toISOString(),
		});
		console.log(
			`  ${outcome.padEnd(7)} ${a.address}  ${
				op
					? `tx ${op.txHash.slice(0, 8)}… @ ${op.at}`
					: "(no ballot op in the last 200 — recorded from account state, no tx hash)"
			}`,
		);
	}

	const back = await readMirroredBallots(payload, roundId);
	let mismatches = 0;
	for (const a of todo) {
		const now = back.get(a.address);
		if (!now || !sameSelections(now, a.selections)) {
			mismatches++;
			console.error(
				`READ-BACK FAILED: ${a.address} holds ${now ? picks(now) : "nothing"}`,
			);
		}
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
