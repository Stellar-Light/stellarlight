/**
 * i³ Awards — clear a TEST wallet's ballot entries from its own testnet account.
 *
 *   pnpm exec tsx scripts/data/award-test-clear-chain.ts --secret=S... --round=i3-2026-test
 *   ... --execute     # actually sign + submit
 *
 * The round is one ballot per voter, and the gate is chain OR mirror. Deleting
 * the mirror row (award-test-setup.ts --reset) only half-unlocks a wallet: its
 * own `i3.<round>.*` manageData entries still say it has voted. Only the
 * account holder can remove those, so this is the half that needs a key.
 *
 * LOCAL ONLY, BY CONSTRUCTION. It takes a SECRET key, so it refuses to run in
 * CI and must never be wired into a workflow — there is deliberately no
 * award-test-clear-chain.yml. Use it with throwaway TESTNET keys only; it
 * refuses anything that isn't a testnet-funded account, and it only ever
 * deletes keys under this round's exact `i3.<round>.` prefix — it will not
 * touch any other data entry on the account.
 */

import "../load-env";
import {
	Account,
	Keypair,
	Networks,
	Operation,
	TransactionBuilder,
} from "@stellar/stellar-sdk";

const arg = (name: string) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const EXECUTE = process.argv.includes("--execute");
const SECRET = (arg("secret") ?? "").trim();
const ROUND = (arg("round") ?? "").trim();
const HORIZON = "https://horizon-testnet.stellar.org";

async function main() {
	if (process.env.CI) {
		console.error(
			"✗ refuses to run in CI — this takes a secret key and is local-only.",
		);
		process.exit(1);
	}
	if (!SECRET || !ROUND) {
		console.error(
			"usage: --secret=S... --round=<slug> [--execute]  (testnet keys only)",
		);
		process.exit(1);
	}

	let kp: Keypair;
	try {
		kp = Keypair.fromSecret(SECRET);
	} catch {
		console.error("✗ --secret is not a valid Stellar secret key (S...)");
		process.exit(1);
	}
	const address = kp.publicKey();
	console.log(
		`i³ awards clear-chain — ${EXECUTE ? "EXECUTE" : "DRY-RUN (pass --execute to submit)"}`,
	);
	console.log(`account: ${address}\nround:   ${ROUND}\n`);

	const res = await fetch(`${HORIZON}/accounts/${address}`);
	if (!res.ok) {
		console.error(
			`✗ testnet Horizon says ${res.status} for this account — nothing to clear.`,
		);
		process.exit(1);
	}
	const account = (await res.json()) as {
		sequence: string;
		data?: Record<string, string>;
	};
	const prefix = `i3.${ROUND}.`;
	const keys = Object.keys(account.data ?? {}).filter((k) =>
		k.startsWith(prefix),
	);
	if (keys.length === 0) {
		console.log("nothing to do — no entries under this round's prefix.");
		process.exit(0);
	}
	console.log(`will delete ${keys.length} entr(ies):`);
	for (const k of keys) console.log(`  ${k}`);

	if (!EXECUTE) {
		console.log("\nDry-run only. Re-run with --execute to sign and submit.");
		process.exit(0);
	}

	const tx = new TransactionBuilder(new Account(address, account.sequence), {
		fee: "200",
		networkPassphrase: Networks.TESTNET,
	});
	for (const name of keys) {
		tx.addOperation(Operation.manageData({ name, value: null }));
	}
	const built = tx.setTimeout(120).build();
	built.sign(kp);

	const submit = await fetch(`${HORIZON}/transactions`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({ tx: built.toXDR() }),
	});
	const body = (await submit.json()) as { hash?: string; extras?: unknown };
	if (!submit.ok) {
		console.error("✗ Horizon rejected it:", JSON.stringify(body.extras));
		process.exit(1);
	}
	console.log(`\n✓ cleared. tx ${body.hash}`);
	console.log(
		"The wallet can vote again once its mirror row is gone too (award-test-setup.ts --reset).",
	);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
