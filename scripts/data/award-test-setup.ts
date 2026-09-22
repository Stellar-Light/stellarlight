/**
 * i³ Awards — prep a round for PILOT TESTING.
 *
 *   pnpm exec tsx scripts/data/award-test-setup.ts --address=G...            # DRY-RUN
 *   pnpm exec tsx scripts/data/award-test-setup.ts --address=G... --execute  # write
 *   ... --execute --test-mode   # also flip the round to testMode (i3-test memo on ballots)
 *   ... --execute --fund        # also friendbot-fund the address on testnet
 *   ... --execute --reset       # delete this address's ballot so it can vote again
 *
 * Idempotent and repeatable — the test wallet is meant to be reset, so this
 * can be re-run to re-whitelist. It ONLY ever:
 *   1. adds one award-voter row (address + round) if it isn't already there,
 *   2. optionally sets round.testMode = true,
 *   3. optionally friendbot-funds the address,
 *   4. with --reset, deletes THIS address's ballot rows for THIS round.
 * It never touches any other voter/round/ballot. Dry-run by default.
 *
 * --reset exists because the round is one-ballot-per-voter: once a test wallet
 * votes it is locked out, and testing the vote path again would otherwise need
 * a fresh address every time. Note the vote gate is chain OR mirror, so this
 * only half-unlocks: the account's own i3.* manageData entries still block it,
 * and clearing those needs the voter's signature — award-test-clear-chain.ts
 * does that, locally, with a key this script never sees.
 *
 * The address is a PUBLIC Stellar key (safe to pass as a workflow input and
 * appear in logs). No secret is ever handled here.
 */

import "../load-env";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
import { getPayload } from "payload";

const { default: configPromise } = await import("../../src/payload.config");

const arg = (name: string) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const EXECUTE = process.argv.includes("--execute");
const TEST_MODE = process.argv.includes("--test-mode");
const FUND = process.argv.includes("--fund");
const RESET = process.argv.includes("--reset");
const ADDRESS = (arg("address") ?? "").trim().toUpperCase();
const ROUND_SLUG = arg("round") ?? null; // null → the open round
const LABEL = arg("label") ?? "Pilot — test wallet";
const FRIENDBOT = "https://friendbot.stellar.org";

