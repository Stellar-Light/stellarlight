import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	RWA_KINDS,
	RWA_PRODUCT_KINDS,
	RWA_STATES,
	RWA_VERIFICATION_LEVELS,
} from "@/data/rwa-registry";
import { CODE_DOMAINS } from "../code-domains";
import { BOOL_FALSE_VALUES, BOOL_TRUE_VALUES } from "../http-params";
import { spec } from "../openapi-spec";
import { PARTNER_TYPES } from "../partner-match";
import { DEPLOYMENT_NETWORKS } from "../project-deployment";
import {
	PROJECT_STATUSES,
	RESOLVABLE_PROJECT_STATUSES,
	STATUS_BASES,
} from "../project-status";
import { PROJECT_TYPES } from "../project-types";
import { REPO_KINDS } from "../repo-grade";
import { TRUST_SIGNALS } from "../trust-report";

/**
 * Two Raven findings, one class: an enum the code serves, hand-copied into
 * the spec and drifted. sls-082 — `/api/rwa` accepted and returned
 * issued-single-holder while BOTH spec enums lacked it. sls-084 — nine live
 * rows served statusBasis=package-release, the value that had joined the
 * code's list the day before and never reached the spec's copy. The fix is
 * that the spec SPREADS the code's arrays; these tests pin every projection
 * to the array so a hand-edit back to a literal fails here, not in a
 * downstream consumer's generated client.
 */
// biome-ignore lint/suspicious/noExplicitAny: walking untyped spec JSON
const S: any = spec;
const sorted = (xs: readonly string[]) => [...xs].sort();
type Param = { name: string; description: string; schema: { enum: string[] } };

describe("statusBasis is ONE list (sls-084)", () => {
	it("Project.statusBasis enum equals STATUS_BASES", () => {
		const e: string[] =
			S.components.schemas.Project.properties.statusBasis.enum;
		expect(sorted(e)).toEqual(sorted(STATUS_BASES));
	});

	it("the collection's statusBasis options are the same list — a basis a writer can store is a basis the spec documents", () => {
		// Read the collection as text: importing a Payload config pulls in
		// server-only modules under vitest. Closes the loop collection ⇄
		// STATUS_BASES ⇄ OpenAPI; CI runs this directory, so the loop is enforced.
		const src = readFileSync(
			resolve(__dirname, "../../collections/Projects.ts"),
			"utf8",
		);
		const m = src.match(
			/name:\s*"statusBasis",[\s\S]*?options:\s*\[([^\]]+)\]/,
		);
		if (!m) throw new Error("statusBasis options not found in Projects.ts");
		const options = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
		expect(sorted(options)).toEqual(sorted(STATUS_BASES));
	});

	it("the enum's description defines every value it lists", () => {
		const d: string =
			S.components.schemas.Project.properties.statusBasis.description;
		for (const v of STATUS_BASES) expect(d, v).toContain(`'${v}'`);
	});

	it("nothing else in the spec carries a rival statusBasis enum", () => {
		// A second, independently-typed copy is how the drift reopens.
		const rivals: string[] = [];
		const walk = (n: unknown, path: string): void => {
			if (Array.isArray(n)) {
				for (const [i, v] of n.entries()) walk(v, `${path}[${i}]`);
				return;
			}
			if (!n || typeof n !== "object") return;
			for (const [k, v] of Object.entries(n as Record<string, unknown>)) {
				if (
					k === "statusBasis" &&
					v &&
					typeof v === "object" &&
					Array.isArray((v as { enum?: unknown }).enum)
				) {
					const e = (v as { enum: string[] }).enum;
					if (sorted(e).join() !== sorted(STATUS_BASES).join())
						rivals.push(`${path}.${k}`);
				}
				walk(v, `${path}.${k}`);
			}
		};
		walk(S, "spec");
		expect(rivals).toEqual([]);
	});
});

