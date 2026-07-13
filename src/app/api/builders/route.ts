/**
 * Public read-only Stellar builders endpoint.
 *
 *   GET /api/builders
 *   GET /api/builders?q=soroban
 *   GET /api/builders?location=Lagos
 *
 * Returns curated Stellar builder profiles (synced from Stellar Passport).
 * Used by the Stellar Scout SKILL.md so AI agents can answer
 * teammate-matching questions like "show me Stellar devs in Lagos who've
 * worked on Soroban".
 */

import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { clampLimit } from "@/lib/http-params";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface BuilderProject {
	name: string;
	slug?: string;
	short_description?: string;
	status?: string;
}

/** sls-041: WHY a row matched the skill query — candidate discovery is a TEXT
 * match over profile/project prose, and consumers must be able to tell a
 * strong repository-backed match from a weak bio mention without re-running
 * the investigation. */
interface BuilderMatch {
	/** Profile fields the query matched (e.g. "bio", "roleTitle", "projects.name"). */
	matchedFields: string[];
	/** Projects whose name/description matched the query. */
	matchedProjects: Array<{ name: string; slug: string | null }>;
	/** Per query token, the literal term that hit (a token can match via a
	 * synonym — e.g. "payments" hitting via "remittance"). */
	matchedTerms: Record<string, string>;
	/** What this match IS: free-text profile evidence, not verified experience. */
	basis: "profile-text";
}

/** sls-041: indexed repository evidence for the query, kept SEPARATE from the
 * subjective profile text — the repo, its language and last activity are
 * observable facts; bio/role claims are not. */
interface BuilderCodeEvidence {
	fullName: string;
	url: string | null;
	primaryLanguage: string | null;
	stars: number;
	lastCommitAt: string | null;
	repoScore: number;
}

interface BuilderRow {
	githubUsername: string;
	displayName: string;
	bio: string | null;
	roleTitle: string | null;
	location: string | null;
	websiteUrl: string | null;
	twitterHandle: string | null;
	avatarUrl: string | null;
	// `scfTier` REMOVED in spec 1.7.19 (sls-040 / #521): the source field was
	// never populated (116/116 live profiles empty), so the always-blank value
	// contradicted the documented "SCF-tier data unsupported" contract. Person-
	// level SCF tier, if it ever gets a real source, returns as a typed,
	// documented field — not a blank placeholder.
	isFeatured: boolean;
	projectCount: number;
	projects: BuilderProject[];
	url: string;
	/** null when the request had no q/skill filter. */
	match: BuilderMatch | null;
	/** Indexed repos owned by this GitHub account that match the query; [] =
	 * no direct code evidence in our index (an explicitly weaker match), null
	 * when the request had no q/skill filter. */
	codeEvidence: BuilderCodeEvidence[] | null;
}

// Region umbrella → the free-text country values builder profiles actually
// carry. Directory coverage note (sls-010): Argentina/Mexico/Peru/Venezuela
// currently have zero profiles — a Passport-sync gap, not a filter bug —
// but they stay in the maps so profiles match as soon as they exist.
const REGION_LOCATIONS: Record<string, string[]> = {
	latam: [
		"brazil",
		"mexico",
		"argentina",
		"colombia",
		"chile",
		"peru",
		"costa rica",
		"venezuela",
		"ecuador",
		"uruguay",
		"bolivia",
		"guatemala",
	],
	"latin america": [
		"brazil",
		"mexico",
		"argentina",
		"colombia",
		"chile",
		"peru",
		"costa rica",
		"venezuela",
		"ecuador",
		"uruguay",
		"bolivia",
		"guatemala",
	],
	africa: [
		"nigeria",
		"kenya",
		"ghana",
		"south africa",
		"uganda",
		"tanzania",
		"egypt",
		"morocco",
		"rwanda",
	],
	asia: [
		"india",
		"philippines",
		"indonesia",
		"vietnam",
		"singapore",
		"japan",
		"korea",
		"thailand",
		"pakistan",
		"bangladesh",
	],
	europe: [
		"germany",
		"france",
		"spain",
		"portugal",
		"italy",
		"united kingdom",
		"uk",
		"netherlands",
		"poland",
		"ukraine",
		"switzerland",
	],
};

