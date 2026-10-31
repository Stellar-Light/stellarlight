import { describe, expect, it } from "vitest";
import { indexProjectRepos, repoFullNameOf } from "@/lib/hackathon-build-links";
import {
	buildDetailFromStored,
	dedupeBuilds,
	type IndexedBuild,
	indexedFromStored,
	onePerSubmission,
	searchHackathonBuilds,
	unusedWordsWarning,
	wordsNoBuildUses,
} from "@/lib/hackathon-builds";
import {
	type DoraHacksHackathon,
	doraEventRef,
	endedDoraHacksEvents,
} from "@/lib/integrations/dorahacks";
import { spec } from "@/lib/openapi-spec";
import type { HackathonBuild } from "@/payload-types";
import {
	responseSchema,
	undeclaredInServed,
} from "../../../scripts/contract/served-shape";

const build = (
	name: string,
	description: string,
	isWinner = false,
	id = name,
): IndexedBuild => ({
	id,
	name,
	description,
	githubUrl: null,
	demoUrl: null,
	videoUrl: null,
	track: null,
	hackathonPlacement: isWinner ? "5th Place" : null,
	award: null,
	isWinner,
	voteCount: null,
	url: `https://dorahacks.io/buidl/${id}`,
	source: "dorahacks",
	hackathon: {
		title: "Stellar Hacks: Agents",
		slug: "stellar-agents-x402-stripe-mpp",
		endedAt: "2026-04-13",
	},
	haystack: `${name} ${description}`.toLowerCase(),
});

describe("searchHackathonBuilds ordering", () => {
	// The 2026-10-05 audit case: titles stuffed with the query's words outranked
	// the winner that built the idea.
	const index = [
		build(
			"Private Resource Access for AI Agents",
			"For AI agents paying per API call on-chain, paying is confessing.",
		),
		build(
			"AgentPay",
			"AI agents can reason and plan, but they can't spend money.",
		),
		build(
			"TollPay",
			"Toll is Stripe for MCP Servers. AI agents use MCP tools but can't pay for them. Toll adds per-call USDC micropayments.",
			true,
		),
		build(
			"Stripe for agents, unplaced",
			"Stripe-style payments for AI agents with USDC micropayments.",
		),
	];

	it("puts the prize winner first among builds covering the same concepts", () => {
		const out = searchHackathonBuilds(
			index,
			"payments for AI agents like Stripe for agents",
		);
		expect(out[0].b.name).toBe("TollPay");
		expect(out[0].matched).toEqual(
			expect.arrayContaining(["payments", "ai", "agents", "stripe"]),
		);
	});

	it("ranks coverage above the winner bonus", () => {
		const out = searchHackathonBuilds(
			[
				build("Escrow winner", "Escrow for freelancers on Soroban.", true),
				build(
					"Agent payments",
					"Payments for AI agents with Stripe-like checkout.",
				),
			],
			"stripe payments for ai agents",
		);
		expect(out[0].b.name).toBe("Agent payments");
	});

	it("does not count query filler or 'stellar' as a concept", () => {
		const out = searchHackathonBuilds(
			[
				build("Stellar Forge", "Token launcher."),
				build("Stellar Shield", "Wallet security for Stellar users."),
				build("Stellar Seal", "Document notarization on Stellar."),
			],
			"stellar forge",
		);
		expect(out.map((s) => s.b.name)).toEqual(["Stellar Forge"]);
	});

	it("matches a short term as a whole word only", () => {
		const out = searchHackathonBuilds(
			[
				build("Chain Explorer", "A blockchain explorer; fees are paid in XLM."),
				build("AI Copilot", "An AI assistant for Soroban developers."),
			],
			"ai",
		);
		expect(out.map((s) => s.b.name)).toEqual(["AI Copilot"]);
	});
});

describe("event naming", () => {
	const hack = (over: Partial<DoraHacksHackathon>): DoraHacksHackathon => ({
		id: 2068,
		title: "Stellar Hacks: Agents",
		uname: "stellar-agents-x402-stripe-mpp",
		start_time: 0,
		end_time: Date.UTC(2026, 3, 13) / 1000,
		bonus_price: 10000,
		hackers_count: 591,
		winner_announced: true,
		status: 2,
		source: "dorahacks",
		...over,
	});

	it("names an event by its DoraHacks uname, the slug getHackathon opens", () => {
		expect(doraEventRef(hack({}))).toEqual({
			title: "Stellar Hacks: Agents",
			slug: "stellar-agents-x402-stripe-mpp",
			endedAt: "2026-04-13",
		});
	});

	it("reads rosters only for ended DoraHacks events, newest first", () => {
		const out = endedDoraHacksEvents([
			hack({ id: 1, uname: "old", end_time: 100 }),
			hack({ id: 2, uname: "live", status: 1, winner_announced: false }),
			hack({ id: 3, uname: "curated", source: "curated" }),
			hack({ id: 4, uname: "new", end_time: 200 }),
		]);
		expect(out.map((h) => h.uname)).toEqual(["new", "old"]);
	});
});

describe("stored rows", () => {
	const row = (over: Partial<HackathonBuild>): HackathonBuild => ({
		id: "x",
		buildId: "dorahacks-buidl-42585",
		name: "TollPay",
		vision: "Toll is Stripe for MCP Servers.",
		hackathonSlug: "stellar-agents-x402-stripe-mpp",
		hackathonTitle: "Stellar Hacks: Agents",
		endedAt: "2026-04-13",
		placement: "5th Place",
		isWinner: true,
		url: "https://dorahacks.io/buidl/42585",
		githubUrl: "https://github.com/rajkaria/toll",
		firstSeenAt: "2026-10-05T00:00:00.000Z",
		lastSeenAt: "2026-10-05T00:00:00.000Z",
		updatedAt: "2026-10-05T00:00:00.000Z",
		createdAt: "2026-10-05T00:00:00.000Z",
		...over,
	});

	it("serves the stored event slug and the one-line summary as description", () => {
		const b = indexedFromStored(row({}));
		expect(b.hackathon.slug).toBe("stellar-agents-x402-stripe-mpp");
		expect(b.description).toBe("Toll is Stripe for MCP Servers.");
		expect(b.isWinner).toBe(true);
	});

	// Hack+ Alebrije: DoraHacks assigned no winners; BAF's newsletter names
	// GIBBOR (src/data/winner-overlay.ts).
	const BAF =
		"https://bafs-newsletter.beehiiv.com/p/b-news-from-mexico-city-to-lima-this-month-s-web3-route";
	const gibbor = row({
		buildId: "dorahacks-buidl-41502",
		name: "GIBBOR",
		hackathonSlug: "alebrije2026",
		hackathonTitle: "Hack+ Alebrije | CDMX 2026",
		endedAt: "2026-03-22",
		placement: null,
		isWinner: false,
		url: "https://dorahacks.io/buidl/41502",
	});

	it("serves a win named off DoraHacks on the stored row it names, by build id and event", () => {
		const b = indexedFromStored(gibbor);
		expect([b.isWinner, b.hackathonPlacement, b.winnerSource]).toEqual([
			true,
			"Winner",
			BAF,
		]);
		// The row's own link stays the DoraHacks page.
		expect(b.url).toBe("https://dorahacks.io/buidl/41502");
		// The same id in another event is not that win.
		const elsewhere = indexedFromStored({ ...gibbor, hackathonSlug: "other" });
		expect(elsewhere.isWinner).toBe(false);
		expect("winnerSource" in elsewhere).toBe(false);
		// A placement DoraHacks assigned replaces it.
		const placed = indexedFromStored({
			...gibbor,
			isWinner: true,
			placement: "1st Place",
		});
		expect(placed.hackathonPlacement).toBe("1st Place");
		expect("winnerSource" in placed).toBe(false);
		// A row no source names stays unplaced.
		const other = indexedFromStored({
			...gibbor,
			buildId: "dorahacks-buidl-1",
		});
		expect([other.isWinner, other.hackathonPlacement]).toEqual([false, null]);
	});

	it("the submission's detail serves that win too, its entry first, as declared", () => {
		// The same submission in a later event, unplaced: a later event leads
		// an unplaced submission, so only the win puts Alebrije first.
		const later = {
			...gibbor,
			id: "y",
			hackathonSlug: "later-event",
			hackathonTitle: "Later",
			endedAt: "2026-09-01",
		};
		const d = buildDetailFromStored([later, gibbor], new Set());
		expect([d.hackathon.slug, d.isWinner, d.placement, d.winnerSource]).toEqual(
			["alebrije2026", true, "Winner", BAF],
		);
		expect(
			d.entries.map((e) => [e.hackathon.slug, e.isWinner, e.winnerSource]),
		).toEqual([
			["alebrije2026", true, BAF],
			["later-event", false, undefined],
		]);
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/builds/{id}"),
				{ build: d },
			),
		).toEqual([]);
	});

	it("keeps 'not checked' apart from 'no project'", () => {
		expect("project" in indexedFromStored(row({}))).toBe(false);
		expect(
			indexedFromStored(row({ linkCheckedAt: "2026-10-05T00:00:00.000Z" }))
				.project,
		).toBeNull();
		expect(
			indexedFromStored(
				row({
					linkCheckedAt: "2026-10-05T00:00:00.000Z",
					projectSlug: "tollpay",
					projectName: "TollPay",
				}),
			).project,
		).toEqual({ slug: "tollpay", name: "TollPay" });
	});
});

