/**
 * Render-reachability: every status a project can be given must be either
 * publicly resolvable or explicitly hidden. No third bucket. This is the
 * guard the Keybase incident was missing — "Inactive" was writable, the page
 * carried an "Inactive / archived" badge, and the detail route's status
 * filter quietly excluded it, 404ing all 96 archived projects.
 *
 * Source of truth for the option list is the collection itself, so a new
 * status added to Projects.ts fails here until someone decides which tier it
 * belongs to.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	ACTIVE_PROJECT_STATUSES,
	HIDDEN_PROJECT_STATUSES,
	isStrongStatusBasis,
	PROJECT_STATUSES,
	RESOLVABLE_PROJECT_STATUSES,
	STATUS_BASES,
	STRONG_STATUS_BASES,
} from "./project-status";

function collectionStatusOptions(): string[] {
	// Read the collection file as text rather than importing it: importing
	// Payload collection configs pulls in server-only modules under vitest.
	const src = readFileSync(
		resolve(__dirname, "../collections/Projects.ts"),
		"utf8",
	);
	const m = src.match(/name:\s*"status",[\s\S]*?options:\s*\[([^\]]+)\]/);
	if (!m) throw new Error("could not find the status options in Projects.ts");
	return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function detailRouteStatusFilters(): string[] {
	// The detail route is the one that MUST resolve every public status. Both
	// its queries (metadata + page) filter by status; read them straight from
	// the file so a hand-edit back to a literal list fails here.
	const src = readFileSync(
		resolve(__dirname, "../app/(frontend)/project/[slug]/page.tsx"),
		"utf8",
	);
	return [...src.matchAll(/status:\s*\{\s*in:\s*([^}]+)\}/g)].map((m) =>
		m[1].trim(),
	);
}

describe("project status tiers", () => {
	it("mirror the collection's option list exactly", () => {
		expect([...PROJECT_STATUSES].sort()).toEqual(
			collectionStatusOptions().sort(),
		);
	});

	it("every status is either resolvable or hidden — never neither", () => {
		const covered = new Set<string>([
			...RESOLVABLE_PROJECT_STATUSES,
			...HIDDEN_PROJECT_STATUSES,
		]);
		for (const s of PROJECT_STATUSES) {
			expect(covered.has(s), `status "${s}" has no public tier`).toBe(true);
		}
		// and no status is in both
		for (const s of HIDDEN_PROJECT_STATUSES) {
			expect(RESOLVABLE_PROJECT_STATUSES as readonly string[]).not.toContain(s);
		}
	});

	it("active ⊂ resolvable, and archived projects are resolvable", () => {
		for (const s of ACTIVE_PROJECT_STATUSES) {
			expect(RESOLVABLE_PROJECT_STATUSES as readonly string[]).toContain(s);
		}
		expect(RESOLVABLE_PROJECT_STATUSES as readonly string[]).toContain(
			"Inactive",
		);
	});

	it("a hidden lineage shadow still reaches its redirect, and is never rendered", () => {
		// 2026-09-05: a duplicate is parked at Draft (hidden), not Inactive (a
		// death verdict). Draft is outside RESOLVABLE, so without an admission
		// for shadows the page 404s a slug that used to 307 to the survivor.
		const src = readFileSync(
			resolve(__dirname, "../app/(frontend)/project/[slug]/page.tsx"),
			"utf8",
		);
		const admit = src.indexOf("canonicalSlug: { exists: true }");
		const redirectAt = src.indexOf("redirect(`/project/");
		const belt = src.indexOf(
			"!(RESOLVABLE_PROJECT_STATUSES as readonly string[]).includes(project.status)",
		);
		expect(admit).toBeGreaterThan(0);
		expect(redirectAt).toBeGreaterThan(admit);
		// the belt must come AFTER the redirect, or a shadow never gets folded
		expect(belt).toBeGreaterThan(redirectAt);
	});

	it("the /project/[slug] route filters by RESOLVABLE, not a hand-copied list", () => {
		const filters = detailRouteStatusFilters();
		expect(filters.length, "detail route should filter by status").toBe(2);
		for (const f of filters) {
			// Must reference the shared constant. A literal list here is exactly
			// how "Inactive" got dropped and 96 pages 404'd.
			expect(f, `detail route uses a literal status list: ${f}`).toMatch(
				/RESOLVABLE_PROJECT_STATUSES/,
			);
			expect(f).not.toMatch(/"Draft"/);
		}
	});
});

/**
 * Same guard, one field over. A statusBasis added to Projects.ts fails here
 * until someone decides whether it is EARNED evidence or not — which is the
 * decision the quality board silently got wrong once already, carrying
 * "official-record" (an scf.basis value no status row can hold) on its strong
 * list while omitting two tiers rows did hold.
 */
describe("status basis vocabulary", () => {
	function collectionBasisOptions(): string[] {
		const src = readFileSync(
			resolve(__dirname, "../collections/Projects.ts"),
			"utf8",
		);
		const m = src.match(
			/name:\s*"statusBasis",[\s\S]*?options:\s*\[([^\]]+)\]/,
		);
		if (!m) throw new Error("could not find the statusBasis options");
		return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
	}

	it("the shared list matches the collection, exactly", () => {
		expect([...STATUS_BASES].sort()).toEqual(collectionBasisOptions().sort());
	});

	it("every strong basis is a real basis", () => {
		for (const b of STRONG_STATUS_BASES)
			expect(STATUS_BASES as readonly string[]).toContain(b);
	});

	it("every basis is classified — strong or explicitly weak", () => {
		// No third bucket. A new tier nobody classified would silently count as
		// weak and quietly depress the board, which is how work gets reported
		// as not done.
		const WEAK: string[] = [
			"operator-announcement",
			"site-liveness",
			"source-inherited",
			"unverified",
		];
		for (const b of STATUS_BASES)
			expect(
				isStrongStatusBasis(b) || WEAK.includes(b),
				`statusBasis "${b}" is in neither tier — classify it`,
			).toBe(true);
	});

	it("package-release is strong, and is not the same thing as repo-activity", () => {
		expect(isStrongStatusBasis("package-release")).toBe(true);
		expect(isStrongStatusBasis("repo-activity")).toBe(true);
		// Distinct values on purpose: repo-activity says the SOURCE moved,
		// package-release says a versioned ARTIFACT shipped to a registry that
		// names this repo. Collapsing them would make the label lie about its
		// own evidence.
		expect("package-release").not.toBe("repo-activity");
	});

	it("site-liveness is never strong — a parked domain answers too", () => {
		expect(isStrongStatusBasis("site-liveness")).toBe(false);
		expect(isStrongStatusBasis(null)).toBe(false);
		expect(isStrongStatusBasis(undefined)).toBe(false);
	});
});