// sls-010: the `q` filter was strict-literal substring, so a payments-relevant
// profile ("boleto/PIX infra", "remittances") didn't match q="payments". Expand
// each query token to a small set of high-precision synonyms + a plural/singular
// stem, then match if ANY expanded form is present — so concepts match by
// meaning, not exact spelling. Mirrors the synonym expansion projects-search has.
const BUILDER_SYNONYMS: Record<string, string[]> = {
	payments: [
		"payment",
		"remittance",
		"remittances",
		"boleto",
		"pix",
		"pagamento",
		"checkout",
		"cross-border",
	],
	payment: ["payments", "remittance", "boleto", "pix"],
	defi: [
		"decentralized finance",
		"lending",
		"amm",
		"dex",
		"yield",
		"liquidity",
	],
	wallet: ["wallets", "custody", "custodial", "self-custody"],
	audit: ["audits", "auditing", "security", "formal verification"],
	oracle: ["oracles", "price feed", "pricefeed", "price-feed"],
	rwa: [
		"real world asset",
		"real-world asset",
		"tokenization",
		"tokenized",
		"tokenize",
	],
	stablecoin: ["stablecoins", "stable coin", "usdc", "eurc"],
	anchor: ["anchors", "on-ramp", "off-ramp", "on/off-ramp", "sep-24", "sep-6"],
	nft: ["nfts", "non-fungible"],
	soroban: ["smart contract", "smart contracts", "rust contract"],
	ai: ["agent", "agents", "agentic", "llm"],
	identity: ["kyc", "did", "credential", "verifiable credential"],
};
function expandBuilderTerm(t: string): string[] {
	const out = new Set<string>([t]);
	// plural/singular stem (payments↔payment, wallets↔wallet)
	if (t.length > 3 && t.endsWith("s")) out.add(t.slice(0, -1));
	else if (t.length > 2) out.add(`${t}s`);
	for (const s of BUILDER_SYNONYMS[t] ?? []) out.add(s);
	return [...out];
}

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	// `skill`/`tech` alias `q` — the free-text filter below already searches
	// bio + role + projects, which is exactly "find a builder who's done X".
	// Agents commonly pass the tech under `skill`; without this it was dropped.
	const q = (sp.get("q") ?? sp.get("skill") ?? sp.get("tech"))
		?.toLowerCase()
		.trim();
	const location = sp.get("location");
	const limit = clampLimit(sp.get("limit"), 50, 200);
	const offset = Math.max(Number(sp.get("offset") || "0") || 0, 0);

	const payload = await getPayloadSafe();
	let builders: BuilderRow[] = [];
	let totalMatching = 0;

	if (payload) {
		try {
			// biome-ignore lint/suspicious/noExplicitAny: Payload Where type is awkward
			const where: any = {
				visibility: { not_equals: "hidden" },
			};
			if (location) {
				// Region umbrellas → country vocabulary (sls-010): profile locations
				// are free-text country/city strings, so "Latin America" matched
				// nothing even with 18 LatAm profiles present. Mirror of the
				// region synonyms /api/projects/search ships.
				// F1: common non-English country spellings normalize before matching
				// (free-text profile locations store the English form).
				const LOCATION_ALIASES: Record<string, string> = {
					"south america": "latam", // F2: umbrella alias (audit: honest-0 miss)
					"central america": "latam",
					brasil: "brazil",
					méxico: "mexico",
					españa: "spain",
					deutschland: "germany",
				};
				const locNorm =
					LOCATION_ALIASES[location.trim().toLowerCase()] ??
					location.trim().toLowerCase();
				const regionCountries = REGION_LOCATIONS[locNorm];
				if (regionCountries) {
					where.or = regionCountries.map((c) => ({ location: { like: c } }));
				} else {
					where.location = { like: locNorm };
				}
			}

			const result = await payload.find({
				collection: "builders",
				where,
				limit: 300,
				depth: 0,
				sort: "-is_featured",
			});

			builders = (
				result.docs as Array<{
					github_username: string;
					display_name?: string;
					bio?: string;
					role_title?: string;
					location?: string;
					website_url?: string;
					twitter_handle?: string;
					avatar_url?: string;
					is_featured?: boolean;
					projects?: BuilderProject[];
				}>
			).map((b) => ({
				githubUsername: b.github_username,
				displayName: b.display_name ?? b.github_username,
				bio: b.bio ?? null,
				roleTitle: b.role_title ?? null,
				location: b.location ?? null,
				websiteUrl: b.website_url ?? null,
				twitterHandle: b.twitter_handle ?? null,
				avatarUrl: b.avatar_url ?? null,
				isFeatured: !!b.is_featured,
				projectCount: (b.projects ?? []).length,
				projects: b.projects ?? [],
				url: `https://stellarlight.xyz/builders/${b.github_username}`,
				match: null,
				codeEvidence: null,
			}));

			// Free-text filter across bio + role + projects — done in-memory so
			// we don't need full-text indexes in the DB. sls-041: while filtering,
			// record WHERE each token hit (field + literal term + project) so a
			// row carries its own match provenance instead of presenting a bio
			// mention as if it were verified experience.
			if (q) {
				const tokens = q.split(/\s+/).filter(Boolean);
				builders = builders.filter((b) => {
					const fields: Array<[field: string, text: string]> = [
						// F1: githubUsername is the record's primary key — q must match it
						["githubUsername", b.githubUsername],
						["displayName", b.displayName],
						["bio", b.bio ?? ""],
						["roleTitle", b.roleTitle ?? ""],
						["location", b.location ?? ""],
					];
					const projectTexts = (b.projects ?? []).map(
						(p) =>
							[p, `${p.name} ${p.short_description ?? ""}`.toLowerCase()] as [
								BuilderProject,
								string,
							],
					);
					const matchedFields = new Set<string>();
					const matchedProjects = new Map<string, string | null>();
					const matchedTerms: Record<string, string> = {};
					// Each concept must be present (AND across tokens), but a token
					// matches via any of its synonyms/stems (sls-010) — so
					// "payments" also hits a "boleto/PIX/remittance" bio.
					for (const t of tokens) {
						let tokenHit = false;
						for (const v of expandBuilderTerm(t)) {
							for (const [field, text] of fields) {
								if (text.toLowerCase().includes(v)) {
									matchedFields.add(field);
									if (!tokenHit) matchedTerms[t] = v;
									tokenHit = true;
								}
							}
							for (const [p, text] of projectTexts) {
								if (text.includes(v)) {
									matchedFields.add("projects");
									matchedProjects.set(p.name, p.slug ?? null);
									if (!tokenHit) matchedTerms[t] = v;
									tokenHit = true;
								}
							}
						}
						if (!tokenHit) return false;
					}
					b.match = {
						matchedFields: [...matchedFields],
						matchedProjects: [...matchedProjects.entries()].map(
							([name, slug]) => ({ name, slug }),
						),
						matchedTerms,
						basis: "profile-text",
					};
					return true;
				});
			}

			totalMatching = builders.length;
			builders = builders.slice(offset, offset + limit);

			// sls-041: repository-backed evidence, fetched ONLY for the returned
			// page — indexed repos owned by each builder's GitHub account that
			// match the query. Kept separate from the profile-text match: the
			// repo/language/last-commit are observable facts, the bio is a claim.
			// Best-effort — rows ship with codeEvidence: [] on any error, which
			// itself is signal ("no direct code evidence in the index").
			if (q && builders.length) {
				const tokens = q.split(/\s+/).filter(Boolean);
				for (const b of builders) b.codeEvidence = [];
				try {
					const byOwner = new Map(
						builders.map((b) => [b.githubUsername.toLowerCase(), b]),
					);
					const rres = await payload.find({
						collection: "repos",
						where: { owner: { in: builders.map((b) => b.githubUsername) } },
						limit: 300,
						depth: 0,
						select: {
							fullName: true,
							owner: true,
							url: true,
							description: true,
							topics: true,
							primaryLanguage: true,
							stars: true,
							lastCommitAt: true,
							repoScore: true,
						},
					});
					for (const d of rres.docs as unknown as Array<
						Record<string, unknown>
					>) {
						const ownerKey = String(d.owner ?? "").toLowerCase();
						const holder = byOwner.get(ownerKey);
						if (!holder?.codeEvidence) continue;
						const hay = [
							d.fullName,
							d.description,
							Array.isArray(d.topics) ? (d.topics as unknown[]).join(" ") : "",
							d.primaryLanguage,
						]
							.map((x) => String(x ?? ""))
							.join(" ")
							.toLowerCase();
						const hits = tokens.some((t) =>
							expandBuilderTerm(t).some((v) => hay.includes(v)),
						);
						if (!hits || holder.codeEvidence.length >= 5) continue;
						holder.codeEvidence.push({
							fullName: String(d.fullName ?? ""),
							url: (d.url as string) ?? null,
							primaryLanguage: (d.primaryLanguage as string) ?? null,
							stars: typeof d.stars === "number" ? d.stars : 0,
							lastCommitAt: (d.lastCommitAt as string) ?? null,
							repoScore: typeof d.repoScore === "number" ? d.repoScore : 0,
						});
					}
				} catch {
					// best-effort — codeEvidence stays [] on error
				}
			}
		} catch {
			// fall through
		}
	}

	logApiHit({
		req,
		endpoint: "/api/builders",
		query: q,
		filters: { location, limit },
	});

	// Distinguish "collection is empty / unseeded" from "this filter matched
	// nothing". The advisory must NOT claim the directory is empty when the
	// collection actually has builders and the query just filtered them all out
	// — agents relay this copy verbatim, so the wrong branch is a false
	// statement about the ecosystem. Gate on the real collection size.
	let collectionTotal = totalMatching;
	if (payload && totalMatching === 0) {
		try {
			const c = await payload.count({
				collection: "builders",
				where: { visibility: { not_equals: "hidden" } },
			});
			collectionTotal = c.totalDocs;
		} catch {
			// keep collectionTotal as-is on a count failure
		}
	}

	const builderChannels = [
		{
			name: "Stellar Discord — Looking for Collaborators",
			url: "https://discord.gg/stellardev",
			why: "The active channel where Stellar devs post 'looking for X' calls",
		},
		{
			name: "GitHub topic:stellar",
			url: "https://github.com/topics/stellar",
			why: "Browse repos by Stellar dev contributions",
		},
	];

	const builderAdvisory =
		totalMatching > 0
			? undefined
			: collectionTotal === 0
				? {
						summary:
							"The /api/builders directory is currently empty — Stellar Passport sync is queued but hasn't seeded the collection yet. Treat this as a known data gap, not a finding about the Stellar builder community. For teammate-matching today, point the user at GitHub-Stellar topic searches and the Stellar Discord #looking-for-collaborator channel.",
						channels: builderChannels,
					}
				: {
						summary: `No builders matched this query. The directory has ${collectionTotal} builder profiles, but none match these filters — broaden or drop a filter (q / location / skill). This is a filter miss, not an empty or unseeded directory.`,
						channels: builderChannels,
					};

	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/builders",
				generatedAt: new Date().toISOString(),
				filters: { q, location, limit, offset },
				counts: { returned: builders.length, total: totalMatching },
				// sls-041: what a skill match IS (and is not). Rows are candidate
				// discovery, not verified experience/seniority/availability.
				matchBasis:
					"Skill/q matches are FREE-TEXT hits over profile + project prose — each row's `match` names the fields, projects and literal terms that hit (a token can match via a synonym). This is candidate discovery, NOT verified experience: treat bio/role text as claims. `codeEvidence` lists indexed repos owned by the builder's GitHub account that match the query (language + last activity are observable facts); an empty list means no direct code evidence in our index — a weaker match, not a disqualification.",
				...(builderAdvisory ? { advisory: builderAdvisory } : {}),
			},
			builders,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
			},
		},
	);
}

// sls-004: method misuse answers JSON (Next's automatic 405 has an empty body).
export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
