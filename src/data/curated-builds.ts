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

const winner2025 = (
	name: string,
	track: "Open Innovation" | "Composability",
	placement: "1st Place" | "2nd Place" | "3rd Place",
): CuratedBuild => ({
	id: `curated-hackmeridian-2025-${name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")}`,
	name,
	hackathonSlug: "hackmeridian-2025",
	track,
	placement,
	isWinner: true,
	description: null,
	githubUrl: null,
	demoUrl: null,
	url: RECAP_2025,
});

export const CURATED_BUILDS: CuratedBuild[] = [
	// SDF's recap names the six winners and their places; it links no repos.
	winner2025("The Simple Fund", "Open Innovation", "1st Place"),
	winner2025("4Bridge", "Open Innovation", "2nd Place"),
	winner2025("Stellar Forge", "Open Innovation", "3rd Place"),
	winner2025("Lance", "Composability", "1st Place"),
	winner2025("Star Lends", "Composability", "2nd Place"),
	winner2025("Panorama Block", "Composability", "3rd Place"),
];
