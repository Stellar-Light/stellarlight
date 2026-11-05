/**
 * scripts/eval/scf-crosscheck.ts compares our SCF fields with the SCF site.
 * It called a row UNDERSTATED (high severity in the improvement ledger)
 * when the listing showed any "SCF #N" badge and we said not awarded, but a
 * badge is a round ENTERED: a project that applied and lost is badged too
 * (and the listing carried no badges on 2026-11-04, so the check never
 * fired). And it matched a name to the first of the rows carrying it.
 */
import { describe, expect, it } from "vitest";
import {
	canon,
	classifyScfMatch,
	parseRoundVerdicts,
	uniqueNames,
} from "../../../scripts/eval/scf-official";

const card = (id: string, status: string, round: string, budget: number) =>
	`{"id":"${id}","status":"${status}","roundName":"${round}","budget":${budget},"awardType":"Build"}`;

/** liqvid-hrr's four cards (2026-11-04): two awards, two losses. */
const liqvid = parseRoundVerdicts(
	[
		card("recLauVL3boo779AG", "Awarded", "SCF #45", 97500),
		card("recIPO2uN2oa0uitf", "Not Awarded", "SCF #44", 97500),
		card("rec2aZKPZ8SmvFoGS", "Awarded", "SCF #37", 137500),
		card("rec91jnTCLjHH1ssP", "Not Awarded", "SCF #30", 135000),
	].join("\n"),
);

describe("crosscheck matching", () => {
	it("a name two rows carry identifies neither", () => {
		const index = uniqueNames([
			{ slug: "nest", name: "Nest" },
			{ slug: "nest-2", name: "NEST" },
			{ slug: "pods", name: "Pods" },
		]);
		expect(index.has("nest")).toBe(false);
		expect(index.get("pods")?.slug).toBe("pods");
	});

	it("only the page's verdicts decide a pair, never a listing badge", () => {
		const loser = parseRoundVerdicts(
			card("rec-crebit-44", "Not Awarded", "SCF #44", 90000),
		);
		expect(
			classifyScfMatch({ ourAwarded: false, ourRounds: [], v: loser }),
		).toEqual({});
		expect(
			classifyScfMatch({ ourAwarded: false, ourRounds: [], v: liqvid }),
		).toEqual({ understated: ["37", "45"] });
		expect(
			classifyScfMatch({ ourAwarded: true, ourRounds: [], v: liqvid }),
		).toEqual({ backfill: ["37", "45"] });
		// a page that could not be read says nothing
		expect(
			classifyScfMatch({ ourAwarded: false, ourRounds: [], v: null }),
		).toEqual({});
	});
});

describe("curated rows (crosscheck)", () => {
	it("a human-verified row is curate's: an award page does not make it understated", () => {
		// pen and hermes are unlinked in SCF_FIX (awarded false). A page whose
		// slug base or name equals theirs is another project's; flagging them
		// UNDERSTATED would raise a high-severity ledger item every run.
		expect(
			classifyScfMatch({
				ourAwarded: false,
				ourRounds: [],
				ourBasis: "human-verified",
				v: liqvid,
			}),
		).toEqual({});
		expect(
			classifyScfMatch({
				ourAwarded: false,
				ourRounds: [],
				ourBasis: null,
				v: liqvid,
			}),
		).toEqual({ understated: ["37", "45"] });
	});
});

describe("one name, one identity (enrich and crosscheck)", () => {
	it("a name carried by two projects names neither; a lineage shadow is not a second project", () => {
		const rows = [
			{ slug: "nest", name: "Nest" },
			{ slug: "nest-2", name: "NEST" },
			{ slug: "liqvid", name: "Liqvid", canonicalSlug: "liqvidxyz" },
			{ slug: "liqvidxyz", name: "Liqvid", canonicalSlug: undefined },
		];
		const shared: string[] = [];
		const index = uniqueNames(
			rows,
			(r) => r.canonicalSlug ?? r.slug,
			(name) => shared.push(name),
		);
		expect(index.has("nest")).toBe(false);
		expect(shared).toEqual(["nest"]);
		const hit = index.get("liqvid");
		expect(hit && (hit.canonicalSlug ?? hit.slug)).toBe("liqvidxyz");
	});

	it("canon folds accents the way the matcher does", () => {
		// The crosscheck read Cryptoconexión as cryptoconexin, the enrich as
		// cryptoconexion, so the two disagreed on whether the page was ours.
		expect(canon("Cryptoconexión")).toBe("cryptoconexion");
		expect(canon("CaféPay")).toBe("cafepay");
	});
});
