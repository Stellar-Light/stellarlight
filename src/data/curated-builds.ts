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
		"Digital payments app built to work with little or no mobile data, for rural and remote areas.",
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
];
