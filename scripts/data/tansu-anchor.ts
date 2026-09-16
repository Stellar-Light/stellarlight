/**
 * i³ Awards — anchor a published result on TESTNET through Tansu.
 *
 *   pnpm exec tsx scripts/data/tansu-anchor.ts --status [--name=tansu]
 *   pnpm exec tsx scripts/data/tansu-anchor.ts --register            [--execute]
 *   pnpm exec tsx scripts/data/tansu-anchor.ts --commit --round=i3-2026 --sha=<git sha> [--execute]
 *
 * WHY. Everything about the i³ vote is on testnet (owner's rule: Pilots use
 * testnet-assigned wallets). The PUBLISHED RESULT gets a home where the vote
 * lives: Tansu (tansu.dev) records "the latest commit hash of a project". We
 * register `stellarlight` (5 test XLM collateral) and, when a round's results
 * file is committed to this public repo, commit that git SHA — readable by
 * anyone via `get_commit(keccak256("stellarlight"))` until the next testnet
 * reset, after which this simply registers again. The award-ballots mirror
 * is the durable record; this is the on-chain one.
 *
 * Nobody — not a voter, not the owner — touches a dApp: the lane signs with
 * its own key and friendbot-funds it itself.
 *
 * Env: TANSU_MAINTAINER_SECRET (S…, execute) or TANSU_MAINTAINER_PUBLIC (G…,
 * dry-run simulation source). --status needs neither.
 *
 * Dry-run by default: every write is simulated and printed. --execute signs,
 * submits, reads the chain back, and (commit) records the anchor on the
 * round; a read-back mismatch exits non-zero.
 */
import "../load-env";
import { contract, Keypair } from "@stellar/stellar-sdk";
import {
	fetchTestnetAccount,
	fundViaFriendbot,
} from "../../src/lib/awards/stellar";
import {
	type AnchorRecord,
	COMMIT_HASH,
	classifyChainError,
	explorerTxUrl,
	TANSU_NETWORK_PASSPHRASE,
	TANSU_PROJECT_NAME,
	TANSU_PROJECT_URL,
	type TansuClient,
	type TansuProject,
	tansuClient,
	tansuProjectKey,
	tansuProjectPageUrl,
	unwrapResult,
} from "../../src/lib/awards/tansu";

const args = process.argv.slice(2);
const arg = (k: string) => {
	const hit = args.find((a) => a.startsWith(`--${k}=`));
	return hit ? hit.slice(k.length + 3) : null;
};
const EXECUTE = args.includes("--execute");
const ACTION = (["status", "register", "commit"] as const).find((a) =>
	args.includes(`--${a}`),
);
const NAME = arg("name") ?? TANSU_PROJECT_NAME;
const ROUND = arg("round");
const SHA = (arg("sha") ?? "").toLowerCase();

/** The lane's own signing identity, from the environment — never from a file. */
function maintainer(): { publicKey: string; keypair: Keypair | null } {
	const secret = process.env.TANSU_MAINTAINER_SECRET?.trim();
	if (secret) {
		const keypair = Keypair.fromSecret(secret);
		return { publicKey: keypair.publicKey(), keypair };
	}
	const pub = process.env.TANSU_MAINTAINER_PUBLIC?.trim();
	if (pub) return { publicKey: pub, keypair: null };
	throw new Error(
		"set TANSU_MAINTAINER_SECRET (to execute) or TANSU_MAINTAINER_PUBLIC (repo variable, for dry-run simulation)",
	);
}

/** null = the contract says no such project; throws on RPC/network trouble. */
async function readProject(
	c: TansuClient,
	key: Buffer,
): Promise<TansuProject | null> {
	const r = unwrapResult<TansuProject>(
		(await c.get_project({ project_key: key })).result,
	);
	return r.ok && r.value?.name ? r.value : null;
}

async function readCommit(c: TansuClient, key: Buffer): Promise<string | null> {
	try {
		const r = unwrapResult<string>(
			(await c.get_commit({ project_key: key })).result,
		);
		return r.ok && typeof r.value === "string" && r.value ? r.value : null;
	} catch (err) {
		if (classifyChainError(err) === "unregistered") return null;
		throw err;
	}
}

/**
 * A Client method RESOLVES even when the simulation failed — the failure sits
 * on the transaction and only surfaces when simulationData/result is read.
 * Read it here so "simulated OK" is never printed over a trapped call.
 */
