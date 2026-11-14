/**
 * The logo repair's plan (scripts/data/repair-missing-logos.ts): which rows
 * get the image from their own SCF page, and why each of the others is left
 * as it is. The rule under test: never another project's mark.
 */
import { describe, expect, it } from "vitest";
import {
	githubOwnersOfManyRows,
	pageConfirmsRow,
	sharedLink,
} from "../../../scripts/data/scf-joins";
import {
	type LogoRepair,
	type LogoRepairIO,
	type LogoRow,
	logoSourceType,
	planLogoRepairs,
	runLogoRepairs,
	scfThumbnailUrl,
} from "../media-files";

/** No GitHub owner is linked by more than one row. */
const NONE: ReadonlySet<string> = new Set();

describe("the repair plan", () => {
	const row = (slug: string, over: Partial<LogoRow> = {}): LogoRow => ({
		id: `id-${slug}`,
		slug,
		name: slug,
		status: "Live",
		canonicalSlug: null,
		links: { website: `https://${slug}.example` },
		scfSlug: `${slug}-page`,
		logo: { id: `m-${slug}`, filename: `${slug}-scf.png`, filesize: 10 },
		...over,
	});
	const img = (s: string) => `https://cdn.example.invalid/${s}.png`;
	/** Plans with the real confirmation rule (scripts/data/scf-joins.ts). */
	const plan = (
		rows: LogoRow[],
		missing: string[],
		image: Array<[string, string | null]>,
		page: Array<[string, { website?: string; github?: string } | null]>,
	) =>
		Object.fromEntries(
			planLogoRepairs(rows, new Set(missing), {
				image: new Map(image),
				page: new Map(page),
				confirms: (slug, page, r) => pageConfirmsRow(slug, page, r, NONE),
			}).map((p) => [
				p.row.slug,
				p.action === "repair" ? `${p.sourceUrl} by ${p.confirmedBy}` : p.reason,
			]),
		);

	it("repairs only rows whose file is missing, from their own SCF page", () => {
		expect(
			plan(
				[row("huma"), row("fine")],
				["huma"],
				[
					["huma-page", img("huma")],
					["fine-page", img("fine")],
				],
				[["huma-page", { website: "https://www.huma.example/about" }]],
			),
		).toEqual({ huma: `${img("huma")} by site huma.example` });
	});

	it("leaves a row with no recorded SCF page as it is", () => {
		expect(plan([row("ankr", { scfSlug: null })], ["ankr"], [], [])).toEqual({
			ankr: "the row records no SCF page",
		});
	});

	it("never takes an image from a page joined by name alone", () => {
		// Measured 2026-11-13: the bridge row (bridge.xyz) stores the SCF page
		// "Bridge+Anchor XOF/USDC for lomi.", whose site is lomi.africa.
		const bridge = row("bridge", {
			name: "Bridge",
			links: { website: "https://bridge.xyz/" },
			scfSlug: "bridgeanchor-xofusdc-for-lomi-xpb",
		});
		expect(
			plan(
				[bridge],
				["bridge"],
				[["bridgeanchor-xofusdc-for-lomi-xpb", img("lomi")]],
				[
					[
						"bridgeanchor-xofusdc-for-lomi-xpb",
						{ website: "https://lomi.africa" },
					],
				],
			),
		).toEqual({
			bridge:
				"SCF page bridgeanchor-xofusdc-for-lomi-xpb has no reviewed join to the row and shares no site or GitHub owner with it; a name alone is not enough",
		});
	});

	it("repairs the row a shared page confirms and not the other claimant", () => {
		const rows = [
			row("merkl", { scfSlug: "ms-page" }),
			row("merkle-science", {
				scfSlug: "ms-page",
				links: { github: "https://github.com/merklescience/soroban" },
			}),
		];
		const out = plan(
			rows,
			["merkl", "merkle-science"],
			[["ms-page", img("ms")]],
			[["ms-page", { github: "https://github.com/MerkleScience" }]],
		);
		expect(out["merkle-science"]).toBe(`${img("ms")} by github merklescience`);
		expect(out.merkl).toMatch(/a name alone is not enough$/);
	});

	it("repairs neither when one page confirms two projects", () => {
		const rows = [
			row("mesh", {
				scfSlug: "p",
				links: { website: "https://bpventures.example/mesh" },
			}),
			row("bp-ventures", {
				scfSlug: "p",
				links: { website: "https://bpventures.example" },
			}),
		];
		expect(
			plan(
				rows,
				["mesh"],
				[["p", img("p")]],
				[["p", { website: "https://bpventures.example" }]],
			),
		).toEqual({
			mesh: "SCF page p also confirms bp-ventures; whose mark its image is needs a person",
		});
	});

	it("counts a lineage shadow and its canonical row as one project", () => {
		const site = { website: "https://lusty.example" };
		const rows = [
			row("lusty", { scfSlug: "lusty-page", links: site }),
			row("lusty-finance", {
				scfSlug: "lusty-page",
				canonicalSlug: "lusty",
				status: "Draft",
				links: site,
			}),
		];
		const scf = [["lusty-page", img("lusty")]] as Array<[string, string]>;
		expect(plan(rows, ["lusty-finance"], scf, [["lusty-page", site]])).toEqual({
			"lusty-finance": `${img("lusty")} by site lusty.example`,
		});
		// a canonicalSlug naming no row is not a lineage
		expect(
			plan(
				[rows[0], { ...rows[1], canonicalSlug: "nobody" }],
				["lusty-finance"],
				scf,
				[["lusty-page", site]],
			)["lusty-finance"],
		).toMatch(/also confirms lusty;/);
	});

	it("says which SCF absence it met", () => {
		expect(
			plan(
				[row("a"), row("b"), row("c"), row("d")],
				["a", "b", "c", "d"],
				[
					["b-page", null],
					["c-page", img("c")],
					["d-page", img("d")],
				],
				[["c-page", null]],
			),
		).toEqual({
			a: "SCF's listing has no page a-page",
			b: "SCF lists b-page with no image",
			c: "SCF page c-page could not be read today",
			d: "SCF page d-page could not be read today",
		});
	});

	it("takes a reviewed join without a shared link, for that row only", () => {
		// SCF_SLUG_OVERRIDES: the page "passkey-ui-sj6" joins the soropass row.
		expect(pageConfirmsRow("passkey-ui-sj6", {}, row("soropass"), NONE)).toBe(
			"a reviewed join",
		);
		expect(
			pageConfirmsRow("passkey-ui-sj6", {}, row("passkey"), NONE),
		).toBeNull();
		// a page with no reviewed entry and a row with no canonical slug
		expect(
			pageConfirmsRow(
				"unlisted-page",
				{},
				row("x", { canonicalSlug: null }),
				NONE,
			),
		).toBeNull();
		// a shadow of the reviewed row
		expect(
			pageConfirmsRow(
				"passkey-ui-sj6",
				{},
				row("soropass-old", { canonicalSlug: "soropass" }),
				NONE,
			),
		).toBe("a reviewed join");
	});

	it("reads SCF's image as the sync does", () => {
		expect(scfThumbnailUrl({ thumbnail: { url: "u" } })).toBe("u");
		expect(
			scfThumbnailUrl({
				thumbnail: { file: { url: "f", thumbnails: { large: { url: "l" } } } },
			}),
		).toBe("l");
		expect(scfThumbnailUrl({ thumbnail: { file: { url: "f" } } })).toBe("f");
		expect(scfThumbnailUrl({ thumbnail: null })).toBeNull();
		expect(scfThumbnailUrl({})).toBeNull();
	});

	it("uploads only the types Payload stores as sent", () => {
		expect(logoSourceType("image/png")).toEqual({ ext: ".png" });
		expect(logoSourceType("IMAGE/JPEG; charset=binary")).toEqual({
			ext: ".jpg",
		});
		// Payload runs WebP, GIF and AVIF through sharp on upload, so the
		// stored bytes differ from the source and the read-back could never
		// pass: every attempt would leave a record no row points at.
		for (const t of ["image/webp", "image/gif", "image/avif"])
			expect(logoSourceType(t)).toEqual({
				why: `the source is ${t}, which Payload re-encodes on upload, so the stored file could not be read back byte for byte`,
			});
		expect(logoSourceType("image/svg+xml")).toEqual({
			why: "the source is not an image the repair stores (image/svg+xml)",
		});
		expect(logoSourceType("")).toEqual({
			why: "the source is not an image the repair stores (no type)",
		});
	});
});

