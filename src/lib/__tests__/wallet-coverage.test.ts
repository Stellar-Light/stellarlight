/**
 * sls-033: on 2026-11-11, GET /api/projects/search?type=Wallet served 74 rows
 * and 41 of them carried no recorded state: 11 with productKind null, and all
 * 41 with availability null, which a consumer cannot tell apart from "nobody
 * looked". Each must end with a cited kind and either dated platform rows or a
 * dated check (none-found or could-not-check). The maps change only when the
 * curation lane runs, so what can fail here is the source: a map that would
 * leave a row without a state, or write a value the vocabulary or the served
 * contract does not hold.
 *
 * Lives in src/lib so CI runs it; the route part drives the real route with
 * Payload mocked.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	AVAILABILITY_CHECKED,
	AVAILABILITY_SET,
	PRODUCT_KIND,
	PRODUCT_KIND_UNRESOLVED,
	STATUS_FIX,
	WALLET_AVAILABILITY,
} from "../../../scripts/data/curation-maps";
import {
	AVAILABILITY_CHECK_RESULTS,
	AVAILABILITY_PLATFORMS,
	AVAILABILITY_STATES,
	PRODUCT_KINDS,
} from "../project-types";
import {
	availabilityPatch,
	CLEARED_CHECK,
	normCheck,
	pickAvailabilityCheck,
	walletCoverageGaps,
} from "../wallet-coverage";

/** The 11 Wallet rows served with productKind null on 2026-11-11. */
const KIND_NULL_2026_11_11 = [
	"amulets",
	"chainless",
	"haven",
	"ibis",
	"mxlet",
	"openzeppelin-stellar-privacy-wallet",
	"piggy-wallet",
	"privy",
	"rehive",
	"smart-treasury",
	"zig3v2",
];
/** All 41 Wallet rows served with availability null that day: the 11 above
 * and 30 that had a kind. */
const AVAILABILITY_NULL_2026_11_11 = [
	...KIND_NULL_2026_11_11,
	"albedo",
	"bebop",
	"ben-wallet",
	"bitget-wallet",
	"blaze",
	"boss-revolution",
	"coca",
	"cypher",
	"elsa",
	"empowch",
	"freelii",
	"hana",
	"humantech",
	"interstellar",
	"kotani-pay",
	"lemon",
	"metamask",
	"mpcvault",
	"nemorixpay",
	"neon-wallet",
	"openxswitch",
	"scopuly",
	"sentit",
	"spatium",
	"stellar-agent-wallet-skill",
	"stellar-metamask",
	"stellar-passport",
	"tago-cash",
	"trezor",
	"unstoppable-wallet",
];
const DASH = /[\u2013\u2014]/;

describe("every 2026-11-11 Wallet gap ends in a recorded state (sls-033)", () => {
	it("the guard finds all 41 before the curation lane runs and none after", () => {
		expect(AVAILABILITY_NULL_2026_11_11).toHaveLength(41);
		const before = AVAILABILITY_NULL_2026_11_11.map((slug) => ({
			slug,
			types: ["Wallet"],
			productKind: KIND_NULL_2026_11_11.includes(slug)
				? null
				: "end-user-wallet",
			availability: null,
			availabilityCheck: null,
		}));
		expect(walletCoverageGaps(before, PRODUCT_KIND_UNRESOLVED)).toHaveLength(
			41,
		);
		const after = AVAILABILITY_NULL_2026_11_11.map((slug) => ({
			slug,
			types: ["Wallet"],
			productKind: PRODUCT_KIND[slug] ?? null,
			availability: WALLET_AVAILABILITY[slug] ?? null,
			availabilityCheck: AVAILABILITY_CHECKED[slug] ?? null,
		}));
		expect(walletCoverageGaps(after, PRODUCT_KIND_UNRESOLVED)).toEqual([]);
	});

	it("the 11 null kinds get these kinds, each read from the operator", () => {
		expect(
			Object.fromEntries(KIND_NULL_2026_11_11.map((s) => [s, PRODUCT_KIND[s]])),
		).toEqual({
			amulets: "end-user-wallet",
			chainless: "end-user-wallet",
			haven: "end-user-wallet",
			ibis: "end-user-wallet",
			mxlet: "hardware-wallet",
			"openzeppelin-stellar-privacy-wallet": "end-user-wallet",
			"piggy-wallet": "end-user-wallet",
			privy: "wallet-sdk",
			rehive: "wallet-sdk",
			"smart-treasury": "smart-account-tooling",
			zig3v2: "end-user-wallet",
		});
	});

	it("the MetaMask Snap is a wallet, not an integration kit", () => {
		expect(PRODUCT_KIND["stellar-metamask"]).toBe("end-user-wallet");
	});

	it("every kind is in the vocabulary and no kind is also excused", () => {
		for (const [slug, kind] of Object.entries(PRODUCT_KIND)) {
			expect(PRODUCT_KINDS as readonly string[], slug).toContain(kind);
			expect(PRODUCT_KIND_UNRESOLVED[slug], slug).toBeUndefined();
		}
		for (const [slug, why] of Object.entries(PRODUCT_KIND_UNRESOLVED))
			expect(why, slug).toMatch(/\b20\d\d-\d\d-\d\d\b/);
	});
});

