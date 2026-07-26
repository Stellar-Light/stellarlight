/**
 * i³ Awards — prep a round for PILOT TESTING.
 *
 *   pnpm exec tsx scripts/data/award-test-setup.ts --address=G...            # DRY-RUN
 *   pnpm exec tsx scripts/data/award-test-setup.ts --address=G... --execute  # write
 *   ... --execute --test-mode   # also flip the round to testMode (i3-test memo on ballots)
 *   ... --execute --fund        # also friendbot-fund the address on testnet
 *
 * Idempotent and repeatable — the test wallet is meant to be reset, so this
 * can be re-run to re-whitelist. It ONLY ever:
 *   1. adds one award-voter row (address + round) if it isn't already there,
 *   2. optionally sets round.testMode = true,
 *   3. optionally friendbot-funds the address.
 * It never deletes or touches any other voter/round. Dry-run by default.
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
