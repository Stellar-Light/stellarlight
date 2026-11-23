import { describe, expect, it } from "vitest";
import { evidenceOf, verdictFor } from "../../../scripts/basis-from-onchain";

// The lane awards onchain-activity from activity the chain dated. Until
// 2026-11-03 it read per-window deltas of the explorer's counters; those
// fields are gone, and an event or a movement carries its own date.
describe("basis-from-onchain evidence: the newest dated activity, or nothing", () => {
	const asset = { assetCode: "USDC", issuer: "GA5Z" };
	const C1 = "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD";
	const C2 = "CAO3AGAMZVRMHITL36EJ2VZQWKYRPWMQAPDQD5YEOF3GIF7T44U4JAL3";

	it("cites the contract whose event is newest, with the event's own date", () => {
		expect(
			evidenceOf({
				...asset,
				assetLastMovedAt: "2026-11-01T00:00:00.000Z",
				asOf: "2026-11-22T00:00:00.000Z",
				contracts: [
					{ address: C1, lastEventAt: "2026-10-01T00:00:00.000Z" },
					{ address: C2, lastEventAt: "2026-11-20T08:00:00.000Z" },
				],
			}),
		).toEqual({
			kind: "contract-event",
			detail: "event from CAO3AGAMZV… on 2026-11-20",
			url: `https://stellar.expert/explorer/public/contract/${C2}`,
			at: "2026-11-20T08:00:00.000Z",
		});
	});

	it("never cites a contract only a third party's label ties to the row (the on-chain map's labelled tier)", () => {
		expect(
			evidenceOf({
				contracts: [
					{
						address: C1,
						lastEventAt: "2026-10-01T00:00:00.000Z",
						tier: "strong",
					},
					{
						address: C2,
						lastEventAt: "2026-11-20T08:00:00.000Z",
						tier: "labelled",
					},
				],
			})?.detail,
		).toBe("event from CAJJZSGMMM… on 2026-10-01");
		expect(
			evidenceOf({
				contracts: [
					{
						address: C2,
						lastEventAt: "2026-11-20T08:00:00.000Z",
						tier: "labelled",
					},
				],
			}),
		).toBeNull();
	});

	it("cites the asset when its movement is the newest activity", () => {
		const ev = evidenceOf({
			...asset,
			assetLastMovedAt: "2026-11-21T00:00:00.000Z",
			contracts: [{ address: C1, lastEventAt: "2026-10-01T00:00:00.000Z" }],
		});
		expect(ev?.kind).toBe("asset-movement");
		expect(ev?.url).toBe(
			"https://stellar.expert/explorer/public/asset/USDC-GA5Z",
		);
		expect(ev?.at).toBe("2026-11-21T00:00:00.000Z");
	});

	it("falls back to a holder change, dated by the reading that saw it", () => {
		expect(
			evidenceOf({
				...asset,
				assetHoldersDelta: -4,
				asOf: "2026-11-22T00:00:00.000Z",
				contracts: [{ address: C1, lastEventAt: null }],
			}),
		).toMatchObject({ kind: "asset-holders", at: "2026-11-22T00:00:00.000Z" });
	});

	it.each([
		["nothing on record", { ...asset, contracts: [] }],
		[
			"a zero holder change",
			{ ...asset, assetHoldersDelta: 0, asOf: "2026-11-22" },
		],
		["a contract with no event", { contracts: [{ address: C1 }] }],
		[
			"a date that does not parse",
			{ contracts: [{ address: C1, lastEventAt: "soon" }] },
		],
		[
			"a movement with no asset to cite",
			{ assetLastMovedAt: "2026-11-21T00:00:00.000Z" },
		],
		// the removed explorer counters are not evidence any more
		[
			"the old delta fields",
			{
				...asset,
				assetPaymentsDelta: 9,
				contracts: [{ address: C1, eventsDelta: 5, subinvocationsDelta: 2 }],
			},
		],
		["no reading at all", null],
	])("finds no evidence in %s", (_label, onchain) => {
		expect(evidenceOf(onchain)).toBeNull();
	});
});

// Second review, 2026-11-22: the evidence date is an event's own date now, so
// it can be older than the date a row holds. Before, it was the snapshot's
// date, which only moved forward.
describe("basis-from-onchain verdict: a strong basis is never re-dated backwards", () => {
	const NOW = Date.parse("2026-11-22T12:00:00.000Z");
	const ev = (
		at: string,
		url = "https://stellar.expert/explorer/public/contract/C2",
	) => ({
		kind: "contract-event",
		detail: "event",
		url,
		at,
	});
	const verdict = (
		statusBasis: string | null,
		statusAsOf: string | null,
		at: string,
	) => verdictFor({ statusBasis, statusAsOf }, ev(at), NOW);

	it("re-dates its own award forward only, whatever it cites now", () => {
		// spectra-finance: stamped 2026-11-03 by the old lane; its newest event
		// is another contract's, on 2026-10-16.
		expect(
			verdict(
				"onchain-activity",
				"2026-11-03T13:57:00.000Z",
				"2026-10-16T00:00:00.000Z",
			),
		).toBe("up-to-date");
		expect(
			verdict(
				"onchain-activity",
				"2026-11-03T13:57:00.000Z",
				"2026-11-21T00:00:00.000Z",
			),
		).toBe("refresh");
		expect(
			verdict(
				"onchain-activity",
				"2026-11-21T00:00:00.000Z",
				"2026-11-21T00:00:00.000Z",
			),
		).toBe("up-to-date");
	});

	it("does not replace a fresher repo, package or product observation with an older event", () => {
		for (const basis of [
			"repo-activity",
			"package-release",
			"product-integration",
		]) {
			expect(
				verdict(basis, "2026-11-20T00:00:00.000Z", "2026-11-01T00:00:00.000Z"),
				basis,
			).toBe("kept-fresher");
			expect(
				verdict(basis, "2026-11-01T00:00:00.000Z", "2026-11-20T00:00:00.000Z"),
				basis,
			).toBe("award");
		}
	});

	it("replaces a weak or missing basis with a dated event inside the window", () => {
		expect(
			verdict(
				"site-liveness",
				"2026-11-21T00:00:00.000Z",
				"2026-10-01T00:00:00.000Z",
			),
		).toBe("award");
		expect(verdict(null, null, "2026-11-20T00:00:00.000Z")).toBe("award");
		expect(verdict("onchain-activity", null, "2026-11-20T00:00:00.000Z")).toBe(
			"refresh",
		);
	});

	it("leaves a row alone when the event is older than 90 days or has no date", () => {
		expect(verdict("site-liveness", null, "2026-08-01T00:00:00.000Z")).toBe(
			"stale",
		);
		expect(verdict("site-liveness", null, "soon")).toBe("no-date");
	});
});