// biome-ignore lint/suspicious/noExplicitAny: SDK's simulation response is loosely typed
function assertSimulated(tx: any): { minResourceFee: string } {
	const data = tx.simulationData; // throws SimulationFailedError on failure
	if (!data?.result) throw new Error("simulation returned no result");
	return { minResourceFee: String(tx.simulation?.minResourceFee ?? "?") };
}

function txHashOf(sent: contract.SentTransaction<unknown>): string | null {
	return (
		sent.sendTransactionResponse?.hash ??
		sent.getTransactionResponse?.txHash ??
		null
	);
}

async function status(): Promise<number> {
	const key = tansuProjectKey(NAME);
	const c = await tansuClient();
	const project = await readProject(c, key);
	console.log(
		`\nTansu testnet · project "${NAME}" · key ${key.toString("hex")}`,
	);
	if (!project) {
		console.log("  not registered");
		return 0;
	}
	console.log(`  name        ${project.name}`);
	console.log(`  maintainers ${project.maintainers.join(", ")}`);
	console.log(`  url         ${project.config?.url}`);
	console.log(`  latest hash ${(await readCommit(c, key)) ?? "(none)"}`);
	console.log(`  dApp        ${tansuProjectPageUrl(NAME)}`);
	return 0;
}

async function register(): Promise<number> {
	const key = tansuProjectKey(NAME);
	const { publicKey, keypair } = maintainer();
	const c = await tansuClient({
		publicKey,
		...(keypair
			? contract.basicNodeSigner(keypair, TANSU_NETWORK_PASSPHRASE)
			: {}),
	});
	const existing = await readProject(c, key);
	if (existing) {
		console.log(
			`\n"${NAME}" is already registered (maintainers: ${existing.maintainers.join(", ")}) — nothing to do.`,
		);
		return 0;
	}
	console.log(
		`\nregister "${NAME}" from ${publicKey} · url ${TANSU_PROJECT_URL}`,
	);
	// Testnet: the lane funds its own key. 5 XLM collateral + reserves + fees
	// are well inside one friendbot grant (10,000 test XLM).
	const acct = await fetchTestnetAccount(publicKey);
	if (acct.funded === false) {
		// Even a dry-run needs this: a simulation from a non-existent account
		// fails before the contract runs. Testnet, free, idempotent.
		const fund = await fundViaFriendbot(publicKey);
		if (!fund.ok) {
			console.error(`  friendbot failed: ${fund.error}`);
			return 1;
		}
		console.log("  friendbot-funded the lane key");
	}
	const tx = await c.register({
		maintainer: publicKey,
		name: NAME,
		maintainers: [publicKey],
		url: TANSU_PROJECT_URL,
		ipfs: "",
		// The SDK requires every declared input to be PRESENT; the newer wasm
		// declares three Options. undefined = None = contract defaults. Extra keys
		// are ignored by the SDK, so this also fits the older 5-arg shape.
		min_voting_period: undefined,
		execute_delay: undefined,
		attestation_threshold: undefined,
	});
	const sim = assertSimulated(tx);
	console.log(
		`  simulated OK · resource fee ${sim.minResourceFee} stroops · 5 test XLM collateral leaves the lane key · project key ${key.toString("hex")}`,
	);
	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing submitted. Re-run with --execute.");
		return 0;
	}
	if (!keypair) {
		console.error("\n--execute needs TANSU_MAINTAINER_SECRET");
		return 2;
	}
	const sent = await tx.signAndSend();
	const hash = txHashOf(sent);
	console.log(
		`  submitted ${hash ? explorerTxUrl(hash) : "(no hash returned)"}`,
	);
	const back = await readProject(c, key);
	if (!back || back.name !== NAME) {
		console.error("READ-BACK FAILED: project not found after register");
		return 1;
	}
	console.log(`✓ read back: "${back.name}" · ${tansuProjectPageUrl(NAME)}`);
	return 0;
}