describe("a site confirms a row only on the same host", () => {
	// Audit of 2026-11-13: the confirmation compared registrable domains, so
	// two unrelated tenants of one hosting or media service confirmed each
	// other. The planned repair of vrf-soroban read "confirmed by site
	// onrender.com" and was right only because both links name one full host.
	const join = (pageSite: string, rowSite: string) =>
		pageConfirmsRow(
			"some-page",
			{ website: pageSite },
			{ slug: "x", name: "X", links: { website: rowSite } },
			NONE,
		);

	it.each([
		["https://vrf-demo.onrender.com", "https://payroll-app.onrender.com"],
		["https://alpha.pages.dev/", "https://beta.pages.dev/"],
		["https://youtube.com/@first", "https://www.youtube.com/@second"],
	])("two tenants of one service do not confirm each other: %s, %s", (a, b) => {
		expect(join(a, b)).toBeNull();
		expect(join(b, a)).toBeNull();
	});

	it("one page on a host that holds everyone's pages is still no site", () => {
		expect(
			join("https://www.youtube.com/@same", "https://youtube.com/@same"),
		).toBeNull();
		expect(join("https://youtu.be/abc", "https://youtu.be/abc")).toBeNull();
	});

	it("the same full host confirms, www and path aside", () => {
		expect(
			join(
				"https://vrf-soroban.onrender.com/",
				"https://vrf-soroban.onrender.com",
			),
		).toBe("site vrf-soroban.onrender.com");
		expect(join("https://www.Huma.Finance/about", "http://huma.finance")).toBe(
			"site huma.finance",
		);
	});

	it("a subdomain is another host", () => {
		expect(join("https://app.acme.example", "https://acme.example")).toBeNull();
		expect(
			join("https://docs.acme.example", "https://app.acme.example"),
		).toBeNull();
	});

	it("keeps the code hosts and third-party pages out, and the GitHub owner in", () => {
		expect(
			join("https://v0-latch.vercel.app/", "https://v0-latch.vercel.app/"),
		).toBeNull();
		expect(join("https://linktr.ee/acme", "https://linktr.ee/acme")).toBeNull();
		expect(
			pageConfirmsRow(
				"some-page",
				{
					website: "https://a.onrender.com",
					github: "https://github.com/Acme",
				},
				{
					slug: "x",
					name: "X",
					links: {
						website: "https://b.onrender.com",
						github: "https://github.com/acme/app",
					},
				},
				NONE,
			),
		).toBe("github acme");
	});

	it("leaves the SCF sync's own rule as it was", () => {
		// sharedLink also joins pages outside SCF's listing in the sync. That
		// rule is not changed here: its effect on the sync's joins has not
		// been measured (improvements/TODO.md).
		expect(
			sharedLink(
				{ website: "https://app.acme.example" },
				{ slug: "x", name: "X", links: { website: "https://acme.example" } },
			),
		).toBe("site acme.example");
	});
});

