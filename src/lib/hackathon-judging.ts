/**
 * An event's judging criteria, each mapped to the evidence a judge would find
 * in the team's repo, or to `checkable: false` with the reason. Evidence,
 * not a verdict: no score, no pass or fail. The criteria are data in the
 * event's curated record (held to its description by a test); the mapping
 * from a criterion to evidence is ours and lives here.
 */
import {
	CURATED_HACKATHONS,
	type CuratedHackathon,
} from "@/data/curated-hackathons";
import {
	type LiveRead,
	type LiveReadPart,
	type LiveRepoFacts,
	TEST_CONVENTIONS,
} from "@/lib/repo-live-read";
import type { ScfRoundState } from "@/lib/scf-rounds";

export const JUDGING_EVIDENCE_IDS = [
	"stellarPackages",
	"contractCrates",
	"contractIds",
	"testFiles",
	"ciConfig",
	"releases",
	"website",
	"demoLinks",
	"lastCommit",
	"scfRound",
] as const;
export type JudgingEvidenceId = (typeof JUDGING_EVIDENCE_IDS)[number];
type RepoEvidenceId = Exclude<JudgingEvidenceId, "scfRound">;

/** found = read and present; not-found = read and absent within what the
 * finding says was read; could-not-check = not read, never a no. */
export const EVIDENCE_STATES = [
	"found",
	"not-found",
	"could-not-check",
] as const;

export interface JudgingEvidence {
	id: JudgingEvidenceId;
	state: (typeof EVIDENCE_STATES)[number];
	finding: string;
	/** The cited values as written; [] when not found, null when not checked. */
	values: string[] | null;
	/** The total behind values when it is a sample or a count matters. */
	count: number | null;
}

export interface JudgedCriterion {
	criterion: string;
	checkable: boolean;
	/** Why it cannot be checked from the repo; null when checkable. */
	reason: string | null;
	/** null when not checkable. */
	evidence: JudgingEvidence[] | null;
}

export interface Judging {
	hackathon: { slug: string; title: string };
	source: string;
	checkedOn: string;
	categories: Array<{ category: string; criteria: JudgedCriterion[] }>;
}

const NOT_READ =
	"Judged from the pitch deck, demo video and submission answers, which Scout does not read.";

/** Each criterion's evidence, by the criterion's words in lower case. A test
 * holds every criterion of every judged event to an entry here. */
export const CRITERION_EVIDENCE: Record<
	string,
	{ evidence: JudgingEvidenceId[] } | { reason: string }
> = {
	"problem clarity": { reason: NOT_READ },
	"mvp quality": {
		evidence: [
			"testFiles",
			"ciConfig",
			"releases",
			"contractIds",
			"website",
			"demoLinks",
		],
	},
	"stellar integration": {
		evidence: ["stellarPackages", "contractCrates", "contractIds"],
	},
	"continued development potential": { evidence: ["lastCommit"] },
	"milestones against goals set at pre-event intake": {
		reason:
			"The goals are set with the organizer at pre-event intake and are not published, so Scout cannot read them or the progress against them.",
	},
	"scf eligibility": { evidence: ["scfRound"] },
	"production readiness": {
		evidence: [
			"testFiles",
			"ciConfig",
			"releases",
			"contractCrates",
			"contractIds",
			"website",
			"demoLinks",
		],
	},
	"ecosystem impact": {
		reason:
			"A judgment on the pitch and the project's place in the ecosystem, from the deck, video and submission answers, which Scout does not read.",
	},
};

/** The events whose criteria are held as data: what hackathon= accepts. */
export const JUDGED_EVENTS: CuratedHackathon[] = CURATED_HACKATHONS.filter(
	(h) => h.judging?.criteria?.length,
);
export const JUDGED_EVENT_SLUGS: string[] = JUDGED_EVENTS.map((h) => h.uname);

/** What the repo side of the review rests on: a live read, or why there is
 * none (no repo on the submission, a repo held for malware). */
export type RepoSource = LiveRead | { state: "none"; reason: string };

