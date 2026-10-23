/**
 * Repos held for malware (src/lib/repo-security.ts), for the surfaces that
 * link a repo without being the repo index: a hackathon build stays served,
 * but a held repo's link is withheld from it and a warning rides along.
 *
 * The held names come from both stores the repo-security lane writes: repo
 * rows, and build rows whose repo is not in the index. They are cached for a
 * few minutes per server instance; a hold therefore reaches build reads
 * within that window of the lane writing it.
 */
import type { Payload } from "payload";

const TTL_MS = 5 * 60_000;
let cache: { at: number; names: Promise<Set<string>> } | null = null;

/** owner/name, lowercased, from a GitHub repo URL or an owner/name string;
 * null for anything else (an org page, a non-GitHub link). */
export function repoKeyOf(ref: unknown): string | null {
	if (typeof ref !== "string") return null;
	const m =
		/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:[/#?]|$)/i.exec(
			ref,
		) ?? /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(ref.trim());
	return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

/** Every held repo's key. The reads opt in to held rows, which also keeps
 * the builds afterRead hook from waiting on this very lookup. */
export function heldRepoNames(payload: Payload): Promise<Set<string>> {
	if (cache && Date.now() - cache.at < TTL_MS) return cache.names;
	const context = { includeSecurityHeld: true };
	const names = (async () => {
		const [repos, builds] = await Promise.all([
			payload.find({
				collection: "repos",
				where: { securityHeld: { equals: true } },
				select: { fullName: true },
				pagination: false,
				depth: 0,
				context,
			}),
			payload.find({
				collection: "hackathon-builds",
				where: { securityHeld: { equals: true } },
				select: { githubUrl: true },
				pagination: false,
				depth: 0,
				context,
			}),
		]);
		return new Set(
			[
				...repos.docs.map((d) => repoKeyOf(d.fullName)),
				...builds.docs.map((d) => repoKeyOf(d.githubUrl)),
			].filter((k): k is string => k !== null),
		);
	})();
	cache = { at: Date.now(), names };
	// A failed lookup is not kept: the next read asks again.
	names.catch(() => {
		cache = null;
	});
	return names;
}

/** What a held build serves in place of its links: Scout's words only. */
export const BUILD_HOLD = {
	held: true as const,
	note: "This submission's repo carried malware when last checked, so its GitHub link is withheld. Do not clone it, open it in VS Code or Cursor, or run npm install in it.",
};

/** `{ security }` when a served doc carries the hold warning, `{}`
 * otherwise: spread next to a withheld link so the reason rides with it. */
export function heldSecurity(doc: unknown): { security?: typeof BUILD_HOLD } {
	const s = (doc as { security?: { held?: unknown } } | null)?.security;
	return s?.held === true ? { security: BUILD_HOLD } : {};
}

/** A build doc as served: when its repo is held, the GitHub link and repo
 * names (where it was submitted and where it moved) are withheld and
 * `security` says why. Mutates and returns `doc`, as Payload's afterRead
 * hooks do. */
export function withholdHeldRepo<
	T extends {
		githubUrl?: string | null;
		repoFullName?: string | null;
		repoCurrentFullName?: string | null;
		securityHeld?: boolean | null;
	},
>(doc: T, held: Set<string>): T & { security?: typeof BUILD_HOLD } {
	const key = repoKeyOf(doc.githubUrl) ?? repoKeyOf(doc.repoFullName);
	if (doc.securityHeld !== true && !(key && held.has(key))) return doc;
	if ("githubUrl" in doc) doc.githubUrl = null;
	if ("repoFullName" in doc) doc.repoFullName = null;
	if ("repoCurrentFullName" in doc) doc.repoCurrentFullName = null;
	return Object.assign(doc, { security: BUILD_HOLD });
}