describe("a link's host is read from the URL, not from its text", () => {
	// Re-audit of 2026-11-14: the host was cut out of the link with string
	// splits, so the link's own text could name another host. Each of these
	// pages is at lomi.africa and confirmed the bridge.xyz row.
	const bridge = {
		slug: "bridge",
		name: "Bridge",
		links: { website: "https://bridge.xyz/" },
	};
	it.each([
		"https://bridge.xyz:x@lomi.africa/",
		"https://lomi.africa/?u=//bridge.xyz",
		"https://lomi.africa//bridge.xyz",
	])(
		"a page at lomi.africa does not confirm the bridge.xyz row: %s",
		(site) => {
			expect(
				pageConfirmsRow("some-page", { website: site }, bridge, NONE),
			).toBeNull();
		},
	);

	it("reads the real host on both sides", () => {
		const lomi = {
			slug: "lomi",
			name: "lomi.",
			links: { website: "lomi.africa" },
		};
		for (const site of [
			"https://bridge.xyz:x@lomi.africa/",
			"https://lomi.africa/?u=//bridge.xyz",
			"https://lomi.africa//bridge.xyz",
			"HTTPS://WWW.Lomi.Africa:443/a?b#c",
			"lomi.africa/pay",
		])
			expect(pageConfirmsRow("some-page", { website: site }, lomi, NONE)).toBe(
				"site lomi.africa",
			);
	});

	it("a shared host cannot hide behind another name in the link", () => {
		const row = {
			slug: "x",
			name: "X",
			links: { website: "https://youtube.com/@x" },
		};
		expect(
			pageConfirmsRow(
				"some-page",
				{ website: "https://acme.example:x@youtube.com/@x" },
				row,
				NONE,
			),
		).toBeNull();
	});

	it("github.com in a path or a query names no owner", () => {
		const row = {
			slug: "x",
			name: "X",
			links: { github: "https://github.com/acme/app" },
		};
		for (const site of [
			"https://lomi.africa/github.com/acme",
			"https://lomi.africa/?next=https://github.com/acme/app",
			"https://github.com.lomi.africa/acme",
		])
			expect(
				pageConfirmsRow("some-page", { website: site }, row, NONE),
			).toBeNull();
		// a link that is nothing a URL parser reads names nothing
		expect(
			pageConfirmsRow("some-page", { website: "http://[bad" }, row, NONE),
		).toBeNull();
	});
});