describe("repo to project links", () => {
	it("parses a repo URL and refuses an account or org URL", () => {
		expect(repoFullNameOf("https://github.com/RajKaria/Toll.git")).toBe(
			"rajkaria/toll",
		);
		expect(
			repoFullNameOf("https://github.com/rajkaria/toll/tree/main/src"),
		).toBe("rajkaria/toll");
		expect(repoFullNameOf("https://github.com/trustbridgecr")).toBeNull();
		expect(repoFullNameOf("https://gitlab.com/a/b")).toBeNull();
		expect(repoFullNameOf(null)).toBeNull();
	});

	it("links only a repo a project lists as its own", () => {
		const idx = indexProjectRepos([
			{
				slug: "tollpay",
				name: "TollPay",
				status: "Live",
				links: { github: "https://github.com/rajkaria/toll" },
			},
			{
				slug: "tansu",
				name: "Tansu",
				status: "Live",
				links: { github: "https://github.com/tupui" },
				github: { repos: [{ owner: "Consulting-Manao", name: "tansu" }] },
			},
		]);
		expect(idx.get("rajkaria/toll")).toEqual({
			slug: "tollpay",
			name: "TollPay",
		});
		expect(idx.get("consulting-manao/tansu")).toEqual({
			slug: "tansu",
			name: "Tansu",
		});
		// An account link is not a repo: the same builder's other repos never link.
		expect(idx.has("tupui/stellar-stratum")).toBe(false);
	});

	it("leaves a repo two projects list unlinked, resolves duplicates, skips drafts", () => {
		const idx = indexProjectRepos([
			{
				slug: "a",
				name: "A",
				status: "Live",
				github: { repos: [{ owner: "o", name: "shared" }] },
			},
			{
				slug: "b",
				name: "B",
				status: "Live",
				github: { repos: [{ owner: "o", name: "shared" }] },
			},
			{
				slug: "canon",
				name: "Canon",
				status: "Live",
				github: { repos: [{ owner: "o", name: "c" }] },
			},
			{
				slug: "old-name",
				name: "Old",
				status: "Draft",
				canonicalSlug: "canon",
				github: { repos: [{ owner: "o", name: "c" }] },
			},
			{
				slug: "hidden",
				name: "Hidden",
				status: "Draft",
				github: { repos: [{ owner: "o", name: "h" }] },
			},
		]);
		expect(idx.get("o/shared")).toBeNull();
		expect(idx.get("o/c")).toEqual({ slug: "canon", name: "Canon" });
		expect(idx.has("o/h")).toBe(false);
	});
});

describe("rarity and phrases", () => {
	// An agents hackathon: "agents" and "api" are everywhere, "x402" is not.
	const filler = Array.from({ length: 30 }, (_, i) =>
		build(`Agent tool ${i}`, "An API for AI agents.", false, `f${i}`),
	);

	it("weighs a rare word above common ones", () => {
		const out = searchHackathonBuilds(
			[
				...filler,
				build("Padded", "An agents API API agents for agents."),
				build("Paywall", "x402 paywall for agents."),
			],
			"x402 api for agents",
		);
		expect(out[0].b.name).toBe("Paywall");
	});

	it("counts a hyphenated phrase once and matches it spaced", () => {
		const out = searchHackathonBuilds(
			[
				build("Spaced", "Pay per call access to data."),
				build("Parts", "Pay once, then call anything."),
			],
			"pay-per-call",
		);
		expect(out[0].b.name).toBe("Spaced");
		expect(out[0].matched).toEqual(["pay-per-call"]);
		expect(out.map((s) => s.b.name)).not.toContain("Parts");
	});

	// On main a hyphenated phrase spelled only q's own number spaced or
	// joined: q=pay-per-calls missed "pay per call", and the whole-word check
	// called pay-per-call unused beside "pay per calls" (2026-10-23).
	it("matches a hyphenated phrase in both numbers, spaced or joined", () => {
		const pool = [
			build("Meter", "Pay per call for data."),
			build("Joined", "Paypercall billing."),
		];
		expect(
			searchHackathonBuilds(pool, "pay-per-calls")
				.map((s) => s.b.name)
				.sort(),
		).toEqual(["Joined", "Meter"]);
		expect(
			wordsNoBuildUses(
				[build("Meters", "Pay per calls for data.")],
				"pay-per-call",
			),
		).toEqual({ absent: [], concepts: 1 });
	});

	// Review: the number varies on the last part only. Whole-token forms
	// stripped a short last part's s ("stellar-ens" became "stellar en"),
	// which matched prose and read the phrase as used.
	it("varies a hyphenated phrase's number on its last part only", () => {
		const prose = [build("Segundos", "Paga con stellar en segundos.")];
		expect(searchHackathonBuilds(prose, "stellar-ens")).toEqual([]);
		expect(wordsNoBuildUses(prose, "stellar-ens")).toEqual({
			absent: ["stellar-ens"],
			concepts: 1,
		});
		// The other directions: a singular q finds the plural in text, and a
		// plural q is read as used beside the singular.
		expect(
			searchHackathonBuilds(
				[build("Accounts", "Smart accounts for teams.")],
				"smart-account",
			).map((s) => s.b.name),
		).toEqual(["Accounts"]);
		expect(
			wordsNoBuildUses(
				[build("Meter", "Pay per call for data.")],
				"pay-per-calls",
			),
		).toEqual({ absent: [], concepts: 1 });
	});
});