describe("WALLET_AVAILABILITY rows hold the served contract", () => {
	const rows = Object.entries(WALLET_AVAILABILITY).flatMap(([slug, rs]) =>
		rs.map((r) => ({ slug, ...r })),
	);

	it("platform and state are in the vocabulary and every row is dated", () => {
		expect(rows.length).toBeGreaterThan(0);
		for (const r of rows) {
			expect(AVAILABILITY_PLATFORMS as readonly string[], r.slug).toContain(
				r.platform,
			);
			expect(AVAILABILITY_STATES as readonly string[], r.slug).toContain(
				r.state,
			);
			expect(r.checkedAt, r.slug).toMatch(/^20\d\d-\d\d-\d\d$/);
		}
	});

	it("an available row names the https surface that was read; an unavailable one says why", () => {
		for (const r of rows) {
			if (r.state === "available")
				expect(r.storeUrl, r.slug).toMatch(/^https:\/\/\S+$/);
			else {
				expect(r.note?.length ?? 0, r.slug).toBeGreaterThan(40);
				// a URL only for a listing that is still up
				if (r.storeUrl !== undefined) {
					expect(r.storeUrl, r.slug).toMatch(/^https:\/\/\S+$/);
					expect(r.note, r.slug).toMatch(/still/);
				}
			}
		}
	});

	it("a product its operator shut down is unavailable even while its listings stay up", () => {
		// cypherhq.io: "The current Cypher mobile app, dApp, and business
		// platform will no longer be available" after 2026-09-06; its buttons
		// still open both store listings and the dApp on 2026-11-11.
		const cypher = WALLET_AVAILABILITY.cypher;
		expect(cypher.map((r) => r.platform).sort()).toEqual([
			"android",
			"ios",
			"web",
		]);
		for (const r of cypher) {
			expect(r.state, r.platform).toBe("unavailable");
			expect(r.note, r.platform).toMatch(/2026-09-06 shutdown/);
		}
		expect(AVAILABILITY_CHECKED.cypher).toBeUndefined();
	});

	it("every note is served text: present, one line, no em or en dash", () => {
		// Rows folded in from the retired applier included, Rabet's among them.
		for (const r of rows) {
			expect(r.note, r.slug).toBeTruthy();
			expect(r.note, r.slug).not.toMatch(/\n/);
			expect(r.note, r.slug).not.toMatch(DASH);
		}
	});

	it("no rows-map entry is empty: EXACT-SYNC would delete the stored rows with no check", () => {
		// An unknown availability is an AVAILABILITY_CHECKED entry, never [].
		const empty = [
			...Object.entries(WALLET_AVAILABILITY),
			...Object.entries(AVAILABILITY_SET),
		]
			.filter(([, rs]) => rs.length === 0)
			.map(([slug]) => slug);
		expect(empty).toEqual([]);
	});

	it("AVAILABILITY_SET serves no em or en dash either, and shares no slug with this map", () => {
		// Its 16 dashed notes were reworded on 2026-11-11, same words otherwise.
		const legacy = Object.entries(AVAILABILITY_SET).flatMap(([slug, rs]) =>
			rs.map((r) => ({ slug, ...r })),
		);
		expect(legacy.length).toBeGreaterThan(30);
		for (const r of legacy) {
			for (const v of [r.note, r.storeUrl])
				if (v !== undefined) expect(v, r.slug).not.toMatch(DASH);
		}
		for (const slug of Object.keys(AVAILABILITY_SET))
			expect(WALLET_AVAILABILITY[slug], slug).toBeUndefined();
	});

	it("an SMS wallet is a platform, not a check that found nothing (Kotani Pay)", () => {
		expect(AVAILABILITY_PLATFORMS).toContain("sms");
		expect(WALLET_AVAILABILITY["kotani-pay"]).toEqual([
			expect.objectContaining({
				platform: "sms",
				state: "available",
				storeUrl: "https://kotanipay.com/sms",
				checkedAt: "2026-11-11",
			}),
		]);
		expect(AVAILABILITY_CHECKED["kotani-pay"]).toBeUndefined();
	});
});

