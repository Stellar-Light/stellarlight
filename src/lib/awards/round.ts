/**
 * i³ Awards, round + nominee + whitelist loading (Payload local API).
 *
 * One loader shared by the /awards page and every /api/awards/* route so
 * the ballot the page renders and the ballot the relay validates are
 * always the same data. Nominee display fields (name, logo, description)
 * resolve LIVE from the projects directory record, the nominee row only
 * points; the directory speaks.
 */

import { getPayloadSafe } from "@/lib/payload-client";
import type { BallotNominee, BallotRound } from "./ballot";
import { AWARD_LOGO_OVERRIDES } from "./logo-overrides";

export interface PublicNominee extends BallotNominee {
	/** Ballot blurb: customBlurb if set, else the project's shortDescription. */
	blurb: string | null;
	logoUrl: string | null;
	/** Directory detail page, e.g. /project/decaf. */
	projectUrl: string;
	projectCategory: string | null;
	/** Real, dated TVL from the directory (DeFiLlama-sourced), null unless meaningful. */
	tvl: { usd: number; source: string | null; asOf: string | null } | null;
}

export interface LoadedRound {
	round: BallotRound & { title: string };
	nominees: PublicNominee[];
	/** Whitelisted voter addresses (SERVER-side only, never serve raw). */
	whitelist: Set<string>;
}

// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function toBallotRound(doc: any): BallotRound & { title: string } {
	return {
		slug: String(doc.slug),
		title: String(doc.title ?? doc.slug),
		status: doc.status,
		ballotMode: String(doc.ballotMode ?? "one-per-category"),
		picksPerCategory: Number(doc.picksPerCategory ?? 1) || 1,
		categories: (doc.categories ?? []).map(
			(c: { key: string; name: string; tagline?: string | null }) => ({
				key: c.key,
				name: c.name,
				tagline: c.tagline ?? null,
			}),
		),
		opensAt: doc.opensAt ?? null,
		closesAt: doc.closesAt ?? null,
		testMode: !!doc.testMode,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function projectLogoUrl(project: any): string | null {
	const logo = project?.logo;
	if (!logo || typeof logo === "string") return null;
	if (logo.url) return logo.url;
	if (logo.filename) return `/api/media/file/${logo.filename}`;
	return null;
}

/**
 * Load a round with nominees + whitelist.
 * - `slug` given → that round, any status (the page renders closed states).
 * - no slug → the open round; falls back to the most recently updated one.
 * Returns null when nothing exists; THROWS on a DB/Payload failure.
 */
export async function loadRoundOrThrow(
	slug?: string | null,
): Promise<LoadedRound | null> {
	const payload = await getPayloadSafe();
	if (!payload) throw new Error("Payload unavailable");
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	let roundDoc: any = null;
	if (slug) {
		const bySlug = await payload.find({
			collection: "award-rounds",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
		});
		roundDoc = bySlug.docs[0] ?? null;
	} else {
		const open = await payload.find({
			collection: "award-rounds",
			where: { status: { equals: "open" } },
			sort: "-updatedAt",
			limit: 1,
			depth: 0,
		});
		roundDoc = open.docs[0] ?? null;
		if (!roundDoc) {
			const latest = await payload.find({
				collection: "award-rounds",
				sort: "-updatedAt",
				limit: 1,
				depth: 0,
			});
			roundDoc = latest.docs[0] ?? null;
		}
	}
	if (!roundDoc) return null;

	// Paged, not capped. A fixed `limit` truncates in SILENCE: the 501st
	// whitelisted Pilot would simply not be in `whitelist`, so the relay would
	// refuse their ballot as "not on the voter list", they would not appear in
	// the turnout denominator, and nothing anywhere would say a row had been
	// dropped. Same for the 101st nominee, whose votes decodeAccountVotes would
	// then discard as a since-removed slug.
	const db = payload;
	const allPages = async (
		collection: "award-nominees" | "award-voters",
		depth: number,
	): Promise<unknown[]> => {
		const out: unknown[] = [];
		for (let page = 1; ; page++) {
			const res = await db.find({
				collection,
				where: { round: { equals: roundDoc.id } },
				depth,
				limit: 200,
				page,
				overrideAccess: true,
			});
			out.push(...res.docs);
			// A malformed page response must not spin forever.
			if (!res.hasNextPage || res.docs.length === 0) return out;
		}
	};

	const [nomineeRows, voterRows] = await Promise.all([
		// depth 2: nominee → project → logo (media doc), so cards can render
		// the directory logo without extra queries.
		allPages("award-nominees", 2),
		allPages("award-voters", 0),
	]);
	const nomineeDocs = { docs: nomineeRows };
	const voterDocs = { docs: voterRows };

	const round = toBallotRound(roundDoc);
	const categoryOrder = new Map(
		round.categories.map((c, i) => [c.key, i] as const),
	);

	const nominees: PublicNominee[] =
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		(nomineeDocs.docs as any[])
			.filter((n) => n.project && typeof n.project === "object")
			.map((n) => {
				const project = n.project;
				// Only surface TVL that's meaningful (> $1k), filters out the
				// near-zero mis-mapped values (etherfuse ~$2, allbridge ~$574).
				const tvlUSD =
					typeof project.tvlUSD === "number" ? project.tvlUSD : null;
				return {
					category: String(n.category),
					slug: String(project.slug),
					name: String(project.name ?? project.slug),
					blurb:
						(typeof n.customBlurb === "string" && n.customBlurb.trim()) ||
						project.shortDescription ||
						null,
					logoUrl:
						AWARD_LOGO_OVERRIDES[String(project.slug)] ??
						projectLogoUrl(project),
					projectUrl: `/project/${project.slug}`,
					projectCategory: project.category ?? null,
					tvl:
						tvlUSD && tvlUSD > 1000
							? {
									usd: tvlUSD,
									source: project.tvlSource ?? null,
									asOf: project.tvlAsOf ?? null,
								}
							: null,
				};
			})
			.sort(
				(a, b) =>
					(categoryOrder.get(a.category) ?? 99) -
						(categoryOrder.get(b.category) ?? 99) ||
					a.name.localeCompare(b.name),
			);

	const whitelist = new Set<string>(
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		(voterDocs.docs as any[])
			.map((v) =>
				String(v.address ?? "")
					.trim()
					.toUpperCase(),
			)
			.filter(Boolean),
	);

	return { round, nominees, whitelist };
}

/**
 * Request-path wrapper: null on ANY failure so pages render their empty
 * state. Scripts use loadRoundOrThrow, a swallowed DB error must not read
 * as "no round" in a lane (award-reconcile run 35106331010 did exactly that).
 */
export async function loadRound(
	slug?: string | null,
): Promise<LoadedRound | null> {
	try {
		return await loadRoundOrThrow(slug);
	} catch {
		return null;
	}
}

/**
 * The same load, keeping "no such round" and "could not read" apart. A
 * route that folds the two into 404 tells a Pilot mid-vote that the round
 * does not exist when the database merely blinked; the page then shows
 * "the stage is being set" over a live round. Verified 2026-09-24: two of
 * ten simultaneous voters hit exactly that on one Atlas reset.
 */
export async function loadRoundResult(
	slug?: string | null,
): Promise<
	{ ok: true; loaded: LoadedRound | null } | { ok: false; error: string }
> {
	try {
		return { ok: true, loaded: await loadRoundOrThrow(slug) };
	} catch (err) {
		return { ok: false, error: String(err) };
	}
}

/** Public projection of a loaded round, safe to serve as-is. */
export function toPublicRound(loaded: LoadedRound) {
	const { round, nominees } = loaded;
	return {
		round: {
			slug: round.slug,
			title: round.title,
			status: round.status,
			ballotMode: round.ballotMode,
			picksPerCategory: round.picksPerCategory ?? 1,
			categories: round.categories,
			opensAt: round.opensAt ?? null,
			closesAt: round.closesAt ?? null,
		},
		nominees: nominees.map((n) => ({
			category: n.category,
			slug: n.slug,
			name: n.name,
			blurb: n.blurb,
			logoUrl: n.logoUrl,
			projectUrl: n.projectUrl,
			projectCategory: n.projectCategory,
			tvl: n.tvl,
		})),
	};
}
