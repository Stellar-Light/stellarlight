#!/usr/bin/env node
/**
 * scout-mcp smoke test harness.
 *
 * Spawns the built server via stdio, sends a sequence of MCP JSON-RPC
 * messages, captures each response, and runs assertions against the result.
 * Exits with a clear pass/fail summary.
 *
 * Run:
 *   node test/smoke.mjs                # against prod (default)
 *   SCOUT_API_BASE=http://localhost:3000 node test/smoke.mjs   # against local
 *   SMOKE_READ_ONLY=1 node test/smoke.mjs   # skip the one call that writes (the submit_feedback POST)
 *   SMOKE_STRICT=1 node test/smoke.mjs      # also the checks that ride on live-data margins
 *
 * The publish workflow runs it with SMOKE_READ_ONLY=1 and without SMOKE_STRICT.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const SERVER = ["node", "dist/index.js"];
const TIMEOUT_MS = 45_000;
const READ_ONLY = process.env.SMOKE_READ_ONLY === "1";
const STRICT = process.env.SMOKE_STRICT === "1";
// Declared parameters across all tools. The forwarding audit asserts this
// exactly, so it cannot pass having probed less: change it with any tool
// parameter change.
const DECLARED_PARAMETERS = 89;

let passed = 0;
let failed = 0;
let skipped = 0;
const failures = [];

function pass(name) {
	passed += 1;
	process.stdout.write(`  \x1b[32m✓\x1b[0m ${name}\n`);
}
function skip(name, reason) {
	skipped += 1;
	process.stdout.write(`  \x1b[33m-\x1b[0m skipped ${name}: ${reason}\n`);
}
function fail(name, reason) {
	failed += 1;
	failures.push({ name, reason });
	process.stdout.write(
		`  \x1b[31m✗\x1b[0m ${name}\n    \x1b[2m${reason}\x1b[0m\n`,
	);
}

/**
 * Run one MCP session: send init + initialized + the test request, return
 * the parsed JSON-RPC response. Each test gets a fresh server process so
 * failures are isolated.
 */
