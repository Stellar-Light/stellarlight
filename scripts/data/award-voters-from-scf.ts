/**
 * i³ Awards — print the SCF voting contract's eligible-voter list as CSV.
 *
 *   pnpm exec tsx scripts/data/award-voters-from-scf.ts --round=43
 *   pnpm exec tsx scripts/data/award-voters-from-scf.ts --round=43 --label="SCF Pilot"
 *   pnpm exec tsx scripts/data/award-voters-from-scf.ts --rounds            # just the counts
 *
 * READ-ONLY. Prints `address,label` on stdout — the exact shape the existing
 * award-import workflow takes as its `csv` input. It writes nothing, touches
 * no database and needs no secret; the whitelist itself is still applied by
 * `award-import.ts --kind=voters`, dry-run first, as before.
 *
 * WHY A SCRIPT. Anke's ask ("all the Pilot addresses from the last round") is
 * a per-round job that recurs every round, and doing it by hand went wrong the
 * first time: a regex over the raw XDR bytes returns every G-address anywhere
 * in the contract — 201 — instead of the round's actual voter map. Decoding
 * the SCVal and reading only the `VotingPowers` entry for the round gives 144.
 *
 * WHAT IT CANNOT DO. The contract stores no ROLE. Its four key types are
 * Submissions / SubmissionVotes / VotingPowers / TallyResults, and the power
 * values are large distinct reputation-style numbers, not a tier flag. So this
 * returns everyone with voting power in a round, which is a superset of the
 * Pilots if SDF's ~80 figure is a subset. Verified 2026-09-08:
 *
 *   round 40  129     union of all four rounds  201
 *   round 41  135     present in ALL four        94
 *   round 42  144
 *   round 43  144     ← the "last round"
 *
 * Whittling 144 → ~80 needs SDF's own roster. Do not infer it from the chain.
 */

import { StrKey, scValToNative, xdr } from "@stellar/stellar-sdk";

const arg = (n: string) =>
	process.argv
		.find((a) => a.startsWith(`--${n}=`))
		?.split("=")
		.slice(1)
		.join("=");

/** The SCF community voting contract on testnet. */
const CONTRACT =
	arg("contract") ?? "CAM3VZX47TCQWCEYGXEDTSIJYKIVM6AWMFR7VTFYTETXFO53I5LOZGBT";
const ROUND = arg("round");
const LABEL = arg("label") ?? "SCF Pilot";
const LIST_ROUNDS = process.argv.includes("--rounds");

type Rec = { key: string; value: string };

async function votingPowerEntries(): Promise<Map<number, string[]>> {
	const url = `https://api.stellar.expert/explorer/testnet/contract-data/${CONTRACT}?limit=200`;
	const res = await fetch(url, {
		headers: { "User-Agent": "stellarlight-scout" },
	});
	if (!res.ok) throw new Error(`contract-data ${res.status} for ${CONTRACT}`);
	const body = (await res.json()) as { _embedded?: { records?: Rec[] } };
	const out = new Map<number, string[]>();
	for (const r of body._embedded?.records ?? []) {
		let key: unknown;
		try {
			key = scValToNative(xdr.ScVal.fromXDR(r.key, "base64"));
		} catch {
			continue; // the contract-instance entry is not an SCVal map
		}
		if (!Array.isArray(key) || key[0] !== "VotingPowers") continue;
		const round = Number((key[1] as { round?: number | bigint })?.round);
		if (!Number.isFinite(round)) continue;
		const val = scValToNative(xdr.ScVal.fromXDR(r.value, "base64")) as Record<
			string,
			unknown
		>;
		out.set(
			round,
			Object.keys(val)
				.filter((a) => StrKey.isValidEd25519PublicKey(a))
				.sort(),
		);
	}
	return out;
}

const rounds = await votingPowerEntries();
if (rounds.size === 0) {
	console.error(`✗ no VotingPowers entries found in ${CONTRACT}`);
	process.exit(1);
}

if (LIST_ROUNDS || !ROUND) {
	const keys = [...rounds.keys()].sort((a, b) => a - b);
	console.error(`contract ${CONTRACT}`);
	for (const k of keys)
		console.error(`  round ${k}: ${rounds.get(k)?.length} addresses`);
	const sets = keys.map((k) => new Set(rounds.get(k) ?? []));
	const union = new Set(sets.flatMap((s) => [...s]));
	const inAll = [...union].filter((a) => sets.every((s) => s.has(a)));
	console.error(
		`  union: ${union.size} · present in all ${keys.length} rounds: ${inAll.length}`,
	);
	if (!ROUND) {
		console.error("\npass --round=<n> to print that round's CSV");
		process.exit(0);
	}
}

const addrs = rounds.get(Number(ROUND));
if (!addrs) {
	console.error(
		`✗ round ${ROUND} not in contract (have: ${[...rounds.keys()].sort().join(", ")})`,
	);
	process.exit(1);
}
// stdout is the CSV so it can be piped; the summary goes to stderr.
console.error(`\nround ${ROUND}: ${addrs.length} addresses — CSV on stdout`);
console.log("address,label");
for (const a of addrs) console.log(`${a},${LABEL}`);
