/**
 * Seed the Stellar Builder Summit SP 26 bounty winners (São Paulo,
 * 2026-07-30 → 08-07, DoraHacks event `stellar-builder-summit-2026`) into
 * the directory, from the owner-provided paid-winners export (2026-08-28).
 *
 * Dispositions, encoded per row and reviewable here rather than inferred:
 *  - NEW project rows for the 10 distinct build artifacts. Status is
 *    Development (fresh bounty builds, not launched products), basis
 *    official-record (the event's paid-winner record; public anchor = the
 *    event page), asOf = the payout date. Types stay EMPTY — typing is a
 *    human lane, and a bounty title is a track, not a product type.
 *  - ATTACH-ONLY for two submissions by teams that already have directory
 *    rows and submitted under their own org/product umbrella: ACTA's
 *    brazil-regional-kit and Trustless-Work's privacy-poc + latam-ramp-kit
 *    become repos on the existing rows, not new rows.
 *  - The 5 content-bounty winners (videos, no repos) are NOT projects and
 *    are skipped, listed in the output for the record.
 *
 * Every row links the hackathon relation + placement/prize/track (the
 * schema's hackathon group, first real use). Dry-run by default; --execute
 * writes, each write read back.
 *
 *   pnpm exec tsx scripts/data/seed-summit-sp-winners.ts [--execute]
 */
import "../load-env";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const EVENT_SLUG = "stellar-builder-summit-2026";
const ASOF = "2026-08-13"; // payout date in the export
const SOURCE_NOTE =
	"Stellar Builder Summit SP 26 paid-winner record (owner export 2026-08-28)";

interface NewRow {
	slug: string;
	name: string;
	shortDescription: string;
	repo: { owner: string; name: string };
	placement: "1st" | "2nd";
	prizeUsd: number;
	track: string;
	team: string;
}

const NEW_ROWS: NewRow[] = [
	{
		// `stellarpay` slug is TAKEN by an unrelated Live project — suffix by
		// the track so the identity stays distinct.
		slug: "stellarpay-x402",
		name: "StellarPay (x402)",
		shortDescription:
			"Agentic-payments build from the Stellar Builder Summit SP 26 (x402/MPP bounty, 1st place) by coderipper.",
		repo: { owner: "yripper", name: "stellarpay" },
		placement: "1st",
		prizeUsd: 1000,
		track: "Agentic Payments (x402 / MPP)",
		team: "coderipper",
	},
	{
		slug: "sextant-agent",
		name: "Sextant",
		shortDescription:
			"Agentic-payments build from the Stellar Builder Summit SP 26 (x402/MPP bounty, 2nd place) by El Guri.",
		repo: { owner: "pedro-pelicioni", name: "sextant" },
		placement: "2nd",
		prizeUsd: 750,
		track: "Agentic Payments (x402 / MPP)",
		team: "El Guri",
	},
	{
		slug: "stellar-memory",
		name: "Stellar Memory",
		shortDescription:
			"CLI plugin for agents from the Stellar Builder Summit SP 26 (1st place) by Raiz Protocol.",
		repo: { owner: "duraznito16", name: "stellar-memory" },
		placement: "1st",
		prizeUsd: 750,
		track: "CLI Plugins for Agents",
		team: "Raiz Protocol",
	},
	{
		slug: "teji",
		name: "Teji",
		shortDescription:
			"CLI plugin for agents from the Stellar Builder Summit SP 26 (2nd place) by Always Cooking.",
		repo: { owner: "salazarsebas", name: "teji" },
		placement: "2nd",
		prizeUsd: 500,
		track: "CLI Plugins for Agents",
		team: "Always Cooking",
	},
	{
		slug: "openzeppelin-stellar-privacy-wallet",
		name: "OpenZeppelin Stellar Privacy Wallet",
		shortDescription:
			"Confidential-token / private-payment wallet build from the Stellar Builder Summit SP 26 (1st place) by coderipper.",
		repo: { owner: "yripper", name: "openzeppelin-stellar-privacy-wallet" },
		placement: "1st",
		prizeUsd: 1250,
		track: "Confidential-Token & Private-Payment Wallets",
		team: "coderipper",
	},
	{
		slug: "stellar-confidential-token-sdk",
		name: "Stellar Confidential Token SDK",
		shortDescription:
			"Confidential-token SDK build from the Stellar Builder Summit SP 26 (2nd place) by aguilar1x.",
		repo: { owner: "aguilar1x", name: "stellar-confidential-token-sdk" },
		placement: "2nd",
		prizeUsd: 750,
		track: "Confidential-Token & Private-Payment Wallets",
		team: "aguilar1x",
	},
	{
		slug: "truway-yield",
		name: "Truway",
		shortDescription:
			"Brazil-first emerging-market yield build from the Stellar Builder Summit SP 26 (1st place).",
		repo: { owner: "jairoamayac", name: "yield-bounty" },
		placement: "1st",
		prizeUsd: 750,
		track: "Emerging-Market Yield, Brazil-first",
		team: "Truway",
	},
	{
		slug: "energypay-tesouro-yield",
		name: "EnergyPay Tesouro Yield",
		shortDescription:
			"Brazil-first emerging-market yield build from the Stellar Builder Summit SP 26 (2nd place) by Fenix.",
		repo: { owner: "beto-rocha-blockchain", name: "energypay-tesouro-yield" },
		placement: "2nd",
		prizeUsd: 500,
		track: "Emerging-Market Yield, Brazil-first",
		team: "Fenix",
	},
	{
		slug: "quietbook",
		name: "QuietBook",
		shortDescription:
			"Enterprise, compliance and RWA build from the Stellar Builder Summit SP 26 (1st place) by Kaptan_web3.",
		repo: { owner: "karagozemin", name: "QuietBook" },
		placement: "1st",
		prizeUsd: 1000,
		track: "Enterprise, Compliance and RWA",
		team: "Kaptan_web3",
	},
];

