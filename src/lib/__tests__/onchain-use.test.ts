import { describe, expect, it } from "vitest";
import {
	type OnchainReading,
	onchainReadingOf,
	onchainUse,
} from "../onchain-use";

const C = "CAFJZQWSED6YAWZU3GWRTOCNPPCGBN32L7QV43XX5LZLFTK6JLN34DLN";
const reading = (
	asOf: string,
	activeLedgers: number | null,
	lastEventAt: string | null = null,
): OnchainReading => ({
	asOf,
	contracts: [{ id: C, lastEventAt, activeLedgers, ttl: "live" }],
	asset: null,
});
const snap = (
	date: string,
	onchain?: OnchainReading | null,
	slug = "reflector",
) => ({
	date,
	projects: [onchain === undefined ? { slug } : { slug, onchain }],
});

describe("onchainReadingOf", () => {
	it("keeps what the served block reads and nothing it does not", () => {
		const r = onchainReadingOf({
			asOf: "2026-11-22T23:55:44.971Z",
			assetCode: "KALE",
			issuer: "GBDVX4VEDWAKN6TQTPKR5KHSTQPLC6DF7CANYGEK2QXIF6TNH46HL3BL",
			assetSupply: 336559555,
			assetTrustlines: 11097,
			assetHolders: 10120,
			assetLastMovedAt: "2026-11-22T23:57:11.000Z",
			contracts: [
				{
					address: C,
					lastEventAt: null,
					activeLedgers: null,
					ttlState: "live",
					createdAt: "2024-11-10T00:00:00.000Z",
				},
			],
		});
		expect(r?.asset?.holders).toBe(10120);
		expect(r?.contracts[0]).toEqual({
			id: C,
			lastEventAt: null,
			activeLedgers: null,
			ttl: "live",
		});
	});

	it("is null for a project with no block or no read date", () => {
		expect(onchainReadingOf(null)).toBeNull();
		expect(onchainReadingOf({ contracts: [] })).toBeNull();
	});
});