const list = (xs: string[], max = 5) =>
	xs.length > max
		? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more`
		: xs.join(", ");
const day = (iso: string | null) =>
	(iso ?? "").slice(0, 10) || "an unknown date";

type Found = (
	id: RepoEvidenceId,
	finding: string,
	values: string[],
	count?: number | null,
) => JudgingEvidence;
type NotFound = (id: RepoEvidenceId, finding: string) => JudgingEvidence;
type Unchecked = (id: RepoEvidenceId, finding: string) => JudgingEvidence;
interface Ctx {
	f: LiveRepoFacts;
	/** An unread part's own reason. */
	why: (part: LiveReadPart) => string;
	/** " Read at commit abc1234." for an item read from the repo's files. */
	at: string;
	found: Found;
	none: NotFound;
	unchecked: Unchecked;
}

/** Every repo evidence item from one source. */
export function repoEvidence(
	src: RepoSource,
): Record<RepoEvidenceId, JudgingEvidence> {
	const out = {} as Record<RepoEvidenceId, JudgingEvidence>;
	const ids = JUDGING_EVIDENCE_IDS.filter(
		(id): id is RepoEvidenceId => id !== "scfRound",
	);
	const unchecked = (id: RepoEvidenceId, finding: string): JudgingEvidence => ({
		id,
		state: "could-not-check",
		finding,
		values: null,
		count: null,
	});
	if (src.state !== "read") {
		const why =
			src.state === "none"
				? src.reason
				: src.state === "missing"
					? "GitHub answers 404 for the repo: it does not exist or is not public, and judges cannot open a private repo."
					: src.reason;
		for (const id of ids) out[id] = unchecked(id, why);
		return out;
	}
	const f = src.facts;
	const c: Ctx = {
		f,
		why: (part) => src.unreadWhy[part] ?? "Not read.",
		at: f.commit ? ` Read at commit ${f.commit.slice(0, 7)}.` : "",
		found: (id, finding, values, count = null) => ({
			id,
			state: "found",
			finding,
			values,
			count,
		}),
		none: (id, finding) => ({
			id,
			state: "not-found",
			finding,
			values: [],
			count: null,
		}),
		unchecked,
	};
	const { found, none, why, at } = c;
	const empty = "The repository is empty: GitHub reports no commits.";

	out.stellarPackages = stellarPackages(c);
	out.contractCrates = contractCrates(c);
	out.contractIds = contractIds(c);

	const t = f.tree;
	// A tree whose listing GitHub cut short, or whose submodules it does not
	// open, did not list every file: none found there is not a no. CI is
	// read off the listing alone (a submodule's workflows never run here).
	const partial = !!t && (!t.complete || !!t.submodules?.length);
	out.testFiles = !t
		? unchecked("testFiles", why("tree"))
		: f.empty
			? none("testFiles", empty)
			: t.testCount
				? found(
						"testFiles",
						`${partial ? "At least " : ""}${t.testCount} file(s) follow a test-naming convention, e.g. ${list(t.tests, 3)}. Conventions counted: ${TEST_CONVENTIONS}; a test named otherwise is not counted, and whether tests run or pass is not read.${at}`,
						t.tests,
						t.testCount,
					)
				: partial
					? unchecked(
							"testFiles",
							`No test file was among the files listed, and not every file was: ${why("tree")}`,
						)
					: none(
							"testFiles",
							`No file in the tree follows a test-naming convention (${TEST_CONVENTIONS}). Tests named otherwise, or written inside source files such as Rust #[cfg(test)] modules, are not seen.${at}`,
						);
	out.ciConfig = !t
		? unchecked("ciConfig", why("tree"))
		: f.empty
			? none("ciConfig", empty)
			: t.ci.length
				? found(
						"ciConfig",
						`${t.complete ? "" : "At least "}${t.ci.length} CI config file(s): ${list(t.ci)}${t.complete ? "" : " (GitHub cut the tree listing short)"}. Whether the jobs run or pass is not read.${at}`,
						t.ci,
						// A count over a cut-short listing is not a total.
						t.complete ? t.ci.length : null,
					)
				: !t.complete
					? unchecked(
							"ciConfig",
							"GitHub cut the tree listing short and no CI config was among the part listed.",
						)
					: none(
							"ciConfig",
							`No CI config in the tree (.github/workflows, .gitlab-ci.yml, .circleci, Travis, Azure Pipelines, Jenkinsfile or Bitbucket Pipelines).${at}`,
						);
	const r = f.releases;
	out.releases = !r
		? unchecked("releases", why("releases"))
		: f.empty
			? none("releases", empty)
			: r.count
				? found(
						"releases",
						`${r.count} GitHub release(s); the latest, ${r.latestTag ?? "untagged"}, published ${day(r.latestAt)}.`,
						r.latestTag ? [r.latestTag] : [],
						r.count,
					)
				: none(
						"releases",
						"No GitHub release is published (tags without a release are not read).",
					);
	// The website is the repo's own setting, read with its metadata: reported
	// as what it is, never as a demo (a library's docs site is a website).
	out.website = f.website
		? found(
				"website",
				`The repo's website field: ${f.website}. Not opened, so what it shows is not checked, nor whether it loads.`,
				[f.website],
			)
		: none("website", "The repo sets no website field.");
	out.demoLinks = demoLinks(c);
	const cm = f.commits;
	const archived = f.archived ? " The repo is archived on GitHub." : "";
	out.lastCommit = !cm
		? unchecked("lastCommit", why("commits"))
		: f.empty || !cm.count
			? none("lastCommit", empty)
			: found(
					"lastCommit",
					`${cm.count} commit(s) on ${f.defaultBranch}, the last on ${day(cm.lastAt)}; the repo was created on ${day(f.createdAt)}.${archived}`,
					cm.lastAt ? [cm.lastAt] : [],
					cm.count,
				);
	return out;
}

