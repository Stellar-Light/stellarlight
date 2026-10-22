/**
 * Winners announced off DoraHacks for submissions the DoraHacks sync stores.
 * The sync is the one writer of a stored row's isWinner and writes only what
 * DoraHacks' winner assignments say; for an event whose winners DoraHacks
 * never assigned, a reviewed source names them here.
 *
 * Each winner is matched to its stored row by build id, read by a person
 * against the source, never by name. src/lib/hackathon-builds.ts applies
 * this when it reads a row (the builds index and a submission's detail), so
 * search, prior art, briefs, event pages and detail agree; nothing is
 * written to the store. A row DoraHacks itself placed keeps DoraHacks'
 * placement.
 */
export interface OverlayEvent {
	/** The DoraHacks event's uname. */
	hackathonSlug: string;
	/** The page that names the winners, served as each one's winnerSource. */
	url: string;
	/** getHackathon's stats.winnersNote while these winners are served: what
	 * the page says, when it was checked, and which named winners are not
	 * served. */
	note: string;
	/** Each named winner's stored build id, and its place as the page states
	 * it: "Winner" when the page names no place. */
	winners: Array<{ buildId: string; placement: string }>;
}

export const WINNER_OVERLAY: OverlayEvent[] = [
	{
		hackathonSlug: "alebrije2026",
		// BAF's newsletter, 2026-05-04, read 2026-10-22: Hack+ Alebrije's
		// winning projects were Mañana Seguro, Seyf and Gibbor, with no places
		// or tracks. Of the 28 stored submissions (DoraHacks counts 28), none
		// is named Seyf or mentions it in its write-up. SEYF
		// (dorahacks-buidl-46191) is an entry of stellar-pulso-hackathon; a win
		// at this event never goes on another event's entry.
		url: "https://bafs-newsletter.beehiiv.com/p/b-news-from-mexico-city-to-lima-this-month-s-web3-route",
		note: "Winners named by BAF's newsletter (2026-05-04), not by DoraHacks, which assigned none when checked on 2026-10-22: Mañana Seguro, Seyf and Gibbor, with no places. Mañana Seguro and Gibbor are served from their stored submissions, each with winnerSource. Seyf is not served: none of the event's 28 stored submissions carries that name, and the SEYF submission stored for stellar-pulso-hackathon is another event's entry, so it does not carry this win.",
		winners: [
			// MañanaSeguro
			{ buildId: "dorahacks-buidl-41505", placement: "Winner" },
			// GIBBOR
			{ buildId: "dorahacks-buidl-41502", placement: "Winner" },
		],
	},
];
