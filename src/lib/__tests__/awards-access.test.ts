// @vitest-environment node

/**
 * A partner is not an admin.
 *
 * Payload sets `req.user` for a token from ANY auth-enabled collection, and
 * this repo has two: `users` and `partner-accounts`. The awards collections
 * originally gated on `!!req.user`, which every logged-in partner satisfies —
 * and Payload auto-mounts REST for each collection, so that reads as: any
 * partner-portal login could GET /api/award-ballots (every address→choice
 * pair, with tx hashes), POST a forged ballot to pre-empt a pilot, PATCH an
 * existing one, or add themselves to /api/award-voters.
 *
 * Ballot privacy and the whole first-ballot guarantee rest on these four
 * functions, so they are pinned here rather than left to review.
 */
import { describe, expect, it } from "vitest";
import { AwardBallots } from "../../collections/AwardBallots";
import { AwardNominees } from "../../collections/AwardNominees";
import { AwardRounds } from "../../collections/AwardRounds";
import { AwardVoters } from "../../collections/AwardVoters";

const admin = { collection: "users" };
const partner = { collection: "partner-accounts" };

type AccessFn = (args: { req: { user: unknown } }) => unknown;

const collections = [
	["award-ballots", AwardBallots],
	["award-voters", AwardVoters],
	["award-nominees", AwardNominees],
	["award-rounds", AwardRounds],
] as const;

describe("awards collection access", () => {
	for (const [name, config] of collections) {
		const access = config.access as Record<string, AccessFn | undefined>;

		it(`${name}: only admins may write`, () => {
			for (const op of ["create", "update", "delete"] as const) {
				const fn = access[op];
				expect(fn, `${name}.${op} must define access`).toBeTypeOf("function");
				expect(fn?.({ req: { user: admin } })).toBe(true);
				expect(fn?.({ req: { user: partner } })).toBe(false);
				expect(fn?.({ req: { user: null } })).toBe(false);
			}
		});
	}

	it("ballots and voters are not readable by a partner, or anonymously", () => {
		// nominees and rounds are deliberately public (the /awards page reads
		// them); ballots and the whitelist are the private ones.
		for (const config of [AwardBallots, AwardVoters]) {
			const read = (config.access as Record<string, AccessFn>).read;
			expect(read({ req: { user: admin } })).toBe(true);
			expect(read({ req: { user: partner } })).toBe(false);
			expect(read({ req: { user: null } })).toBe(false);
		}
	});

	it("no awards collection gates on mere authentication", () => {
		// the defect in one assertion: `!!req.user` is true for a partner, so
		// any gate that accepts `partner` for a write has regressed.
		for (const [name, config] of collections) {
			for (const [op, fn] of Object.entries(
				config.access as Record<string, AccessFn>,
			)) {
				if (op === "read") continue;
				expect(
					fn({ req: { user: partner } }),
					`${name}.${op} accepted a partner`,
				).toBe(false);
			}
		}
	});
});
