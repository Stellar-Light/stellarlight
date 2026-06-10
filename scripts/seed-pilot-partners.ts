/**
 * Seed the Partner Connector pilot cohort.
 *
 *   pnpm exec tsx scripts/seed-pilot-partners.ts          # create as drafts
 *   pnpm exec tsx scripts/seed-pilot-partners.ts --publish # also publish
 *
 * Creates skeleton profiles for the three pilot partners Anke named:
 * DeFindex (Palta Labs), Etherfuse, Trustless Work. We seed ONLY facts
 * we can state plainly — name, type, sector, a one-line description,
 * GitHub org. Every subjective field (pricing, capacity, SLA, exact
 * services) is left EMPTY on purpose: that's what the partner fills in
 * via the chatbot onboarding. Seeding fabricated specifics would be
 * putting words in their mouth.
 *
 * Idempotent: skips a partner whose slug already exists, so re-running is
 * safe. Status defaults to "draft" — a real profile only goes public
 * after the partner confirms it and an admin publishes.
 *
 * Each gets a temporary login (email + a random password printed once).
 * Share the credentials with the partner out-of-band; they reset on
 * first login.
 */

import { config as loadEnv } from "dotenv";
import { randomBytes } from "node:crypto";
import { getPayload } from "payload";
import config from "@payload-config";

// Next.js reads .env.local; tsx scripts must load it explicitly.
loadEnv({ path: ".env.local" });

const PUBLISH = process.argv.includes("--publish");

const PILOT = [
	{
		name: "DeFindex",
		slug: "defindex",
		email: "defindex@partners.stellarlight.xyz",
		partnerType: "protocol",
		sectors: ["defi"],
		description:
			"DeFi yield aggregator / index protocol on Soroban, built by Palta Labs.",
		githubOrg: "paltalabs",
	},
	{
		name: "Etherfuse",
		slug: "etherfuse",
		email: "etherfuse@partners.stellarlight.xyz",
		partnerType: "infrastructure",
		sectors: ["stablecoins", "rwa"],
		description:
			"Stablecoin and tokenized-asset infrastructure (local-currency stablecoins and on-chain savings instruments).",
		githubOrg: "etherfuse",
	},
	{
		name: "Trustless Work",
		slug: "trustless-work",
		email: "trustless-work@partners.stellarlight.xyz",
		partnerType: "infrastructure",
		sectors: ["payments"],
		description:
			"Smart-escrow infrastructure on Stellar — escrow-as-a-service for marketplaces and payment flows.",
		githubOrg: "Trustless-Work",
	},
];

async function main() {
	const payload = await getPayload({ config });
	console.log(`Seeding ${PILOT.length} pilot partners (${PUBLISH ? "published" : "draft"})\n`);

	for (const p of PILOT) {
		const existing = await payload.find({
			collection: "partners",
			where: { slug: { equals: p.slug } },
			limit: 1,
			depth: 0,
		});
		if (existing.docs.length > 0) {
			console.log(`  · ${p.name} (${p.slug}) — already exists, skipping`);
			continue;
		}

		const password = randomBytes(12).toString("base64url");
		await payload.create({
			collection: "partners",
			data: {
				email: p.email,
				password,
				name: p.name,
				slug: p.slug,
				partnerType: p.partnerType as never,
				sectors: p.sectors as never,
				description: p.description,
				githubOrg: p.githubOrg,
				status: PUBLISH ? "published" : "draft",
			},
		});
		console.log(`  ✓ ${p.name} (${p.slug})`);
		console.log(`      login: ${p.email}`);
		console.log(`      temp password: ${password}`);
	}

	console.log(
		"\nDone. Share each partner's login out-of-band; they fill the rest via the chatbot.",
	);
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