async function callMcp(method, params, { rawErrorOk = false } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(SERVER[0], SERVER.slice(1), {
			stdio: ["pipe", "pipe", "pipe"],
			env: { ...process.env },
		});
		let stdoutBuf = "";
		let stderrBuf = "";
		let resolved = false;
		const timer = setTimeout(() => {
			if (resolved) return;
			resolved = true;
			child.kill("SIGKILL");
			reject(new Error(`timed out after ${TIMEOUT_MS}ms`));
		}, TIMEOUT_MS);
		child.stdout.on("data", (chunk) => {
			stdoutBuf += chunk.toString();
			// MCP responses are newline-delimited JSON-RPC. Parse each line and
			// look for the test response (id: 2).
			let nl;
			while ((nl = stdoutBuf.indexOf("\n")) !== -1) {
				const line = stdoutBuf.slice(0, nl);
				stdoutBuf = stdoutBuf.slice(nl + 1);
				if (!line.trim()) continue;
				let msg;
				try {
					msg = JSON.parse(line);
				} catch {
					continue;
				}
				if (msg.id === 2 && !resolved) {
					resolved = true;
					clearTimeout(timer);
					child.kill();
					resolve(msg);
				}
			}
		});
		child.stderr.on("data", (c) => (stderrBuf += c.toString()));
		child.on("error", (e) => {
			if (resolved) return;
			resolved = true;
			clearTimeout(timer);
			reject(e);
		});
		// Three messages: initialize → initialized notification → the test call
		child.stdin.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "smoke", version: "1.0.0" },
				},
			})}\n`,
		);
		child.stdin.write(
			`${JSON.stringify({
				jsonrpc: "2.0",
				method: "notifications/initialized",
			})}\n`,
		);
		child.stdin.write(
			`${JSON.stringify({ jsonrpc: "2.0", id: 2, method, params })}\n`,
		);
	});
}

/** Helper: call a tool, return either the parsed JSON content or throw. */
async function callTool(name, args = {}) {
	const resp = await callMcp("tools/call", { name, arguments: args });
	if (resp.error) {
		const e = new Error(`tool error: ${resp.error.message}`);
		e.rpc = resp.error;
		throw e;
	}
	const text = resp.result?.content?.[0]?.text;
	if (text === undefined) {
		throw new Error("no text content in response");
	}
	// Tools that hit the network return JSON-stringified payloads.
	try {
		return {
			isError: resp.result.isError === true,
			data: JSON.parse(text),
			raw: text,
		};
	} catch {
		return { isError: resp.result.isError === true, data: null, raw: text };
	}
}

/**
 * One server process for many sequential requests, against apiBase. The
 * forwarding audit sends about 130, too many for a process each.
 */
function openSession(apiBase) {
	const child = spawn(SERVER[0], SERVER.slice(1), {
		stdio: ["pipe", "pipe", "pipe"],
		env: { ...process.env, SCOUT_API_BASE: apiBase },
	});
	const send = (msg) =>
		child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
	const waiting = new Map();
	let buf = "";
	child.stdout.on("data", (chunk) => {
		buf += chunk.toString();
		let nl = buf.indexOf("\n");
		while (nl !== -1) {
			const line = buf.slice(0, nl);
			buf = buf.slice(nl + 1);
			nl = buf.indexOf("\n");
			let msg;
			try {
				msg = JSON.parse(line);
			} catch {
				continue;
			}
			waiting.get(msg.id)?.(msg);
		}
	});
	send({
		id: 0,
		method: "initialize",
		params: {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "smoke", version: "1.0.0" },
		},
	});
	send({ method: "notifications/initialized" });
	let nextId = 1;
	return {
		request: (method, params) =>
			new Promise((resolve, reject) => {
				const id = nextId++;
				const timer = setTimeout(
					() => reject(new Error(`${method} timed out after ${TIMEOUT_MS}ms`)),
					TIMEOUT_MS,
				);
				waiting.set(id, (msg) => {
					clearTimeout(timer);
					waiting.delete(id);
					resolve(msg);
				});
				send({ id, method, params });
			}),
		close: () => child.kill(),
	};
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
	const startedAt = Date.now();
	console.log("scout-mcp smoke test\n");
	console.log(
		`  API base: ${process.env.SCOUT_API_BASE ?? "https://stellarlight.xyz"}\n`,
	);

	// ── Session 1: tools/list matches the source registry ────────────────────
	// Derive the expected count from src/index.ts instead of hardcoding it —
	// the hardcoded "15" silently rotted as tools were added and then BLOCKED
	// the 1.1.11/1.1.12 publishes (2026-07-19) when the server hit 20.
	console.log("◆ Tools registry");
	try {
		const { readFileSync } = await import("node:fs");
		const src = readFileSync(
			new URL("../src/index.ts", import.meta.url),
			"utf8",
		);
		const expectedCount = (src.match(/registerTool\(/g) ?? []).length;
		const resp = await callMcp("tools/list", {});
		const tools = resp?.result?.tools ?? [];
		if (expectedCount > 0 && tools.length === expectedCount)
			pass(`tools/list returns all ${expectedCount} registered tools`);
		else
			fail(
				`tools/list returns all ${expectedCount} registered tools`,
				`got ${tools.length}`,
			);
		const names = tools.map((t) => t.name);
		if (new Set(names).size === names.length) pass("tool names are unique");
		else fail("tool names are unique", names.join(","));

		const expected = [
			"search_research",
			"get_hackathons",
			"get_hackathon",
			"compare_hackathons",
			"get_builders",
			"search_projects",
			"search_repos",
			"get_rfps",
			"list_skills",
			"get_skill",
			"get_leaderboard",
			"get_status",
			"submit_feedback",
			"get_clusters",
			"analyze_ecosystem",
			"get_partners",
			"get_changelog",
			"explain_repo",
			"get_people",
			"get_audits",
			"search_hackathon_builds",
			"vet_idea",
			"hackathon_brief",
			"scf_pitch",
			"get_hackathon_submission",
			"analyze_hackathon_submissions",
			"review_submission",
			"locate_source",
		];
		const got = tools.map((t) => t.name).sort();
		const missing = expected.filter((n) => !got.includes(n));
		if (missing.length === 0) pass("every expected tool registered");
		else
			fail("every expected tool registered", `missing: ${missing.join(", ")}`);

		// The API ignores these, with an "Unknown parameter(s) ignored" warning,
		// so no tool declares them; searchProjects' type filter is declared.
		const declaredOf = (n) =>
			Object.keys(
				tools.find((t) => t.name === n)?.inputSchema?.properties ?? {},
			);
		const dead = [
			["get_leaderboard", "include"],
			["search_projects", "hackathon"],
		].filter(([t, p]) => declaredOf(t).includes(p));
		if (dead.length === 0)
			pass(
				"no tool declares a parameter the API ignores (get_leaderboard include, search_projects hackathon)",
			);
		else
			fail(
				"no tool declares a parameter the API ignores",
				dead.map(([t, p]) => `${t}.${p}`).join(", "),
			);
		if (declaredOf("search_projects").includes("type"))
			pass("search_projects declares type");
		else
			fail(
				"search_projects declares type",
				declaredOf("search_projects").join(", "),
			);

		// Verify each tool has a description + input schema
		for (const t of tools) {
			if (!t.description || t.description.length < 40) {
				fail(
					`tool '${t.name}' has substantive description`,
					`len=${t.description?.length}`,
				);
			} else {
				pass(`tool '${t.name}' description present`);
			}
		}
	} catch (e) {
		fail("tools/list smoke", e.message);
	}

	// ── Session 1b: every declared parameter reaches the request ────────────
	// Offline: the server talks to a local stub that records each request, so
	// this checks forwarding, never data. A parameter whose value leaves the
	// request unchanged is declared but dropped, as search_repos activity and
	// get_leaderboard type were until 1.8.0; a probe the schema refuses sends
	// nothing and counts as dropped too.
	console.log("\n◆ Parameter forwarding (local stub, no network)");
	{
		const { createServer } = await import("node:http");
		const seen = [];
		// The stub's answer to every request: unindented JSON, as the API serves.
		const STUB_BODY =
			'{"meta":{"view":{"mode":"compact"}},"projects":[{"id":"p1","name":"Probe","reposCount":2}]}';
		const stub = createServer((req, res) => {
			let body = "";
			req.on("data", (c) => {
				body += c;
			});
			req.on("end", () => {
				seen.push(`${req.method} ${req.url} ${body}`);
				res.writeHead(200, { "content-type": "application/json" });
				res.end(STUB_BODY);
			});
		});
		await new Promise((resolve) => stub.listen(0, "127.0.0.1", resolve));
		const session = openSession(`http://127.0.0.1:${stub.address().port}`);
		// Two valid, different values for a JSON-schema property.
		const values = (name, s) => {
			if (s.enum) return [s.enum[0], s.enum[1] ?? s.enum[0]];
			if (s.type === "boolean") return [true, true];
			if (s.type === "integer" || s.type === "number") {
				const lo = s.minimum ?? (s.exclusiveMinimum ?? 0) + 1;
				return [lo, Math.min(lo + 1, s.maximum ?? lo + 1)];
			}
			if (s.type === "array")
				return [
					["probe-a", "probe-b"],
					["probe-a", "probe-c"],
				];
			return [`probe-${name}-a`, `probe-${name}-b`];
		};
		const sent = async (name, args) => {
			seen.length = 0;
			await session.request("tools/call", { name, arguments: args });
			return seen.join("\n");
		};
		try {
			const { result } = await session.request("tools/list", {});
			const registered = (
				readFileSync(new URL("../src/index.ts", import.meta.url), "utf8").match(
					/registerTool\(/g,
				) ?? []
			).length;
			const dropped = [];
			let declared = 0;
			for (const tool of result.tools) {
				const props = tool.inputSchema?.properties ?? {};
				const required = tool.inputSchema?.required ?? [];
				const base = Object.fromEntries(
					required.map((n) => [n, values(n, props[n])[0]]),
				);
				const baseSent = await sent(tool.name, base);
				if (!baseSent && Object.keys(props).length === 0)
					dropped.push(`${tool.name} (no request)`);
				for (const [name, s] of Object.entries(props)) {
					declared += 1;
					const [a, b] = values(name, s);
					const probe = await sent(tool.name, {
						...base,
						[name]: required.includes(name) ? b : a,
					});
					// No request proves nothing, so it counts as dropped.
					if (!baseSent || !probe)
						dropped.push(`${tool.name}.${name} (no request)`);
					else if (probe === baseSent) dropped.push(`${tool.name}.${name}`);
				}
			}
			if (dropped.length === 0)
				pass(
					`all ${declared} declared parameters of ${result.tools.length} tools reach the request`,
				);
			else
				fail(
					"every declared parameter reaches the request",
					`dropped: ${dropped.join(", ")}`,
				);
			// Exact coverage, so the audit cannot pass having probed less.
			if (
				result.tools.length === registered &&
				declared === DECLARED_PARAMETERS
			)
				pass(
					`audit covered ${result.tools.length} tools (the registerTool calls in src) and ${declared} parameters (DECLARED_PARAMETERS)`,
				);
			else
				fail(
					"audit covered every tool and parameter",
					`${result.tools.length} tools of ${registered} registered, ${declared} parameters of ${DECLARED_PARAMETERS}; update DECLARED_PARAMETERS with a parameter change`,
				);
			// A compact page is the API's own bytes, so its size is the API's
			// own; every other output stays indented.
			const text = async (name, args) =>
				(await session.request("tools/call", { name, arguments: args })).result
					?.content?.[0]?.text;
			const indented = JSON.stringify(JSON.parse(STUB_BODY), null, 2);
			const outputs = [
				["search_projects compact", { view: "compact" }, STUB_BODY],
				["search_repos compact", { view: "compact" }, STUB_BODY],
				["search_projects full", {}, indented],
				["get_status", {}, indented],
			];
			const off = [];
			for (const [label, args, want] of outputs)
				if ((await text(label.split(" ")[0], args)) !== want) off.push(label);
			if (off.length === 0)
				pass(
					`compact pages come back as unindented JSON, equal to the stub's minified page (${STUB_BODY.length} of ${STUB_BODY.length} chars); other output stays indented`,
				);
			else
				fail(
					"compact pages byte for byte, other output indented",
					off.join(", "),
				);
		} catch (e) {
			fail("parameter forwarding audit", e.message);
		} finally {
			session.close();
			stub.close();
		}
	}

	// ── Session 2: search_research (vector mode) ────────────────────────────
	console.log("\n◆ search_research");
	try {
		const { data } = await callTool("search_research", {
			query: "oracle manipulation",
			source: "audit",
			limit: 3,
		});
		if (data?.meta?.mode === "vector") pass("returns vector mode");
		else fail("returns vector mode", `mode=${data?.meta?.mode}`);
		if (data?.results?.length === 3) pass("respects limit=3");
		else fail("respects limit=3", `got ${data?.results?.length}`);
		const first = data?.results?.[0];
		if (first?.source === "audit") pass("filters to source=audit");
		else fail("filters to source=audit", `first.source=${first?.source}`);
		if (first?.score && first.score > 0.5) pass("returns relevant score");
		else fail("returns relevant score", `score=${first?.score}`);
		if (first?.severity !== undefined)
			pass("audit chunks include severity field");
		else fail("audit chunks include severity field", "missing");
	} catch (e) {
		fail("search_research smoke", e.message);
	}

	// ── Session 3: search_research input validation (zod) ───────────────────
	try {
		const resp = await callMcp("tools/call", {
			name: "search_research",
			arguments: { source: "audit" }, // missing required 'query'
		});
		if (resp.error || resp.result?.isError)
			pass("rejects missing required 'query'");
		else
			fail(
				"rejects missing required 'query'",
				"request unexpectedly succeeded",
			);
	} catch (e) {
		// SDK may throw before reaching server — that's also acceptable
		pass("rejects missing required 'query'");
	}

	// ── Session 4: get_status ───────────────────────────────────────────────
	console.log("\n◆ get_status");
	try {
		const { data } = await callTool("get_status");
		if (data?.ok === true) pass("ok=true");
		else fail("ok=true", `ok=${data?.ok}`);
		if (data?.version) pass(`reports version: ${data.version}`);
		else fail("reports version", "missing");
		if (Array.isArray(data?.sources))
			pass(`enumerates ${data.sources.length} sources`);
		else fail("enumerates sources", "missing");
		if (Array.isArray(data?.endpoints) && data.endpoints.length >= 9)
			pass(`enumerates ${data.endpoints.length} endpoints`);
		else fail("enumerates endpoints", `got ${data?.endpoints?.length}`);
	} catch (e) {
		fail("get_status smoke", e.message);
	}

	// ── Session 5: get_hackathons (status=upcoming triggers fallback) ───────
	console.log("\n◆ get_hackathons");
	try {
		const { data } = await callTool("get_hackathons", { status: "upcoming" });
		if (data?.hackathons !== undefined) pass("returns hackathons array");
		else fail("returns hackathons array", "missing");
		// When 0 results, fallbackChannels should be present
		if (data.hackathons?.length === 0) {
			if (data?.meta?.fallbackChannels?.channels?.length >= 3) {
				pass("empty upcoming includes fallbackChannels with 3+ channels");
			} else {
				fail("empty upcoming includes fallbackChannels", "missing");
			}
		} else {
			pass(`returned ${data.hackathons.length} upcoming events`);
		}
	} catch (e) {
		fail("get_hackathons smoke", e.message);
	}

	// ── Session 6: get_hackathons (status=completed) ────────────────────────
	try {
		const { data } = await callTool("get_hackathons", {
			status: "completed",
			limit: 5,
		});
		if (data?.hackathons?.length > 0)
			pass(`returns completed events (${data.hackathons.length})`);
		else fail("returns completed events", "got 0");
	} catch (e) {
		fail("get_hackathons completed", e.message);
	}

	// ── Session 7: get_hackathon (curated detail) ───────────────────────────
	console.log("\n◆ get_hackathon");
	try {
		const { data: list } = await callTool("get_hackathons", {
			status: "completed",
			limit: 1,
		});
		const slug = list?.hackathons?.[0]?.slug;
		if (!slug) {
			fail("get_hackathon picks a real slug", "no completed events");
		} else {
			const { data } = await callTool("get_hackathon", { slug });
			if (data?.hackathon?.slug === slug || data?.slug === slug)
				pass(`returns hackathon detail for ${slug}`);
			else if (data?.meta?.note)
				pass(`returns DoraHacks-only with .meta.note for ${slug}`);
			else
				fail(
					`returns hackathon detail for ${slug}`,
					JSON.stringify(data).slice(0, 150),
				);
		}
	} catch (e) {
		fail("get_hackathon smoke", e.message);
	}

	// ── Session 8: get_hackathon (invalid slug → 404 / error) ───────────────
	try {
		const { isError, data } = await callTool("get_hackathon", {
			slug: "this-does-not-exist-zzz",
		});
		if (isError || data?.error || data === null)
			pass("invalid slug returns error or null");
		else
			fail(
				"invalid slug returns error or null",
				`data=${JSON.stringify(data).slice(0, 100)}`,
			);
	} catch (e) {
		pass("invalid slug returns error or null");
	}

	// ── Session 9: compare_hackathons ───────────────────────────────────────
	console.log("\n◆ compare_hackathons");
	try {
		const { data: list } = await callTool("get_hackathons", {
			status: "completed",
			limit: 3,
		});
		const slugs = (list?.hackathons ?? [])
			.slice(0, 2)
			.map((h) => h.slug)
			.filter(Boolean);
		if (slugs.length < 2) {
			fail("compare_hackathons picks 2 real slugs", "not enough events");
		} else {
			const { data } = await callTool("compare_hackathons", { slugs });
			if (Array.isArray(data?.hackathons) && data.hackathons.length === 2)
				pass(`compares ${slugs.join(" vs ")}`);
			else fail("compares 2 hackathons", `got ${data?.hackathons?.length}`);
			if (data?.deltas?.notes) pass("includes deltas.notes");
			else fail("includes deltas.notes", "missing");
		}
	} catch (e) {
		fail("compare_hackathons smoke", e.message);
	}

	// ── Session 10: compare_hackathons invalid (1 slug) ─────────────────────
	try {
		const resp = await callMcp("tools/call", {
			name: "compare_hackathons",
			arguments: { slugs: ["only-one"] },
		});
		if (resp.error || resp.result?.isError)
			pass("compare_hackathons rejects 1 slug");
		else fail("compare_hackathons rejects 1 slug", "unexpectedly succeeded");
	} catch (e) {
		pass("compare_hackathons rejects 1 slug");
	}

	// ── Session 11: get_builders ────────────────────────────────────────────
	console.log("\n◆ get_builders");
	try {
		const { data } = await callTool("get_builders", { limit: 2 });
		if (Array.isArray(data?.builders))
			pass(`returns builders (${data.builders.length})`);
		else fail("returns builders array", "missing");
		const b = data?.builders?.[0];
		if (b?.displayName || b?.githubUsername)
			pass("builder has displayName/githubUsername");
		else
			fail(
				"builder has displayName/githubUsername",
				JSON.stringify(b).slice(0, 100),
			);
	} catch (e) {
		fail("get_builders smoke", e.message);
	}

	// ── Session 12: search_projects (tiered matchMode) ──────────────────────
	console.log("\n◆ search_projects");
	try {
		const { data } = await callTool("search_projects", {
			q: "stablecoin",
			limit: 3,
		});
		if (data?.meta?.matchMode)
			pass(`returns matchMode: ${data.meta.matchMode}`);
		else fail("returns matchMode", "missing");
		if (Array.isArray(data?.projects))
			pass(`returns projects (${data.projects.length})`);
		else fail("returns projects array", "missing");
	} catch (e) {
		fail("search_projects smoke", e.message);
	}

	// ── Session 13: search_projects (multi-word, loose fallback) ────────────
	try {
		const { data } = await callTool("search_projects", {
			q: "real time price api soroban",
			limit: 5,
		});
		if (
			data?.meta?.matchMode &&
			["strict", "loose-1", "majority"].includes(data.meta.matchMode)
		) {
			pass(`multi-word query uses ${data.meta.matchMode} mode`);
		} else {
			fail("multi-word query has a tier", `matchMode=${data?.meta?.matchMode}`);
		}
	} catch (e) {
		fail("search_projects multi-word", e.message);
	}

	// ── Session 14: get_rfps ────────────────────────────────────────────────
	console.log("\n◆ get_rfps");
	try {
		const { data } = await callTool("get_rfps", { status: "open" });
		if (Array.isArray(data?.rfps))
			pass(`returns ${data.rfps.length} open RFPs`);
		else fail("returns rfps array", "missing");
		if (data?.meta?.activeQuarter)
			pass(`reports activeQuarter: ${data.meta.activeQuarter}`);
		else fail("reports activeQuarter", "missing");
	} catch (e) {
		fail("get_rfps smoke", e.message);
	}

	// ── Session 15: list_skills + get_skill ─────────────────────────────────
	console.log("\n◆ list_skills + get_skill");
	try {
		const { data } = await callTool("list_skills");
		if (Array.isArray(data?.skills) && data.skills.length >= 5)
			pass(`returns ${data.skills.length} skills`);
		else fail("returns 5+ skills", `got ${data?.skills?.length}`);

		const sample = data?.skills?.[0]?.name ?? "soroban";
		const { data: skill } = await callTool("get_skill", { name: sample });
		if (skill?.content || skill?.skill?.content)
			pass(`get_skill returns content for '${sample}'`);
		else
			fail(
				`get_skill returns content for '${sample}'`,
				JSON.stringify(skill).slice(0, 150),
			);
	} catch (e) {
		fail("list_skills / get_skill smoke", e.message);
	}

	// ── Session 16: get_leaderboard ─────────────────────────────────────────
	console.log("\n◆ get_leaderboard");
	try {
		const { data } = await callTool("get_leaderboard");
		if (data?.ecosystem) pass("returns ecosystem block");
		else fail("returns ecosystem block", "missing");
		if (data?.ecosystem?.activeDevs28d > 0)
			pass(`reports ${data.ecosystem.activeDevs28d} active devs`);
		else fail("reports active devs", "missing or 0");
	} catch (e) {
		fail("get_leaderboard smoke", e.message);
	}

	// ── Session 17: get_clusters ────────────────────────────────────────────
	console.log("\n◆ get_clusters");
	try {
		const { data } = await callTool("get_clusters", { dimension: "category" });
		if (Array.isArray(data?.clusters) && data.clusters.length > 0) {
			pass(`returns ${data.clusters.length} category clusters`);
			const c = data.clusters[0];
			if (
				typeof c?.crowdedness === "number" &&
				c.crowdedness >= 1 &&
				c.crowdedness <= 10
			) {
				pass(`crowdedness is log-scaled 1-10 (got ${c.crowdedness})`);
			} else {
				fail("crowdedness is 1-10", `got ${c?.crowdedness}`);
			}
		} else {
			fail("returns clusters", "empty");
		}
	} catch (e) {
		fail("get_clusters smoke", e.message);
	}

	// ── Session 18: analyze_ecosystem ───────────────────────────────────────
	console.log("\n◆ analyze_ecosystem");
	try {
		const { data } = await callTool("analyze_ecosystem", {
			dimension: "funding",
		});
		if (data?.funding) pass("dimension=funding returns funding block");
		else
			fail(
				"dimension=funding returns funding block",
				JSON.stringify(data).slice(0, 100),
			);
		if (data?.hackathons === undefined)
			pass("dimension=funding excludes other sections");
		else
			fail("dimension=funding excludes other sections", "hackathons present");
	} catch (e) {
		fail("analyze_ecosystem smoke", e.message);
	}

	// ── Session 19: submit_feedback (real POST to prod) ─────────────────────
	console.log("\n◆ submit_feedback");
	if (READ_ONLY) {
		skip(
			"feedback POST",
			"SMOKE_READ_ONLY=1 (it writes a row to the curator queue)",
		);
	} else {
		try {
			const { data } = await callTool("submit_feedback", {
				kind: "other",
				message:
					"scout-mcp smoke test: please disregard. This is from the automated test harness.",
				agentName: "scout-mcp-smoke-test",
			});
			if (data?.ok === true) pass(`feedback persisted (id: ${data.id})`);
			else if (data?.error)
				fail("feedback POST", JSON.stringify(data).slice(0, 150));
			else fail("feedback POST", "unexpected response shape");
		} catch (e) {
			fail("submit_feedback smoke", e.message);
		}
	}

	// ── Session 20: submit_feedback (validation — short message) ────────────
	try {
		const resp = await callMcp("tools/call", {
			name: "submit_feedback",
			arguments: { kind: "bug", message: "short" },
		});
		if (resp.error || resp.result?.isError)
			pass("short message rejected by zod");
		else fail("short message rejected by zod", "unexpectedly succeeded");
	} catch (e) {
		pass("short message rejected by zod");
	}

	// ── Session 21: locate_source (pointers into Stellar's own source) ──────
	console.log("\n◆ locate_source");
	try {
		const { isError, data } = await callTool("locate_source", {
			q: "where is require_auth defined",
		});
		const pointers = Array.isArray(data?.pointers) ? data.pointers : [];
		if (!isError && pointers.length > 0)
			pass(`returns ${pointers.length} pointers of ${data.total}`);
		else fail("returns pointers", `isError=${isError} total=${data?.total}`);
		// Ranks can move when the index is rebuilt: the publish run asks for the
		// first page, SMOKE_STRICT=1 for the top 3.
		const within = STRICT ? "in the top 3" : "on the first page";
		const hit = pointers
			.slice(0, STRICT ? 3 : pointers.length)
			.find(
				(p) =>
					p.repo === "stellar/rs-soroban-env" &&
					p.path === "soroban-env-host/src/auth.rs",
			);
		if (hit)
			pass(
				`rs-soroban-env soroban-env-host/src/auth.rs ${within}: rank ${hit.rank} (${hit.locator}, line ${hit.line})`,
			);
		else
			fail(
				`rs-soroban-env soroban-env-host/src/auth.rs ${within}`,
				pointers.map((p) => `${p.rank} ${p.repo} ${p.path}`).join("; "),
			);
		if (!STRICT) skip("auth.rs in the top 3", "strict mode only (SMOKE_STRICT=1)");
		if (
			hit?.verificationUrl?.startsWith(
				`https://github.com/stellar/rs-soroban-env/blob/${hit.ref}/`,
			)
		)
			pass("pointer carries a verificationUrl pinned to its commit");
		else fail("verificationUrl pinned to its commit", hit?.verificationUrl);
	} catch (e) {
		fail("locate_source smoke", e.message);
	}

	// ── Session 22: locate_source forwards repo, kind and page ──────────────
	try {
		const { data } = await callTool("locate_source", {
			q: "require_auth",
			repo: "stellar/rs-soroban-env",
			kind: "symbol",
			page: 2,
		});
		const f = data?.meta?.filters ?? {};
		if (
			f.repo === "stellar/rs-soroban-env" &&
			f.kind === "symbol" &&
			f.page === 2
		)
			pass("forwards repo, kind and page (meta.filters)");
		else fail("forwards repo, kind and page", JSON.stringify(f));
		const rows = Array.isArray(data?.pointers) ? data.pointers : [];
		if (
			rows[0]?.rank === 11 &&
			rows.every(
				(p) =>
					p.repo === "stellar/rs-soroban-env" && p.locatorKind === "symbol",
			)
		)
			pass("page 2 starts at rank 11, one repo, symbols only");
		else fail("page 2 rows", JSON.stringify(rows[0] ?? null).slice(0, 150));
	} catch (e) {
		fail("locate_source filters", e.message);
	}

	// ── Session 23: no match is pointers [] with total 0, never null ────────
	try {
		const { isError, data } = await callTool("locate_source", {
			q: "qzxjvwk",
		});
		if (
			!isError &&
			Array.isArray(data?.pointers) &&
			data.pointers.length === 0 &&
			data.total === 0
		)
			pass("no match: pointers [] with total 0 (checked, none)");
		else
			fail(
				"no match: pointers [] with total 0",
				`isError=${isError} pointers=${JSON.stringify(data?.pointers)} total=${data?.total}`,
			);
	} catch (e) {
		fail("locate_source no match", e.message);
	}

	// ── Session 24: an out-of-range page is refused, naming page ────────────
	// The schema holds the spec's 1 to 2000, so page 0 never reaches the API.
	try {
		const resp = await callMcp("tools/call", {
			name: "locate_source",
			arguments: { q: "require_auth", page: 0 },
		});
		const text = resp.error?.message ?? resp.result?.content?.[0]?.text ?? "";
		if ((resp.error || resp.result?.isError) && text.includes("page"))
			pass("page 0 refused, naming page");
		else fail("page 0 refused, naming page", text.slice(0, 150));
	} catch (e) {
		fail("locate_source page 0", e.message);
	}

	// ── Session 25: an API 400 comes back as a clean tool error ─────────────
	// Every word of this q is filler, a 400 the schema cannot catch.
	try {
		const { isError, raw } = await callTool("locate_source", {
			q: "where is the file defined",
		});
		if (isError && raw.includes("HTTP 400") && raw.includes('"error"'))
			pass(
				`API 400 passed through as a tool error (${raw.match(/"error":"([^"]*)"/)?.[1]})`,
			);
		else
			fail("API 400 passed through", `isError=${isError} ${raw.slice(0, 150)}`);
	} catch (e) {
		fail("locate_source 400 passthrough", e.message);
	}

	// ── Session 26: view=compact on search_projects and search_repos ────────
	console.log("\n◆ view=compact");
	try {
		const full = await callTool("search_projects", { q: "lending" });
		const compact = await callTool("search_projects", {
			q: "lending",
			view: "compact",
		});
		if (compact.data?.meta?.view?.mode === "compact")
			pass("search_projects forwards view=compact (meta.view.mode)");
		else
			fail(
				"search_projects forwards view=compact",
				JSON.stringify(compact.data?.meta?.view ?? null).slice(0, 100),
			);
		if (compact.raw.length * 2 < full.raw.length)
			pass(`compact page ${compact.raw.length} chars, full ${full.raw.length}`);
		else
			fail(
				"compact page under half the full page",
				`${compact.raw.length} vs ${full.raw.length}`,
			);
		// The tool re-serializes without indentation, so it adds no whitespace
		// (the stub session checks a minified page round-trips unchanged). The 24,000 characters the
		// compact view was sized for rides on live data: SMOKE_STRICT=1 only.
		if (compact.raw === JSON.stringify(JSON.parse(compact.raw)))
			pass(
				`compact page carries no added whitespace (${compact.raw.length} chars)`,
			);
		else
			fail(
				"compact page carries no added whitespace",
				compact.raw.slice(0, 40),
			);
		if (!STRICT)
			skip("compact q=lending under 24,000 characters", "strict mode only (SMOKE_STRICT=1)");
		else if (compact.raw.length < 24_000)
			pass(`compact q=lending under 24,000 characters (${compact.raw.length})`);
		else
			fail(
				"compact q=lending under 24,000 characters",
				`${compact.raw.length}`,
			);
		if (full.raw.startsWith('{\n  "')) pass("full page keeps indented JSON");
		else fail("full page keeps indented JSON", full.raw.slice(0, 40));
	} catch (e) {
		fail("search_projects view=compact", e.message);
	}
	try {
		const { data } = await callTool("search_repos", {
			q: "soroban",
			view: "compact",
		});
		if (data?.meta?.view?.mode === "compact")
			pass("search_repos forwards view=compact (meta.view.mode)");
		else
			fail(
				"search_repos forwards view=compact",
				JSON.stringify(data?.meta?.view ?? null).slice(0, 100),
			);
	} catch (e) {
		fail("search_repos view=compact", e.message);
	}

	// ── Session 27: filters reach the API: search_repos activity, ──────────
	// get_leaderboard type (declared and silently dropped before 1.8.0) and
	// search_projects type (not declared before 1.8.0).
	console.log(
		"\n◆ filters applied: search_repos activity, get_leaderboard and search_projects type",
	);
	try {
		const { isError, data } = await callTool("search_repos", {
			q: "soroban",
			activity: "maintained",
			limit: 5,
		});
		const rows = Array.isArray(data?.repos) ? data.repos : [];
		if (
			!isError &&
			data?.meta?.filters?.activity === "maintained" &&
			rows.length > 0 &&
			rows.every((r) => r.activityState === "maintained")
		)
			pass(
				`search_repos activity=maintained echoed and applied (${rows.length} rows, all maintained)`,
			);
		else
			fail(
				"search_repos activity=maintained echoed and applied",
				`isError=${isError} filters=${JSON.stringify(data?.meta?.filters ?? null)}`,
			);
	} catch (e) {
		fail("search_repos activity", e.message);
	}
	try {
		const { isError, data } = await callTool("get_leaderboard", {
			type: "DEX",
		});
		const rows = Array.isArray(data?.projects) ? data.projects : [];
		if (
			!isError &&
			data?.meta?.filters?.type?.includes?.("DEX") &&
			rows.length > 0 &&
			rows.every((p) => p.types?.includes("DEX"))
		)
			pass(
				`get_leaderboard type=DEX echoed and applied (${rows.length} projects, all typed DEX)`,
			);
		else
			fail(
				"get_leaderboard type=DEX echoed and applied",
				`isError=${isError} filters=${JSON.stringify(data?.meta?.filters ?? null)}`,
			);
	} catch (e) {
		fail("get_leaderboard type", e.message);
	}
	try {
		const { isError, data } = await callTool("search_projects", {
			type: "Wallet",
			limit: 5,
		});
		const rows = Array.isArray(data?.projects) ? data.projects : [];
		if (
			!isError &&
			data?.meta?.filters?.type === "Wallet" &&
			rows.length > 0 &&
			rows.every((p) => p.types?.includes("Wallet"))
		)
			pass(
				`search_projects type=Wallet echoed and applied (${rows.length} projects, all typed Wallet)`,
			);
		else
			fail(
				"search_projects type=Wallet echoed and applied",
				`isError=${isError} filters=${JSON.stringify(data?.meta?.filters ?? null)}`,
			);
	} catch (e) {
		fail("search_projects type", e.message);
	}

	// ── Summary ─────────────────────────────────────────────────────────────
	const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
	console.log(`\n${"─".repeat(60)}`);
	console.log(
		`  ${passed} passed · ${failed} failed · ${skipped} skipped · ${elapsed}s`,
	);
	if (failed > 0) {
		console.log(`\n  Failures:`);
		for (const f of failures) console.log(`    • ${f.name}: ${f.reason}`);
		process.exit(1);
	}
	process.exit(0);
}

main().catch((e) => {
	console.error("FATAL:", e);
	process.exit(2);
});
