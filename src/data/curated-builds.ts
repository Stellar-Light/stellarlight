/**
 * Hackathon submissions from events that do not run on DoraHacks
 * (src/data/curated-hackathons.ts), so the sync lane can never read them.
 * scripts/import-curated-builds.ts stores them as hackathon builds, the one
 * writer of `curated-` rows, and every build surface (search, prior art,
 * briefs, event pages, submission detail) serves them like any other.
 *
 * Each row carries the URL it was verified against. A field the source does
 * not give stays null: no repo link without proof that it is the team's.
 */
import type {
	BuildContract,
	EntryBasis,
	EntryEvidence,
	MentionIn,
} from "@/lib/hackathon-build-links";
import hackproof from "./hackmeridian-2026-hackproof.json";

export interface CuratedBuild {
	/** curated-<event>-<name>: never a DoraHacks id. */
	id: string;
	name: string;
	/** A curated event's uname. */
	hackathonSlug: string;
	track: string | null;
	placement: string | null;
	isWinner: boolean;
	/** What the project does, from the source; null when it says nothing. */
	description: string | null;
	githubUrl: string | null;
	demoUrl: string | null;
	/** Where this row was verified. */
	url: string;
	/** On a row from a list kept off the organizer's (HACKPROOF_BUILDS):
	 * why it is stored, what that rests on, the contracts its repo cites
	 * that passed Scout's checks and when they were checked, and the file
	 * that names its placement. Absent on a winner from the page naming it. */
	entryBasis?: EntryBasis;
	entryEvidence?: EntryEvidence;
	contracts?: BuildContract[];
	contractsCheckedAt?: string;
	winnerSource?: string;
}

const RECAP_2025 =
	"https://stellar.org/blog/foundation-news/the-blueprint-at-meridian-2025";
// BitPinas, 2026-06-08: the five awarded teams of Stellar PH and Rise In's
// "Build the Future of Finance" hackathon, what each built, and no links or
// prize amounts. Read 2026-10-22.
const PH_2026 =
	"https://bitpinas.com/feature/stellar-rise-in-ph-hackathon-concludes/";
// Rise In's builder spotlight, 2026-09-01: Olio's track and place, and its
// site. The only APAC winner found published (read 2026-10-22).
const APAC_OLIO =
	"https://www.risein.com/blog/builder-spotlight-from-hackathon-curiosity-to-building-olio-on-stellar";
// Rise In's recap, 2026-09-30: the Stellar Pro Hackathon's seven winners,
// each one's track and place and what it built; it links no project. Read
// 2026-11-04.
const PRO_2026 =
	"https://www.risein.com/blog/stellar-pro-hackathon-153-builders-85-projects-and-a-path-to-enterprise";

/** A winner as its source names it: curated-<event>-<name> id. */
const winner = (
	hackathonSlug: string,
	url: string,
	name: string,
	placement: string,
	track: string | null,
	description: string | null,
	demoUrl: string | null = null,
): CuratedBuild => ({
	id: `curated-${hackathonSlug}-${name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")}`,
	name,
	hackathonSlug,
	track,
	placement,
	isWinner: true,
	description,
	githubUrl: null,
	demoUrl,
	url,
});

const winner2025 = (
	name: string,
	track: "Open Innovation" | "Composability",
	placement: "1st Place" | "2nd Place" | "3rd Place",
): CuratedBuild =>
	winner("hackmeridian-2025", RECAP_2025, name, placement, track, null);

const ph2026 = (name: string, placement: string, description: string) =>
	winner(
		"build-on-stellar-philippines-2026",
		PH_2026,
		name,
		placement,
		null,
		description,
	);

const pro2026 = (
	name: string,
	track: "Genesis Track" | "Scale Track",
	placement: string,
	description: string,
) =>
	winner(
		"stellar-pro-hackathon-istanbul-2026",
		PRO_2026,
		name,
		placement,
		track,
		description,
	);