describe("availability has one writer (2026-11-11)", () => {
	/** The 16 rows the retired apply-wallet-availability lane wrote. */
	const FOLDED = [
		"airgap",
		"beans",
		"bexo",
		"emigro",
		"hot-wallet",
		"klever",
		"onekey",
		"peer",
		"rabet",
		"ripio",
		"simple-signer",
		"solar-wallet",
		"sollpay",
		"stellarport",
		"vesseo",
		"volta-circuit",
	];
	it("its 16 rows live in WALLET_AVAILABILITY as stored, dated by their drafts", () => {
		for (const slug of FOLDED) {
			const rows = WALLET_AVAILABILITY[slug];
			expect(rows?.length, slug).toBeGreaterThan(0);
			for (const r of rows) {
				expect(["2026-08-13", "2026-08-14"], slug).toContain(r.checkedAt);
				expect(r.note, slug).toMatch(/^curator-agent draft: /);
			}
		}
		expect(WALLET_AVAILABILITY.airgap).toHaveLength(2);
		expect(WALLET_AVAILABILITY.onekey).toHaveLength(3);
	});
	it("the applier and its workflow are gone, and no lane registers them", () => {
		const root = resolve(__dirname, "../../..");
		expect(
			existsSync(resolve(root, "scripts/agents/apply-wallet-availability.ts")),
		).toBe(false);
		expect(
			existsSync(
				resolve(root, ".github/workflows/apply-wallet-availability.yml"),
			),
		).toBe(false);
		const lanes = JSON.parse(
			readFileSync(resolve(root, "improvements/lanes/lanes.json"), "utf8"),
		) as { lanes: Array<{ id: string }> };
		expect(lanes.lanes.map((l) => l.id)).not.toContain(
			"apply-wallet-availability",
		);
	});
});

describe("Cypher's status follows its own shutdown notice (2026-11-11)", () => {
	it("moves Live to Inactive on an operator announcement, dated, with that source", () => {
		expect(STATUS_FIX.cypher).toMatchObject({
			from: "Live",
			to: "Inactive",
			basis: "operator-announcement",
			asOf: "2026-11-11",
			sourceUrl: "https://cypherhq.io/notice-of-termination",
		});
		expect(STATUS_FIX.cypher.note).toMatch(/2026-09-06/);
	});
});

describe("AVAILABILITY_CHECKED is a dated check, never a guess", () => {
	it("each entry has a result, a date, the https sources read and what they showed", () => {
		const entries = Object.entries(AVAILABILITY_CHECKED);
		expect(entries.length).toBeGreaterThan(0);
		for (const [slug, c] of entries) {
			expect(AVAILABILITY_CHECK_RESULTS as readonly string[], slug).toContain(
				c.result,
			);
			expect(c.checkedAt, slug).toMatch(/^20\d\d-\d\d-\d\d$/);
			expect(c.sources.length, slug).toBeGreaterThan(0);
			for (const s of c.sources) expect(s, slug).toMatch(/^https:\/\/\S+$/);
			expect(c.note.length, slug).toBeGreaterThan(40);
			expect(c.note, slug).not.toMatch(DASH);
		}
	});

	it("none-found means the sources were read, or the operator's domain no longer resolves and the note says so; anything unread is could-not-check", () => {
		// Read 2026-11-11: freelii.app is NXDOMAIN, xlet.io and spatium.net have
		// no address record. Stellar Passport and myben.xyz were read in a
		// browser, so they are not checks that could not read them.
		const goneDomain = ["freelii", "mxlet", "spatium"];
		const byResult = (r: string) =>
			Object.entries(AVAILABILITY_CHECKED)
				.filter(([, c]) => c.result === r)
				.map(([slug]) => slug)
				.sort();
		expect(byResult("could-not-check")).toEqual(["blaze"]);
		for (const slug of byResult("none-found")) {
			const { note } = AVAILABILITY_CHECKED[slug];
			if (goneDomain.includes(slug))
				expect(note, slug).toMatch(
					/^The operator's domain no longer resolves: /,
				);
			else expect(note, slug).not.toMatch(/resolve/);
		}
		expect(AVAILABILITY_CHECKED["stellar-passport"]).toBeUndefined();
		expect(WALLET_AVAILABILITY["stellar-passport"]).toEqual([
			expect.objectContaining({ platform: "web", state: "available" }),
		]);
		expect(AVAILABILITY_CHECKED["ben-wallet"].note).toMatch(/waitlist/);
	});
});

