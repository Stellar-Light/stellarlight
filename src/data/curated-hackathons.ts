/**
 * Stellar hackathons and builder programs that do NOT run on DoraHacks, so
 * the DoraHacks feed can never see them: HackMeridian (Bizzabo), Rise In
 * programs, Luma-listed residencies. Hand-maintained; every row carries the
 * URL it was verified against. Shape mirrors DoraHacksHackathon so the
 * page, the API and the homepage section render them with the same code.
 *
 * Add a row when an event is announced; the status (upcoming / active /
 * ended) is derived from the dates at request time, never hand-set.
 * Verified 2026-08-17.
 */
import type { DoraHacksHackathon } from "@/lib/integrations/dorahacks";

const ts = (iso: string) => Math.floor(Date.parse(iso) / 1000);

export const CURATED_HACKATHONS: DoraHacksHackathon[] = [
	{
		id: -1001,
		title: "HackMeridian 2026",
		uname: "hackmeridian-2026",
		description:
			"The two-day hackathon before Meridian 2026 in Lisbon: developers, founders, designers and technical teams building on Stellar. Applications opened Aug 17, 2026; prize pool to be announced.",
		start_time: ts("2026-10-25T09:00:00+01:00"),
		end_time: ts("2026-10-26T17:00:00+01:00"),
		bonus_price: 0,
		hackers_count: 0,
		winner_announced: false,
		status: 1,
		field: "IRL,Meridian",
		ecosystem: "Stellar",
		organization: { id: 3096, name: "Stellar Development Foundation" },
		external_url: "https://meridian.stellar.org/hackmeridian",
		source: "curated",
	},
	{
		id: -1002,
		title: "Stellar Journey to Mastery: Monthly Builder Challenges",
		uname: "stellar-journey-to-mastery-2026",
		description:
			"Three months of online builder challenges with Rise In: a belt-progression builder track and a startup track (payments, stablecoins, RWAs, cross-border, wallets, AI + blockchain, anchors). $20,000 monthly prize pool.",
		start_time: ts("2026-05-31T00:00:00Z"),
		end_time: ts("2026-08-31T23:59:00Z"),
		bonus_price: 20000,
		hackers_count: 0,
		winner_announced: false,
		status: 1,
		field: "Online,Payments,Stablecoins,AI",
		ecosystem: "Stellar",
		organization: { id: -20, name: "Rise In" },
		external_url:
			"https://www.risein.com/programs/stellar-journey-to-mastery-monthly-builder-challenges",
		source: "curated",
	},
	{
		id: -1003,
		title: "APAC Stellar Hackathon",
		uname: "apac-stellar-hackathon-2026",
		description:
			"Rise In and SDF's Asia-Pacific hackathon for user-facing finance apps: payments, DeFi with real assets, local financial tools for Vietnam, Indonesia and the Philippines. Up to $60,000 in prizes; demo day at GCash, grand finale Jul 24, 2026.",
		start_time: ts("2026-05-13T00:00:00Z"),
		end_time: ts("2026-07-24T23:59:00Z"),
		bonus_price: 60000,
		hackers_count: 0,
		winner_announced: false,
		status: 2,
		field: "Payments,DeFi,APAC",
		ecosystem: "Stellar",
		organization: { id: -20, name: "Rise In" },
		external_url: "https://www.risein.com/programs/apac-stellar-hackathon",
		source: "curated",
	},
	{
		id: -1004,
		title: "Stellar Builders Camp, Jaipur",
		uname: "stellar-builders-camp-jaipur-2026",
		description:
			"Five-day builder residency with Rise In, SDF and Stellar India: payments, remittances, DeFi, identity, AI and tooling, aimed at SCF-ready projects. $2,000 in prizes. Registration has closed.",
		start_time: ts("2026-08-21T00:00:00+05:30"),
		end_time: ts("2026-08-25T23:59:00+05:30"),
		bonus_price: 2000,
		hackers_count: 0,
		winner_announced: false,
		status: 1,
		field: "IRL,Residency,India",
		ecosystem: "Stellar",
		organization: { id: -20, name: "Rise In" },
		external_url: "https://luma.com/ajcns4mc",
		source: "curated",
	},
	{
		id: -1005,
		title: "Build on Stellar Philippines Hackathon",
		uname: "build-on-stellar-philippines-2026",
		description:
			"Stellar PH and Rise In's national hackathon: 165 registrations, 32 submissions, 28 mainnet deployments; ₱60,000 in prizes. Winners: AbotPera, PinkRaft, Axial, Sobre, TyFi.",
		start_time: ts("2026-05-18T00:00:00+08:00"),
		end_time: ts("2026-05-24T23:59:00+08:00"),
		bonus_price: 0,
		hackers_count: 165,
		winner_announced: true,
		status: 2,
		field: "Payments,Philippines",
		ecosystem: "Stellar",
		organization: { id: -20, name: "Rise In" },
		external_url:
			"https://www.risein.com/programs/build-on-stellar-philippines-hackathon",
		source: "curated",
	},
	{
		id: -1006,
		title: "Stellar Builder Summit 2026",
		uname: "stellar-builder-summit-2026",
		description:
			"NearX's week-long team build sprint in São Paulo (about 100 builders): payments, tokenization, DeFi, contracts, AI, developer tools and confidential tokens, closing at Stellar House SP.",
		start_time: ts("2026-07-30T00:00:00-03:00"),
		end_time: ts("2026-08-06T23:59:00-03:00"),
		bonus_price: 0,
		hackers_count: 100,
		winner_announced: false,
		status: 2,
		field: "IRL,Brazil,Build sprint",
		ecosystem: "Stellar",
		organization: { id: 15761, name: "NearX" },
		external_url:
			"https://cointelegraph.com.br/news/brazil-hosts-global-stellar",
		source: "curated",
	},
];
