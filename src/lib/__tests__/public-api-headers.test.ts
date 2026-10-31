/**
 * Every public GET path in the spec gets CORS and X-API-Version: next.config.mjs
 * adds them only to the paths its publicApi[] names, and an endpoint left off
 * that list ships without them, so a browser agent cannot call it. The daily
 * drift guard found two (locateSource, getHackathonSubmission) a week after
 * they shipped; this fails the PR instead.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { spec as specSource } from "../openapi-spec";

const spec = specSource as unknown as {
	paths: Record<string, Record<string, unknown>>;
};
const config = readFileSync(
	path.join(process.cwd(), "next.config.mjs"),
	"utf8",
);
const listed = [
	...(/const publicApi = \[([\s\S]*?)\];/.exec(config)?.[1] ?? "").matchAll(
		/"([^"]+)"/g,
	),
].map((m) => m[1]);

/** A next.config source pattern as a regex: each :param is one path segment,
 * every other character literal. */
const covers = (source: string, p: string) =>
	new RegExp(
		`^${source
			.split(/:[A-Za-z]+/)
			.map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
			.join("[^/]+")}$`,
	).test(p);

describe("public API headers", () => {
	it("reads the publicApi list", () => {
		expect(listed.length).toBeGreaterThan(30);
	});

	it("covers every GET path the spec documents", () => {
		const uncovered = Object.keys(spec.paths)
			.filter((p) => spec.paths[p].get)
			.map((p) => p.replace(/\{[^}]+\}/g, "x"))
			.filter((p) => !listed.some((source) => covers(source, p)));
		expect(uncovered).toEqual([]);
	});
});