describe("the check the lane writes and the route serves", () => {
	const check = AVAILABILITY_CHECKED.mxlet;
	const row = [{ platform: "web", state: "available" }];
	const wanted = [
		{
			platform: "web",
			state: "available",
			storeUrl: "https://example.test/",
			checkedAt: "2026-11-11",
		},
	];
	const stored = (over: Record<string, unknown>) => ({
		availability: null,
		availabilityCheck: null,
		...over,
	});

	it("is planned while availability is empty and cleared once a row has some, from any writer", () => {
		expect(availabilityPatch(stored({}), undefined, check)).toEqual({
			availabilityCheck: check,
		});
		expect(
			availabilityPatch(stored({ availabilityCheck: check }), undefined, check),
		).toEqual({});
		expect(
			availabilityPatch(
				stored({ availability: row, availabilityCheck: check }),
				undefined,
				check,
			),
		).toEqual({ availabilityCheck: CLEARED_CHECK });
	});

	it("a slug in a rows map and AVAILABILITY_CHECKED writes its rows and clears its check in one run", () => {
		const patch = availabilityPatch(
			stored({ availabilityCheck: check }),
			wanted,
			check,
		);
		expect(patch.availability).toEqual([{ ...wanted[0], note: null }]);
		expect(patch.availabilityCheck).toEqual(CLEARED_CHECK);
		// and the next run plans nothing
		expect(
			availabilityPatch(
				stored({
					availability: patch.availability,
					availabilityCheck: CLEARED_CHECK,
				}),
				wanted,
				check,
			),
		).toEqual({});
	});

	it("rows in sync with a stale stored check plan only the clear", () => {
		expect(
			availabilityPatch(
				stored({ availability: wanted, availabilityCheck: check }),
				wanted,
				undefined,
			),
		).toEqual({ availabilityCheck: CLEARED_CHECK });
	});

	it("compares stored and wanted values in one form, so a rerun plans nothing", () => {
		const stored = { ...check, sources: [...check.sources] };
		expect(normCheck(stored)).toBe(normCheck(check));
		// A never-written group reads back with null members; that is no check.
		const empty = { result: null, checkedAt: null, sources: [], note: null };
		expect(normCheck(empty)).toBe(normCheck(null));
		expect(normCheck(undefined)).toBe(normCheck(null));
		expect(normCheck(check)).not.toBe(normCheck(null));
	});

	it("is served only beside a null availability, and only with a result", () => {
		expect(pickAvailabilityCheck(check, null)).toEqual(check);
		expect(pickAvailabilityCheck(check, row)).toBeNull();
		expect(
			pickAvailabilityCheck({ result: null, sources: [] }, null),
		).toBeNull();
		expect(pickAvailabilityCheck(undefined, null)).toBeNull();
	});
});

describe("walletCoverageGaps (the nightly S6 guard)", () => {
	const w = (slug: string, over: Record<string, unknown> = {}) => ({
		slug,
		types: ["Wallet"],
		productKind: "end-user-wallet",
		availability: [{ platform: "ios" }],
		availabilityCheck: null,
		...over,
	});
	it("names what each row misses", () => {
		const gaps = walletCoverageGaps(
			[
				w("nokind", { productKind: null }),
				w("noavail", { availability: null }),
				w("neither", { productKind: null, availability: [] }),
			],
			{},
		);
		expect(gaps.map((g) => [g.slug, g.missing])).toEqual([
			["nokind", ["productKind"]],
			["noavail", ["availability"]],
			["neither", ["productKind", "availability"]],
		]);
	});
	it("passes a dated check, a dated reason, and rows that are not Wallets", () => {
		const rows = [
			w("checked", {
				availability: null,
				availabilityCheck: { result: "none-found" },
			}),
			w("why", { productKind: null }),
			w("dex", { types: ["DEX"], productKind: null, availability: null }),
			w("untyped", { types: null, availability: null }),
		];
		expect(walletCoverageGaps(rows, { why: "2026-11-11: reason" })).toEqual([]);
	});
	it("a check with no result, a blank reason or an inherited key records nothing", () => {
		const rows = [
			w("hollow", { availability: null, availabilityCheck: { result: null } }),
			w("blank", { productKind: null }),
			w("constructor", { productKind: null }),
		];
		expect(walletCoverageGaps(rows, { blank: " " }).map((g) => g.slug)).toEqual(
			["hollow", "blank", "constructor"],
		);
	});
});