function stellarPackages({
	f,
	why,
	at,
	found,
	none,
	unchecked,
}: Ctx): JudgingEvidence {
	const m = f.manifests;
	if (!m) return unchecked("stellarPackages", why("manifests"));
	if (f.empty)
		return none(
			"stellarPackages",
			"The repository is empty: GitHub reports no commits.",
		);
	const values = [...m.packages, ...(m.otherSdk ? [m.otherSdk] : [])];
	const sdks = [
		m.sorobanSdk && `soroban-sdk ${m.sorobanSdk}`,
		m.stellarJsDep,
	].filter(Boolean);
	const [lang, file] = (m.otherSdk ?? "").split(":");
	const treePartial = !f.tree?.complete || !!f.tree?.submodules?.length;
	if (values.length)
		return found(
			"stellarPackages",
			`${m.unread ? `The ${m.read} of ${m.read + m.unread} manifests read declare` : "Declares"} ${values.length} Stellar package(s) Scout recognises: ${list(values, 8)}.${sdks.length ? ` SDK versions as declared: ${sdks.join(", ")}.` : ""}${m.otherSdk ? ` ${m.otherSdk}: a ${file} declares a Stellar SDK or library (${lang}).` : ""}${m.unread ? ` The ${m.unread} not read may declare more: ${why("manifests")}` : treePartial ? ` Not every file was listed, so there may be more: ${why("tree")}` : ""}${at}`,
			values,
			// Over a partial read the list is not the repo's total.
			m.unread || treePartial ? null : values.length,
		);
	if (m.unread || treePartial)
		return unchecked(
			"stellarPackages",
			`None of the ${m.read} manifest(s) read declares a package on Scout's Stellar list, but ${m.unread ? `not all were read: ${why("manifests")}` : `not every file was listed: ${why("tree")}`}`,
		);
	return none(
		"stellarPackages",
		m.read
			? `Its ${m.read} manifest(s) declare no package on Scout's Stellar list (the @stellar npm scope, soroban-sdk, the Stellar SDKs of other languages, Stellar Wallets Kit, passkey-kit and other ecosystem libraries). A package off that list is not seen.${at}`
			: `The tree holds no manifest Scout reads (package.json, Cargo.toml, go.mod, pyproject.toml, requirements.txt, pubspec.yaml and others), so no Stellar package is declared in one.${at}`,
	);
}

