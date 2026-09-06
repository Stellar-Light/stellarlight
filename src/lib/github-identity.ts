/**
 * One reader for "what GitHub owner is this?", because the field it guards is
 * filled by people.
 *
 * `github.orgLogin` is a GitHub *login* — the thing that goes after
 * github.com/. The public intake form accepts free text, so 27 rows arrived
 * holding something else: a full submission URL
 * ("https://github.com/kratikavyas/DropPay"), an owner/repo pair
 * ("krit-k7/MediVault"), another forge's host ("gitlab.com", "bitbucket.org"),
 * a Google Docs link, and two with stray whitespace or a comma-joined pair.
 * Every downstream reader rejects those, so the repos were never discovered and
 * the API served a hostname where a login belongs.
 *
 * A host that is not github.com is not a bad login to be repaired — it is an
 * absence of one, and it resolves to null. The project's own link fields are
 * where a GitLab or Bitbucket URL belongs.
 */

/** GitHub's rule: alphanumeric or single hyphens, no leading/trailing hyphen,
 *  39 characters max. Deliberately stricter than the crawl-side VALID_IDENT,
 *  which also admits "." and "_" so it can pass repo NAMES. */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

/** First-segment paths that are GitHub's own, never an owner. */
const RESERVED = new Set([
	"orgs",
	"sponsors",
	"marketplace",
	"settings",
	"topics",
	"search",
	"about",
	"features",
	"pricing",
	"apps",
	"collections",
	"login",
	"join",
	"explore",
	"notifications",
	"new",
]);

export interface GithubIdentity {
	/** A valid GitHub login, or null when the input names no GitHub owner. */
	orgLogin: string | null;
	/** Set only when the input named one specific repository. */
	repo: { owner: string; name: string } | null;
}

const EMPTY: GithubIdentity = { orgLogin: null, repo: null };

/**
 * Read a GitHub owner (and repo, when named) out of whatever a human typed.
 * Never throws; anything unrecognised is an honest null rather than a guess.
 */
export function parseGithubIdentity(raw: unknown): GithubIdentity {
	if (typeof raw !== "string") return EMPTY;
	const s = raw.trim();
	if (!s) return EMPTY;

	// A bare login is the common, correct case.
	if (LOGIN.test(s) && !RESERVED.has(s.toLowerCase()))
		return { orgLogin: s, repo: null };

	// Otherwise it must be a github.com path to mean anything. Strip scheme and
	// www, then require the host — "gitlab.com/foo" names no GitHub owner.
	const path = s
		.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "")
		.replace(/^www\./i, "")
		.replace(/^git@github\.com:/i, "github.com/");
	const m = /^(?:github\.com\/)?([^/?#\s]+)(?:\/([^/?#\s]+))?/.exec(path);
	if (!m) return EMPTY;
	// Without an explicit github.com host, only accept the owner/repo shape —
	// a bare "gitlab.com" would otherwise read as the owner "gitlab.com".
	const hosted = /^github\.com\//i.test(path);
	if (!hosted && !m[2]) return EMPTY;

	const owner = m[1];
	if (!LOGIN.test(owner) || RESERVED.has(owner.toLowerCase())) return EMPTY;

	const name = m[2]?.replace(/\.git$/i, "");
	// Repo names allow "." and "_"; reject anything else so a trailing /tree or
	// a query fragment never becomes a repository.
	const repo =
		name && /^[A-Za-z0-9._-]+$/.test(name) && name !== "." && name !== ".."
			? { owner, name }
			: null;
	return { orgLogin: owner, repo };
}
