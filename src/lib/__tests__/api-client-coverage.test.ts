/**
 * The published client must not drift from the spec again: every operationId in
 * specs/openapi.json has a ScoutClient method of the same name, and for every
 * GET the method's params type accepts each query parameter the spec declares.
 *
 * Checked with the TypeScript compiler against api-client/src/index.ts, so a
 * `Record<string, unknown>` or a stale inline type that omits a parameter fails
 * the same way a missing method does. POST operations (submitFeedback and the
 * partner flows) are checked for the method only: their bodies are typed by the
 * spec's request schemas or left open, and they declare no query parameters.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { spec as specSource } from "../openapi-spec";

// The same source the rest of the suite reads (specs/openapi.json is generated from it).
const spec = specSource as unknown as {
	paths: Record<string, PathItem>;
	components: { parameters: Record<string, Param> };
};
const root = process.cwd();
const clientDir = path.join(root, "api-client");

interface Op {
	id: string;
	method: string;
	queryParams: string[];
}

interface Param {
	$ref?: string;
	name?: string;
	in?: string;
}
interface PathItem {
	parameters?: Param[];
	[method: string]:
		| { operationId?: string; parameters?: Param[] }
		| Param[]
		| undefined;
}

const resolveParam = (p: Param): Param =>
	p.$ref ? spec.components.parameters[p.$ref.split("/").pop() as string] : p;

const ops: Op[] = [];
for (const item of Object.values(spec.paths)) {
	for (const [method, op] of Object.entries(item)) {
		if (!op || Array.isArray(op) || !op.operationId) continue;
		ops.push({
			id: op.operationId,
			method: method.toUpperCase(),
			queryParams: [...(item.parameters ?? []), ...(op.parameters ?? [])]
				.map(resolveParam)
				.filter((p) => p.in === "query")
				.map((p) => p.name as string),
		});
	}
}

// Operations deliberately without a client method, with the reason. Empty today.
const EXCLUDED_OPERATIONS: Record<string, string> = {};
// Query parameters a method deliberately does not accept: "operationId.param".
const EXCLUDED_PARAMS: Record<string, string> = {
	"compareHackathons.slugs":
		"takes the slugs as a positional string[] and joins them into ?slugs=",
};

const virtual = path.join(clientDir, "src/__coverage__.ts");

function diagnose(source: string): string[] {
	const options: ts.CompilerOptions = {
		target: ts.ScriptTarget.ES2022,
		module: ts.ModuleKind.ESNext,
		moduleResolution: ts.ModuleResolutionKind.Bundler,
		lib: ["lib.es2022.d.ts", "lib.dom.d.ts"],
		strict: true,
		skipLibCheck: true,
		resolveJsonModule: true,
		noEmit: true,
		// index.ts needs no Node globals, and CI installs only the root, so there is
		// no api-client/node_modules/@types to point at.
		types: [],
	};
	const host = ts.createCompilerHost(options);
	const read = host.readFile.bind(host);
	const exists = host.fileExists.bind(host);
	host.fileExists = (f) => f === virtual || exists(f);
	host.readFile = (f) => (f === virtual ? source : read(f));
	host.getSourceFile = (
		(orig) =>
		(f, lang, ...rest) =>
			f === virtual
				? ts.createSourceFile(f, source, lang)
				: orig(f, lang, ...rest)
	)(host.getSourceFile.bind(host));
	const program = ts.createProgram([virtual], options, host);
	return ts
		.getPreEmitDiagnostics(program, program.getSourceFile(virtual))
		.map((d) => {
			const line = d.file
				? d.file.getLineAndCharacterOfPosition(d.start ?? 0).line
				: -1;
			return `${line}:${ts.flattenDiagnosticMessageText(d.messageText, " ")}`;
		});
}

describe("api-client covers the spec", () => {
	it("has a method for every operationId", () => {
		const src = readFileSync(path.join(clientDir, "src/index.ts"), "utf8");
		const missing = ops
			.filter((o) => !EXCLUDED_OPERATIONS[o.id])
			.filter((o) => !new RegExp(`^\\t${o.id}\\(`, "m").test(src))
			.map((o) => `${o.method} ${o.id}`);
		expect(missing, "operations without a ScoutClient method").toEqual([]);
	});

	it("every GET method accepts every query parameter the spec declares", () => {
		const checks = ops
			.filter((o) => o.method === "GET")
			.flatMap((o) =>
				o.queryParams
					.filter((p) => !EXCLUDED_PARAMS[`${o.id}.${p}`])
					.map((p) => ({ o, p })),
			);
		// One line per (operation, parameter): assigning the parameter name to the
		// keys of the method's first argument fails when the key is absent.
		const arg = (id: string) =>
			`NonNullable<Parameters<ScoutClient["${id}" & keyof ScoutClient]>[0]>`;
		const lines = checks.map(
			({ o, p }) =>
				`const _${o.id}_${p}: keyof ${arg(o.id)} = ${JSON.stringify(p)};`,
		);
		// A string index signature (Record<string, unknown>) would accept any name,
		// so it counts as a miss: the type must list the spec's parameters.
		const open = [...new Set(checks.map(({ o }) => o.id))];
		lines.push(
			...open.map(
				(id) =>
					`const _open_${id}: string extends keyof ${arg(id)} ? never : true = true;`,
			),
		);
		const errors = diagnose(
			`import type { ScoutClient } from "./index";\n${lines.join("\n")}\n`,
		);
		const bad = errors.map((e) => {
			const i = Number(e.split(":")[0]) - 1; // line 0 is the import
			if (i >= 0 && i < checks.length)
				return `${checks[i].o.id}.${checks[i].p}`;
			if (i >= checks.length)
				return `${open[i - checks.length]} (untyped params)`;
			return e;
		});
		expect(bad, "query parameters a method's params type rejects").toEqual([]);
	}, 120_000);

	// A minor version must not break callers. Every call below compiled against
	// 1.9.1's signatures (inline string/number/boolean params, an open record for
	// getPartners, the schema aliases for the rest), including ones a stricter
	// schema type would reject: a string variable where the schema has an enum,
	// a boolean where it has a string enum, a number where it has a boolean, an
	// undeclared key.
	it("accepts every call form 1.9.1 accepted", () => {
		const errors =
			diagnose(`import { ScoutClient, type FeedbackRequest } from "./index";
declare const c: ScoutClient;
declare const fb: FeedbackRequest;
declare const s: string;
declare const n: number;
declare const b: boolean;
declare const r: Record<string, unknown>;
c.getStatus();
c.submitFeedback(fb);
c.searchProjects({ q: s, scfAwarded: true, limit: n });
c.searchRepos({ q: s, language: s, limit: n });
c.explainRepo({ q: s, repo: s });
c.getPartners();
c.getPartners({});
c.getPartners(r);
c.getPartners({ accepting: 1, all: 1, region: "Europe", type: s, offset: 10 });
c.getPartners({ q: s, sector: s, ramps: s, limit: n, fields: s });
c.getChangelog({ since: s, limit: n });
c.getHackathons({ limit: n });
c.getHackathon(s);
c.compareHackathons([s, s]);
c.getBuilders({ q: s, limit: n });
c.getRfps({ status: "open", limit: n });
c.searchResearch({ q: s, limit: n });
c.listSkills();
c.getSkill(s);
c.getClusters({ dimension: "category" });
c.analyzeEcosystem({ dimension: "all" });
c.getLeaderboard();
c.getStablecoins({ sort: s, peg: s, limit: n });
c.vetIdea({ q: s });
c.scfPitch({ q: s });
c.hackathonBrief({ q: s });
c.searchHackathonBuilds();
c.searchHackathonBuilds({ q: s, winnersOnly: true, track: s, limit: n });
c.searchHackathonBuilds({ winnersOnly: b });
c.listAudits({ project: s, auditor: s, q: s, since: s, limit: n, offset: n });
c.listContracts({ q: s, domain: s, limit: n, offset: n });
c.getRepoTrust({ repo: s });
c.resolveProject({ q: s });
c.getPeople();
c.getPeople({ q: s, section: s });
c.getPartner(s);
c.matchPartners(r);
c.partnerAssistant(r);
c.partnerOnboard(r);
c.submitPartnerListing(r);
c.getChanges({ since: s, surfaces: s, limit: n });
c.getFeedbackSchema();
`);
		expect(errors, "1.9.1 call forms the current types reject").toEqual([]);
	}, 120_000);
});