describe("onchainUse", () => {
	it("counts ledgers with an event between two readings a week apart", () => {
		const r = onchainUse([
			snap("2026-11-23", reading("2026-11-22T23:55:44Z", 73165)),
			snap("2026-11-30", reading("2026-11-29T06:10:00Z", 73990)),
		]);
		expect(r.projects[0]).toMatchObject({
			ledgersWithEvents: 825,
			days: 6.3,
			verdict: "events in window",
		});
		expect(r.readings).toHaveLength(2);
	});

	it("does not compare two snapshots of the same weekly reading", () => {
		const one = reading("2026-11-22T23:55:44Z", 73165);
		const r = onchainUse([snap("2026-11-23", one), snap("2026-11-24", one)]);
		expect(r.projects[0].verdict).toBe("could not check");
		expect(r.counts["could not check"]).toBe(1);
	});

	it("does not compare readings under six days apart", () => {
		const r = onchainUse([
			snap("2026-11-23", reading("2026-11-22T00:00:00Z", 10)),
			snap("2026-11-26", reading("2026-11-25T00:00:00Z", 20)),
		]);
		expect(r.projects[0].verdict).toBe("could not check");
	});

	it("reads no new ledger and no new event as not seen, never as unused", () => {
		const r = onchainUse([
			snap(
				"2026-11-23",
				reading("2026-11-22T00:00:00Z", 17, "2025-02-23T00:00:00Z"),
			),
			snap(
				"2026-11-30",
				reading("2026-11-29T00:00:00Z", 17, "2025-02-23T00:00:00Z"),
			),
		]);
		expect(r.projects[0]).toMatchObject({
			ledgersWithEvents: 0,
			verdict: "no event or movement seen",
		});
		expect(r.note).toMatch(/not 'not used'/);
	});

	it("skips a lifetime count that shrank: an index correction is not a reading", () => {
		const r = onchainUse([
			snap("2026-11-23", reading("2026-11-22T00:00:00Z", 500)),
			snap("2026-11-30", reading("2026-11-29T00:00:00Z", 400)),
		]);
		expect(r.projects[0]).toMatchObject({
			ledgersWithEvents: null,
			contractsCompared: 0,
			verdict: "could not check",
		});
	});

	it("treats a snapshot written before the field existed as unrecorded", () => {
		const r = onchainUse([
			snap("2026-11-15"),
			snap("2026-11-23", reading("2026-11-22T00:00:00Z", 10)),
		]);
		expect(r.readings).toEqual(["2026-11-22T00:00:00Z"]);
		expect(r.projects[0].verdict).toBe("could not check");
	});

	it("reads an asset's movement and holder change in the window", () => {
		const asset = (
			asOf: string,
			holders: number,
			lastMovedAt: string,
		): OnchainReading => ({
			asOf,
			contracts: [],
			asset: {
				code: "USDC",
				issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
				supply: 1,
				trustlines: 100,
				holders,
				lastMovedAt,
			},
		});
		const r = onchainUse([
			snap(
				"2026-11-23",
				asset("2026-11-22T00:00:00Z", 687388, "2026-11-21T00:00:00Z"),
				"usdc",
			),
			snap(
				"2026-11-30",
				asset("2026-11-29T00:00:00Z", 688000, "2026-11-28T00:00:00Z"),
				"usdc",
			),
		]);
		expect(r.projects[0]).toMatchObject({
			assetMovedInWindow: true,
			holdersChange: 612,
			verdict: "asset moved in window",
		});
	});

	it("counts a new event as use when the ledger count was not read", () => {
		const r = onchainUse([
			snap("2026-11-23", reading("2026-11-22T00:00:00Z", null)),
			snap(
				"2026-11-30",
				reading("2026-11-29T00:00:00Z", null, "2026-11-28T10:00:00Z"),
			),
		]);
		expect(r.projects[0]).toMatchObject({
			ledgersWithEvents: null,
			verdict: "events in window",
		});
	});

	it("reads an asset that did not move in the window as not seen", () => {
		const still = (asOf: string): OnchainReading => ({
			asOf,
			contracts: [],
			asset: {
				code: "VEUR",
				issuer: "GDM4RQUQQUVSKQA7S6EM7XBZP3FCGH4Q7CL6TABQ7B2BEJ5ERARM2M5M",
				supply: 1,
				trustlines: 5,
				holders: 3,
				lastMovedAt: "2026-10-01T00:00:00Z",
			},
		});
		const r = onchainUse([
			snap("2026-11-23", still("2026-11-22T00:00:00Z"), "veur"),
			snap("2026-11-30", still("2026-11-29T00:00:00Z"), "veur"),
		]);
		expect(r.projects[0]).toMatchObject({
			assetMovedInWindow: false,
			holdersChange: 0,
			verdict: "no event or movement seen",
		});
	});

	// The weekly lane stamps asOf when its run starts and reads each project
	// after, so a busy asset's newest movement is later than its own asOf.
	// Real USDC reading of 2026-11-22: asOf 23:55:44.971Z, moved 23:57:31.000Z.
	const usdc = (asOf: string, lastMovedAt: string | null): OnchainReading => ({
		asOf,
		contracts: [],
		asset: {
			code: "USDC",
			issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
			supply: 308376830,
			trustlines: 2566915,
			holders: 687388,
			lastMovedAt,
		},
	});

	it("reads a movement stamped after the reading's own asOf as movement", () => {
		const r = onchainUse([
			snap(
				"2026-11-23",
				usdc("2026-11-22T23:55:44.971Z", "2026-11-22T23:57:31.000Z"),
				"usdc",
			),
			snap(
				"2026-11-30",
				usdc("2026-11-29T23:55:44.971Z", "2026-11-29T23:57:31.000Z"),
				"usdc",
			),
		]);
		expect(r.projects[0]).toMatchObject({
			assetMovedInWindow: true,
			verdict: "asset moved in window",
		});
	});

	it("does not count again a movement the earlier reading already saw", () => {
		const r = onchainUse([
			snap(
				"2026-11-23",
				usdc("2026-11-22T23:55:44.971Z", "2026-11-22T23:57:31.000Z"),
				"usdc",
			),
			snap(
				"2026-11-30",
				usdc("2026-11-29T23:55:44.971Z", "2026-11-22T23:57:31.000Z"),
				"usdc",
			),
		]);
		expect(r.projects[0]).toMatchObject({
			assetMovedInWindow: false,
			verdict: "no event or movement seen",
		});
	});

	it("reads a contract event stamped after the later asOf, with no ledger count, as use", () => {
		const r = onchainUse([
			snap("2026-11-23", reading("2026-11-22T23:55:44.971Z", null)),
			snap(
				"2026-11-30",
				reading("2026-11-29T23:55:44.971Z", null, "2026-11-29T23:56:10.000Z"),
			),
		]);
		expect(r.projects[0].verdict).toBe("events in window");
	});

	it("does not count again an event the earlier reading already saw", () => {
		const r = onchainUse([
			snap(
				"2026-11-23",
				reading("2026-11-22T23:55:44.971Z", 17, "2026-11-22T23:56:10.000Z"),
			),
			snap(
				"2026-11-30",
				reading("2026-11-29T23:55:44.971Z", 17, "2026-11-22T23:56:10.000Z"),
			),
		]);
		expect(r.projects[0]).toMatchObject({
			ledgersWithEvents: 0,
			verdict: "no event or movement seen",
		});
	});

	it("compares instants, not strings, across precisions", () => {
		const r = onchainUse([
			snap("2026-11-23", reading("2026-11-22T00:00:00Z", null)),
			snap(
				"2026-11-30",
				reading("2026-11-29T00:00:00Z", null, "2026-11-22T00:00:00.500Z"),
			),
		]);
		expect(r.projects[0].verdict).toBe("events in window");
	});

	it("says nothing seen only of a project read whole", () => {
		const two = (asOf: string, c2: number): OnchainReading => ({
			asOf,
			contracts: [
				{ id: "C1", lastEventAt: null, activeLedgers: 5, ttl: "live" },
				{ id: "C2", lastEventAt: null, activeLedgers: c2, ttl: "live" },
			],
			asset: null,
		});
		const r = onchainUse([
			snap("2026-11-23", two("2026-11-22T00:00:00.000Z", 500)),
			snap("2026-11-30", two("2026-11-29T00:00:00.000Z", 400)),
		]);
		expect(r.projects[0]).toMatchObject({
			contractsCompared: 1,
			contractsTotal: 2,
			verdict: "could not check",
		});
		// an asset whose newest events hold no movement is unread, not still
		const r2 = onchainUse([
			snap("2026-11-23", usdc("2026-11-22T00:00:00.000Z", null), "usdc"),
			snap("2026-11-30", usdc("2026-11-29T00:00:00.000Z", null), "usdc"),
		]);
		expect(r2.projects[0]).toMatchObject({
			assetMovedInWindow: null,
			verdict: "could not check",
		});
	});

	it("does not read movement or holder change across a change of asset", () => {
		const eurc: OnchainReading = {
			asOf: "2026-11-29T00:00:00.000Z",
			contracts: [],
			asset: {
				code: "EURC",
				issuer: "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2",
				supply: 1,
				trustlines: 1,
				holders: 1,
				lastMovedAt: "2026-11-28T00:00:00.000Z",
			},
		};
		const r = onchainUse([
			snap(
				"2026-11-23",
				usdc("2026-11-22T00:00:00.000Z", "2026-11-21T00:00:00.000Z"),
				"x",
			),
			snap("2026-11-30", eurc, "x"),
		]);
		expect(r.projects[0]).toMatchObject({
			assetMovedInWindow: null,
			holdersChange: null,
			verdict: "could not check",
		});
	});

	it("reads an unparseable movement date as unknown, not as still", () => {
		const r = onchainUse([
			snap(
				"2026-11-23",
				usdc("2026-11-22T00:00:00.000Z", "2026-11-20T00:00:00.000Z"),
				"usdc",
			),
			snap("2026-11-30", usdc("2026-11-29T00:00:00.000Z", "soon"), "usdc"),
		]);
		expect(r.projects[0]).toMatchObject({
			assetMovedInWindow: null,
			verdict: "could not check",
		});
	});

	it("counts a contract listed twice once", () => {
		const twice = (asOf: string, n: number): OnchainReading => ({
			asOf,
			contracts: [
				{ id: C, lastEventAt: null, activeLedgers: n, ttl: "live" },
				{ id: C, lastEventAt: null, activeLedgers: n, ttl: "live" },
			],
			asset: null,
		});
		const r = onchainUse([
			snap("2026-11-23", twice("2026-11-22T00:00:00.000Z", 10)),
			snap("2026-11-30", twice("2026-11-29T00:00:00.000Z", 30)),
		]);
		expect(r.projects[0]).toMatchObject({
			ledgersWithEvents: 20,
			contractsCompared: 1,
			contractsTotal: 1,
		});
	});

	it("leaves a project without a reading in the newest snapshot out", () => {
		const r = onchainUse([
			snap("2026-11-23", reading("2026-11-22T00:00:00Z", 10)),
			snap("2026-11-30", null),
		]);
		expect(r.projects).toEqual([]);
	});
});