describe("a smart wallet in q is one concept that passkey evidence satisfies", () => {
	// Live 1.9.101: q=passkey smart wallet&winnersOnly=1 read three words, so
	// a build had to cover two or hold one in its name. It listed a build for
	// wallet in its name and dropped the winner Tukar, whose declared
	// passkey-kit covers one word of the three.
	const pool = [
		{
			...build("Tukar", "Cross-border transfers in local currencies.", true),
			stack: ["passkey-kit"],
		},
		build("Quest", "DeFi onboarding with a passkey smart wallet.", true),
		build("Signers", "Policy signers for smart accounts."),
		build("Safe", "Multisig SmartWallets."),
		build("Veil", "Biometric sign-in, WebAuthn verified on-chain."),
		build("Umbra Wallet", "A private wallet with smart contract escrow.", true),
		build("Shield", "Smart contract audits that score wallet risk."),
		build("Smart Escrow", "Smart contract escrow for any account."),
	];
	const run = (q: string, winnersOnly = false) =>
		searchHackathonBuilds(pool, q, { winnersOnly, packages: true });
	const names = (q: string, winnersOnly = false) =>
		run(q, winnersOnly)
			.map((s) => s.b.name)
			.sort();
	const matched = (q: string, winnersOnly = false) =>
		Object.fromEntries(run(q, winnersOnly).map((s) => [s.b.name, s.matched]));
	const smartWallets = ["Quest", "Safe", "Signers", "Tukar", "Veil"];

	it("lists the passkey winners for passkey smart wallet, not a wallet named build", () => {
		expect(matched("passkey smart wallet", true)).toEqual({
			Quest: ["passkey", "smart-wallet"],
			Tukar: ["passkey"],
		});
		expect(wordsNoBuildUses(pool, "passkey smart wallet").concepts).toBe(2);
	});

	// Lane Z3 (2026-10-23): when q said passkey and the phrase, one passkey
	// mention covered both, so passkey builds that miss the rest of q passed
	// the builds that do it.
	it("lets one passkey mention satisfy one concept of q, q's own word first", () => {
		expect(matched("passkey smart wallet")).toEqual({
			Quest: ["passkey", "smart-wallet"],
			Safe: ["smart-wallet"],
			Signers: ["smart-wallet"],
			Tukar: ["passkey"],
			Veil: ["smart-wallet"],
		});
		const onboarding = [
			build("Onboard", "Passkey onboarding for new users."),
			build("Phrase", "Smart wallet onboarding."),
			build("Key", "Passkey sign-in, WebAuthn verified."),
		];
		expect(
			Object.fromEntries(
				searchHackathonBuilds(
					onboarding,
					"passkey or smart-wallet onboarding",
				).map((s) => [s.b.name, s.matched]),
			),
		).toEqual({
			Onboard: ["passkey", "onboarding"],
			Phrase: ["onboarding", "smart-wallet"],
		});
	});

	it("reads either phrase, in any spelling or number, as one concept passkey evidence also satisfies", () => {
		for (const q of [
			"smart wallet",
			"smart wallets",
			"smart_wallet",
			"smartwallet",
			"smart-wallet",
			"smart-wallets",
			"smart wallet?",
			"smart account",
			"smart-accounts",
			"smartaccounts",
		])
			expect(names(q), q).toEqual(smartWallets);
		expect(run("smart-accounts").map((s) => s.matched)).toEqual(
			smartWallets.map(() => ["smart-account"]),
		);
	});

	it("reads both phrases in one q as one concept, named by the first", () => {
		expect(
			wordsNoBuildUses(pool, "smart wallet or smart account").concepts,
		).toBe(1);
		expect(names("smart wallet or smart account")).toEqual(smartWallets);
		expect(run("smart account or smart wallet").map((s) => s.matched)).toEqual(
			smartWallets.map(() => ["smart-account"]),
		);
	});

	// Lane Z3 (2026-10-23): vetIdea's evidence rule read only q's own phrase,
	// so q=smart account dropped builds that write smart wallet.
	it("counts the concept's equivalents in a build's own words, a passkey for one concept only", () => {
		const share = (q: string) =>
			Object.fromEntries(run(q).map((s) => [s.b.name, s.textShare]));
		expect(share("smart wallet")).toEqual({
			Quest: 1,
			Safe: 1,
			Signers: 1,
			Tukar: 0,
			Veil: 1,
		});
		expect(share("passkey smart wallet")).toEqual({
			Quest: 1,
			Safe: 0.5,
			Signers: 0.5,
			Tukar: 0,
			Veil: 0.5,
		});
		const one = [build("One", "Deploys a smart account per user.")];
		expect(wordsNoBuildUses(one, "smart-accounts")).toEqual({
			absent: [],
			concepts: 1,
		});
		expect(wordsNoBuildUses(pool, "smart account llama")).toEqual({
			absent: ["llama"],
			concepts: 2,
		});
	});

	it("never expands passkey, and leaves smart, wallet and account to their own words", () => {
		expect(names("passkey")).toEqual(["Quest", "Tukar"]);
		expect(names("passkey-kit")).toEqual(["Tukar"]);
		expect(names("passkey wallet")).toEqual([
			"Quest",
			"Safe",
			"Shield",
			"Tukar",
			"Umbra Wallet",
		]);
		const smart = [
			"Quest",
			"Safe",
			"Shield",
			"Signers",
			"Smart Escrow",
			"Umbra Wallet",
		];
		expect(names("smart")).toEqual(smart);
		expect(names("smart contract")).toEqual(smart);
		expect(names("wallet")).toEqual([
			"Quest",
			"Safe",
			"Shield",
			"Umbra Wallet",
		]);
		expect(names("account abstraction")).toEqual(["Signers", "Smart Escrow"]);
	});
});

describe("words no build uses", () => {
	const pool = [build("Agent Pay", "AI agents, payments at the café.")];

	it("reads a word with edge punctuation or an accent as a whole word", () => {
		expect(wordsNoBuildUses(pool, "agents, café")).toEqual({
			absent: [],
			concepts: 2,
		});
	});

	it("still counts a word found only inside a longer one as absent", () => {
		expect(wordsNoBuildUses(pool, "gents cafés agent")).toEqual({
			absent: ["gents"],
			concepts: 3,
		});
	});

	// Review 2026-10-23: notes read as used through not, uses through us.
	it("drops es only after s, x, z, ch or sh", () => {
		const short = [build("Short", "not mod plan them hop to do us tax")];
		for (const w of [
			"notes",
			"modes",
			"planes",
			"themes",
			"hopes",
			"toes",
			"does",
			"uses",
		])
			expect(wordsNoBuildUses(short, w).absent, w).toEqual([w]);
		expect(wordsNoBuildUses(short, "taxes").absent).toEqual([]);
	});

	it("does not count a token with no letter or digit as a word", () => {
		expect(wordsNoBuildUses(pool, "agents !!! ???")).toEqual({
			absent: [],
			concepts: 1,
		});
	});

	// 140 labeled ideas, 2026-10-23: charities and family were called unused
	// beside charity and families, soroban-sdk beside 66% of read repos.
	it("reads charity for charities, a common library as used, and names a word bare", () => {
		const more = [
			build("Give", "A charity drive for families."),
			{ ...build("Vault", "A vault."), stack: ["soroban-sdk"] },
		];
		expect(
			wordsNoBuildUses(more, "charities family soroban-sdk (rosca,"),
		).toEqual({ absent: ["rosca"], concepts: 4 });
	});
});

describe("the warning names related forms submissions do use", () => {
	// The 12 words on 140 labeled ideas (2026-10-23) whose related form is
	// used, and look-alikes that are not related forms.
	const pool = [
		build("Cash", "Cash out, with cashback."),
		build("Mint", "Mint and minting tools."),
		build("Hedge", "Hedge positions."),
		build("Rent", "Rent, rental and rentals."),
		build("Cart", "A shopping cart."),
		build("Office", "Back office, backed by assets, background jobs."),
		build("Algo", "Trading algorithms."),
		build("Fees", "Cheap and cheaper fees."),
		build("Gen", "Generate a generation."),
		build("Votes", "Delegation and delegating."),
		build("Keys", "Revocable keys."),
		build("Misc", "Reliable, forever, vouch, sticker, traction."),
		// Review 2026-10-23: words these were said to be related forms of.
		build(
			"Look",
			"Portal, portion, million, mineral, minerals, stripe, formal, billion, planes.",
		),
		build("Alike", "Cent, stale, with."),
		build("Short", "Them, not, plan, hop, mod."),
	];
	const line = (q: string) => unusedWordsWarning(pool, q, []) ?? "";

	it("names each related form that is used", () => {
		for (const [word, clause] of [
			["cashing", "cash for cashing"],
			["minted", "mint and minting for minted"],
			// mint is not grown back on a stem minter gives by dropping er
			// (center is not cent), only its inflections are.
			["minter", "minting for minter"],
			["hedging", "hedge for hedging"],
			// An inflection's stem takes back no al (renting is not rental).
			["renting", "rent for renting"],
			["shops", "shopping for shops"],
			["backing", "back and backed for backing"],
			["algorithmic", "algorithms for algorithmic"],
			["cheapest", "cheap for cheapest"],
			["generator", "generate for generator"],
			["delegate", "delegating and delegation for delegate"],
		])
			expect(line(word), word).toContain(`used: ${clause}`);
	});

	it("claims no related form a shared prefix only looks like", () => {
		// revocable is related to revoke, but k to c is past the rule.
		for (const word of [
			"revoke",
			"relief",
			"forex",
			"vouchers",
			"stick",
			"tractor",
			"port",
			"mill",
			"miner",
			"center",
			"strip",
			"stalling",
			"wither",
			// es and e dropped where they are not an ending: them is not
			// themes or theme.
			"themes",
			"theme",
			"notes",
			"planes",
			"hopes",
			"modes",
			// Re-check 2026-10-23: a word's own inflection let these back in
			// (ports portal, mills million, forming formal, billed billion).
			"ports",
			"mills",
			"forming",
			"strips",
			"miners",
			"billed",
		])
			expect(line(word), word).not.toMatch(/related form/);
	});

	it("names plan for planning but never planes", () => {
		expect(line("planning")).toContain("used: plan for planning");
		expect(line("planning")).not.toContain("planes");
	});
});

describe("the warning names a spelling only when one is clear", () => {
	const remit = (n: number, typo: number) => [
		...Array.from({ length: n }, (_, i) =>
			build(`Remit ${i}`, "Remittance app."),
		),
		...Array.from({ length: typo }, (_, i) =>
			build(`Typo ${i}`, "Remmitance app."),
		),
	];
	const suggestion = "(remittance is a used word one edit from remitance)";

	it("names a word five times as used as any other one edit away", () => {
		expect(unusedWordsWarning(remit(5, 1), "remitance", [])).toContain(
			suggestion,
		);
	});

	it("names none when two are close in use", () => {
		expect(unusedWordsWarning(remit(5, 2), "remitance", [])).not.toContain(
			suggestion,
		);
	});
});