function contractCrates({
	f,
	why,
	at,
	found,
	none,
	unchecked,
}: Ctx): JudgingEvidence {
	const m = f.manifests;
	if (!m) return unchecked("contractCrates", why("manifests"));
	if (f.empty)
		return none(
			"contractCrates",
			"The repository is empty: GitHub reports no commits.",
		);
	const treePartial = !f.tree?.complete || !!f.tree?.submodules?.length;
	if (m.contractCrates.length)
		return found(
			"contractCrates",
			`${m.cargoUnread ? `In the ${m.cargoRead} of ${m.cargoRead + m.cargoUnread} Cargo.toml files read, ` : ""}${m.contractCrates.length} deployable Soroban contract crate(s) (soroban-sdk with crate-type cdylib): ${list(m.contractCrates)}${m.sorobanSdk ? `; soroban-sdk ${m.sorobanSdk} as declared` : ""}.${m.cargoUnread ? ` The ${m.cargoUnread} not read may hold more.` : treePartial ? ` Not every file was listed, so there may be more: ${why("tree")}` : ""} Whether they build or are deployed is not read here.${at}`,
			m.contractCrates,
			// Over a partial read the list is not the repo's total.
			m.cargoUnread || treePartial ? null : m.contractCrates.length,
		);
	if (m.cargoUnread || treePartial)
		return unchecked(
			"contractCrates",
			`No Cargo.toml read declares a deployable Soroban contract, but ${m.cargoUnread ? `${m.cargoUnread} Cargo.toml file(s) were not read: ${why("manifests")}` : `not every file was listed: ${why("tree")}`}`,
		);
	return none(
		"contractCrates",
		m.cargoRead
			? `None of its ${m.cargoRead} Cargo.toml file(s) declares a deployable Soroban contract (soroban-sdk with crate-type cdylib, outside the folders a product does not ship from: examples, tests, testdata, testing, fixtures, benches, integration and templates).${at}`
			: `No Cargo.toml in the tree, so no Soroban contract crate. A dapp that calls contracts deployed elsewhere has none.${at}`,
	);
}

function contractIds({
	f,
	why,
	at,
	found,
	none,
	unchecked,
}: Ctx): JudgingEvidence {
	if (f.empty)
		return none(
			"contractIds",
			"The repository is empty: GitHub reports no commits.",
		);
	const rd = f.readme;
	if (rd === undefined) return unchecked("contractIds", why("readme"));
	if (rd === null)
		return none(
			"contractIds",
			`No README at the repo root, so no contract id is named there.${at}`,
		);
	if (rd.contractIds.length)
		return found(
			"contractIds",
			`${rd.path} names ${rd.truncated ? `at least ${rd.contractIds.length} contract id(s) in the ${rd.chars.toLocaleString("en-US")} characters read` : `${rd.contractIds.length} contract id(s)`}: ${list(rd.contractIds, 3)}. Scout does not check them on chain or confirm they are this project's own (a README also names the token and pool contracts it uses).${at}`,
			rd.contractIds.slice(0, 5),
			// Over a cut-short README the count is not a total.
			rd.truncated ? null : rd.contractIds.length,
		);
	if (rd.truncated)
		return unchecked(
			"contractIds",
			`${rd.path} is longer than the ${rd.chars.toLocaleString("en-US")} characters read, and names no contract id in them.`,
		);
	return none(
		"contractIds",
		`${rd.path} names no contract id (a 56-character address starting with C).${at}`,
	);
}

/** The README links a judge is never pointed to as a demo. */
const LINK_SCOPE =
	"outside code hosts, docs, explorers, badges, chats, local addresses and HTML comments";

/** Links the README labels as a demo or live app: the website is its own
 * item. */