/** Submissions by teams with existing rows, under their own umbrella:
 * the repo attaches to the row; no new identity is minted. */
const ATTACH: Array<{
	projectSlug: string;
	repo: { owner: string; name: string };
	note: string;
}> = [
	{
		projectSlug: "acta",
		repo: { owner: "ACTA-Team", name: "brazil-regional-kit" },
		note: "Brazil Ramps & Regional Kits, 1st place ($1000) — Summit SP 26",
	},
	{
		projectSlug: "trustless-work",
		repo: { owner: "armandocodecr", name: "latam-ramp-kit" },
		note: "Brazil Ramps & Regional Kits, 2nd place ($750, team TrustlessWork) — Summit SP 26",
	},
	{
		projectSlug: "trustless-work",
		repo: { owner: "Trustless-Work", name: "privacy-poc" },
		note: "Enterprise, Compliance and RWA, 2nd place ($500, team Green Road) — Summit SP 26",
	},
];

/** Content-bounty winners (no repos): recorded here so the skip is a
 * decision, not an omission. */
const CONTENT_WINNERS = [
	"ChatPay Go Labs — Concept Explainer/Tutorial Video, 1st ($100)",
	"FASIS — Concept Explainer/Tutorial Video, 2nd ($100)",
	"FACUNDO MAXIMILIANO ASIS — Stellar vs. (other chain) Video, 1st ($100)",
	"FASIS — Why I Build Here, 1st ($100)",
	"Block Girls — Why I Build Here, 2nd ($100)",
];