describe("a name alone does not list a build when most of q is in no build", () => {
	const pool = [
		build("Quantum Shield Exchange", "Post-quantum key custody."),
		build("MellaMate", "A companion app for daily habits."),
		build("Escrow Hub", "Escrow for freelancers on Soroban."),
		build("Café Pay", "Tap to pay at a café."),
	];
	const names = (q: string) =>
		searchHackathonBuilds(pool, q).map((s) => s.b.name);

	it("drops a build named for one word, or holding one inside its name", () => {
		expect(names("quantum llama sandwich")).toEqual([]);
	});

	it("keeps name matches when at most half of q is in no build", () => {
		expect(names("quantum escrow sandwich").sort()).toEqual([
			"Escrow Hub",
			"Quantum Shield Exchange",
		]);
		// An accented word is a word some build uses.
		expect(names("café sandwich")).toEqual(["Café Pay"]);
	});

	it("keeps a build that covers half of q, and every one-word match", () => {
		expect(names("escrow freelancers pogo stick")).toEqual(["Escrow Hub"]);
		expect(names("llama")).toEqual(["MellaMate"]);
	});
});

describe("brief picks winners first, then broadens", () => {
	// 2026-10-23: vetIdea reranks its prior art, so the brief takes vetIdea's
	// list after its winner slots instead of re-deriving the hybrid top five.
	it("after its winner slots lists the builds vetIdea lists, in vetIdea's order", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		const pool = [
			build(
				"RenderGate",
				"Pay-per-render browser API for agents with x402.",
				true,
			),
			build("Exact phrase", "x402 pay-per-call API for AI agents."),
			build("Second", "x402 API for agents paying per call."),
		];
		const scored = searchHackathonBuilds(
			pool,
			"x402 pay-per-call API for AI agents",
			{ perSubmission: true },
		);
		expect(
			pickBriefBuilds(scored, [pool[2], pool[0]]).map((s) => s.b.name),
		).toEqual(["RenderGate", "Second"]);
		// No list from vetIdea (its read failed): the evidence rule, as before.
		expect(pickBriefBuilds(scored, undefined)).toEqual(pickBriefBuilds(scored));
		expect(pickBriefBuilds(scored).map((s) => s.b.name)).toContain(
			"Exact phrase",
		);
	});

	// Review 2026-10-23: the brief looked vetIdea's ids up in its own ranking
	// and dropped, in silence, one its own search did not hold (vetIdea served
	// hybrid, the brief keyword).
	it("lists a build vetIdea lists that its own ranking does not hold", async () => {
		const { pickBriefBuilds, vetBuildsIn } = await import(
			"@/lib/hackathon-brief"
		);
		const pool = [
			build("Words", "x402 pay-per-call API for AI agents."),
			build("Meaning only", "Agents settle usage per request in stablecoins."),
		];
		// Keyword served: the meaning-only build is not in the ranking.
		const scored = searchHackathonBuilds(
			pool,
			"x402 pay-per-call API for AI agents",
			{ perSubmission: true },
		);
		expect(scored.map((s) => s.b.name)).toEqual(["Words"]);
		const vetRows = [
			{ id: "Meaning only", hackathon: "Stellar Hacks: Agents" },
			{ id: "Words", hackathon: "Stellar Hacks: Agents" },
		];
		const listed = vetBuildsIn(vetRows, scored, pool);
		expect(pickBriefBuilds(scored, listed.builds).map((s) => s.b.name)).toEqual(
			["Meaning only", "Words"],
		);
		expect(listed.missing).toEqual([]);
	});

	it("takes vetIdea's event entry from the index, and names a build it cannot find", async () => {
		const { vetBuildsIn } = await import("@/lib/hackathon-brief");
		const twin = build("Twin", "A wallet.", false, "twin");
		const other = {
			...twin,
			hackathon: { title: "Other", slug: "other", endedAt: null },
		};
		const listed = vetBuildsIn(
			[
				{ id: "twin", hackathon: "Other" },
				{ id: "gone", hackathon: "Stellar Hacks: Agents" },
			],
			[],
			[twin, other],
		);
		expect(listed.builds).toEqual([other]);
		expect(listed.missing).toEqual(["gone"]);
	});

	it("puts covering winners first and leaves out a one-word winner", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		// The brief takes the search's scored list (hybrid in production).
		const picks = pickBriefBuilds(
			searchHackathonBuilds(
				[
					build("Exact phrase", "x402 pay-per-call API for AI agents."),
					build(
						"RenderGate",
						"Pay-per-render browser API for agents with x402.",
						true,
					),
					build("Wallet winner", "A wallet.", true),
				],
				"x402 pay-per-call API for AI agents",
				{ perSubmission: true },
			),
		).map((s) => s.b.name);
		expect(picks[0]).toBe("RenderGate");
		expect(picks).toContain("Exact phrase");
		expect(picks).not.toContain("Wallet winner");
	});

	it("keeps winners-first on a hybrid list: share is keyword coverage", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		const pool = [
			build("Keyword winner", "Multisig treasury wallet for teams.", true),
			build("Meaning-only winner", "Shared custody for group funds.", true),
			build("One-word winner", "A wallet for gamers.", true),
			build("Close match", "Multisig wallet for team treasuries."),
		];
		// Meaning scores as the vector search would give them (at or above the
		// floor); "Meaning-only winner" shares no word with the idea.
		const semantic = new Map(
			pool.map((b, i) => [b.id, [0.8, 0.79, 0.69, 0.78][i]] as const),
		);
		const scored = searchHackathonBuilds(
			pool,
			"multisig wallet team treasury",
			{
				perSubmission: true,
				mode: "hybrid",
				semantic,
			},
		);
		const meaningOnly = scored.find((s) => s.b.name === "Meaning-only winner");
		expect(meaningOnly?.share).toBe(0);
		const picks = pickBriefBuilds(scored).map((s) => s.b.name);
		expect(picks[0]).toBe("Keyword winner");
		// One word of four and a meaning score under 0.7: not prior art.
		expect(picks).not.toContain("One-word winner");
		// Found by meaning alone: not a winner-first slot, but listed on merit.
		expect(picks.indexOf("Meaning-only winner")).toBeGreaterThan(0);
	});

	it("holds winners to the evidence rule: half of a two-word idea is one word", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		const pool = [
			build("Gamer wallet", "A wallet for gamers.", true),
			build("Team multisig", "Multisig wallet for teams."),
		];
		const semantic = new Map([
			[pool[0].id, 0.69],
			[pool[1].id, 0.8],
		]);
		const scored = searchHackathonBuilds(pool, "multisig wallet", {
			perSubmission: true,
			mode: "hybrid",
			semantic,
		});
		// One of two words is share 0.5, but one word and 0.69 is not prior art.
		expect(scored.find((s) => s.b.name === "Gamer wallet")?.share).toBe(0.5);
		expect(pickBriefBuilds(scored).map((s) => s.b.name)).toEqual([
			"Team multisig",
		]);
	});

	it("does not pull a winner that only mentions a one-word idea above the top five", async () => {
		const { pickBriefBuilds } = await import("@/lib/hackathon-brief");
		// Five builds about stablecoins, close in meaning, rank above a winner
		// that mentions the word once and has no meaning score.
		const pool = [
			...[1, 2, 3, 4, 5].map((i) =>
				build(`Peg ${i}`, "A stablecoin backed by treasuries."),
			),
			build("Tip jar", "Tips for streamers, with a stablecoin option.", true),
		];
		const semantic = new Map(pool.slice(0, 5).map((b) => [b.id, 0.8]));
		const scored = searchHackathonBuilds(pool, "stablecoin", {
			perSubmission: true,
			mode: "hybrid",
			semantic,
		});
		expect(scored.findIndex((s) => s.b.name === "Tip jar")).toBe(5);
		const picks = pickBriefBuilds(scored).map((s) => s.b.name);
		expect(picks).not.toContain("Tip jar");
		expect(picks).toHaveLength(5);
	});
});

