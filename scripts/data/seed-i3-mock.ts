/**
 * Seed the MOCK i³ Awards round for design/wallet-flow testing.
 *
 *   pnpm exec tsx scripts/data/seed-i3-mock.ts             # dry-run (default)
 *   pnpm exec tsx scripts/data/seed-i3-mock.ts --execute   # write to the DB
 *   pnpm exec tsx scripts/data/seed-i3-mock.ts --execute --fund
 *                                    # …and friendbot-fund the mock voters
 *
 * Creates (idempotently):
 *   - award round  `i3-2026-test` (status: open, closes in 14 days)
 *   - 12 nominees — 4 per category, all REAL directory projects. Every slug
 *     is verified against the LIVE API before anything is written; a slug
 *     that doesn't resolve aborts the run (fail closed, no partial ballot).
 *   - 3 mock voters with freshly generated TESTNET keypairs. The SECRET
 *     keys are printed to the console ONCE for wallet testing (import into
 *     Freighter/xBull on testnet) and are stored NOWHERE. ⚠ TEST ONLY —
 *     these are throwaway testnet keys; never fund them on mainnet, never
 *     commit them anywhere.
 *
 * The real shortlist + ~98-address whitelist come from SDF later and will
 * replace this round's data via the admin (or a CSV import if volumes ask
 * for it). Deleting the mock = delete the round + its nominees/voters in
 * the admin, or just flip its status to draft.
 *
 * DB target follows the standard rule (feedback_run_prod_mutations_via_action):
 * local .env.local points wherever it points — run against prod ONLY via the
 * GitHub Action with repo secrets, dry-run first.
 */

import { Keypair } from "@stellar/stellar-sdk";
import { config as loadEnv } from "dotenv";
import { getPayload } from "payload";

loadEnv({ path: ".env.local" });

const { default: configPromise } = await import("../../src/payload.config");

const EXECUTE = process.argv.includes("--execute");
const FUND = process.argv.includes("--fund");

const LIVE_API = process.env.SCOUT_BASE || "https://stellarlight.xyz";
const FRIENDBOT = "https://friendbot.stellar.org";

const ROUND = {
	slug: "i3-2026-test",
	title: "i³ Awards 2026",
	status: "open" as const,
	ballotMode: "one-per-category" as const,
	categories: [
		{
			key: "impact",
			name: "Impact",
			tagline: "Real-world outcomes for real people",
		},
		{
			key: "innovation",
			name: "Innovation",
			tagline: "Pushing what's possible on Stellar",
		},
		{
			key: "interoperability",
			name: "Interoperability",
			tagline: "Bridging Stellar to the wider world",
		},
	],
	opensAt: new Date().toISOString(),
	closesAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
};

/** category key → [directory slug, why-nominated blurb][] */
const NOMINEES: Record<string, Array<[slug: string, blurb: string]>> = {
	impact: [
		[
			"decaf",
			"Cash-out without a bank account: Decaf moves remittances and USDC across nearly 200 countries via MoneyGram and partner ramps.",
		],
		[
			"beans",
			"A payments app so simple your family already knows how to use it — Beans puts Stellar rails behind everyday money.",
		],
		[
			"elsa",
			"Elsa brings dollar savings and everyday payments to markets where inflation eats paychecks.",
		],
		[
			"meru",
			"Meru gives LatAm freelancers and families a dollar account in their pocket, settled on Stellar.",
		],
	],
	innovation: [
		[
			"etherfuse",
			"Tokenized government bonds (CETES) on-chain — Etherfuse made real-world yield a Stellar primitive.",
		],
		[
			"blend",
			"Blend's isolated lending pools rewrote what DeFi credit looks like on Soroban.",
		],
		[
			"sorobanhooks",
			"Event-driven automation for Soroban contracts — SorobanHooks lets contracts react to the world.",
		],
		[
			"reflector",
			"Reflector became the ecosystem's canonical oracle — decentralized price feeds every Soroban protocol leans on.",
		],
	],
	interoperability: [
		[
			"defindex",
			"DeFindex turns whole DeFi strategies into a single integrable index any wallet can plug into.",
		],
		[
			"allbridge",
			"Allbridge connects Stellar liquidity to a dozen chains — value flows in, value flows out.",
		],
		[
			"usdc-swap",
			"USDC Swap makes cross-chain USDC movement feel like one network instead of five.",
		],
		[
			"rubic",
			"Rubic aggregates routes across 70+ chains and brought Stellar into the map.",
		],
	],
};

const MOCK_VOTER_COUNT = 3;

async function verifySlugLive(slug: string): Promise<boolean> {
	try {
		const res = await fetch(
			`${LIVE_API}/api/projects/search?q=${encodeURIComponent(slug)}&limit=10`,
			{ headers: { "User-Agent": "stellarlight-i3-seed" } },
		);
		if (!res.ok) return false;
		const body = (await res.json()) as {
			projects?: Array<{ slug?: string }>;
		};
		return (body.projects ?? []).some((p) => p.slug === slug);
	} catch {
		return false;
	}
}

