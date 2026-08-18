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
			"The two-day hackathon before Meridian 2026 in Lisbon, open to developers of all experience levels building on Stellar. Venue, tracks and prize pool are still to be announced; the 2025 edition in Rio drew 500+ builders for $50,000 in XLM.",
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
		image_url:
			"https://cdn.sanity.io/images/e2r40yh6/production-i18n/4771a62228f9c6e297d71d2a006fa401416257d8-1200x630.jpg",
		source: "curated",
		kind: "hackathon",
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
		image_url:
			"https://files.risein.com/programs/_3zmz-cohort-1780031137050png",
		source: "curated",
		kind: "program",
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
		image_url:
			"https://files.risein.com/programs/co8um-cohort-1778746738617png",
		source: "curated",
		kind: "hackathon",
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
		image_url:
			"https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=cover,dpr=1,anim=false,background=white,quality=75,width=800,height=420/event-social/uf/71ddf351-c388-4ea1-82ca-fb4fc120dded.png",
		source: "curated",
		kind: "program",
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
		image_url:
			"https://files.risein.com/programs/ef4de-cohort-1778249785601png",
		source: "curated",
		kind: "hackathon",
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
		// No official event page and no organizer artwork we can point at — the
		// only public record is press coverage, so this row runs coverless.
		source: "curated",
		kind: "summit",
	},
];