describe("textShare reads the build's own words", () => {
	const withText = (
		name: string,
		description: string,
		extra: Partial<IndexedBuild> = {},
	): IndexedBuild => {
		const b = { ...build(name, description), ...extra };
		return {
			...b,
			haystack:
				`${b.name} ${b.description ?? ""} ${b.track ?? ""} ${b.award ?? ""}`.toLowerCase(),
		};
	};
	const textShares = (pool: IndexedBuild[], q: string) =>
		Object.fromEntries(
			searchHackathonBuilds(pool, q).map((s) => [s.b.name, s.textShare]),
		);

	it("counts the word in a name or description, not only in a track or award", () => {
		expect(
			textShares(
				[
					withText("Peg", "Stablecoins backed by treasuries."),
					withText("Swap", "A DEX.", {
						award: "Best Stablecoin Integration",
					}),
					withText("Rail", "Payroll.", { track: "Stablecoin track" }),
				],
				"stablecoin",
			),
		).toEqual({ Peg: 1, Swap: 0, Rail: 0 });
	});

	it("does not count a synonym as the idea's word", () => {
		// The search matches "usdc" for "stablecoin"; a build that only pays in
		// USDC is not a stablecoin build.
		expect(
			textShares(
				[withText("Toll", "Per-call USDC micropayments for MCP servers.")],
				"stablecoin",
			),
		).toEqual({ Toll: 0 });
	});
});

describe("one submission in full", () => {
	it("opens from the id, the bare number or the DoraHacks link", async () => {
		const { parseBuildId } = await import("@/lib/hackathon-build-links");
		expect(parseBuildId("dorahacks-buidl-42585")).toBe("dorahacks-buidl-42585");
		expect(parseBuildId(" 42585 ")).toBe("dorahacks-buidl-42585");
		expect(parseBuildId("https://dorahacks.io/buidl/42585")).toBe(
			"dorahacks-buidl-42585",
		);
		expect(parseBuildId("tollpay")).toBeNull();
		expect(parseBuildId("42585; drop")).toBeNull();
	});

	it("serves the write-up, the parsed prize and an unchecked link as absent", async () => {
		const { buildDetailFromStored } = await import("@/lib/hackathon-builds");
		const blend = {
			id: "x",
			buildId: "dorahacks-buidl-27438",
			name: "Blend Pool Creator",
			vision: "Launch custom lending pools.",
			description: "## Blend Pool Creator\nFull write-up.",
			selfTags: ["layer1:Stellar"],
			hackathonSlug: "stellar-hacks-blend",
			hackathonTitle: "Stellar Hacks: Blend",
			endedAt: "2025-07-07",
			placement: "1st Place - $3,000 in XLM",
			isWinner: true,
			url: "https://dorahacks.io/buidl/27438",
			githubUrl: "https://github.com/ELDEVODE/blend-pool-creator",
			repoFullName: "eldevode/blend-pool-creator",
			firstSeenAt: "2026-10-05T10:20:00.000Z",
			lastSeenAt: "2026-10-05T10:20:00.000Z",
			detailReadAt: "2026-10-05T10:20:00.000Z",
			updatedAt: "2026-10-05T10:20:00.000Z",
			createdAt: "2026-10-05T10:20:00.000Z",
		};
		const d = buildDetailFromStored([blend], new Set());
		expect(d.writeUp).toBe("## Blend Pool Creator\nFull write-up.");
		expect(d.prizeUsd).toBe(3000);
		expect(d.hackathon.slug).toBe("stellar-hacks-blend");
		expect("project" in d).toBe(false);

		// sls-092: the same submission also entered a later event, unplaced.
		// Its placed entry leads; both events are listed.
		const palta = {
			...blend,
			id: "y",
			hackathonSlug: "stellar-hacks-paltalabs",
			hackathonTitle: "Stellar Hacks: PaltaLabs",
			endedAt: "2025-08-07",
			placement: null,
			isWinner: false,
		};
		const both = buildDetailFromStored([palta, blend], new Set());
		expect(both.hackathon.slug).toBe("stellar-hacks-blend");
		expect(both.placement).toBe("1st Place - $3,000 in XLM");
		expect(
			both.entries.map((e) => [e.hackathon.slug, e.isWinner, e.prizeUsd]),
		).toEqual([
			["stellar-hacks-blend", true, 3000],
			["stellar-hacks-paltalabs", false, null],
		]);
		// A restored entry is a new row; the submission is not new.
		const restored = { ...blend, firstSeenAt: "2026-10-15T09:00:00.000Z" };
		const old = { ...palta, lastSeenAt: "2026-10-15T09:00:00.000Z" };
		const dated = buildDetailFromStored([old, restored], new Set());
		expect(dated.firstSeenAt).toBe("2026-10-05T10:20:00.000Z");
		expect(dated.lastSeenAt).toBe("2026-10-15T09:00:00.000Z");
	});

	it("serves an award its event's winners of other placements share as awardCategory, in every entry", async () => {
		const { buildDetailFromStored } = await import("@/lib/hackathon-builds");
		const { prizeCategories } = await import("@/lib/integrations/dorahacks");
		const umbra = {
			id: "u",
			buildId: "dorahacks-buidl-46541",
			name: "Umbra Wallet",
			hackathonSlug: "stellar-hacks-zk",
			hackathonTitle: "Stellar Hacks: Real-World ZK",
			endedAt: "2025-10-09",
			placement: "3rd Place - $1,250 in XLM",
			award: "$10,000 XLM Prize",
			isWinner: true,
			url: "https://dorahacks.io/buidl/46541",
			firstSeenAt: "2026-10-05T10:20:00.000Z",
			lastSeenAt: "2026-10-05T10:20:00.000Z",
			updatedAt: "2026-10-05T10:20:00.000Z",
			createdAt: "2026-10-05T10:20:00.000Z",
		};
		// The same award text in a later event, its only winner's own prize.
		const later = {
			...umbra,
			id: "v",
			hackathonSlug: "later",
			hackathonTitle: "Later",
			endedAt: "2026-01-01",
			placement: "Winners",
		};
		const categories = prizeCategories(
			[
				{
					hackathonSlug: "stellar-hacks-zk",
					placement: "1st Place - $5,000 in XLM",
				},
				{
					hackathonSlug: "stellar-hacks-zk",
					placement: "3rd Place - $1,250 in XLM",
				},
				{ hackathonSlug: "later", placement: "Winners" },
			].map((w) => ({
				hackathon: { slug: w.hackathonSlug },
				hackathonPlacement: w.placement,
				award: "$10,000 XLM Prize",
			})),
		);
		const d = buildDetailFromStored([later, umbra], categories);
		expect([d.hackathon.slug, d.award, d.awardCategory, d.prizeUsd]).toEqual([
			"later",
			"$10,000 XLM Prize",
			null,
			null,
		]);
		expect(
			d.entries.map((e) => [
				e.hackathon.slug,
				e.award,
				e.awardCategory,
				e.prizeUsd,
			]),
		).toEqual([
			["later", "$10,000 XLM Prize", null, null],
			["stellar-hacks-zk", null, "$10,000 XLM Prize", 1250],
		]);
		expect(
			undeclaredInServed(
				spec,
				responseSchema(spec, "/api/hackathons/builds/{id}"),
				{ build: d },
			),
		).toEqual([]);
	});
});

describe("search by meaning", () => {
	const idx = [
		build(
			"Position Watch",
			"Telegram alerts when a position nears closing.",
			false,
			"a",
		),
		build("Lending Dashboard", "Lending pool analytics and alerts.", true, "b"),
		build("NFT Gallery", "Show your collectibles.", false, "c"),
	];
	// "warn borrowers before liquidation" shares no word with build a; its
	// meaning is close.
	const sem = new Map([
		["a", 0.82],
		["b", 0.74],
	]);

	it("meaning finds a build that shares no words with the query", () => {
		const out = searchHackathonBuilds(
			idx,
			"warn borrowers before liquidation",
			{
				mode: "meaning",
				semantic: sem,
			},
		);
		expect(out.map((s) => s.b.id)).toEqual(["a", "b"]);
		expect(out[0].similarity).toBe(0.82);
		expect(out[0].matched).toEqual([]);
	});

	it("hybrid keeps keyword matches and adds close-in-meaning builds", () => {
		const out = searchHackathonBuilds(idx, "lending alerts", {
			mode: "hybrid",
			semantic: sem,
		});
		const ids = out.map((s) => s.b.id);
		expect(ids[0]).toBe("b"); // both signals, and a winner
		expect(ids).toContain("a"); // joined on meaning
		expect(ids).not.toContain("c");
	});

	it("keyword mode ignores similarity entirely", () => {
		const out = searchHackathonBuilds(
			idx,
			"warn borrowers before liquidation",
			{
				mode: "keyword",
				semantic: sem,
			},
		);
		expect(out.every((s) => s.similarity === undefined)).toBe(true);
	});
});

