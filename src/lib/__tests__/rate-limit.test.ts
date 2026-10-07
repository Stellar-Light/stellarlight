// @vitest-environment node

/**
 * A partner key moves a caller from the per-IP bucket to a per-key one at
 * the partner tier; an unknown key changes nothing. Buckets are keyed by
 * endpoint, so each test uses its own.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { partnerOf, rateLimit } from "../rate-limit";

function req(headers: Record<string, string>, ip = "203.0.113.9") {
	return new NextRequest("https://stellarlight.xyz/api/research?q=x", {
		headers: { "x-forwarded-for": ip, ...headers },
	});
}
const opts = () => ({
	endpoint: `/api/test-${Math.random()}`,
	limit: 60,
	windowMs: 60_000,
});

describe("partner keys", () => {
	beforeEach(() => {
		process.env.SCOUT_PARTNER_KEYS = "tyler:sk_test_1, other:sk_test_2";
	});

	it("names the partner from a bearer or x-api-key header", () => {
		expect(partnerOf(req({ authorization: "Bearer sk_test_1" }))).toBe("tyler");
		expect(partnerOf(req({ "x-api-key": "sk_test_2" }))).toBe("other");
		expect(partnerOf(req({ authorization: "Bearer nope" }))).toBeNull();
		expect(partnerOf(req({}))).toBeNull();
	});

	it("a keyed caller is metered per key at 1,200 a minute", () => {
		const o = opts();
		for (let i = 0; i < 61; i++) {
			const r = rateLimit(req({ authorization: "Bearer sk_test_1" }), o);
			expect(r.allowed).toBe(true);
			expect(r.limit).toBe(1200);
		}
		// the same IP without the key is still on the public bucket, untouched
		expect(rateLimit(req({}), o)).toMatchObject({
			allowed: true,
			remaining: 59,
		});
	});

	it("an unknown key stays on the public tier", () => {
		const o = opts();
		let last = rateLimit(req({ authorization: "Bearer nope" }), o);
		for (let i = 1; i < 61; i++)
			last = rateLimit(req({ authorization: "Bearer nope" }), o);
		expect(last).toMatchObject({ allowed: false, limit: 60, remaining: 0 });
	});
});
