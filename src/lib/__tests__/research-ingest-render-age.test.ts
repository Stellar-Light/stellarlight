// @vitest-environment node

/**
 * The corpus refresh re-plans every source right after its execute and must
 * plan 0 writes. Two reads of an unchanged page must therefore give the same
 * chunks. Built from pages as the sites served them on 2026-11-23.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	chunkMarkdown,
	fetchFreshHtml,
	stripHtml,
	stripTrailingTeaser,
} from "../research-ingest";

/** The ingest-lumenloop-research.ts body and chunk hashes of one render. */
function lumenloopChunks(html: string) {
	const body = stripTrailingTeaser(stripHtml(html));
	return chunkMarkdown({
		md: `# Practical Confidential Stablecoins\n\n${body}`,
		parentDocId: "news/practical-confidential-stablecoins-issuer-controlled-2",
		title: "Practical Confidential Stablecoins",
		url: "https://lumenloop.com/news/practical-confidential-stablecoins-issuer-controlled-2",
		tags: [],
	});
}

describe("render-time ages", () => {
	// lumenloop.com/news/practical-confidential-stablecoins-issuer-controlled-2
	// as served 2026-11-23T21:13Z, its header verbatim: it prints "2mo ago"
	// beside the date. The row the refresh's execute stored at 17:11Z that day
	// reads "Boyan BarakovSeptember 24, 20261mo ago" for the same page (an
	// edge render up to a day old), so the re-plan planned a write: the red of
	// 11-23.
	const header = (age: string) =>
		`<div class="art-meta-row" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:18px"><span class="mono" style="font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--ed-accent);border:1px solid #ee826855;padding:3px 8px;border-radius:3px">Article</span><span aria-hidden="true" style="width:3px;height:3px;border-radius:50%;background:var(--ed-text-faint);flex:0 0 auto"></span><span class="meta" style="color:var(--ed-text)">stellar.org</span><span aria-hidden="true" style="width:3px;height:3px;border-radius:50%;background:var(--ed-text-faint);flex:0 0 auto"></span><span class="meta" style="color:var(--ed-text-dim)">Boyan Barakov</span><span style="flex:1"></span><time dateTime="2026-09-24T00:00:00.000Z" class="meta">September 24, 2026</time><span aria-hidden="true" style="width:3px;height:3px;border-radius:50%;background:var(--ed-text-faint);flex:0 0 auto"></span><span class="meta" style="color:var(--ed-text-dim)">${age}</span></div><h1 class="serif" style="margin:0;font-size:clamp(34px, 4.2vw, 52px);line-height:1.05;letter-spacing:-0.02em;font-weight:500;text-wrap:balance">Practical Confidential Stablecoins: An Issuer-Controlled Architecture</h1><p>OpenZeppelin's confidential token contract for Stellar keeps transaction amounts private.</p>`;
	const served = header("2mo ago");
	const earlier = header("1mo ago");

	it("two renders of an unchanged lumenloop page give the same chunks", () => {
		const a = lumenloopChunks(served);
		const b = lumenloopChunks(earlier);
		expect(a.map((c) => c.contentHash)).toEqual(b.map((c) => c.contentHash));
		expect(a[0].content).toContain("Boyan BarakovSeptember 24, 2026\n");
		expect(a[0].content).not.toMatch(/mo ago/);
		// Same-day and day-old posts print a word instead of a number.
		expect(lumenloopChunks(header("today"))[0].contentHash).toBe(
			a[0].contentHash,
		);
	});

	it("a GitBook 'Last updated' age becomes the date it stands for", () => {
		// The SCF Handbook's footer (stellar.gitbook.io, rfp-track, 2026-11-23).
		const footer = (age: string) =>
			`<div class="max-w-3xl layout-wide:max-w-6xl mx-auto w-full mt-6 flex flex-row flex-wrap items-center gap-4 text-tint contrast-more:text-tint-strong"><p class="mr-auto text-sm">Last updated <time data-visual-test="transparent" dateTime="2026-11-13T15:15:29.212Z" id="base-ui-_R_7pdl5fivcdmiv5ubsnpfivb_" data-base-ui-tooltip-trigger="">${age}</time></p></div>`;
		expect(stripHtml(footer("10 days ago"))).toBe("Last updated 2026-11-13");
		expect(stripHtml(footer("11 days ago"))).toBe("Last updated 2026-11-13");
		expect(stripHtml(footer("1 month ago"))).toBe("Last updated 2026-11-13");
	});

	it("keeps prose that says how long ago something was", () => {
		for (const prose of [
			"We operate on financial infrastructure that was built 50 or 75 years ago.",
			"Shipped May 5, 2026 today's build is the last.",
		])
			expect(stripHtml(`<p>${prose}</p>`)).toBe(prose);
		expect(
			stripHtml(
				'<p>Released <time dateTime="2026-09-24">September 24, 2026</time>.</p>',
			),
		).toBe("Released September 24, 2026.");
	});
});

describe("fetchFreshHtml", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	// stellar.org/foundation/mandate, six reads within one second on
	// 2026-11-23T21:14Z: three STALE renders said the balances were "Last
	// updated: November 21, 2026 at 7.08 AM UTC", three HIT renders said
	// "November 23, 2026 at 9.07 PM UTC" with other balances. The refresh's
	// execute stored the STALE one at 17:16Z.
	const stale = "Last updated:  November 21, 2026 at 7.08 AM UTC";
	const fresh = "Last updated:  November 23, 2026 at 9.07 PM UTC";
	const page = (body: string, cache?: string) =>
		new Response(body, {
			headers: cache ? { "x-nextjs-cache": cache } : {},
		});

	it("reads past a STALE render to the one the server calls fresh", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(page(stale, "STALE"))
			.mockResolvedValueOnce(page(stale, "STALE"))
			.mockResolvedValueOnce(page(fresh, "HIT"));
		vi.stubGlobal("fetch", fetch);
		const r = await fetchFreshHtml("https://stellar.org/foundation/mandate", {
			delayMs: 0,
		});
		expect(r.html).toBe(fresh);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("reads once when the server does not call the render stale", async () => {
		for (const cache of ["HIT", "MISS", undefined]) {
			const fetch = vi.fn().mockResolvedValueOnce(page(fresh, cache));
			vi.stubGlobal("fetch", fetch);
			const r = await fetchFreshHtml("https://stellar.org/x", { delayMs: 0 });
			expect(r.html).toBe(fresh);
			expect(fetch).toHaveBeenCalledTimes(1);
		}
	});

	it("uses the last STALE render once the attempts run out", async () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const fetch = vi.fn(async () => page(stale, "STALE"));
		vi.stubGlobal("fetch", fetch);
		const r = await fetchFreshHtml("https://stellar.org/x", {
			attempts: 3,
			delayMs: 0,
		});
		expect(r.html).toBe(stale);
		expect(fetch).toHaveBeenCalledTimes(3);
	});

	it("throws on an HTTP error", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("", { status: 404 })),
		);
		await expect(
			fetchFreshHtml("https://stellar.org/x", { delayMs: 0 }),
		).rejects.toThrow("404");
	});
});