describe("what a build's repo declares", () => {
	const stored = (over: Partial<HackathonBuild>): HackathonBuild => ({
		id: "x",
		buildId: "dorahacks-buidl-42585",
		name: "TollPay",
		hackathonSlug: "stellar-agents-x402-stripe-mpp",
		hackathonTitle: "Stellar Hacks: Agents",
		url: "https://dorahacks.io/buidl/42585",
		firstSeenAt: "2026-10-05T00:00:00.000Z",
		lastSeenAt: "2026-10-05T00:00:00.000Z",
		updatedAt: "2026-10-05T00:00:00.000Z",
		createdAt: "2026-10-05T00:00:00.000Z",
		...over,
	});

	it("keeps 'not read' apart from 'declares none'", async () => {
		const { buildDetailFromStored } = await import("@/lib/hackathon-builds");
		// A stack left over from an older read is not served without its date.
		expect("stack" in indexedFromStored(stored({ stack: ["x"] }))).toBe(false);
		expect(
			indexedFromStored(stored({ stackReadAt: "2026-10-05T00:00:00.000Z" }))
				.stack,
		).toEqual([]);
		const d = buildDetailFromStored(
			[stored({ repoMissingAt: "2026-10-05T00:00:00.000Z" })],
			new Set(),
		);
		expect("stack" in d).toBe(false);
		expect(d.stackReadAt).toBeNull();
		expect(d.repoMissingAt).toBe("2026-10-05T00:00:00.000Z");
	});

	// The 2026-10-22 battery: q=passkey&winnersOnly=1 found no winner, though
	// Tukar's repo declares passkey-kit.
	it("matches a package the repo declares when asked, never as the build's own words", () => {
		const tukar = indexedFromStored(
			stored({
				name: "Tukar",
				vision: "Cross-border transfers in local currencies.",
				isWinner: true,
				stack: ["passkey-kit", "@blend-capital/blend-sdk", "soroban-sdk"],
				stackReadAt: "2026-10-05T00:00:00.000Z",
			}),
		);
		const out = searchHackathonBuilds([tukar], "passkey", {
			winnersOnly: true,
			packages: true,
		});
		expect(out.map((s) => [s.b.name, s.matched, s.textShare])).toEqual([
			["Tukar", ["passkey"], 0],
		]);
		expect(
			searchHackathonBuilds([tukar], "passkey-kit", { packages: true }),
		).toHaveLength(1);
		// Prior art and analyze do not ask: a package is not what a build does.
		expect(searchHackathonBuilds([tukar], "passkey")).toEqual([]);
	});

	it("leaves out the libraries most repos declare, and a stack not read", () => {
		const common = indexedFromStored(
			stored({
				vision: "Pay per call.",
				stack: [
					"@stellar/stellar-sdk",
					"soroban-sdk",
					"@stellar/freighter-api",
					"@creit.tech/stellar-wallets-kit",
					"@x402/fetch",
				],
				stackReadAt: "2026-10-05T00:00:00.000Z",
			}),
		);
		const unread = indexedFromStored(
			stored({ vision: "Pay per call.", stack: ["passkey-kit"] }),
		);
		for (const q of ["soroban", "freighter", "wallets", "x402", "sdk"])
			expect(searchHackathonBuilds([common], q, { packages: true })).toEqual(
				[],
			);
		expect(
			searchHackathonBuilds([unread], "passkey", { packages: true }),
		).toEqual([]);
	});
});

describe("package filter", () => {
	it("keeps only builds whose read repo declares the package", () => {
		const rows: IndexedBuild[] = [
			{ ...build("Passkey Wallet", "wallet", true), stack: ["passkey-kit"] },
			{ ...build("Plain Wallet", "wallet"), stack: [] },
			build("Unread Wallet", "wallet"),
		];
		const hit = searchHackathonBuilds(rows, "", { package: "Passkey-Kit" });
		expect(hit.map((s) => s.b.name)).toEqual(["Passkey Wallet"]);
	});
});

describe("links by owner and name", () => {
	const owners = async () => {
		const { indexProjectOwners } = await import("@/lib/hackathon-build-links");
		return indexProjectOwners([
			{
				slug: "neko",
				name: "Neko",
				links: { github: "https://github.com/Neko-Protocol" },
			},
			{
				slug: "sextant-agent",
				name: "Sextant Agent",
				github: { repos: [{ owner: "pedro-pelicioni", name: "sextant" }] },
			},
			{
				slug: "freighter",
				name: "Freighter",
				links: { github: "https://github.com/stellar/freighter" },
			},
			{
				slug: "sorobanhooks",
				name: "Sorobanhooks",
				links: { github: "https://github.com/sorobanhooks" },
			},
			{
				slug: "vaquita",
				name: "Vaquita",
				links: { github: "https://github.com/vaquita-fi" },
			},
			{
				slug: "vaquita-pools",
				name: "Vaquita Pools",
				links: { github: "https://github.com/vaquita-fi/pools" },
			},
			{
				slug: "ion",
				name: "Ion",
				links: { github: "https://github.com/ion-labs" },
			},
		]);
	};

	it("links a submission under the project's owner that carries its name", async () => {
		const { ownerAndNameLink } = await import("@/lib/hackathon-build-links");
		const o = await owners();
		expect(
			ownerAndNameLink(
				"https://github.com/Neko-Protocol/neko-dex",
				"Neko Protocol",
				o,
			),
		).toEqual({
			slug: "neko",
			name: "Neko",
			basis: "owner-and-name",
		});
		expect(
			ownerAndNameLink("https://github.com/sorobanhooks", "Sorobanhooks", o)
				?.slug,
		).toBe("sorobanhooks");
	});

	it("never takes a builder's other product, the examples repo or a team-named entry", async () => {
		const { ownerAndNameLink } = await import("@/lib/hackathon-build-links");
		const o = await owners();
		// The 2026-10-05 audit's two cases: same owner, other names.
		expect(
			ownerAndNameLink(
				"https://github.com/pedro-pelicioni/gift-pool-zk",
				"Gift Pool ZK",
				o,
			),
		).toBeNull();
		expect(
			ownerAndNameLink(
				"https://github.com/stellar/soroban-examples",
				"Qué es Stellar?",
				o,
			),
		).toBeNull();
		// Named for its team, not as the team's project.
		expect(
			ownerAndNameLink(
				"sorobanhooks/freighter",
				"x402 Smart Wallet - By Sorobanhooks",
				o,
			),
		).toBeNull();
	});

	it("refuses a name two projects under one owner both fit, and names too short", async () => {
		const { ownerAndNameLink, nameKeyOf } = await import(
			"@/lib/hackathon-build-links"
		);
		const o = await owners();
		expect(
			ownerAndNameLink(
				"https://github.com/vaquita-fi/pools-v2",
				"Vaquita Pools v2",
				o,
			),
		).toBeNull();
		expect(
			ownerAndNameLink(
				"https://github.com/vaquita-fi/boost",
				"Vaquita Boost",
				o,
			)?.slug,
		).toBe("vaquita");
		expect(
			ownerAndNameLink("https://github.com/ion-labs/ion", "Ion", o),
		).toBeNull();
		expect(nameKeyOf("Ion")).toBeNull();
		expect(nameKeyOf("Neko Protocol")).toBe("nekoprotocol");
	});

	it("reads the owner from an organization link too", async () => {
		const { githubOwnerOf } = await import("@/lib/hackathon-build-links");
		expect(githubOwnerOf("https://github.com/orgs/Orion-LB/repositories")).toBe(
			"orion-lb",
		);
		expect(githubOwnerOf("https://github.com/mpprouter")).toBe("mpprouter");
		expect(githubOwnerOf("https://github.com/a/b/tree/main")).toBe("a");
		expect(githubOwnerOf("https://gitlab.com/a/b")).toBeNull();
	});
});

