/**
 * Submission-to-project links a person verified against named evidence: the
 * same repo, the team's own accounts, or the project's own page naming the
 * build. A name alone never makes one. The sync lane
 * (scripts/sync-hackathon-builds.ts, step 3), the one writer of a stored
 * row's project link, reads this list after its rules
 * (src/lib/hackathon-build-links.ts withCuratedLink): the record names the
 * project, and the link keeps the basis of a rule that finds that same
 * project, else it is served with basis `curated`. So a record also holds a
 * link a page rule would drop when a page is edited. Every row of the
 * submission links alike.
 *
 * Before adding one, search the directory for another row of the same
 * brand or GitHub organisation: a word shared with a row is not ownership.
 */
export interface CuratedBuildLink {
	/** The stored submission's build id. */
	buildId: string;
	/** The directory project it became. */
	projectSlug: string;
	/** What was read, and where, that names the link. */
	evidence: string;
	/** The day the evidence was read. */
	checkedOn: string;
}

export const CURATED_BUILD_LINKS: CuratedBuildLink[] = [
	{
		// Comet x Hoops Finance, 2nd Place, Stellar Hacks: Blend.
		buildId: "dorahacks-buidl-27417",
		projectSlug: "hoops",
		evidence:
			"The repo hoops-finance/cometswap sits under the project's GitHub organisation (its links.github) and is one of the repos the directory indexes for it; the submission's DoraHacks page lists the project's X account (x.com/hoops_finance) and a demo on comet.hoops.finance, a subdomain of the project's website. The directory row comet (cometdex) is the AMM the build swaps through, not its maker: it shares only the word.",
		checkedOn: "2026-11-24",
	},
	{
		// Juntta, Stellar Ideaton (telluscoop-ideaton), not a winner.
		buildId: "dorahacks-buidl-30931",
		projectSlug: "juntta",
		evidence:
			"The submission's DoraHacks page lists instagram.com/junttaperu and linkedin.com/company/juntta, the accounts the project's own website (juntta.org) links in its footer beside x.com/junttaperu, the directory's X account for it.",
		checkedOn: "2026-11-24",
	},
	{
		// YieldBack.Cash, 3rd Place, Stellar Hacks: Blend. Linked today by
		// scf-page-and-name; this record keeps it if that page changes.
		buildId: "dorahacks-buidl-27456",
		projectSlug: "yieldbackcash",
		evidence:
			"The project's SCF page (communityfund.stellar.org/project/yieldbackcash-enj) links this submission's DoraHacks page in its own siteUrls record.",
		checkedOn: "2026-11-24",
	},
	{
		// PayZoll_Stellar, First Place, Stellar Build Better Hackathon. Linked
		// today by submission-links-and-name.
		buildId: "dorahacks-buidl-25141",
		projectSlug: "payzoll",
		evidence:
			"The submission's DoraHacks page lists x.com/PayZoll, the project's X account in the directory and on its SCF page.",
		checkedOn: "2026-11-24",
	},
	{
		// clevercon, 2nd Place, Stellar Hacks: Agents. Linked today by
		// moved-repo.
		buildId: "dorahacks-buidl-42656",
		projectSlug: "clevercon",
		evidence:
			"GitHub redirects the submission's stored repo (a personal account's clevercon) to clevercon-protocol/clevercon, the repo the project lists as its GitHub link.",
		checkedOn: "2026-11-24",
	},
];