// biome-ignore lint/suspicious/noExplicitAny: minimal doc shapes
type Doc = Record<string, any>;

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`seed-summit-sp-winners — ${EXECUTE ? "EXECUTE (writes + read-backs)" : "DRY RUN"}\n`,
	);
	console.log(`content-bounty winners (not projects, skipped by design):`);
	for (const c of CONTENT_WINNERS) console.log(`  · ${c}`);

	let event = (
		await payload.find({
			collection: "hackathons",
			where: { slug: { equals: EVENT_SLUG } },
			limit: 1,
			depth: 0,
		})
	).docs[0] as Doc | undefined;
	if (!event) {
		// The summit lives only in src/data/curated-hackathons.ts (the /hackathons
		// page merges that static list with DoraHacks); the relationship field
		// needs a real DB row, so create it from the curated entry's facts.
		const data = {
			name: "Stellar Builder Summit 2026",
			slug: EVENT_SLUG,
			description:
				"NearX's week-long team build sprint in São Paulo (about 100 builders): payments, tokenization, DeFi, contracts, AI, developer tools and confidential tokens, closing at Stellar House SP.",
			startDate: "2026-07-30",
			endDate: "2026-08-06",
			externalUrl:
				"https://cointelegraph.com.br/news/brazil-hosts-global-stellar",
			status: "completed",
		};
		if (EXECUTE) {
			event = (await payload.create({
				collection: "hackathons",
				data,
			})) as Doc;
			console.log(`\ncreated hackathon row ${EVENT_SLUG} (${event.id})`);
		} else {
			console.log(`\nDRY: would create hackathon row ${EVENT_SLUG}`);
			event = { ...data, id: "(dry-run)" };
		}
	}
	const eventUrl = String(event.externalUrl ?? "");
	console.log(`\nevent: ${event.name} (${event.id}) · ${eventUrl}`);

	let created = 0;
	let attached = 0;
	let skipped = 0;
	const failed: string[] = [];

	for (const r of NEW_ROWS) {
		const existing = await payload.find({
			collection: "projects",
			where: { slug: { equals: r.slug } },
			limit: 1,
			depth: 0,
		});
		if (existing.docs.length > 0) {
			console.log(`  skip   ${r.slug} (row already exists)`);
			skipped++;
			continue;
		}
		console.log(
			`  create ${r.slug.padEnd(36)} ${r.placement} · $${r.prizeUsd} · ${r.track}`,
		);
		if (!EXECUTE) continue;
		try {
			const doc = await payload.create({
				collection: "projects",
				data: {
					name: r.name,
					slug: r.slug,
					category: "Protocol/Contract",
					shortDescription: r.shortDescription,
					status: "Development",
					// The Development label is carried from the summit's paid-winners
					// export, not from probing the project — source-inherited is the
					// honest enum fit ("official-record" is not a statusBasis value).
					statusBasis: "source-inherited",
					statusAsOf: ASOF,
					statusSourceUrl: eventUrl || null,
					links: { github: `https://github.com/${r.repo.owner}/${r.repo.name}` },
					github: { repos: [{ owner: r.repo.owner, name: r.repo.name }] },
					hackathon: event.id,
					hackathonStatus: "Built",
					hackathonPlacement: r.placement,
					hackathonPrize: r.prizeUsd,
					hackathonPrizeTrack: r.track,
					provenance: {
						source: "AdminEdit",
						sourceId: `summit-sp-26:${r.team}`,
						firstSeenAt: ASOF,
					},
				},
			});
			const back = (await payload.findByID({
				collection: "projects",
				id: doc.id,
				depth: 0,
				select: { slug: true, hackathonPlacement: true },
			})) as Doc;
			if (back.slug !== r.slug || back.hackathonPlacement !== r.placement)
				throw new Error("read-back mismatch");
			created++;
		} catch (err) {
			failed.push(r.slug);
			console.error(`  ✗ ${r.slug}: ${(err as Error).message}`);
		}
	}

	for (const a of ATTACH) {
		const row = (
			await payload.find({
				collection: "projects",
				where: { slug: { equals: a.projectSlug } },
				limit: 1,
				depth: 0,
			})
		).docs[0] as Doc | undefined;
		if (!row) {
			console.log(`  ✗ attach target ${a.projectSlug} not found`);
			failed.push(a.projectSlug);
			continue;
		}
		const repos: Array<{ owner: string; name: string }> = Array.isArray(
			row.github?.repos,
		)
			? row.github.repos.map((x: Doc) => ({ owner: x.owner, name: x.name }))
			: [];
		if (
			repos.some(
				(x) =>
					x.owner?.toLowerCase() === a.repo.owner.toLowerCase() &&
					x.name?.toLowerCase() === a.repo.name.toLowerCase(),
			)
		) {
			console.log(`  skip   ${a.projectSlug} already carries ${a.repo.owner}/${a.repo.name}`);
			skipped++;
			continue;
		}
		console.log(
			`  attach ${a.projectSlug.padEnd(20)} += ${a.repo.owner}/${a.repo.name} (${a.note})`,
		);
		if (!EXECUTE) continue;
		try {
			await payload.update({
				collection: "projects",
				id: row.id,
				data: { github: { ...row.github, repos: [...repos, a.repo] } },
			});
			const back = (await payload.findByID({
				collection: "projects",
				id: row.id,
				depth: 0,
				select: { github: true },
			})) as Doc;
			if (
				!(back.github?.repos ?? []).some(
					(x: Doc) => x.name?.toLowerCase() === a.repo.name.toLowerCase(),
				)
			)
				throw new Error("read-back: repo not persisted");
			attached++;
		} catch (err) {
			failed.push(a.projectSlug);
			console.error(`  ✗ ${a.projectSlug}: ${(err as Error).message}`);
		}
	}

	console.log(
		`\nDONE. created ${EXECUTE ? created : `(dry) ${NEW_ROWS.length}`} · attached ${EXECUTE ? attached : `(dry) ${ATTACH.length}`} · skipped ${skipped} · failed ${failed.length}`,
	);
	if (failed.length) process.exitCode = 1;
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((err) => {
		console.error("FATAL:", err);
		process.exit(1);
	});
