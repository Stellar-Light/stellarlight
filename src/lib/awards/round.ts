/**
 * i³ Awards — round + nominee + whitelist loading (Payload local API).
 *
 * One loader shared by the /awards page and every /api/awards/* route so
 * the ballot the page renders and the ballot the relay validates are
 * always the same data. Nominee display fields (name, logo, description)
 * resolve LIVE from the projects directory record — the nominee row only
 * points; the directory speaks.
 */

import { getPayloadSafe } from "@/lib/payload-client";
import type { BallotNominee, BallotRound } from "./ballot";

export interface PublicNominee extends BallotNominee {
	/** Ballot blurb: customBlurb if set, else the project's shortDescription. */
	blurb: string | null;
	logoUrl: string | null;
	/** Directory detail page, e.g. /project/decaf. */
	projectUrl: string;
	projectCategory: string | null;
	/** Real, dated TVL from the directory (DeFiLlama-sourced) — null unless meaningful. */
	tvl: { usd: number; source: string | null; asOf: string | null } | null;
}

export interface LoadedRound {
	round: BallotRound & { title: string };
	nominees: PublicNominee[];
	/** Whitelisted voter addresses (SERVER-side only — never serve raw). */
	whitelist: Set<string>;
}

// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
function toBallotRound(doc: any): BallotRound & { title: string } {
	return {
		slug: String(doc.slug),
		title: String(doc.title ?? doc.slug),
		status: doc.status,
		ballotMode: String(doc.ballotMode ?? "one-per-category"),
		categories: (doc.categories ?? []).map(
			(c: { key: string; name: string; tagline?: string | null }) => ({
				key: c.key,
				name: c.name,
				tagline: c.tagline ?? null,
			}),
		),
		opensAt: doc.opensAt ?? null,
		closesAt: doc.closesAt ?? null,
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
 * Returns null when nothing exists (page shows its empty state).
 */
export async function loadRound(
	slug?: string | null,
): Promise<LoadedRound | null> {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	try {
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

		const [nomineeDocs, voterDocs] = await Promise.all([
			payload.find({
				collection: "award-nominees",
				where: { round: { equals: roundDoc.id } },
				// depth 2: nominee → project → logo (media doc), so cards can render
				// the directory logo without extra queries.
				depth: 2,
				limit: 100,
			}),
			payload.find({
				collection: "award-voters",
				where: { round: { equals: roundDoc.id } },
				depth: 0,
				limit: 500,
				overrideAccess: true,
			}),
		]);

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
					// Only surface TVL that's meaningful (> $1k) — filters out the
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
						logoUrl: projectLogoUrl(project),
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
	} catch {
		return null;
	}
}

/** Public projection of a loaded round — safe to serve as-is. */
export function toPublicRound(loaded: LoadedRound) {
	const { round, nominees } = loaded;
	return {
		round: {
			slug: round.slug,
			title: round.title,
			status: round.status,
			ballotMode: round.ballotMode,
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