async function main() {
	console.log(
		`i³ awards test-setup — ${EXECUTE ? "EXECUTE" : "DRY-RUN (pass --execute to write)"}\n`,
	);

	if (!StrKey.isValidEd25519PublicKey(ADDRESS)) {
		console.error(
			`✗ --address is required and must be a Stellar public key (G...). Got: ${ADDRESS || "(none)"}`,
		);
		process.exit(1);
	}

	const payload = await getPayload({ config: await configPromise });

	// Resolve the round: explicit slug, else the single open round.
	const rounds = await payload.find({
		collection: "award-rounds",
		where: ROUND_SLUG
			? { slug: { equals: ROUND_SLUG } }
			: { status: { equals: "open" } },
		limit: 2,
		depth: 0,
	});
	if (rounds.docs.length === 0) {
		console.error(
			ROUND_SLUG
				? `✗ no round with slug "${ROUND_SLUG}"`
				: "✗ no OPEN round — pass --round=<slug> to target a specific one",
		);
		process.exit(1);
	}
	if (rounds.docs.length > 1) {
		console.error(
			"✗ more than one open round — pass --round=<slug> to disambiguate",
		);
		process.exit(1);
	}
	const round = rounds.docs[0] as {
		id: string | number;
		slug: string;
		status: string;
		testMode?: boolean;
	};
	console.log(
		`round: ${round.slug} (status=${round.status}, testMode=${!!round.testMode})`,
	);
	console.log(`address: ${ADDRESS}`);
	console.log("");

	// 1. Whitelist (idempotent).
	const existing = await payload.find({
		collection: "award-voters",
		where: {
			and: [{ round: { equals: round.id } }, { address: { equals: ADDRESS } }],
		},
		limit: 1,
		depth: 0,
	});
	if (existing.docs.length > 0) {
		console.log("• whitelist: already listed — skip");
	} else if (EXECUTE) {
		await payload.create({
			collection: "award-voters",
			data: { round: round.id, address: ADDRESS, label: LABEL },
		});
		console.log(`• whitelist: ADDED (${LABEL})`);
	} else {
		console.log(`• whitelist: WOULD add (${LABEL})`);
	}

	// 2. testMode.
	if (TEST_MODE) {
		if (round.testMode) {
			console.log("• testMode: already on — skip");
		} else if (EXECUTE) {
			await payload.update({
				collection: "award-rounds",
				id: round.id,
				data: { testMode: true },
			});
			console.log("• testMode: SET true (ballots now carry the i3-test memo)");
		} else {
			console.log("• testMode: WOULD set true");
		}
	}

	// 3. Fund (best-effort, testnet only).
	if (FUND) {
		if (EXECUTE) {
			try {
				const res = await fetch(
					`${FRIENDBOT}/?addr=${encodeURIComponent(ADDRESS)}`,
				);
				console.log(
					res.ok
						? "• fund: friendbot funded the account"
						: `• fund: friendbot responded ${res.status} (may already be funded)`,
				);
			} catch {
				console.log(
					"• fund: friendbot unreachable — use the page's Fund button",
				);
			}
		} else {
			console.log("• fund: WOULD friendbot-fund");
		}
	}

	// 4. Reset this address's ballot so the wallet can vote again.
	if (RESET && !round.testMode) {
		console.error(
			`✗ --reset refused: ${round.slug} is not a testMode round. A ballot row's history[0] is the only record of a first ballot once the chain has moved on; deleting one on a real round destroys it, and the reconcile lane would then re-create the row from chain-LATEST — laundering a revote into first place.`,
		);
		process.exit(1);
	}
	if (RESET) {
		const ballots = await payload.find({
			collection: "award-ballots",
			where: {
				and: [
					{ round: { equals: round.id } },
					{ address: { equals: ADDRESS } },
				],
			},
			limit: 50,
			depth: 0,
		});
		if (ballots.docs.length === 0) {
			console.log(
				"• reset: no ballot row for this address — nothing to delete",
			);
		} else if (EXECUTE) {
			for (const doc of ballots.docs) {
				await payload.delete({ collection: "award-ballots", id: doc.id });
			}
			console.log(`• reset: DELETED ${ballots.docs.length} ballot row(s)`);
		} else {
			console.log(`• reset: WOULD delete ${ballots.docs.length} ballot row(s)`);
		}

		// The gate is chain OR mirror, so say plainly whether this is enough.
		try {
			const res = await fetch(
				`https://horizon-testnet.stellar.org/accounts/${ADDRESS}`,
			);
			const data = res.ok
				? (((await res.json()) as { data?: Record<string, string> }).data ?? {})
				: {};
			const keys = Object.keys(data).filter((k) =>
				k.startsWith(`i3.${round.slug}.`),
			);
			console.log(
				keys.length === 0
					? "• reset: chain is clear — this wallet can vote again"
					: `• reset: ${keys.length} entr(ies) STILL ON CHAIN (${keys.join(", ")}) — the wallet stays locked until they are cleared. Run, with that wallet's key, locally:\n    pnpm exec tsx scripts/data/award-test-clear-chain.ts --secret=S... --round=${round.slug} --execute`,
			);
		} catch {
			console.log("• reset: could not reach Horizon to check chain entries");
		}
	}

	// Sanity: the address is well-formed, not a secret key mistakenly pasted.
	try {
		Keypair.fromPublicKey(ADDRESS);
	} catch {
		console.error("✗ address failed Keypair.fromPublicKey — aborting");
		process.exit(1);
	}

	console.log(
		EXECUTE
			? "\nDone. Check GET /api/awards/eligibility?address=… to confirm whitelisted+funded."
			: "\nDry-run only. Re-run with --execute to write.",
	);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
