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

/**
 * Reverse lookup: a person-NAME query → the GitHub handle it curates, if any.
 * The builders collection is keyed by handle, and the code-derived-builder path
 * only triggers on handle-shaped queries — so without this, "tyler van der
 * hoeven" (a name, with spaces) never reaches the profile that IS Tyler. Matches
 * when every token of a curated name appears in the query (order-free, so both
 * "tyler van der hoeven" and "hoeven, tyler van der" resolve); requires ≥2 name
 * tokens so a bare first name ("tyler") never over-resolves.
 */
/**
 * Curated people whose name PARTIALLY matches the query — suggestions only.
 *
 * `handleForName` deliberately refuses to resolve a bare first name: "tyler"
 * could be any Tyler, and silently answering with one is a guess dressed as an
 * answer. But the demand log shows people really do type just "tyler", and the
 * old behaviour was to hand them a flat "no builders matched" — a stonewall
 * that hides the fact that we DO hold Tyler van der Hoeven under @kalepail.
 *
 * Refusing to guess and refusing to help are not the same thing. This returns
 * the candidates for an advisory to NAME, leaving the choice with the caller;
 * the row itself is still not returned, because we still don't know that's who
 * they meant.
 */
export function nameCandidatesFor(
	query: string,
): Array<{ handle: string; name: string }> {
	const q = query.toLowerCase().trim();
	if (q.length < 3) return [];
	// 4+ characters on BOTH sides. At 3 the particles inside real names —
	// "van", "der", "de", "bin" — become matchable tokens, and a bare "van"
	// would then suggest Tyler van der Hoeven to anyone who typed it. A
	// suggestion nobody asked for is noise, and noise is how an advisory gets
	// ignored.
	const qTokens = q.split(/\s+/).filter((t) => t.length >= 4);
	if (qTokens.length === 0) return [];
	const out: Array<{ handle: string; name: string }> = [];
	for (const [handle, ov] of Object.entries(BUILDER_NAME_OVERRIDES)) {
		const nameTokens = ov.name
			.toLowerCase()
			.split(/\s+/)
			.filter((t) => t.length >= 4);
		// Any meaningful token of the query matching any of the name — or the
		// handle itself — is enough to SUGGEST (never enough to answer).
		const hit =
			qTokens.some((t) => nameTokens.includes(t)) ||
			qTokens.some((t) => handle.toLowerCase() === t);
		if (hit) out.push({ handle, name: ov.name });
	}
	return out;
}

export function handleForName(query: string): string | null {
	const q = query.toLowerCase().trim();
	if (!q) return null;
	for (const [handle, ov] of Object.entries(BUILDER_NAME_OVERRIDES)) {
		const name = ov.name.toLowerCase();
		if (q === name) return handle;
		const toks = name.split(/\s+/).filter((t) => t.length > 1);
		if (toks.length >= 2 && toks.every((t) => q.includes(t))) return handle;
	}
	return null;
}
