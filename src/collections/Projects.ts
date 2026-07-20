import type { CollectionConfig } from "payload";

import { generateSlug, normalizeUrlField } from "../lib/utils/normalize";

export const Projects: CollectionConfig = {
	slug: "projects",
	admin: {
		useAsTitle: "name",
	},
	versions: {
		maxPerDoc: 3,
	},
	access: {
		read: () => true,
		create: ({ data, req }) => {
			// Allow admin creation from backend
			if (req.user) {
				return true;
			}
			// Allow public creation for intake (unverified projects)
			if (
				data?.provenance?.source === "UserSubmitted" &&
				data?.verificationLevel === "Unverified"
			) {
				return true;
			}
			return false;
		},
		update: ({ req }) => {
			// Only admins can update
			return !!req.user;
		},
	},
	fields: [
		{
			name: "name",
			type: "text",
			required: true,
		},
		{
			name: "slug",
			type: "text",
			required: true,
			unique: true,
			admin: {
				position: "sidebar",
			},
		},
		{
			name: "logo",
			type: "upload",
			relationTo: "media",
			admin: {
				description:
					"Project logo image. If not provided, a default logo will be used.",
			},
		},
		{
			name: "shortDescription",
			type: "textarea",
		},
		{
			name: "category",
			type: "select",
			required: true,
			options: [
				"Infrastructure",
				"Tooling",
				"Partner Integration",
				"User-Facing App",
				"Asset",
				"Protocol/Contract",
				"Anchor",
			],
		},
		{
			name: "types",
			type: "select",
			hasMany: true,
			options: [
				"Wallet",
				"DEX",
				"Lending",
				"Bridge",
				"Infrastructure",
				"Payments",
				"Anchor",
				"SDK",
				"Indexer",
				"Explorer",
				"Analytics",
				"AI",
				"Gaming",
				"Education",
				"Security",
				"NFT",
				"RWA",
				"Stablecoin",
				"Social Impact",
				"RPC",
				"Faucet",
			],
		},
		{
			name: "status",
			type: "select",
			required: true,
			index: true,
			options: ["Draft", "Development", "Pre-Release", "Live", "Inactive"],
			defaultValue: "Draft",
			admin: {
				description:
					"Draft = hidden pending approval. Development/Pre-Release/Live = active, shown + ranked. Inactive = defunct/abandoned (e.g. dead repo, product shut down) — dropped from the leaderboard, directory, and home, and heavily down-ranked in search so it never outranks a live project on borrowed GitHub clout (the Keybase-at-#2 problem).",
			},
		},
		{
			// sls-024: lifecycle-label provenance. A bare status ("Live"/"Inactive")
			// gives consumers no way to reconcile it with a conflicting operator
			// surface (Slender/Laina/K2/OrbitCDP class) — an operator page can be
			// stale, an app can outlive its team, and "Live" can describe an org
			// rather than a mainnet product. These three OPTIONAL fields date the
			// label, point at its evidence, and say what KIND of evidence it is.
			// All default null — additive, zero writes to existing data; populated
			// by curation flows (STATUS_FIX in scripts/data/curate-projects.ts)
			// going forward.
			name: "statusAsOf",
			type: "date",
			admin: {
				description:
					"When the current `status` value was last asserted/verified (sls-024). Null = undated legacy label.",
			},
		},
		{
			name: "statusSourceUrl",
			type: "text",
			admin: {
				description:
					"Primary evidence URL behind the current status (operator announcement, checked product surface, on-chain probe, triage note).",
			},
		},
		{
			name: "statusBasis",
			type: "select",
			options: [
				"operator-announcement",
				"site-liveness",
				"onchain-activity",
				"human-verified",
				"source-inherited",
			],
			admin: {
				description:
					"What kind of evidence backs the current status: operator-announcement (the team/operator said so), site-liveness (product surface checked), onchain-activity (contract/network probe), human-verified (owner/boxy-confirmed), source-inherited (label carried from a seed source, unverified).",
			},
		},
		{
			// Identity continuity (sls-050). When a project RENAMES (Vibrant →
			// Vesseo), a consumer looking up either name must land on one entity
			// WITH the continuity as data — not via invisible synonym patches.
			// aliases join name-matching (an exact alias hit ranks like an exact
			// name hit) and rows serve an `identity` block with provenance.
			name: "aliases",
			type: "text",
			hasMany: true,
			admin: {
				description:
					"Former/alternate names this project is known by (e.g. Vibrant for Vesseo). Alias lookups resolve to this record and rows disclose the continuity.",
			},
		},
		{
			name: "renamedAt",
			type: "date",
			admin: {
				description: "When the current name took effect (if known).",
			},
		},
		{
			name: "renameSourceUrl",
			type: "text",
			admin: {
				description: "Source substantiating the rename (announcement, site).",
			},
		},
		{
			// Dedupe / lineage pointer (sls-008). When this record is a duplicate
			// or former name of another project — same team, same site, split by a
			// naming artifact (e.g. orbit-finance → orbitcdp, both Zenith Protocols)
			// — set this to the CANONICAL project's slug. Consumers resolve any
			// record to its canonical form, so a name lookup that lands on the stale
			// row can follow the pointer to the funded/active one instead of
			// returning a contradictory answer. Additive and non-destructive: it
			// never deletes or hides this record. Pair with status: Inactive to also
			// suppress the duplicate from active listings. Leave empty for normal
			// standalone projects.
			name: "canonicalSlug",
			type: "text",
			index: true,
			admin: {
				position: "sidebar",
				description:
					"Slug of the canonical project this record is a duplicate/rename of (leave empty for standalone projects). Does not delete or hide this record — pair with status: Inactive to suppress a duplicate.",
			},
		},
		{
			// Historical archive (lean). Turns a bare `status: Inactive` into
			// ecosystem memory: a consumer asking "what CDPs are on Stellar?" can be
			// told "OrbitCDP WAS a live CDP protocol that shut down" instead of
			// getting silence or a stale "live". Additive — defaults empty; only
			// meaningful on Inactive records. Can grow later (inactiveSince, reason
			// enum, successorSlug) without breaking this shape.
			name: "lifecycle",
			type: "group",
			fields: [
				{
					name: "wasLive",
					type: "checkbox",
					defaultValue: false,
					admin: {
						description:
							"True if this project ever reached Live/production (distinguishes a real product that later died from one abandoned in development). Lets consumers say 'used to be live'.",
					},
				},
				{
					name: "note",
					type: "textarea",
					admin: {
						description:
							"Short historical note for a defunct/changed project, e.g. 'Live CDP protocol; shut down 2026, team pivoted to Zenex.' Quoted verbatim by agents — keep it factual and dated.",
					},
				},
			],
		},
		{
			name: "links",
			type: "group",
			fields: [
				{
					name: "website",
					type: "text",
				},
				{
					name: "github",
					type: "text",
				},
				{
					name: "docs",
					type: "text",
				},
				{
					name: "twitter",
					type: "text",
					admin: {
						description:
							"X (formerly Twitter) profile URL (e.g., https://x.com/username)",
					},
					label: "X (Twitter)",
				},
				{
					name: "discord",
					type: "text",
				},
			],
		},
		{
			name: "github",
			type: "group",
			admin: {
				description: "Link GitHub data to this project",
			},
			fields: [
				{
					name: "orgLogin",
					type: "text",
					admin: {
						description: 'GitHub org login (optional), e.g. "stellar"',
					},
				},
				{
					name: "repos",
					type: "array",
					labels: { singular: "Repo", plural: "Repos" },
					admin: {
						description: "Specific repositories for this project (owner/name)",
					},
					fields: [
						{ name: "owner", type: "text", required: true },
						{ name: "name", type: "text", required: true },
					],
				},
			],
		},
		{
			// On-chain metrics (2026-07-20): populated by
			// scripts/data/enrich-onchain-projects.ts from stellar.expert, join
			// keys hand-verified in src/data/onchain-contracts.ts. Semantics:
			// absence/null = not tracked here, NEVER "no activity". events and
			// subinvocations are lifetime counts (stellar.expert's direct
			// invocation counter is currently broken service-wide, so these are
			// the honest activity signals available).
			name: "onchain",
			type: "group",
			fields: [
				{ name: "assetCode", type: "text" },
				{ name: "issuer", type: "text" },
				{
					name: "assetHolders",
					type: "number",
					admin: { description: "Trustline holders of the issued asset" },
				},
				{
					name: "assetSupply",
					type: "number",
					admin: { description: "Circulating supply in whole asset units" },
				},
				{
					name: "contracts",
					type: "array",
					fields: [
						{ name: "address", type: "text" },
						{ name: "label", type: "text" },
						{
							name: "events",
							type: "number",
							admin: { description: "Lifetime contract events emitted" },
						},
						{
							name: "subinvocations",
							type: "number",
							admin: {
								description:
									"Lifetime times called as a subcall — low for contracts users hit directly; read WITH events",
							},
						},
						{ name: "storageEntries", type: "number" },
						{ name: "createdAt", type: "date" },
						{
							name: "verifiedRepo",
							type: "text",
							admin: {
								description:
									"GitHub repo from stellar.expert's wasm validation, when the team ran it",
							},
						},
					],
				},
				{ name: "source", type: "text" },
				{ name: "asOf", type: "date" },
			],
		},
		{
			// sls-012: structured anchor corridor/coverage, so "which anchors serve
			// corridor X→Y / currency Z?" is filterable + dated, not prose-mined.
			// Synced from the matching partner record (currencies/SEPs/country) by
			// scripts/data/curate-projects.ts; `asOf` stamps the sync.
			name: "coverage",
			type: "group",
			admin: {
				description:
					"Structured fiat/corridor coverage for anchors & ramps (currencies, SEPs, countries), synced from the partner record. Empty for non-anchors.",
			},
			fields: [
				{ name: "countries", type: "text", hasMany: true },
				{ name: "currencies", type: "text", hasMany: true },
				{
					name: "seps",
					type: "select",
					hasMany: true,
					options: [
						{ label: "SEP-6", value: "sep-6" },
						{ label: "SEP-24", value: "sep-24" },
						{ label: "SEP-31", value: "sep-31" },
					],
				},
				{ name: "asOf", type: "text" },
			],
		},
		{
			// sls-017 (durable half): chain/network support so omission ≠ negation
			// on wallet/multichain records (e.g. LOBSTR = Stellar + XRPL).
			name: "supportedNetworks",
			type: "text",
			hasMany: true,
			admin: {
				description:
					"Networks this project supports, lowercase (e.g. 'stellar', 'xrpl'). Curator-maintained.",
			},
		},
		{
			// sls-032 (#516): route-level bridge evidence. A Bridge-typed project
			// hit is DISCOVERY-level — it cannot tell a caller which mechanism a
			// transfer would use, whether the direction is supported, or whether
			// the destination asset is canonical (Circle-issued USDC) vs a bridged
			// representation (USDC.axl). Each row here is a CURATED route fact
			// grounded in the provider's own docs/APIs (sourceUrl + asOf), written
			// by ROUTES_SET in scripts/data/curate-projects.ts. Empty = no curated
			// route evidence yet (unknown), NEVER "no routes exist". Quote-time
			// facts (fees, availability, current quotes) intentionally stay out.
			name: "routes",
			type: "array",
			admin: {
				description:
					"Curated route-level bridge evidence (sls-032): chain pair, direction, assets, destination representation, mechanism, source URL, as-of date. Populated by scripts/data/curate-projects.ts ROUTES_SET only — empty means not-yet-curated, not route-free.",
			},
			fields: [
				{ name: "fromChain", type: "text", required: true },
				{ name: "toChain", type: "text", required: true },
				{
					name: "direction",
					type: "select",
					options: ["one-way", "bidirectional"],
				},
				{
					name: "assets",
					type: "text",
					hasMany: true,
					admin: {
						description:
							"Asset codes moved on this route (e.g. USDC). Empty = asset scope not curated (aggregator/router routes are quote-time) — unknown, not none.",
					},
				},
				{
					name: "assetRepresentation",
					type: "select",
					options: ["canonical", "wrapped", "bridged", "interchain"],
					admin: {
						description:
							"What the DESTINATION asset is: canonical (issuer-native, e.g. Circle-issued USDC via CCTP), wrapped, bridged, or interchain (e.g. USDC.axl). Null = quote-time/unverified.",
					},
				},
				{
					name: "mechanism",
					type: "text",
					admin: {
						description:
							"Settlement mechanism, e.g. cctp-burn-mint, native-liquidity-pool, lock-mint, aggregator-router.",
					},
				},
				{ name: "sourceUrl", type: "text" },
				{
					name: "asOf",
					type: "text",
					admin: {
						description: "YYYY-MM-DD the route evidence was verified.",
					},
				},
			],
		},
		{
			// sls-035 (#517): DEX-cluster role taxonomy. The DEX type mixes
			// independent liquidity venues (AMMs, the native orderbook) with
			// aggregators/routers, trading UIs, and wallet-integrated trading —
			// so a cluster count is a taxonomy count, NOT a competitor count.
			// Curated only (VENUE_ROLE in scripts/data/curate-projects.ts), each
			// assignment grounded in the operator's own product description.
			name: "venueRole",
			type: "select",
			options: [
				"amm",
				"native-orderbook",
				"aggregator-router",
				"trading-ui",
				"wallet-integrated",
			],
			admin: {
				description:
					"Role in the DEX/trading landscape (sls-035): amm / native-orderbook = independent liquidity venues; aggregator-router routes across venues and runs none; trading-ui = an interface over other venues (e.g. the native SDEX); wallet-integrated = trading embedded in a wallet. Null = not yet classified (unknown, not 'not a venue').",
			},
		},
		{
			// sls-033 (#519): wallet-landscape product kind. The Wallet type mixes
			// end-user wallet products with hardware wallets, connectivity
			// protocols (WalletConnect), wallet-building SDKs, integration kits
			// (Stellar Wallets Kit), and passkey/smart-account tooling — a
			// directory/module row alone does not establish what KIND of product
			// a record is. Curated only (PRODUCT_KIND in
			// scripts/data/curate-projects.ts), each assignment grounded in the
			// operator's own product description. Follows the venueRole precedent
			// (#517).
			name: "productKind",
			type: "select",
			options: [
				"end-user-wallet",
				"hardware-wallet",
				"connectivity-protocol",
				"wallet-sdk",
				"integration-kit",
				"smart-account-tooling",
			],
			admin: {
				description:
					"What KIND of wallet-landscape product this is (sls-033): end-user-wallet = a consumer app users hold funds in; hardware-wallet = a physical signing device product; connectivity-protocol = a wallet↔dApp connection protocol (not a wallet); wallet-sdk = a library for BUILDING wallets; integration-kit = a library for integrating existing wallets into dApps; smart-account-tooling = passkey/smart-account infrastructure. Null = not yet classified (unknown, NOT 'not a wallet').",
			},
		},
		{
			// sls-033 (#519): per-platform APP availability, deliberately separate
			// from the project lifecycle `status` — a Live project can have a dead
			// store listing (xBull: product Live via web + Chrome extension while
			// its formerly-listed iOS/Android store apps 404, checked 2026-07-13).
			// Each row is a dated, store-checked fact (AVAILABILITY_SET in
			// scripts/data/curate-projects.ts). Empty = availability not yet
			// curated (unknown), NEVER "not available anywhere".
			name: "availability",
			type: "array",
			admin: {
				description:
					"Per-platform app availability (sls-033): platform, reachable/unavailable state, store URL, and the date it was checked. Distinct from `status` (project lifecycle). Populated by scripts/data/curate-projects.ts AVAILABILITY_SET only — empty means not-yet-curated, not unavailable.",
			},
			fields: [
				{
					name: "platform",
					type: "select",
					required: true,
					options: [
						"ios",
						"android",
						"web",
						"browser-extension",
						"desktop",
						"hardware-device",
					],
				},
				{
					name: "state",
					type: "select",
					required: true,
					options: ["available", "unavailable"],
					admin: {
						description:
							"available = the store listing / product surface was reachable when checked; unavailable = a previously-listed surface is gone (404 / delisted).",
					},
				},
				{
					name: "storeUrl",
					type: "text",
					admin: {
						description:
							"The store listing / product surface URL that was checked (App Store, Google Play, Chrome Web Store, vendor shop, web app). Null for an unavailable row whose listing no longer exists.",
					},
				},
				{
					name: "checkedAt",
					type: "text",
					admin: {
						description:
							"YYYY-MM-DD the availability state was last verified — availability is a dated fact, re-check before relying on it.",
					},
				},
				{
					name: "note",
					type: "text",
					admin: {
						description:
							"Optional one-line evidence note (e.g. 'Play listing for app.xbull.mobile 404s').",
					},
				},
			],
		},
		{
			name: "scf",
			type: "group",
			admin: {
				description: "Stellar Community Fund data",
			},
			fields: [
				{
					name: "awarded",
					type: "checkbox",
					defaultValue: false,
					admin: {
						description: "Whether this project has received SCF funding",
					},
				},
				{
					name: "lastAwardedRound",
					type: "number",
					admin: {
						description: "Last SCF round this project was awarded in",
					},
				},
				{
					name: "slug",
					type: "text",
					admin: {
						description:
							"SCF project slug (used for linking to communityfund.stellar.org)",
					},
				},
				{
					name: "totalAwarded",
					type: "number",
					admin: {
						description: "Total funding amount awarded from SCF (in USD)",
					},
				},
				{
					name: "awardedRounds",
					type: "number",
					hasMany: true,
					admin: {
						description:
							"Round numbers this project was funded in, e.g. 2, 17, 22",
					},
				},
			],
		},
		{
			name: "verificationLevel",
			type: "select",
			required: true,
			defaultValue: "Unverified",
			options: ["Unverified", "Verified (SDF)", "Verified (Community)"],
		},
		{
			// Voyage (voyage-3, 1024-dim) embedding of name + description +
			// category, for semantic project search via Atlas $vectorSearch.
			// Backfilled by scripts/embed-projects.ts, read raw by the search
			// route. Hidden from admin; large numeric array, not display data.
			name: "embedding",
			type: "json",
			admin: { hidden: true },
		},
		{
			// DefiLlama-verified TVL (system-written by scripts/enrich-tvl.ts).
			// null = NOT TRACKED on DefiLlama — never "zero TVL" (class 3);
			// llama-listed protocols with ~$0 feed the liveness report instead.
			name: "tvlUSD",
			type: "number",
			admin: {
				description:
					"DefiLlama TVL in USD (sum of mapped llama rows). null = not tracked, NOT zero.",
			},
		},
		{
			name: "tvlAsOf",
			type: "date",
			admin: {
				description: "When tvlUSD was fetched (class 8: dated metrics).",
			},
		},
		{
			// sls-031: TVL methodology provenance. Concurrent observers legitimately
			// disagree on TVL (operator ~16.57M vs DefiLlama 16.49M vs ours 16.386M
			// vs Dune 16.255M for DeFindex, 2026-07-10) — without source+method a
			// consumer either treats our number as exact universal truth or concludes
			// no current TVL exists. Optional; written by scripts/enrich-tvl.ts
			// alongside tvlUSD/tvlAsOf.
			name: "tvlSource",
			type: "text",
			admin: {
				description:
					'Source that produced tvlUSD (e.g. "defillama"). Null = legacy value predating provenance.',
			},
		},
		{
			name: "tvlMethod",
			type: "text",
			admin: {
				description:
					"How tvlUSD was computed (e.g. sum of the mapped DefiLlama protocol rows in llamaSlugs, USD at DefiLlama pricing time).",
			},
		},
		{
			// Curated mapping to DefiLlama protocol slugs (several per project —
			// e.g. blend = pools + pools-v2 + backstops). Maintained in
			// scripts/enrich-tvl.ts LLAMA_MAP; stored for provenance.
			name: "llamaSlugs",
			type: "text",
			hasMany: true,
		},
		{
			name: "provenance",
			type: "group",
			fields: [
				{
					name: "source",
					type: "select",
					required: true,
					options: ["LumenloopSeed", "UserSubmitted", "AdminEdit"],
				},
				{
					name: "sourceId",
					type: "text",
				},
				{
					name: "firstSeenAt",
					type: "date",
				},
			],
		},
		{
			name: "lastVerifiedAt",
			type: "date",
		},
		{
			name: "featured",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description:
					"Featured projects appear first in the directory when sorted by Featured.",
			},
		},
		{
			name: "relevanceScore",
			type: "number",
			defaultValue: 0,
			admin: {
				description:
					"Computed relevance score (0-100). Higher = more relevant. Auto-calculated from TVL, GitHub activity, completeness, etc.",
				position: "sidebar",
			},
		},
		{
			name: "prominence",
			type: "number",
			defaultValue: 0,
			admin: {
				description:
					"Editorial search-ranking boost (0-100). Lifts canonical/flagship projects above incidental keyword mentions in /api/projects/search. Guide: 90 = the canonical pick for its category (Freighter, Soroswap, Blend, Reflector, USDC); 70 = established; 50 = notable; 0 = default. Distinct from relevanceScore (auto-computed) — this is curated.",
				position: "sidebar",
			},
		},
		{
			name: "communityPick",
			type: "checkbox",
			defaultValue: false,
			admin: {
				description:
					"Mark this project as a community pick. Note: Projects must have an X (Twitter) profile link in the Links section to appear in the Community Picks section on the homepage.",
			},
		},
		{
			name: "relatedEntities",
			type: "join",
			collection: "entities",
			on: "projects",
			admin: {
				description:
					"Entities/organizations linked to this project. Edit from either side.",
			},
		},
		{
			name: "hackathon",
			type: "relationship",
			relationTo: "hackathons",
			admin: {
				description: "Hackathon this project originated from (if applicable)",
			},
		},
		{
			name: "hackathonStatus",
			type: "select",
			options: [
				{ label: "Built", value: "Built" },
				{ label: "In Progress", value: "In Progress" },
				{ label: "Abandoned", value: "Abandoned" },
			],
			admin: {
				description: "Post-hackathon project status",
				condition: (data) => !!data?.hackathon,
			},
		},
		{
			name: "hackathonPlacement",
			type: "select",
			options: [
				{ label: "Grand Prize", value: "grand-prize" },
				{ label: "1st Place", value: "1st" },
				{ label: "2nd Place", value: "2nd" },
				{ label: "3rd Place", value: "3rd" },
				{ label: "Honorable Mention", value: "honorable-mention" },
				{ label: "Track Winner", value: "track-winner" },
			],
			admin: {
				description:
					"If this project won a placement at the hackathon, surface it in the Winners section",
				condition: (data) => !!data?.hackathon,
			},
		},
		{
			name: "hackathonPrize",
			type: "number",
			admin: {
				description: "Prize amount won (USD)",
				condition: (data) => !!data?.hackathon && !!data?.hackathonPlacement,
				step: 100,
			},
		},
		{
			name: "hackathonPrizeTrack",
			type: "text",
			admin: {
				description:
					"Track or sponsor that awarded the prize (e.g. 'Best DeFi', 'Coinbase Track')",
				condition: (data) => !!data?.hackathon && !!data?.hackathonPlacement,
			},
		},
	],
	// Unique index on slug is handled by unique: true on the field
	hooks: {
		beforeValidate: [
			async ({ data, operation, req }) => {
				// Generate slug from name if not provided
				if (data && !data.slug && data.name) {
					data.slug = generateSlug(data.name);
				}

				// Set provenance for admin-created entries
				if (
					data &&
					operation === "create" &&
					req?.user &&
					!data.provenance?.source
				) {
					data.provenance = {
						...data.provenance,
						source: "AdminEdit",
						firstSeenAt: new Date().toISOString(),
					};
				}

				// Normalize URLs in links group
				if (data?.links) {
					if (data.links.website) {
						data.links.website = normalizeUrlField(data.links.website);
					}
					if (data.links.github) {
						data.links.github = normalizeUrlField(data.links.github);
					}
					if (data.links.docs) {
						data.links.docs = normalizeUrlField(data.links.docs);
					}
					if (data.links.twitter) {
						data.links.twitter = normalizeUrlField(data.links.twitter);
					}
					if (data.links.discord) {
						data.links.discord = normalizeUrlField(data.links.discord);
					}
				}

				return data;
			},
		],
		afterChange: [
			async ({ doc, operation, req, previousDoc }) => {
				if (!req.payload) return;

				// Determine action type
				let action: "Create" | "Update" | "SyncImport" | "Intake" = "Update";
				let actorType: "System" | "User" | "Admin" = "User";

				if (operation === "create") {
					action = "Create";
					// Check if this is from sync or intake based on provenance
					if (doc.provenance?.source === "LumenloopSeed") {
						action = "SyncImport";
						actorType = "System";
					} else if (doc.provenance?.source === "UserSubmitted") {
						action = "Intake";
						actorType = "User";
					} else if (req.user) {
						actorType = "Admin";
					}
				} else if (operation === "update") {
					if (req.user) {
						actorType = "Admin";
					}
				}

				// Create transparency log entry
				await req.payload.create({
					collection: "transparency-logs",
					data: {
						action,
						actorType,
						targetCollection: "projects",
						targetId: doc.id.toString(),
						diff: {
							before: previousDoc || null,
							after: doc,
						},
						timestamp: new Date().toISOString(),
					},
				});

				// Invalidate GitHub cache if repos changed
				if (operation === "update" && previousDoc) {
					const currentRepos = doc.github?.repos || [];
					const previousRepos = previousDoc.github?.repos || [];

					const currentReposKey = JSON.stringify(
						(currentRepos as any[])
							.map((r: any) => `${r.owner}/${r.name}`)
							.sort(),
					);
					const previousReposKey = JSON.stringify(
						(previousRepos as any[])
							.map((r: any) => `${r.owner}/${r.name}`)
							.sort(),
					);

					if (currentReposKey !== previousReposKey) {
						// Delete cache to force refresh on next request
						const existing = await req.payload.find({
							collection: "signals",
							where: { project: { equals: doc.id } },
							limit: 1,
						});

						if (existing.docs.length > 0) {
							await req.payload.delete({
								collection: "signals",
								id: existing.docs[0].id,
							});
						}
					}
				}
			},
		],
	},
};