describe("more hosts that hold many owners' pages", () => {
	// Re-audit: two different owners on each of these confirmed each other.
	it.each([
		["https://jsr.io/@acme/sdk", "https://jsr.io/@other/sdk"],
		["https://bitbucket.org/acme/app", "https://bitbucket.org/other/app"],
		["https://huggingface.co/acme", "https://huggingface.co/other"],
		[
			"https://taikai.network/acme/hackathons/x",
			"https://taikai.network/other",
		],
	])("%s and %s confirm nothing, nor does one page twice", (a, b) => {
		const join = (page: string, site: string) =>
			pageConfirmsRow(
				"some-page",
				{ website: page },
				{ slug: "x", name: "X", links: { website: site } },
				NONE,
			);
		expect(join(a, b)).toBeNull();
		expect(join(a, a)).toBeNull();
	});
});

describe("a GitHub owner confirms a row only when it is that row's alone", () => {
	// Re-audit: on 2026-11-14, 49 GitHub owners were linked by more than one
	// project (stellar 11, soneso 8, creit-tech 6), and a shared owner
	// confirmed any of them. A reserved first segment read as an owner too.
	const gh = (pageLink: string, rowLink: string, many: string[] = []) =>
		pageConfirmsRow(
			"some-page",
			{ github: pageLink },
			{ slug: "x", name: "X", links: { github: rowLink } },
			new Set(many),
		);

	it("a reserved first segment is no owner", () => {
		expect(
			gh(
				"https://github.com/sponsors/alice",
				"https://github.com/sponsors/bob",
			),
		).toBeNull();
		expect(
			gh(
				"https://github.com/marketplace/a",
				"https://github.com/marketplace/b",
			),
		).toBeNull();
		// the SCF sync's rule reads the same owners
		expect(
			sharedLink(
				{ github: "https://github.com/sponsors/alice" },
				{
					slug: "x",
					name: "X",
					links: { github: "https://github.com/sponsors/bob" },
				},
			),
		).toBeNull();
	});

	it("an owner one project links confirms it, whatever the repository", () => {
		expect(
			gh(
				"https://github.com/OFFER-HUB/offer-hub",
				"https://github.com/offer-hub",
			),
		).toBe("github offer-hub");
		// SCF writes an organisation as github.com/orgs/<owner>
		expect(
			gh("https://github.com/orgs/Acme", "https://github.com/acme/app"),
		).toBe("github acme");
	});

	it("an owner several projects link confirms only the same repository", () => {
		const many = ["soneso"];
		expect(
			gh(
				"https://github.com/Soneso/kmp-stellar-sdk",
				"https://github.com/soneso/kmp-stellar-sdk.git",
				many,
			),
		).toBe("github soneso/kmp-stellar-sdk");
		expect(
			gh(
				"https://github.com/Soneso/kmp-stellar-sdk",
				"https://github.com/soneso/stellar-php-sdk",
				many,
			),
		).toBeNull();
		// an owner link names no repository
		expect(
			gh("https://github.com/Soneso", "https://github.com/soneso", many),
		).toBeNull();
		expect(
			gh(
				"https://github.com/Soneso/kmp-stellar-sdk",
				"https://github.com/soneso",
				many,
			),
		).toBeNull();
	});

	it("reads a repository off the website field too", () => {
		// account-demolisher's SCF page gives its repository as its website
		expect(
			pageConfirmsRow(
				"some-page",
				{ website: "https://github.com/bytemaster333/account-demolisher" },
				{
					slug: "account-demolisher",
					name: "Account Demolisher",
					links: {
						website: "https://demolisher.saliht.xyz/",
						github: "https://github.com/bytemaster333/account-demolisher",
					},
				},
				new Set(["bytemaster333"]),
			),
		).toBe("github bytemaster333/account-demolisher");
	});

	it("counts the projects that link an owner, a shadow with its canonical row", () => {
		const rows = [
			{
				slug: "a",
				name: "A",
				links: { github: "https://github.com/Soneso/a" },
			},
			{
				slug: "b",
				name: "B",
				links: { website: "https://github.com/soneso/b" },
			},
			{ slug: "c", name: "C", links: { github: "https://github.com/solo/c" } },
			// a lineage shadow and its canonical row are one project
			{
				slug: "c-old",
				name: "C old",
				canonicalSlug: "c",
				links: { github: "https://github.com/solo/c" },
			},
			{
				slug: "d",
				name: "D",
				links: { github: "https://github.com/sponsors/x" },
			},
			{
				slug: "e",
				name: "E",
				links: { github: "https://github.com/sponsors/y" },
			},
		];
		expect([...githubOwnersOfManyRows(rows)]).toEqual(["soneso"]);
	});

	it("the oracle row keeps its page by a reviewed join", () => {
		// The page links the row's repository, stackman27/SOO, and a second
		// one that answers 404; the page reader returns only the second, and
		// the owner is linked by two rows, so the repository rule alone would
		// leave this row. Read 2026-11-14, recorded in SCF_SLUG_OVERRIDES.
		const oracle = {
			slug: "soroban-optimistic-oracle",
			name: "Soroban Optimistic Oracle",
			links: { github: "https://github.com/stackman27/soo" },
		};
		const page = {
			website: "https://github.com/stackman27/soroban-opt-oracle",
		};
		const many = new Set(["stackman27"]);
		expect(
			pageConfirmsRow("soroban-optimistic-oracle-soo-b6y", page, oracle, many),
		).toBe("a reviewed join");
		expect(pageConfirmsRow("another-page", page, oracle, many)).toBeNull();
	});
});