describe("links by website", () => {
	it("compares hosts without www. or app., and never a shared platform", async () => {
		const { siteKeyOf } = await import("@/lib/hackathon-build-links");
		expect(siteKeyOf("https://www.tollpay.xyz/pricing")).toBe("tollpay.xyz");
		expect(siteKeyOf("https://app.tollpay.xyz")).toBe("tollpay.xyz");
		expect(siteKeyOf("https://rendergate.vercel.app/")).toBe(
			"rendergate.vercel.app",
		);
		expect(siteKeyOf("https://github.com/rajkaria/toll")).toBeNull();
		expect(siteKeyOf("https://someone.github.io/demo")).toBeNull();
		expect(siteKeyOf("https://youtu.be/abc")).toBeNull();
		expect(siteKeyOf("not a url")).toBeNull();
		expect(siteKeyOf("ftp://tollpay.xyz")).toBeNull();
	});

	it("links a site one project claims, and none that two projects share", async () => {
		const { indexProjectSites } = await import("@/lib/hackathon-build-links");
		const sites = indexProjectSites([
			{
				slug: "tollpay",
				name: "TollPay",
				links: { website: "https://tollpay.xyz" },
			},
			{ slug: "a", name: "A", links: { website: "https://shared.io" } },
			{ slug: "b", name: "B", links: { website: "https://www.shared.io" } },
			{
				slug: "draft",
				name: "Draft",
				status: "Draft",
				links: { website: "https://draft.dev" },
			},
		]);
		expect(sites.get("tollpay.xyz")).toEqual({
			slug: "tollpay",
			name: "TollPay",
		});
		expect(sites.get("shared.io")).toBeNull();
		expect(sites.has("draft.dev")).toBe(false);
	});

	it("serves the basis a link was made by", () => {
		const b = indexedFromStored({
			id: "x",
			buildId: "dorahacks-buidl-1",
			name: "X",
			hackathonSlug: "e",
			hackathonTitle: "E",
			url: "https://dorahacks.io/buidl/1",
			linkCheckedAt: "2026-10-05T00:00:00.000Z",
			projectSlug: "tollpay",
			projectName: "TollPay",
			projectLinkBasis: "website",
			firstSeenAt: "2026-10-05T00:00:00.000Z",
			lastSeenAt: "2026-10-05T00:00:00.000Z",
			updatedAt: "2026-10-05T00:00:00.000Z",
			createdAt: "2026-10-05T00:00:00.000Z",
		});
		expect(b.project).toEqual({
			slug: "tollpay",
			name: "TollPay",
			basis: "website",
		});
	});
});

describe("project facts on a link", () => {
	it("carries the project's status and funding when read, and leaves them out when not", () => {
		const row = {
			id: "x",
			buildId: "dorahacks-buidl-42585",
			name: "TollPay",
			hackathonSlug: "e",
			hackathonTitle: "E",
			url: "https://dorahacks.io/buidl/42585",
			linkCheckedAt: "2026-10-05T00:00:00.000Z",
			projectSlug: "tollpay",
			projectName: "TollPay",
			projectLinkBasis: "repo",
			firstSeenAt: "2026-10-05T00:00:00.000Z",
			lastSeenAt: "2026-10-05T00:00:00.000Z",
			updatedAt: "2026-10-05T00:00:00.000Z",
			createdAt: "2026-10-05T00:00:00.000Z",
		};
		expect(
			indexedFromStored(row, {
				status: "Live",
				scfAwarded: false,
				factsReadAt: "2026-10-05T17:00:00.000Z",
			}).project,
		).toEqual({
			slug: "tollpay",
			name: "TollPay",
			basis: "repo",
			status: "Live",
			scfAwarded: false,
			factsReadAt: "2026-10-05T17:00:00.000Z",
		});
		expect(indexedFromStored(row).project).toEqual({
			slug: "tollpay",
			name: "TollPay",
			basis: "repo",
		});
	});
});

// sls-092: Blend Pool Creator entered Stellar Hacks: Blend (1st place) and
// then PaltaLabs. The index dropped every row after a submission's first,
// so Blend served no first place and 35 of its 39 submissions.
describe("a submission entered in two events", () => {
	const inEvent = (slug: string, isWinner: boolean): IndexedBuild => ({
		...build(
			"Blend Pool Creator",
			"Launch custom lending pools.",
			isWinner,
			"dorahacks-buidl-27438",
		),
		hackathon: { title: slug, slug, endedAt: null },
	});
	const rows = [
		inEvent("stellar-hacks-paltalabs", false),
		inEvent("stellar-hacks-blend", true),
	];

	it("keeps one row per event, each with its own placement", () => {
		expect(
			dedupeBuilds(rows).map((b) => [b.hackathon.slug, b.isWinner]),
		).toEqual([
			["stellar-hacks-paltalabs", false],
			["stellar-hacks-blend", true],
		]);
		// The same event listing it twice is still one row.
		expect(dedupeBuilds([...rows, rows[1]])).toHaveLength(2);
	});

	it("an event filter serves that event's own row", () => {
		const hit = searchHackathonBuilds(rows, "", {
			hackathons: ["stellar-hacks-blend"],
		});
		expect(hit.map((s) => [s.b.hackathon.slug, s.b.isWinner])).toEqual([
			["stellar-hacks-blend", true],
		]);
	});

	it("across events it is one result, its placed entry", () => {
		for (const q of ["", "lending pools"]) {
			const hit = searchHackathonBuilds(rows, q, { perSubmission: true });
			expect(hit.map((s) => s.b.hackathon.slug)).toEqual([
				"stellar-hacks-blend",
			]);
		}
	});

	it("counting keeps every event entry (analyze counts once per event)", () => {
		expect(searchHackathonBuilds(rows, "")).toHaveLength(2);
	});

	it("an unplaced submission's best entry is its latest event", () => {
		const at = (slug: string, endedAt: string): IndexedBuild => ({
			...inEvent(slug, false),
			hackathon: { title: slug, slug, endedAt },
		});
		const pick = onePerSubmission([
			at("older", "2025-07-07"),
			at("newer", "2025-08-07"),
		]);
		expect(pick.map((b) => b.hackathon.slug)).toEqual(["newer"]);
	});
});

