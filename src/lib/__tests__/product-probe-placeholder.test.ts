/** The first version of this check read any "coming soon" anywhere on a page
 * as a parked domain. sendana's real product page says "Businesses — Coming
 * Soon" about one section and was reported as not-a-product; loop, prism and
 * team-finance were flagged and matched nothing on recheck. A false "this is
 * parked" is worse than no signal: it argues a live project is dead. */
import { describe, expect, it } from "vitest";
import { placeholderReason } from "../product-probe";

const page = (body: string) => `<html><body>${body}</body></html>`;
/** Enough real copy that the page is plainly a product, not a splash. */
const REAL_COPY = "Send money across borders in seconds. ".repeat(60);

describe("placeholderReason", () => {
	it("flags an unambiguously parked domain", () => {
		expect(placeholderReason(page("This domain is for sale. Buy this domain."))).toMatch(
			/parked page/,
		);
		expect(placeholderReason(page("Welcome to nginx!"))).toMatch(/parked page/);
	});

	it("does NOT flag a shipping product that labels one section Coming Soon", () => {
		// The sendana case, verbatim in shape.
		expect(
			placeholderReason(page(`<h1>Sendana</h1>${REAL_COPY}<div>Businesses <span>Coming Soon</span></div>`)),
		).toBeNull();
	});

	it("still flags a bare splash whose only content is Coming Soon", () => {
		expect(placeholderReason(page("<h1>Coming Soon</h1>"))).toMatch(/splash page/);
	});

	it("does not flag an ordinary product page", () => {
		expect(placeholderReason(page(`<h1>Wallet</h1>${REAL_COPY}`))).toBeNull();
	});

	it("ignores phrases buried in scripts and styles when measuring content", () => {
		// A big JS bundle inlined must not make a splash look like a full page.
		const withScript = page(
			`<script>${"x".repeat(5000)}</script><h1>Coming Soon</h1>`,
		);
		expect(placeholderReason(withScript)).toMatch(/splash page/);
	});
});
