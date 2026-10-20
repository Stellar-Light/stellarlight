/**
 * Stellar hackathons and builder programs that do NOT run on DoraHacks, so
 * the DoraHacks feed can never see them: HackMeridian (Bizzabo), Rise In
 * programs, Luma-listed residencies. Hand-maintained; every row carries the
 * URL it was verified against. Shape mirrors DoraHacksHackathon so the
 * page, the API and the homepage section render them with the same code.
 *
 * Add a row when an event is announced; the status (upcoming / active /
 * ended) is derived from the dates at request time, never hand-set.
 * Verified 2026-08-17; HackMeridian rows 2026-10-20.
 */
import type { DoraHacksHackathon } from "@/lib/integrations/dorahacks";

/** Timestamps whose UTC date is not the date written. The API serves an
 * event's dates as UTC dates, so local midnight east of UTC, or late evening
 * west of it, shows a day off (Jaipur served 20 August for 21). A test keeps
 * this empty: write each row at a local time that stays on its date. */
export const TS_DATE_SHIFTS: string[] = [];

/** Whether a timestamp's UTC date differs from the date written in it. */
export function shiftsUtcDate(iso: string): boolean {
	const sec = Math.floor(Date.parse(iso) / 1000);
	return new Date(sec * 1000).toISOString().slice(0, 10) !== iso.slice(0, 10);
}

const ts = (iso: string) => {
	if (shiftsUtcDate(iso)) TS_DATE_SHIFTS.push(iso);
	return Math.floor(Date.parse(iso) / 1000);
};
/** The rows' timestamp helper, exported so a test can check it records. */
export { ts as curatedTimestamp };

export const CURATED_HACKATHONS: DoraHacksHackathon[] = [
	{
		id: -1001,
		title: "HackMeridian 2026",
		uname: "hackmeridian-2026",
		description:
			"Building on Stellar at Warehouse ONE16 in Marvila, Lisbon: check-in and hacking open at 09:00 on Sunday 25 October 2026, and hacking ends at 12:00 on Monday 26 October, the submission deadline (no late submissions). The organizer calls it 28 hours; its schedule gives 27. Two categories: Genesis takes a new idea or early prototype to a working MVP; Scale moves an existing product or advanced prototype toward production. Thematic tracks: Stellar Unlocked (new uses of Stellar's core protocol features) and Stellar Composed (two or more ecosystem tools or projects combined). This year's priorities are smart contracts, smart accounts and cross-chain transfers. No prior Stellar experience is needed, solo applicants are welcome and AI-assisted development is allowed. Up to $30,000 across 6 winners, set in USD and paid in XLM. Judging is an async review of the demo video, pitch deck, GitHub repo and submission answers: Genesis on problem clarity, MVP quality, Stellar integration and continued development potential; Scale on milestones against goals set at pre-event intake, SCF eligibility, production readiness and ecosystem impact. Finalists pitch live at the Meridian conference on 28 October (conference 28 to 29 October, Lisbon). Stellar engineers, technical mentors and product experts are on site with workshops and office hours; travel support goes to selected participants. Organized by Grow with Guava LLC (hackmeridian.com); apply at meridian.stellar.org/hackmeridian. The 2025 edition in Rio drew more than 400 builders and 110+ submissions (hackmeridian-2025).",
		// Lisbon leaves summer time at 01:00 UTC that Sunday, so 09:00 local is
		// UTC+0. The end is the 12:00 Monday submission deadline, as for
		// DoraHacks events; guests stay until 16:00.
		start_time: ts("2026-10-25T09:00:00+00:00"),
		end_time: ts("2026-10-26T12:00:00+00:00"),
		// The organizer's site, hackmeridian.com (Grow with Guava LLC; its Apply
		// button opens the same SDF registration, Bizzabo event 949257), checked
		// 2026-10-20 for hours, venue, categories, tracks, prize, judging and
		// support. SDF's own page gives only the dates, Lisbon and "two days".
		// Not the Winners Circle session page: its 36 hours and $50,000 are
		// HackMeridian 2024 (the video is titled "Meridian 2024").
		bonus_price: 30000,
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
		// The program ends 19 September; 31 August is when registration closes.
		end_time: ts("2026-09-19T23:59:00Z"),
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
			"Rise In and SDF's Asia-Pacific hackathon for user-facing finance apps: payments, DeFi with real assets, local financial tools for Vietnam, Indonesia and the Philippines. Up to $60,000 in prizes; final submissions July 15, a hybrid demo day July 18 and an in-person grand finale for the top teams from each country on July 24, 2026.",
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
		// Luma's times, India Standard Time.
		start_time: ts("2026-08-21T15:00:00+05:30"),
		end_time: ts("2026-08-25T14:00:00+05:30"),
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
		// Launch day 18 May (the page body; no time of day published), so a
		// daytime start: local midnight served 17 May.
		start_time: ts("2026-05-18T09:00:00+08:00"),
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
		end_time: ts("2026-08-06T18:00:00-03:00"),
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
	{
		id: -1007,
		title: "HackMeridian 2025",
		uname: "hackmeridian-2025",
		description:
			"The two-day hackathon before Meridian 2025 at the Copacabana Palace in Rio de Janeiro: more than 400 builders and 110+ submissions across two tracks, Open Innovation (56 projects) and Composability (35 teams building on each other's work), with six teams pitching on the mainstage. Open Innovation: The Simple Fund, 4Bridge, Stellar Forge. Composability: Lance, Star Lends, Panorama Block. It ran in the two days before the Meridian 2025 conference (17 to 18 September); SDF has not published the exact days, so the 15 to 16 September dates here are derived.",
		// SDF's recap, "Building the Future of Finance at Meridian 2025"
		// (2025-10-01), for every count and winner. The days are derived:
		// two days before Meridian 2025, which SDF's event page dates
		// 17 to 18 September 2025. Correct them from SDF's list.
		// Midday: only the (derived) days are claimed, not hours.
		start_time: ts("2025-09-15T12:00:00-03:00"),
		end_time: ts("2025-09-16T12:00:00-03:00"),
		bonus_price: 0,
		hackers_count: 400,
		winner_announced: true,
		status: 2,
		field: "IRL,Meridian",
		ecosystem: "Stellar",
		organization: { id: 3096, name: "Stellar Development Foundation" },
		external_url:
			"https://stellar.org/blog/foundation-news/the-blueprint-at-meridian-2025",
		source: "curated",
		kind: "hackathon",
	},
];