describe("the repair's write step", () => {
	const BASE = "https://site.invalid";
	const PNG = new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4]);
	const row = (slug: string): LogoRow => ({
		id: `id-${slug}`,
		slug,
		name: slug.toUpperCase(),
		status: "Live",
		canonicalSlug: null,
		links: null,
		scfSlug: `${slug}-page`,
		logo: { id: `old-${slug}`, filename: `${slug}-scf.png`, filesize: 8 },
	});
	const repair = (slug: string): LogoRepair => ({
		row: row(slug),
		action: "repair",
		scfSlug: `${slug}-page`,
		sourceUrl: `https://cdn.invalid/${slug}.png`,
		confirmedBy: `site ${slug}.example`,
	});

	/** A site whose store and rows can each be made to misbehave. Every
	 *  call lands in `calls`, in order. */
	function site(
		over: {
			/** what the site serves for an uploaded file (default: what was stored) */
			serve?: (stored: Uint8Array) => Response | Promise<Response>;
			/** the logo id the API serves for a row (default: what was set) */
			rowLogo?: (set: string | undefined, rowId: string) => unknown;
			/** row ids whose update throws */
			setFails?: string[];
			createFails?: boolean;
			dry?: boolean;
			download?: LogoRepairIO["download"];
		} = {},
	) {
		const calls: string[] = [];
		const lines: string[] = [];
		const stored = new Map<string, Uint8Array>();
		const logos = new Map<string, string>();
		const signals: Array<AbortSignal | null | undefined> = [];
		const io: LogoRepairIO = {
			base: BASE,
			download:
				over.download ??
				(async (url) => {
					calls.push(`download ${url}`);
					return { buffer: PNG, type: "image/png", ext: ".png" };
				}),
			write: over.dry
				? null
				: {
						createMedia: async (f) => {
							calls.push(`create ${f.name} "${f.alt}"`);
							if (over.createFails) throw new Error("AccessDenied");
							// Payload renames when the name is taken
							const filename = f.name.replace(".png", "-1.png");
							stored.set(filename, f.buffer);
							return { id: `new-${f.name}`, filename };
						},
						setLogo: async (rowId, mediaId) => {
							calls.push(`set ${rowId} ${mediaId}`);
							if (over.setFails?.includes(rowId))
								throw new Error("ValidationError: slug");
							logos.set(rowId, mediaId);
						},
					},
			fetch: (async (url: string, init?: RequestInit) => {
				signals.push(init?.signal);
				const file = url.match(/\/api\/media\/file\/(.+)$/)?.[1];
				if (file) {
					calls.push(`get-file ${file}`);
					const bytes = stored.get(decodeURIComponent(file));
					if (!bytes) return new Response(null, { status: 404 });
					return over.serve ? over.serve(bytes) : new Response(bytes);
				}
				const id = url.match(/\/api\/projects\/([^?]+)\?/)?.[1] ?? "";
				calls.push(`get-row ${id}`);
				return Response.json({
					id,
					logo: over.rowLogo ? over.rowLogo(logos.get(id), id) : logos.get(id),
				});
			}) as unknown as typeof fetch,
			log: (line) => lines.push(line),
		};
		return { io, calls, lines, logos, signals };
	}

	it("a dry run downloads, prints what it would write and writes nothing", async () => {
		const s = site({ dry: true });
		const run = await runLogoRepairs([repair("huma")], s.io);
		expect(s.calls).toEqual(["download https://cdn.invalid/huma.png"]);
		expect(run).toMatchObject({
			planned: 1,
			written: 0,
			failed: [],
			stoppedAt: null,
			cannot: [],
			notAttempted: 0,
		});
		expect(s.lines).toEqual([
			"  huma (Live): huma-scf.png answers 404. Source https://cdn.invalid/huma.png (SCF page huma-page, confirmed by site huma.example): image/png, 8 bytes, the lost file's size. WOULD upload huma-scf.png and point projects/huma logo at it.",
		]);
	});

	it("reads the file back before the row moves, and the row back after", async () => {
		const s = site();
		const run = await runLogoRepairs([repair("huma")], s.io);
		expect(s.calls).toEqual([
			"download https://cdn.invalid/huma.png",
			'create huma-scf.png "HUMA logo (https://cdn.invalid/huma.png)"',
			// the name Payload stored, not the name asked for
			"get-file huma-scf-1.png",
			"set id-huma new-huma-scf.png",
			"get-row id-huma",
		]);
		expect(run).toMatchObject({
			planned: 1,
			written: 1,
			failed: [],
			stoppedAt: null,
		});
		expect(s.lines[0]).toMatch(
			/WROTE huma-scf-1\.png \(media new-huma-scf\.png, read back 8 bytes\) and projects\/huma logo points at it\.$/,
		);
		// both read-backs can time out
		expect(s.signals.length).toBe(2);
		for (const sig of s.signals) expect(sig).toBeInstanceOf(AbortSignal);
	});

	it.each([
		[
			"other bytes of the same length",
			() => new Response(new Uint8Array([137, 80, 78, 71, 1, 2, 3, 9])),
			/answered HTTP 200 with 8 bytes that are not the bytes sent/,
		],
		[
			"a shorter file",
			() => new Response(new Uint8Array([137, 80])),
			/answered HTTP 200 with 2 bytes that are not the bytes sent/,
		],
		["a 404", () => new Response(null, { status: 404 }), /answered HTTP 404/],
		[
			"no answer",
			() => {
				throw new DOMException("timed out", "TimeoutError");
			},
			/did not answer \(timed out\)/,
		],
	])(
		"leaves the row alone when the file reads back as %s",
		async (_n, serve, why) => {
			const s = site({ serve });
			const run = await runLogoRepairs([repair("huma"), repair("acta")], s.io);
			// the row was never sent a logo, and never read back
			expect(s.calls.some((c) => c.startsWith("set "))).toBe(false);
			expect(s.calls.some((c) => c.startsWith("get-row "))).toBe(false);
			expect(s.logos.size).toBe(0);
			// the store is in doubt, so the run stops
			expect(run).toMatchObject({
				written: 0,
				failed: ["huma"],
				stoppedAt: "huma",
				notAttempted: 1,
			});
			expect(s.lines.at(-1)).toMatch(why);
			expect(s.lines.at(-1)).toMatch(
				/FAILED: uploaded media new-huma-scf\.png but .*The row is unchanged\. STOPPED: 1 row\(s\) after this one were not attempted\.$/,
			);
		},
	);

	it("stops at the first store failure, so a wrong bucket leaves one record and not 117", async () => {
		const s = site({ serve: () => new Response(null, { status: 404 }) });
		const plans = ["a", "b", "c", "d"].map(repair);
		const run = await runLogoRepairs(plans, s.io);
		expect(s.calls.filter((c) => c.startsWith("create ")).length).toBe(1);
		expect(s.calls.some((c) => c.includes("/b.png"))).toBe(false);
		expect(run).toMatchObject({
			planned: 1,
			written: 0,
			failed: ["a"],
			stoppedAt: "a",
			notAttempted: 3,
		});
	});

	it("counts a row the API does not serve as sent, and carries on", async () => {
		// One row's own trouble: the file is stored and read back, so the
		// store is sound. Stopping here would halt every retry at this row.
		const s = site({
			rowLogo: (set, id) => (id === "id-huma" ? "old-huma" : set),
		});
		const run = await runLogoRepairs(
			[repair("huma"), repair("acta"), repair("dig")],
			s.io,
		);
		// the row read-back came after the update, and the next row followed
		const i = s.calls.indexOf("set id-huma new-huma-scf.png");
		expect(s.calls.slice(i, i + 3)).toEqual([
			"set id-huma new-huma-scf.png",
			"get-row id-huma",
			"download https://cdn.invalid/acta.png",
		]);
		expect(run).toMatchObject({
			planned: 3,
			written: 2,
			failed: ["huma"],
			stoppedAt: null,
			notAttempted: 0,
		});
		expect(s.lines[0]).toMatch(
			/FAILED: the row was sent logo new-huma-scf\.png and the API serves old-huma\. The new file is stored; the run goes on\.$/,
		);
		expect(s.lines[1]).toMatch(/WROTE acta-scf-1\.png/);
		expect(s.lines[2]).toMatch(/WROTE dig-scf-1\.png/);
	});

	it("counts a row whose update throws, and carries on", async () => {
		const s = site({ setFails: ["id-huma"] });
		const run = await runLogoRepairs([repair("huma"), repair("acta")], s.io);
		// the row that threw is not read back; the next row is written
		expect(s.calls).not.toContain("get-row id-huma");
		expect(s.calls).toContain("get-row id-acta");
		expect(run).toMatchObject({
			written: 1,
			failed: ["huma"],
			stoppedAt: null,
			notAttempted: 0,
		});
		expect(s.lines[0]).toMatch(
			/FAILED: media new-huma-scf\.png read back, but the row update failed \(ValidationError: slug\)\. The new file is stored; the run goes on\.$/,
		);
	});

	it("reports an upload that fails, with no read-back and no row write", async () => {
		const s = site({ createFails: true });
		const run = await runLogoRepairs([repair("huma"), repair("acta")], s.io);
		expect(s.calls).toEqual([
			"download https://cdn.invalid/huma.png",
			'create huma-scf.png "HUMA logo (https://cdn.invalid/huma.png)"',
		]);
		// no store took the file, so the next row would fail the same way
		expect(run).toMatchObject({
			written: 0,
			failed: ["huma"],
			stoppedAt: "huma",
			notAttempted: 1,
		});
		expect(s.lines.at(-1)).toMatch(
			/FAILED: the upload failed \(AccessDenied\)\. STOPPED: 1 row\(s\) after this one were not attempted\.$/,
		);
	});

	it("lists a row with no usable source and carries on to the next", async () => {
		const s = site({
			download: async (url) =>
				url.includes("huma")
					? {
							why: "the source is image/webp, which Payload re-encodes on upload, so the stored file could not be read back byte for byte",
						}
					: { buffer: PNG, type: "image/png", ext: ".png" },
		});
		const none: LogoRepair = {
			row: row("ankr"),
			action: "could-not-repair",
			reason: "the row records no SCF page",
		};
		const run = await runLogoRepairs(
			[none, repair("huma"), repair("acta")],
			s.io,
		);
		expect(run).toMatchObject({
			planned: 1,
			written: 1,
			failed: [],
			stoppedAt: null,
			cannot: ["ankr", "huma"],
			notAttempted: 0,
		});
		expect(s.lines.slice(0, 2)).toEqual([
			"  ankr (Live): ankr-scf.png answers 404. COULD NOT REPAIR: the row records no SCF page. Row unchanged.",
			"  huma (Live): huma-scf.png answers 404. COULD NOT REPAIR: the source is image/webp, which Payload re-encodes on upload, so the stored file could not be read back byte for byte at https://cdn.invalid/huma.png (SCF page huma-page). Row unchanged.",
		]);
		// nothing was uploaded for the WebP source
		expect(s.calls.filter((c) => c.startsWith("create "))).toEqual([
			'create acta-scf.png "ACTA logo (https://cdn.invalid/acta.png)"',
		]);
	});

	it("says when SCF's image is not the size of the file that was lost", async () => {
		const s = site({ dry: true });
		const p = repair("dig");
		p.row.logo = { id: "old", filename: "dig-scf.png", filesize: 13836 };
		await runLogoRepairs([p], s.io);
		expect(s.lines[0]).toContain("8 bytes, the lost file was 13836 bytes.");
	});
});