function demoLinks({
	f,
	why,
	at,
	found,
	none,
	unchecked,
}: Ctx): JudgingEvidence {
	const rd = f.readme;
	if (f.empty)
		return none(
			"demoLinks",
			"The repository is empty: GitHub reports no commits.",
		);
	if (rd === undefined) return unchecked("demoLinks", why("readme"));
	if (rd === null)
		return none(
			"demoLinks",
			`No README at the repo root, so no demo link is named there.${at}`,
		);
	if (rd.demoLinks.length)
		return found(
			"demoLinks",
			`In ${rd.path}, Scout reads ${rd.demoLinks.length} link(s) as labelled a demo or live app (words such as demo, live app, deployed, website): ${list(rd.demoLinks, 3)}. A link labelled in other words is not listed. Not opened, so whether they load is not checked.${at}`,
			rd.demoLinks,
			// The links found, not a count of every demo the repo has.
			null,
		);
	if (rd.otherLinks.length)
		return unchecked(
			"demoLinks",
			`Scout reads no demo or live-app label on ${rd.path}'s ${rd.otherLinks.length} link(s) ${LINK_SCOPE} (it reads words such as demo, live app, deployed, website); whether one of them is a demo is not judged: ${list(rd.otherLinks, 3)}.`,
		);
	if (rd.truncated)
		return unchecked(
			"demoLinks",
			`${rd.path} is longer than the ${rd.chars.toLocaleString("en-US")} characters read, and labels no demo in them.`,
		);
	return none("demoLinks", `${rd.path} links nothing ${LINK_SCOPE}.${at}`);
}

/** SCF eligibility from the live round state, the source scfPitch reads. */
export function scfEvidence(scf: ScfRoundState | null): JudgingEvidence {
	const rules =
		"Eligibility itself is SCF's call under its own rules (communityfund.stellar.org, the SCF Handbook); Scout's scf-prescreen-checker skill (getSkill) simulates the prescreen.";
	if (!scf)
		return {
			id: "scfRound",
			state: "could-not-check",
			finding: `The live SCF round state (communityfund.stellar.org) did not answer; check it there before relying on a round. ${rules}`,
			values: null,
			count: null,
		};
	const open = scf.roundsInProgress.filter((r) => /submission/i.test(r.phase));
	const say = (r: (typeof open)[number]) =>
		`Round ${r.round}: ${r.phase}${r.submissionDeadline ? `, deadline ${r.submissionDeadline}` : ""}`;
	if (open.length)
		return {
			id: "scfRound",
			state: "found",
			finding: `SCF is taking submissions: ${open.map(say).join("; ")} (read live from communityfund.stellar.org). ${rules}`,
			values: open.map(say),
			count: open.length,
		};
	const busy = scf.roundsInProgress.map(say);
	return {
		id: "scfRound",
		state: "not-found",
		finding: `No SCF round is taking submissions now${busy.length ? ` (in progress: ${busy.join("; ")})` : ""}; read live from communityfund.stellar.org. ${rules}`,
		values: [],
		count: null,
	};
}

/** The event's criteria, each with its evidence or the reason it has none. */
export function buildJudging(
	event: CuratedHackathon,
	repo: Record<RepoEvidenceId, JudgingEvidence>,
	scf: JudgingEvidence,
): Judging {
	const byId = { ...repo, scfRound: scf };
	return {
		hackathon: { slug: event.uname, title: event.title },
		source: event.judging?.source ?? "",
		checkedOn: event.judging?.checkedOn ?? "",
		categories: (event.judging?.criteria ?? []).map((c) => ({
			category: c.category,
			criteria: c.criteria.map((criterion) => {
				const rule = CRITERION_EVIDENCE[criterion.toLowerCase()];
				return rule && "evidence" in rule
					? {
							criterion,
							checkable: true,
							reason: null,
							evidence: rule.evidence.map((id) => byId[id]),
						}
					: {
							criterion,
							checkable: false,
							reason:
								rule?.reason ??
								"Scout holds no way to check this criterion from the repo.",
							evidence: null,
						};
			}),
		})),
	};
}
