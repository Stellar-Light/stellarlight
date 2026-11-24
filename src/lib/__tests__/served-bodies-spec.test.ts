/**
 * Every GET operation's recorded production body against the spec: no
 * field, null, enum value, JSON type or shape the operation's 200 schema
 * does not declare (scripts/contract/served-shape.ts). The bodies are live
 * reads trimmed to the rows that serve something new
 * (scripts/contract/record-served.ts, which re-records them), and
 * scripts/check-api-drift.ts reads the same URLs live every day: this test
 * holds the spec to what is served, the drift guard holds what is served to
 * the spec.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { spec } from "@/lib/openapi-spec";
import {
	operationOf,
	responseSchema,
	undeclaredInServed,
} from "../../../scripts/contract/served-shape";

type Read = { url: string; status?: number; body?: unknown };
const { reads } = JSON.parse(
	readFileSync(resolve(__dirname, "fixtures/served-bodies.json"), "utf8"),
) as { reads: Read[] };
const bodies = reads.filter((r) => r.body !== undefined);

/** Partner-only operations: their bodies are private cohort data and this
 * fixture is public, so none is recorded here. sdf-cohort.test.ts ("cohort
 * bodies against the spec") holds each one to the spec on its synthetic
 * bundle; add an operation here only with a check there. */
const PARTNER_ONLY = ["getCohortFigures", "listCohortRows", "getCohortJourney"];

describe("recorded production bodies against the spec", () => {
	it("every GET operation has a recorded body", () => {
		const ops = Object.values(
			spec.paths as Record<string, { get?: { operationId?: string } }>,
		).flatMap((p) => (p.get?.operationId ? [p.get.operationId] : []));
		const recorded = new Set(
			bodies.map((r) => operationOf(spec, r.url)?.operationId),
		);
		expect(PARTNER_ONLY.filter((op) => !ops.includes(op))).toEqual([]);
		expect(
			ops.filter((op) => !recorded.has(op) && !PARTNER_ONLY.includes(op)),
		).toEqual([]);
	});

	it.each(bodies.map((r) => [r.url, r.body] as const))(
		"%s serves nothing its schema does not declare",
		(url, body) => {
			const op = operationOf(spec, url);
			expect(op, `no GET operation serves ${url}`).toBeDefined();
			expect(
				undeclaredInServed(spec, responseSchema(spec, op?.path ?? ""), body),
			).toEqual([]);
		},
	);
});
