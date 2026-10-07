import { describe, expect, it } from "vitest";
import {
	classifyMirrorComponent,
	digitSiblingPaths,
	mirrorGroups,
	type UrlProbe,
} from "../corpus-mirrors";

const A =
	"https://stellar.org/blog/foundation-news/how-to-protect-yourself-from-scammers";
const B =
	"https://stellar.org/blog/foundation-news/stellar-security-guide-protect-scammers";

const doc = (source: string, hashes: string[]) => ({
	source,
	hashes: new Set(hashes),
});

describe("mirrorGroups", () => {
	it("groups a hash under >1 URL and ignores singletons and hashless rows", () => {
		const groups = mirrorGroups([
			{ url: A, contentHash: "h1" },
			{ url: B, contentHash: "h1" },
			{ url: A, contentHash: "h2" },
			{ url: "https://x.com/solo", contentHash: "h3" },
			{ url: "https://x.com/none" },
		]);
		expect(groups).toEqual([{ hash: "h1", urls: [A, B] }]);
	});
});

describe("digitSiblingPaths", () => {
	it("flags version/number-only slug differences", () => {
		expect(
			digitSiblingPaths(
				"https://github.com/stellar/rs-soroban-sdk/releases/tag/v22.0.10",
				"https://github.com/stellar/rs-soroban-sdk/releases/tag/v23.5.2",
			),
		).toBe(true);
		expect(
			digitSiblingPaths(
				"https://developers.stellar.org/docs/platforms/anchor-platform/sep-guide/sep6/integration",
				"https://developers.stellar.org/docs/platforms/anchor-platform/sep-guide/sep24/integration",
			),
		).toBe(true);
	});
	it("does not flag worded slug differences or identical URLs", () => {
		expect(digitSiblingPaths(A, B)).toBe(false);
		expect(digitSiblingPaths(A, A)).toBe(false);
	});
});

describe("classifyMirrorComponent", () => {
	const pair = new Map([
		[A, doc("sdf-blog", ["h1", "h2"])],
		[B, doc("sdf-blog", ["h1", "h2"])],
	]);

	it("republication on redirect proof — keep the redirect target", () => {
		const probes = new Map<string, UrlProbe>([
			[A, { status: 200, finalUrl: B }],
			[B, { status: 200, finalUrl: B }],
		]);
		const d = classifyMirrorComponent([A, B], pair, probes);
		expect(d).toMatchObject({ kind: "republication", keep: B, drop: A });
	});

	it("republication on dead-mirror proof — keep the live URL", () => {
		const probes = new Map<string, UrlProbe>([
			[A, { status: 404, finalUrl: A }],
			[B, { status: 200, finalUrl: B }],
		]);
		const d = classifyMirrorComponent([A, B], pair, probes);
		expect(d).toMatchObject({ kind: "republication", keep: B, drop: A });
	});

	it("ambiguous when both live with no redirect — never guesses", () => {
		const probes = new Map<string, UrlProbe>([
			[A, { status: 200, finalUrl: A }],
			[B, { status: 200, finalUrl: B }],
		]);
		expect(classifyMirrorComponent([A, B], pair, probes).kind).toBe(
			"ambiguous",
		);
	});

	it("ambiguous without probes at all", () => {
		expect(classifyMirrorComponent([A, B], pair).kind).toBe("ambiguous");
	});

	it("template-siblings for digit-only slug pairs, even whole-doc-identical", () => {
		const u1 = "https://g.com/r/releases/tag/v22.0.10";
		const u2 = "https://g.com/r/releases/tag/v23.5.2";
		const byUrl = new Map([
			[u1, doc("release", ["h1"])],
			[u2, doc("release", ["h1"])],
		]);
		expect(classifyMirrorComponent([u1, u2], byUrl).kind).toBe(
			"template-siblings",
		);
	});

	it("boilerplate-overlap when docs share some but not all chunks", () => {
		const byUrl = new Map([
			[A, doc("repo-docs", ["h1", "h2"])],
			[B, doc("repo-docs", ["h1"])],
		]);
		expect(classifyMirrorComponent([A, B], byUrl).kind).toBe(
			"boilerplate-overlap",
		);
	});

	it("boilerplate-overlap for >2-URL components (the 8-CAP group)", () => {
		const urls = [
			"https://g.com/a-doc",
			"https://g.com/b-doc",
			"https://g.com/c-doc",
		];
		const byUrl = new Map(urls.map((u) => [u, doc("cap", ["h1"])]));
		expect(classifyMirrorComponent(urls, byUrl).kind).toBe(
			"boilerplate-overlap",
		);
	});

	it("ambiguous for cross-source mirrors", () => {
		const byUrl = new Map([
			[A, doc("sdf-blog", ["h1"])],
			[B, doc("dev-docs", ["h1"])],
		]);
		expect(classifyMirrorComponent([A, B], byUrl).kind).toBe("ambiguous");
	});
});