describe("getRwaAssets enums are the registry's value sets (sls-082)", () => {
	const op = S.paths["/api/rwa"].get;
	const param = (name: string): Param =>
		op.parameters.find((p: Param) => p.name === name);
	const row =
		op.responses["200"].content["application/json"].schema.properties.assets
			.items.properties;

	it("state: request enum, response enum and the validator are the same set, and it includes issued-single-holder", () => {
		expect(sorted(param("state").schema.enum)).toEqual(sorted(RWA_STATES));
		expect(sorted(row.state.enum)).toEqual(sorted(RWA_STATES));
		expect(RWA_STATES).toContain("issued-single-holder");
	});

	it("level, kind and productKind likewise", () => {
		expect(sorted(param("level").schema.enum)).toEqual(
			sorted(RWA_VERIFICATION_LEVELS),
		);
		expect(sorted(row.verificationLevel.enum)).toEqual(
			sorted(RWA_VERIFICATION_LEVELS),
		);
		expect(sorted(param("kind").schema.enum)).toEqual(sorted(RWA_KINDS));
		expect(sorted(row.kind.enum)).toEqual(sorted(RWA_KINDS));
		expect(sorted(row.productKind.enum)).toEqual(sorted(RWA_PRODUCT_KINDS));
	});

	it("the state parameter's description names every value the enum accepts AND defines deployed-no-supply for classic assets", () => {
		const d = param("state").description;
		for (const v of RWA_STATES) expect(d, v).toContain(v);
		// The definition, not just the token: a classic asset with trustlines
		// and zero supply is in this state (CETESZ, FOCGX). The route's
		// methodology text was updated before the spec's was — this pins both.
		expect(d).toMatch(/classic asset/);
		expect(d).toMatch(/supply is zero|nothing minted/);
		expect(d).not.toMatch(/deployed-no-supply = the contract exists/);
	});

	it("the route validates against the imported arrays, not a local literal", () => {
		const src = readFileSync(
			resolve(__dirname, "../../app/api/rwa/route.ts"),
			"utf8",
		);
		expect(src).toContain("= RWA_STATES");
		expect(src).toContain("= RWA_VERIFICATION_LEVELS");
		expect(src).toContain("= RWA_KINDS");
		expect(src).not.toMatch(/const STATES[^=]*=\s*\[/);
		expect(src).not.toMatch(/const LEVELS[^=]*=\s*\[/);
	});
});

describe("status and types params are the code's lists too (found 2026-09-09 by the same sweep)", () => {
	const searchOp = S.paths["/api/projects/search"].get;
	const lbOp = S.paths["/api/leaderboard"].get;
	const param = (op: { parameters: Param[] }, name: string) =>
		op.parameters.find((p) => p.name === name) as Param;
	// Comments stripped first: a `]` inside a comment in an options array
	// ended a naive `[^\]]+` match early and produced a false "collection
	// lacks Oracle/Yield" reading on 2026-09-09 — the trap this test must not
	// carry.
	const collection = readFileSync(
		resolve(__dirname, "../../collections/Projects.ts"),
		"utf8",
	).replace(/^\s*\/\/[^\n]*$/gm, "");

	it("searchProjects ?status accepts exactly the statuses a public reader can see — Pre-Development is gone", () => {
		expect(sorted(param(searchOp, "status").schema.enum)).toEqual(
			sorted(RESOLVABLE_PROJECT_STATUSES),
		);
		expect(param(searchOp, "status").schema.enum).not.toContain(
			"Pre-Development",
		);
		expect(param(searchOp, "status").schema.enum).not.toContain("Draft");
	});

	it("Project.status enum equals PROJECT_STATUSES", () => {
		expect(sorted(S.components.schemas.Project.properties.status.enum)).toEqual(
			sorted(PROJECT_STATUSES),
		);
	});

	it("searchProjects ?type and getLeaderboard ?type are PROJECT_TYPES, and so is the collection", () => {
		expect(sorted(param(searchOp, "type").schema.enum)).toEqual(
			sorted(PROJECT_TYPES),
		);
		const lb = param(lbOp, "type").schema as unknown as {
			items?: { enum: string[] };
			enum?: string[];
		};
		expect(sorted(lb.items?.enum ?? lb.enum ?? [])).toEqual(
			sorted(PROJECT_TYPES),
		);
		// The collection spreads the same array — no literal copy to drift.
		expect(collection).toMatch(
			/name:\s*"types",[\s\S]*?options:\s*\[\.\.\.PROJECT_TYPES\]/,
		);
		expect(PROJECT_TYPES).toContain("Oracle");
		expect(PROJECT_TYPES).toContain("Yield");
	});

	it("both route validators use the shared lists, not local literals", () => {
		const search = readFileSync(
			resolve(__dirname, "../../app/api/projects/search/route.ts"),
			"utf8",
		);
		const lb = readFileSync(
			resolve(__dirname, "../../app/api/leaderboard/route.ts"),
			"utf8",
		);
		expect(search).toContain("VALID_STATUSES = RESOLVABLE_PROJECT_STATUSES");
		expect(search).toContain("VALID_TYPES = PROJECT_TYPES");
		expect(lb).toContain("VALID_TYPES = PROJECT_TYPES");
		// No local literal lists remain in either validator.
		expect(search).not.toMatch(/const VALID_STATUSES\s*=\s*\[/);
		expect(search).not.toMatch(/const VALID_TYPES\s*=\s*\[/);
		expect(lb).not.toMatch(/const VALID_TYPES\s*=\s*\[/);
	});
});

describe("no spec enum literal mirrors an exported vocabulary any more", () => {
	// The residual copies found by the 2026-09-09 sweep. All were EQUAL to their
	// constants that day, so spreading them changed no served byte — but a copy
	// that is equal today is the copy that drifts tomorrow. Behavioural check
	// (compiled spec equals the constant) plus a structural one (the source
	// spreads it, so a hand-edit back to a literal is visible).
	const src = readFileSync(resolve(__dirname, "../openapi-spec.ts"), "utf8");
	const spread = (name: string) =>
		(src.match(new RegExp(`\\[\\.\\.\\.${name}\\]`, "g")) ?? []).length;

	it("Project.deployment.network is DEPLOYMENT_NETWORKS", () => {
		expect(
			sorted(
				S.components.schemas.Project.properties.deployment.properties.network
					.enum,
			),
		).toEqual(sorted(DEPLOYMENT_NETWORKS));
		expect(spread("DEPLOYMENT_NETWORKS")).toBe(1);
	});

	it("partnerType (getPartners param, submit-listing body, Partner schema) is PARTNER_TYPES", () => {
		expect(
			sorted(S.components.schemas.Partner.properties.partnerType.enum),
		).toEqual(sorted(PARTNER_TYPES as readonly string[]));
		expect(spread("PARTNER_TYPES")).toBe(3);
	});

	it("REPO_KINDS: one spread, one shared schema object, two sites that equal it (Repo.kind, explainRepo repoMeta.kind)", () => {
		expect(spread("REPO_KINDS")).toBe(1);
		expect(sorted(S.components.schemas.Repo.properties.kind.enum)).toEqual(
			sorted(REPO_KINDS as readonly string[]),
		);
		const meta =
			S.paths["/api/repos/explain"].get.responses["200"].content[
				"application/json"
			].schema.properties.repoMeta.properties.kind.enum;
		expect(sorted(meta)).toEqual(sorted(REPO_KINDS as readonly string[]));
	});

	it("trust signals, contract code domains and the boolean param values are their constants", () => {
		expect(spread("TRUST_SIGNALS")).toBe(1);
		expect(spread("CODE_DOMAINS")).toBe(1);
		expect(
			src.includes("enum: [...BOOL_TRUE_VALUES, ...BOOL_FALSE_VALUES]"),
		).toBe(true);
		const p = S.paths["/api/contracts"].get.parameters.find((x: Param) =>
			x.schema?.enum?.includes(CODE_DOMAINS[0]),
		) as Param;
		expect(sorted(p.schema.enum)).toEqual(
			sorted(CODE_DOMAINS as readonly string[]),
		);
		const t = S.paths["/api/repos/trust"].get.responses["200"].content[
			"application/json"
		].schema.properties.report.properties.signals.items.enum as string[];
		expect(sorted(t)).toEqual(sorted(TRUST_SIGNALS as readonly string[]));
		const b = S.paths["/api/hackathons/builds"].get.parameters.find(
			(x: Param) => x.schema?.enum?.includes("yes"),
		) as Param;
		expect(sorted(b.schema.enum)).toEqual(
			sorted([...BOOL_TRUE_VALUES, ...BOOL_FALSE_VALUES]),
		);
	});
});