async function commit(): Promise<number> {
	if (!ROUND || !COMMIT_HASH.test(SHA)) {
		console.error(
			"usage: --commit --round=<slug> --sha=<40|64 lowercase hex> [--execute]",
		);
		return 2;
	}
	const key = tansuProjectKey(NAME);
	const { publicKey, keypair } = maintainer();
	const c = await tansuClient({
		publicKey,
		...(keypair
			? contract.basicNodeSigner(keypair, TANSU_NETWORK_PASSPHRASE)
			: {}),
	});
	const project = await readProject(c, key);
	if (!project) {
		console.error(
			`\n"${NAME}" is not registered on Tansu testnet — run --register first.`,
		);
		return 1;
	}
	if (!project.maintainers.includes(publicKey)) {
		console.error(
			`\n${publicKey} is not a maintainer of "${NAME}" (${project.maintainers.join(", ")})`,
		);
		return 1;
	}
	const current = await readCommit(c, key);
	console.log(
		`\ncommit ${SHA} for round ${ROUND} · latest on-chain ${current ?? "(none)"}`,
	);

	let txHash: string | null = null;
	if (current === SHA) {
		console.log("  already the latest hash on-chain — no transaction needed.");
	} else {
		const tx = await c.commit({
			maintainer: publicKey,
			project_key: key,
			hash: SHA,
		});
		const sim = assertSimulated(tx);
		console.log(`  simulated OK · resource fee ${sim.minResourceFee} stroops`);
		if (!EXECUTE) {
			console.log(
				"\nDRY RUN — nothing submitted, nothing recorded. Re-run with --execute.",
			);
			return 0;
		}
		if (!keypair) {
			console.error("\n--execute needs TANSU_MAINTAINER_SECRET");
			return 2;
		}
		const sent = await tx.signAndSend();
		txHash = txHashOf(sent);
		console.log(
			`  submitted ${txHash ? explorerTxUrl(txHash) : "(no hash returned)"}`,
		);
		const back = await readCommit(c, key);
		if (back !== SHA) {
			console.error(
				`READ-BACK FAILED: chain holds ${back ?? "(none)"}, expected ${SHA}`,
			);
			return 1;
		}
		console.log("✓ read back: chain holds the SHA");
	}
	if (!EXECUTE) {
		console.log(
			"\nDRY RUN — anchor record not written. Re-run with --execute.",
		);
		return 0;
	}

	// Record the anchor on the round so /api/awards/anchor can verify without
	// trusting this log. Loaded lazily: --status/--register need no DB.
	const { getPayload } = await import("payload");
	const { default: configPromise } = await import("../../src/payload.config");
	const payload = await getPayload({ config: configPromise });
	const rounds = await payload.find({
		collection: "award-rounds",
		where: { slug: { equals: ROUND } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const round = rounds.docs[0];
	if (!round) {
		console.error(
			`\nno round with slug "${ROUND}" — chain is committed, DB record NOT written`,
		);
		return 1;
	}
	const prior = (round.anchor ?? null) as AnchorRecord | null;
	if (prior?.commitSha === SHA && prior.txHash) {
		console.log(
			`✓ round already records this anchor (tx ${prior.txHash.slice(0, 8)}…)`,
		);
		return 0;
	}
	const record: AnchorRecord = {
		project: NAME,
		projectKey: key.toString("hex"),
		commitSha: SHA,
		txHash: txHash ?? prior?.txHash ?? null,
		at: new Date().toISOString(),
	};
	await payload.update({
		collection: "award-rounds",
		id: round.id,
		data: { anchor: record },
		overrideAccess: true,
	});
	const back = await payload.findByID({
		collection: "award-rounds",
		id: round.id,
		depth: 0,
		overrideAccess: true,
	});
	const got = (back.anchor ?? null) as AnchorRecord | null;
	if (got?.commitSha !== SHA) {
		console.error("READ-BACK FAILED: round.anchor does not hold the SHA");
		return 1;
	}
	console.log(
		`✓ read back: round ${ROUND} anchored → ${TANSU_PROJECT_URL}/commit/${SHA}`,
	);
	return 0;
}

async function main() {
	if (!ACTION) {
		console.error(
			"usage: --status | --register | --commit --round=<slug> --sha=<hex>   [--name=…] [--execute]",
		);
		return 2;
	}
	console.log(
		`\ntansu-anchor — ${ACTION} — ${EXECUTE ? "EXECUTE" : "DRY-RUN"} — testnet`,
	);
	return ACTION === "status"
		? status()
		: ACTION === "register"
			? register()
			: commit();
}

main()
	.then((c) => process.exit(c))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
