/**
 * Curated real-name overlay for builder profiles.
 *
 * Builder rows are derived from GitHub repo ownership, so a builder whose
 * `display_name` we never captured falls back to their bare handle (see
 * builders/route.ts: `display_name ?? github_username`). That makes them
 * UNFINDABLE by the name every human knows them by — e.g. a real user (or Raven)
 * asking "who is Tyler van der Hoeven" gets zero results even though he's in the
 * data as `kalepail`, because no field of his profile contains "Tyler".
 *
 * This overlay maps a GitHub handle → the person's real name (and optional short
 * bio), applied in the route ONLY when the stored profile is thin (display_name
 * absent / equal to the handle). The handle stays searchable AND the real name
 * becomes searchable, so both "kalepail" and "tyler van der hoeven" resolve.
 *
 * DISCIPLINE: only add an entry you can VERIFY (a widely-known identity, or one
 * corroborated by our own repo/project attribution) — this is a public directory
 * (feedback: verify before you advertise). Keep bios factual and minimal; the
 * profile's existing project attribution carries the detail.
 */
export interface BuilderNameOverride {
	/** The person's real name — becomes the searchable displayName. */
	name: string;
	/** Optional one-line factual bio (kept short; projects carry the rest). */
	bio?: string;
}

export const BUILDER_NAME_OVERRIDES: Record<string, BuilderNameOverride> = {
	// Verified: kalepail is Tyler van der Hoeven — longtime Stellar developer,
	// author of kalepail/stellar-raven (the SDF agent that consumes this very
	// API), and GitHub owner of Passkey Kit, Smart Account Kit, KALE & StellarAuth
	// (already attributed to this profile in our own builders data).
	kalepail: {
		name: "Tyler van der Hoeven",
		bio: "Independent Stellar developer (@kalepail); author of stellar-raven and builder of Passkey Kit, Smart Account Kit, KALE and StellarAuth.",
	},
};

/**
 * Apply the overlay to one builder row. The real name replaces a thin
 * displayName so the person is findable by name; the handle stays visible as
 * `githubUsername` (already returned + searched), so both "kalepail" and "tyler
 * van der hoeven" resolve to the same profile. No-op when the handle isn't
 * curated or the stored name is already richer than the handle (a real
 * curated/claimed DB name always wins).
 */
export function applyBuilderNameOverride(row: {
	githubUsername: string;
	displayName: string;
	bio: string | null;
}): { displayName: string; bio: string | null } {
	const ov = BUILDER_NAME_OVERRIDES[row.githubUsername];
	const thin =
		!row.displayName ||
		row.displayName.toLowerCase() === row.githubUsername.toLowerCase();
	if (!ov || !thin) return { displayName: row.displayName, bio: row.bio };
	return { displayName: ov.name, bio: row.bio ?? ov.bio ?? null };
}
