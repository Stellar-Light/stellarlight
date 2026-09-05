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
	PROJECT_STATUSES,
	RESOLVABLE_PROJECT_STATUSES,
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