// ── the served field, through the real route ──────────────────────────────
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/embed", () => ({ embed: vi.fn(async () => [0.1, 0.2, 0.3]) }));
vi.mock("@/lib/repo-search", async (orig) => ({
	...(await orig<typeof import("@/lib/repo-search")>()),
	searchRepos: vi.fn(async () => ({ repos: [], warnings: [] })),
}));

const STORED_CHECK = {
	result: "none-found",
	checkedAt: "2026-11-11",
	sources: ["https://example.test/"],
	note: "The example site links no app, extension or web app at all",
};
const wallet = (slug: string, over: Record<string, unknown> = {}) => ({
	id: slug,
	name: slug,
	slug,
	category: "User-Facing App",
	shortDescription: `${slug} wallet`,
	status: "Live",
	types: ["Wallet"],
	productKind: "end-user-wallet",
	...over,
});
const ROWS = [
	wallet("checkedwallet", { availabilityCheck: STORED_CHECK }),
	wallet("listedwallet", {
		availability: [
			{
				id: "r1",
				platform: "ios",
				state: "available",
				storeUrl: "https://apps.apple.com/app/id1",
				checkedAt: "2026-11-11",
				note: "listed",
			},
		],
		// stale: written before the row gained availability
		availabilityCheck: STORED_CHECK,
	}),
	wallet("plainwallet", {
		availabilityCheck: { result: null, sources: [] },
	}),
	wallet("oldwallet", {
		status: "Inactive",
		canonicalSlug: "newwallet",
		availabilityCheck: STORED_CHECK,
	}),
];
const CANONICALS = [
	wallet("newwallet", {
		availabilityCheck: { ...STORED_CHECK, result: "could-not-check" },
	}),
];
const aggregate = vi.fn((_pipeline: unknown[]) => ({
	toArray: async () => [],
}));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		db: { connection: { db: { collection: () => ({ aggregate }) } } },
		find: vi.fn(
			async (args: {
				collection: string;
				limit?: number;
				where?: { slug?: { in?: string[] } };
				select?: { embedding?: boolean };
			}) => {
				const wanted = args.where?.slug?.in;
				if (wanted) {
					const docs = [...ROWS, ...CANONICALS].filter((r) =>
						wanted.includes(r.slug),
					);
					return { docs, totalDocs: docs.length };
				}
				if (
					args.collection !== "projects" ||
					args.limit !== 0 ||
					args.select?.embedding !== false
				)
					return { docs: [], totalDocs: 0 };
				return { docs: ROWS, totalDocs: ROWS.length };
			},
		),
	})),
}));

async function search(qs: string) {
	vi.resetModules();
	const { GET } = await import("../../app/api/projects/search/route");
	const pending = GET(
		new NextRequest(`https://x.test/api/projects/search?${qs}`),
	);
	await vi.advanceTimersByTimeAsync(10_000);
	const res = await pending;
	return { status: res.status, body: await res.json() };
}
type Served = {
	slug: string;
	availability: unknown;
	availabilityCheck: unknown;
};

describe("GET /api/projects/search serves availabilityCheck (sls-033)", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubEnv("VOYAGE_API_KEY", "");
		aggregate.mockClear();
	});
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllEnvs();
	});

	it("a row with no availability serves its dated check; a row with availability serves none", async () => {
		const { status, body } = await search("type=Wallet");
		expect(status).toBe(200);
		const by = Object.fromEntries(
			(body.projects as Served[]).map((p) => [p.slug, p]),
		);
		expect(by.checkedwallet.availability).toBeNull();
		expect(by.checkedwallet.availabilityCheck).toEqual(STORED_CHECK);
		expect(by.listedwallet.availability).toHaveLength(1);
		expect(by.listedwallet.availabilityCheck).toBeNull();
		expect(by.plainwallet.availabilityCheck).toBeNull();
	});

	it("a shadow swapped for its canonical serves the canonical's check", async () => {
		const { body } = await search("q=oldwallet");
		const p = (body.projects as Served[]).find((r) => r.slug === "newwallet");
		expect(p?.availabilityCheck).toMatchObject({ result: "could-not-check" });
	});

	it("the semantic rung projects the field, so its rows can serve it", async () => {
		vi.stubEnv("VOYAGE_API_KEY", "test-key");
		// No row matches these words, so the keyword pass is empty and the
		// vector rung runs.
		await search("q=pocket+money+for+children");
		expect(aggregate).toHaveBeenCalled();
		const pipeline = aggregate.mock.calls[0][0] as Array<
			Record<string, Record<string, unknown>>
		>;
		const project = pipeline.find((s) => "$project" in s)?.$project;
		expect(project?.availabilityCheck).toBe(1);
	});
});