export const CURATED_BUILDS: CuratedBuild[] = [
	// SDF's recap names the six winners and their places; it links no repos.
	winner2025("The Simple Fund", "Open Innovation", "1st Place"),
	winner2025("4Bridge", "Open Innovation", "2nd Place"),
	winner2025("Stellar Forge", "Open Innovation", "3rd Place"),
	winner2025("Lance", "Composability", "1st Place"),
	winner2025("Star Lends", "Composability", "2nd Place"),
	winner2025("Panorama Block", "Composability", "3rd Place"),
	// Places as BitPinas heads them; it names no tracks.
	ph2026(
		"AbotPera",
		"Champion",
		"Digital payments app built to work with little or no connectivity, for rural and remote areas without stable internet.",
	),
	ph2026(
		"PinkRaft",
		"1st Runner-Up",
		"AI-assisted tool that helps developers design payment architectures on Soroban.",
	),
	ph2026(
		"Axial",
		"2nd Runner-Up",
		"Liquidity and compliance engine for small businesses: capital from tokenized receivables, with tax and payroll contributions automated.",
	),
	ph2026(
		"Sobre",
		"Best Use of Stellar",
		"Envelope budgeting with stablecoins on Stellar, for transparent remittances by overseas Filipino workers.",
	),
	ph2026(
		"TyFi",
		"Best Use of Stellar",
		"Prototype for quick financial aid and credit alternatives for farm workers hit by natural disasters.",
	),
	// One track's winner; the other tracks' winners are not published
	// (apac-stellar-hackathon-2026's winnersNote says so).
	winner(
		"apac-stellar-hackathon-2026",
		APAC_OLIO,
		"Olio",
		"1st Place",
		"Payment & Consumer Application",
		"Confidential USDC payments app on Stellar.",
		"https://oliopay.xyz/",
	),
	// Places as the recap heads them, by track.
	pro2026(
		"Pera Wallet",
		"Genesis Track",
		"First Place",
		"Smart wallet that brings Turkish lira onto Stellar through a local anchor and converts it to USDC, puts idle funds in DeFindex vaults, and caps AI-agent spending with daily and weekly rules enforced on Soroban.",
	),
	pro2026(
		"Plink",
		"Genesis Track",
		"Second Place",
		"Crowdfunding payment links that deposit into a Soroban escrow contract, releasing funds only when conditions set before payment are met.",
	),
	pro2026(
		"StellarCard",
		"Genesis Track",
		"Third Place",
		"Payment infrastructure for AI agents linked to Stripe virtual cards, with Stellar smart contracts applying spending limits per transaction.",
	),
	pro2026(
		"Payper",
		"Genesis Track",
		"Fourth Place",
		"Invoice financing that hashes each invoice's ETTN on-chain so the same receivable cannot be financed twice, with real-time pricing for receivables.",
	),
	pro2026(
		"Pacta",
		"Scale Track",
		"First Place",
		"Escrow for medical-tourism payments: deposits held on Stellar, cancellation terms recorded before payment and refunds calculated openly, with clinics paid in Turkish lira through a SEP-6 anchor.",
	),
	pro2026(
		"Koul",
		"Scale Track",
		"Second Place",
		"Conditional execution engine: rules set in a Soroban contract run when a keeper finds their condition met, while funds stay in the user's smart account.",
	),
	pro2026(
		"Mono",
		"Scale Track",
		"Third Place",
		"Reliability scores for Stellar anchors from live tests: it finds active SEP-6 and SEP-24 anchors, checks their APIs and tests SEP-10 and SEP-24 deposit flows.",
	),
];

/** HackMeridian 2026's records from HackProof (MIT licensed; its notice is in
 * the data file), built by scripts/build-hackmeridian-2026-hackproof.ts: the
 * repos whose own text names the event, plus one HackProof lists as a
 * placement. Not the organizer's list. Each row's url is its HackProof
 * record at the pinned commit; a placed row's winnerSource is HackProof's
 * event file, and its placement is HackProof's. */
export const HACKPROOF_BUILDS: CuratedBuild[] = hackproof.rows.map((r) => ({
	id: `curated-${hackproof.event}-${r.file}`,
	name: r.name,
	hackathonSlug: hackproof.event,
	track: r.track,
	placement: r.placement,
	isWinner: r.placement !== null,
	description: r.description,
	githubUrl: `https://github.com/${r.repo}`,
	demoUrl: r.homepage,
	url: r.url,
	entryBasis: r.basis as EntryBasis,
	entryEvidence: {
		mention: r.mention && {
			in: r.mention.in as MentionIn,
			path: r.mention.path,
			readAt: hackproof.checkedAt.slice(0, 10),
		},
		listed: {
			tier: r.tier as EntryEvidence["listed"]["tier"],
			method: r.method,
			commitsInWindow: r.commitsInWindow,
		},
		repoCreatedAt: r.repoCreatedAt,
	},
	contracts: r.contracts.map((c) => ({
		id: c.id,
		network: "testnet" as const,
		createdAt: c.createdAt,
		path: c.path,
		checkedAt: hackproof.checkedAt,
	})),
	contractsCheckedAt: hackproof.checkedAt,
	...(r.placement ? { winnerSource: hackproof.source.awards } : {}),
}));