async function main() {
	console.log(
		`i³ mock seed — ${EXECUTE ? "EXECUTE" : "DRY-RUN (pass --execute to write)"}\n`,
	);

	// ── 1. Verify every nominee slug against the LIVE directory API ────────
	const allSlugs = Object.values(NOMINEES).flatMap((list) =>
		list.map(([slug]) => slug),
	);
	console.log(
		`Verifying ${allSlugs.length} nominee slugs against ${LIVE_API} …`,
	);
	const missing: string[] = [];
	for (const slug of allSlugs) {
		const ok = await verifySlugLive(slug);
		console.log(`  ${ok ? "✓" : "✗"} ${slug}`);
		if (!ok) missing.push(slug);
	}
	if (missing.length > 0) {
		console.error(
			`\nABORT: ${missing.length} slug(s) did not resolve on the live API: ${missing.join(", ")}`,
		);
		process.exit(1);
	}

	// ── 2. Resolve local project IDs ────────────────────────────────────────
	const payload = await getPayload({ config: await configPromise });
	const projects = await payload.find({
		collection: "projects",
		where: { slug: { in: allSlugs } },
		limit: allSlugs.length,
		depth: 0,
		overrideAccess: true,
	});
	const idBySlug = new Map(
		projects.docs.map((p) => [String(p.slug), String(p.id)] as const),
	);
	const missingLocal = allSlugs.filter((s) => !idBySlug.has(s));
	if (missingLocal.length > 0) {
		console.error(
			`\nABORT: slug(s) missing from THIS database (is it in sync with prod?): ${missingLocal.join(", ")}`,
		);
		process.exit(1);
	}
	console.log(`\nAll ${allSlugs.length} slugs resolve locally too.`);

	// ── 3. Upsert the round ─────────────────────────────────────────────────
	const existingRound = await payload.find({
		collection: "award-rounds",
		where: { slug: { equals: ROUND.slug } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	let roundId = existingRound.docs[0] ? String(existingRound.docs[0].id) : null;
	if (roundId) {
		console.log(`\nRound "${ROUND.slug}" exists (${roundId}) — leaving as-is.`);
	} else if (EXECUTE) {
		const created = await payload.create({
			collection: "award-rounds",
			data: ROUND,
			overrideAccess: true,
		});
		roundId = String(created.id);
		console.log(`\nCreated round "${ROUND.slug}" (${roundId}).`);
	} else {
		console.log(
			`\nWould create round "${ROUND.slug}" (open now → closes ${ROUND.closesAt}).`,
		);
	}

	// ── 4. Nominees (skip ones already present) ─────────────────────────────
	const existingNominees = roundId
		? await payload.find({
				collection: "award-nominees",
				where: { round: { equals: roundId } },
				limit: 200,
				depth: 0,
				overrideAccess: true,
			})
		: { docs: [] as Array<{ category?: string; project?: unknown }> };
	const have = new Set(
		existingNominees.docs.map((n) => `${n.category}:${String(n.project)}`),
	);

	for (const [category, list] of Object.entries(NOMINEES)) {
		for (const [slug, blurb] of list) {
			const projectId = idBySlug.get(slug);
			if (!projectId) continue; // unreachable — verified above
			if (roundId && have.has(`${category}:${projectId}`)) {
				console.log(`  = nominee exists: ${category}/${slug}`);
				continue;
			}
			if (EXECUTE && roundId) {
				await payload.create({
					collection: "award-nominees",
					data: {
						round: roundId,
						category,
						project: projectId,
						customBlurb: blurb,
					},
					overrideAccess: true,
				});
				console.log(`  + nominee: ${category}/${slug}`);
			} else {
				console.log(`  ~ would create nominee: ${category}/${slug}`);
			}
		}
	}

	// ── 5. Mock voters ──────────────────────────────────────────────────────
	const existingVoters = roundId
		? await payload.find({
				collection: "award-voters",
				where: { round: { equals: roundId } },
				limit: 100,
				depth: 0,
				overrideAccess: true,
			})
		: { docs: [] as Array<{ address?: string }> };
	if (existingVoters.docs.length >= MOCK_VOTER_COUNT) {
		console.log(
			`\n${existingVoters.docs.length} voters already whitelisted — not adding more.`,
		);
		console.log(
			"(Secrets were only printed when they were created; re-run with a fresh round to mint new ones.)",
		);
	} else {
		const toCreate = MOCK_VOTER_COUNT - existingVoters.docs.length;
		console.log(`\nGenerating ${toCreate} TESTNET voter keypair(s)…`);
		console.log(
			"┌──────────────────────────────────────────────────────────────────┐",
		);
		console.log(
			"│ ⚠  TEST-ONLY TESTNET SECRETS — printed once, stored nowhere.      │",
		);
		console.log(
			"│    Import into Freighter/xBull (testnet) to exercise the flow.   │",
		);
		console.log(
			"│    NEVER commit these. NEVER use on mainnet.                     │",
		);
		console.log(
			"└──────────────────────────────────────────────────────────────────┘",
		);
		for (let i = 0; i < toCreate; i++) {
			const kp = Keypair.random();
			const label = `Mock pilot voter ${existingVoters.docs.length + i + 1}`;
			console.log(`\n  ${label}`);
			console.log(`    public : ${kp.publicKey()}`);
			console.log(`    secret : ${kp.secret()}   ← TEST ONLY`);
			if (EXECUTE && roundId) {
				await payload.create({
					collection: "award-voters",
					data: { round: roundId, address: kp.publicKey(), label },
					overrideAccess: true,
				});
				console.log("    ✓ whitelisted");
				if (FUND) {
					try {
						const res = await fetch(
							`${FRIENDBOT}/?addr=${encodeURIComponent(kp.publicKey())}`,
						);
						console.log(
							res.ok
								? "    ✓ funded via friendbot"
								: `    ✗ friendbot responded ${res.status} — fund manually`,
						);
					} catch {
						console.log("    ✗ friendbot unreachable — fund manually");
					}
				} else {
					console.log(
						"    (unfunded — pass --fund, or use the page's 'Fund on testnet' button)",
					);
				}
			} else {
				console.log("    ~ would whitelist (dry-run)");
			}
		}
	}

	console.log(
		`\nDone. ${EXECUTE ? "Visit /awards to see the ballot." : "Re-run with --execute to write."}`,
	);
	process.exit(0);
}

main().catch((err) => {
	console.error("seed failed:", err);
	process.exit(1);
});