describe("links through a repo that was renamed or transferred", () => {
	const indexes = async () => {
		const links = await import("@/lib/hackathon-build-links");
		const rows = [
			{
				slug: "widget",
				name: "Widget",
				status: "Live",
				links: { github: "https://github.com/widget-labs/widget" },
			},
			{
				slug: "gadget",
				name: "Gadget",
				status: "Live",
				links: { github: "https://github.com/gadget-org" },
			},
			{
				slug: "doohickey",
				name: "Doohickey",
				status: "Live",
				links: { website: "https://doohickey.app" },
				github: { repos: [{ owner: "doohickey-org", name: "core" }] },
			},
			{
				slug: "shared-a",
				name: "Shared A",
				status: "Live",
				github: { repos: [{ owner: "both", name: "shared" }] },
			},
			{
				slug: "shared-b",
				name: "Shared B",
				status: "Live",
				github: { repos: [{ owner: "both", name: "shared" }] },
			},
		];
		return {
			links,
			idx: {
				repos: links.indexProjectRepos(rows),
				sites: links.indexProjectSites(rows),
				owners: links.indexProjectOwners(rows),
			},
		};
	};

	it("links by exact repo when the project lists the repo it moved to", async () => {
		const { links, idx } = await indexes();
		const b = {
			name: "Widget",
			githubUrl: "https://github.com/a-builder/widget",
			repoFullName: "a-builder/widget",
		};
		expect(links.linkBuild(b, idx).project).toBeNull();
		expect(
			links.linkBuild({ ...b, repoCurrentFullName: "widget-labs/widget" }, idx)
				.project,
		).toEqual({ slug: "widget", name: "Widget", basis: "moved-repo" });
	});

	it("links by owner and name read on the repo it moved to", async () => {
		const { links, idx } = await indexes();
		const b = {
			name: "Gadget Pay",
			githubUrl: "https://github.com/a-builder/gadget-pay",
			repoFullName: "a-builder/gadget-pay",
		};
		expect(links.linkBuild(b, idx).project).toBeNull();
		expect(
			links.linkBuild(
				{ ...b, repoCurrentFullName: "gadget-org/gadget-pay" },
				idx,
			).project,
		).toEqual({
			slug: "gadget",
			name: "Gadget",
			basis: "moved-owner-and-name",
		});
		// The owner alone is never enough: another name under it stays unlinked.
		expect(
			links.linkBuild(
				{
					name: "Sprocket",
					githubUrl: "https://github.com/a-builder/sprocket",
					repoFullName: "a-builder/sprocket",
					repoCurrentFullName: "gadget-org/sprocket",
				},
				idx,
			).project,
		).toBeNull();
	});

	it("adds no link when the repo could not be resolved or did not move", async () => {
		const { links, idx } = await indexes();
		const b = {
			name: "Widget",
			githubUrl: "https://github.com/a-builder/widget",
			repoFullName: "a-builder/widget",
		};
		for (const repoCurrentFullName of [undefined, null, "a-builder/widget"])
			expect(links.linkBuild({ ...b, repoCurrentFullName }, idx)).toEqual({
				project: null,
				ambiguous: false,
			});
		// The sync lane's value for a repo GitHub did not answer (404 or a
		// failed read): the last one read for this same repo, or nothing.
		expect(links.currentRepoFor("a-builder/widget", undefined)).toBeNull();
		expect(
			links.currentRepoFor("a-builder/widget", undefined, {
				repoFullName: "a-builder/widget",
				repoCurrentFullName: "widget-labs/widget",
			}),
		).toBe("widget-labs/widget");
		// A stored value names where another repo went: never carried over.
		expect(
			links.currentRepoFor("a-builder/widget-v2", undefined, {
				repoFullName: "a-builder/widget",
				repoCurrentFullName: "widget-labs/widget",
			}),
		).toBeNull();
		// A read: the repo it answers under, or null when that is the same repo.
		expect(links.currentRepoFor("a-builder/widget", "widget-labs/widget")).toBe(
			"widget-labs/widget",
		);
		expect(
			links.currentRepoFor("a-builder/widget", "a-builder/widget", {
				repoFullName: "a-builder/widget",
				repoCurrentFullName: "widget-labs/widget",
			}),
		).toBeNull();
	});

	it("changes no link the stored repo, the site or the stored owner already decides", async () => {
		const { links, idx } = await indexes();
		// Listed by its stored repo: the move is not read.
		expect(
			links.linkBuild(
				{
					name: "Widget",
					repoFullName: "widget-labs/widget",
					repoCurrentFullName: "doohickey-org/core",
				},
				idx,
			).project,
		).toEqual({ slug: "widget", name: "Widget", basis: "repo" });
		// A stored repo two projects list stays unlinked, moved or not.
		expect(
			links.linkBuild(
				{
					name: "Shared",
					repoFullName: "both/shared",
					repoCurrentFullName: "widget-labs/widget",
				},
				idx,
			),
		).toEqual({ project: null, ambiguous: true });
		// The repo it moved to is listed by two projects: unlinked.
		expect(
			links.linkBuild(
				{
					name: "Doohickey",
					demoUrl: "https://doohickey.app",
					repoFullName: "a-builder/x",
					repoCurrentFullName: "both/shared",
				},
				idx,
			),
		).toEqual({ project: null, ambiguous: true });
		// The site rule still comes before owner and name on the moved repo.
		expect(
			links.linkBuild(
				{
					name: "Gadget Pay",
					demoUrl: "https://www.doohickey.app",
					repoFullName: "a-builder/gadget-pay",
					repoCurrentFullName: "gadget-org/gadget-pay",
				},
				idx,
			).project,
		).toEqual({ slug: "doohickey", name: "Doohickey", basis: "website" });
		// Owner and name on the stored repo comes before the moved one.
		expect(
			links.linkBuild(
				{
					name: "Gadget Pay",
					githubUrl: "https://github.com/gadget-org/gadget-pay",
					repoFullName: "gadget-org/gadget-pay",
					repoCurrentFullName: "a-builder/gadget-pay",
				},
				idx,
			).project,
		).toEqual({ slug: "gadget", name: "Gadget", basis: "owner-and-name" });
	});

	it("serves the moved bases", () => {
		for (const basis of ["moved-repo", "moved-owner-and-name"]) {
			const b = indexedFromStored({
				id: "x",
				buildId: "dorahacks-buidl-1",
				name: "X",
				hackathonSlug: "e",
				hackathonTitle: "E",
				url: "https://dorahacks.io/buidl/1",
				linkCheckedAt: "2026-10-23T00:00:00.000Z",
				projectSlug: "widget",
				projectName: "Widget",
				projectLinkBasis: basis,
				firstSeenAt: "2026-10-23T00:00:00.000Z",
				lastSeenAt: "2026-10-23T00:00:00.000Z",
				updatedAt: "2026-10-23T00:00:00.000Z",
				createdAt: "2026-10-23T00:00:00.000Z",
			});
			expect(b.project?.basis).toBe(basis);
		}
	});
});

describe("a question's outcome words are not concepts", () => {
	// The priority battery's winners questions (live 1.9.107): won, prizes,
	// hackathons and the question mark counted as concepts, so game builds
	// with prize pools stood level with the passkey and Blend winners asked
	// for, and a build naming Blend alone missed the half rule.
	const pool = [
		build("Passkey Wallet", "Onboard users with a passkey smart wallet.", true),
		build(
			"Arcade Rush",
			"Players who won rounds take prizes from the pool at Stellar hackathons.",
			true,
		),
		build("YieldBack", "Blend Coupon Bond", true),
		build("Pool Creator", "Launch custom lending pools on Blend.", true),
		build(
			"Fantasy League",
			"A fantasy sports game where winners split the prize pool.",
		),
	];

	it("searches only the topic of a winners question", () => {
		const out = searchHackathonBuilds(
			pool,
			"which passkey or smart-wallet projects have won prizes at stellar hackathons?",
			{ winnersOnly: true },
		);
		expect(out.map((s) => s.b.name)).toEqual(["Passkey Wallet"]);
		expect(out[0].share).toBe(1);
	});

	it("drops the question mark, so a stopword before it stays a stopword", () => {
		const out = searchHackathonBuilds(
			pool,
			"which past stellar hackathon winners built on top of the blend lending protocol?",
			{ winnersOnly: true },
		);
		expect(out.map((s) => s.b.name).sort()).toEqual([
			"Pool Creator",
			"YieldBack",
		]);
	});

	it("keeps the words where they are the idea, not a question", () => {
		const out = searchHackathonBuilds(
			pool,
			"fantasy sports game where winners split the prize pool",
		);
		expect(out[0].b.name).toBe("Fantasy League");
		expect(out[0].matched).toEqual(
			expect.arrayContaining(["winners", "prize"]),
		);
	});

	it("still searches a question made of them alone", () => {
		const out = searchHackathonBuilds(pool, "who won?");
		expect(out.map((s) => s.b.name)).toEqual(["Arcade Rush"]);
		expect(out[0].matched).toEqual(["won"]);
	});

	// Review, 2026-10-23: an opener joined by a hyphen or an apostrophe
	// ("how-to", "do-it-yourself", "who's") read a topic as a question.
	it("reads an opener as a question word only before a space", () => {
		const concepts = (q: string) => wordsNoBuildUses(pool, q).concepts;
		expect(concepts("how-to win hackathon prizes")).toBe(4);
		expect(concepts("do-it-yourself prize wheel")).toBe(3);
		expect(concepts("which passkey projects won prizes")).toBe(1);
	});

	it("counts the question's topic words for the unused-words rule", () => {
		expect(
			wordsNoBuildUses(
				pool,
				"has a cross-chain or bridge project ever won a prize at a stellar hackathon?",
			),
		).toEqual({ absent: ["bridge", "cross-chain"], concepts: 2 });
	});
});

describe("a query word is searched without its edge punctuation", () => {
	// Review 2026-10-31, reproduced live on 1.9.111: q=-- matched all 1,356
	// builds through the empty form, a "--" written as a dash listed every
	// build through the name rule, q=the- searched the stopword, and
	// "escrow, milestones, freelancers" listed nothing with no warning.
	const names = (pool: IndexedBuild[], q: string) =>
		searchHackathonBuilds(pool, q)
			.map((s) => s.b.name)
			.sort();
	const pool = [
		build("Lend", "Lending pools."),
		build("Shop", "Tools for small businesses."),
		build("Game", "A racing game."),
		build("Ref", "The referral wallet."),
	];

	it("a token of hyphens or symbols alone is no concept", () => {
		expect(names(pool, "--")).toEqual([]);
		expect(names(pool, "---")).toEqual([]);
		expect(names(pool, "lending -- small businesses")).toEqual(
			names(pool, "lending small businesses"),
		);
		const escrow = [
			build("Helper", "Escrow for teams"),
			build("Escrow Hub", "A hub."),
		];
		expect(names(escrow, "escrow sandwich !!!")).toEqual(
			names(escrow, "escrow sandwich"),
		);
	});

	it("a trailing hyphen does not keep a stopword as a concept", () => {
		expect(names(pool, "lending the-")).toEqual(names(pool, "lending the"));
	});

	it("a word followed by a comma matches the word", () => {
		const gig = [
			build("Gig Escrow", "Escrow with milestones for freelancers."),
		];
		const list = "escrow, milestones, freelancers";
		expect(names(gig, list)).toEqual(["Gig Escrow"]);
		expect(
			unusedWordsWarning(gig, list, searchHackathonBuilds(gig, list)),
		).toBeNull();
		expect(
			names([build("Agent Pay", "AI agents payments")], "agents,"),
		).toEqual(["Agent Pay"]);
	});

	it("keeps a word's combining marks, which are not punctuation", () => {
		const hindi = [build("Suraksha", "भुगतान सुरक्षा")];
		expect(names(hindi, "सुरक्षा,")).toEqual(["Suraksha"]);
	});
});
