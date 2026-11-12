import { describe, expect, it } from "vitest";
import {
	IDIOMS_REVIEWED_THROUGH,
	SDK_ADVISORIES,
	SDK_FACTS_ASOF,
	SDK_IDIOMS,
	SDK_PACKAGES,
} from "@/data/sdk-facts";
import { docVersionStatus } from "../doc-freshness";
import { isKindMapped, MAINTENANCE_MODES } from "../improvement-ledger";
import {
	advisoriesAffecting,
	carryForward,
	DRIFT_KINDS,
	type DriftRow,
	deriveAlsoAffects,
	inRange,
	jsSdkAdoption,
	readAdvisory,
	readCrate,
	readNpm,
	type SdkUpstream,
	sdkFactsDrift,
	sorobanSdkAdoption,
	unreadSources,
	watchedRepositories,
} from "../sdk-facts";
import { PUBLISHER_DEPRECATED_JS_PACKAGES } from "../soroban-versions";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
// GitHub's advisory range grammar: comparators joined by ", ".
const RANGE = /^(?:[<>]=?|=) ?\d+\.\d+\.\d+(?:, (?:[<>]=?|=) ?\d+\.\d+\.\d+)*$/;

/** An upstream reading that agrees with the facts exactly. */
function agreeing(): SdkUpstream {
	const database = SDK_ADVISORIES.filter((a) => a.source !== "repository").map(
		(a) => ({ ...a, withdrawn: false }),
	);
	const repositories: SdkUpstream["repositories"] = {};
	for (const repo of watchedRepositories()) repositories[repo] = [];
	for (const a of SDK_ADVISORIES.filter((x) => x.source === "repository"))
		repositories[a.repository ?? ""]?.push({ ...a, withdrawn: false });
	const registries: SdkUpstream["registries"] = {};
	for (const p of SDK_PACKAGES)
		registries[`${p.registry}:${p.name}`] = {
			latestMajor: p.latestMajor,
			deprecated: p.status === "deprecated" ? p.statement : null,
			withdrawnVersions: [...p.withdrawnVersions],
		};
	return {
		database,
		repositories,
		registries,
		releases: {},
		crateIndex: null,
	};
}

describe("sdk facts data", () => {
	it("every fact carries a source URL and an as-of date", () => {
		for (const a of SDK_ADVISORIES) {
			expect(a.url).toMatch(/^https:\/\//);
			expect(a.asOf).toMatch(DATE);
			expect(a.publishedAt).toMatch(DATE);
		}
		for (const p of SDK_PACKAGES) {
			expect(p.registryUrl).toMatch(/^https:\/\//);
			expect(p.asOf).toMatch(DATE);
		}
		for (const i of SDK_IDIOMS) {
			expect(i.sourceUrl).toMatch(/^https:\/\//);
			expect(i.asOf).toMatch(DATE);
		}
		expect(SDK_FACTS_ASOF).toMatch(DATE);
		expect(Number.isNaN(Date.parse(IDIOMS_REVIEWED_THROUGH))).toBe(false);
	});

	it("holds the two soroban-sdk advisories the research ingest already carries", () => {
		const by = new Map(SDK_ADVISORIES.map((a) => [a.ghsa, a]));
		expect(by.get("GHSA-x2hw-px52-wp4m")?.cve).toBe("CVE-2026-32322");
		expect(by.get("GHSA-96xm-fv9w-pf3f")?.cve).toBe("CVE-2026-24889");
	});

	it("serves affected ranges verbatim in the advisory grammar, on listed packages only", () => {
		const listed = new Set(
			SDK_PACKAGES.map(
				(p) => `${p.registry === "crates.io" ? "rust" : p.registry}:${p.name}`,
			),
		);
		for (const a of SDK_ADVISORIES) {
			expect(a.affected.length).toBeGreaterThan(0);
			for (const v of a.affected) {
				expect(v.vulnerableRange).toMatch(RANGE);
				expect(listed.has(`${v.ecosystem}:${v.package}`)).toBe(true);
			}
			if (a.source === "repository") expect(a.repository).toBeTruthy();
		}
	});

	it("names a replacement and the publisher's words for every package that is not active", () => {
		for (const p of SDK_PACKAGES) {
			if (p.status === "active") {
				expect(p.replacement).toBeNull();
				continue;
			}
			expect(p.replacement?.name).toBeTruthy();
			expect(p.statement).toBeTruthy();
			expect(p.statementUrl).toMatch(/^https:\/\//);
		}
	});

	it("agrees with the publisher-deprecated set the toolchain table applies", () => {
		const deprecatedNpm = new Set(
			SDK_PACKAGES.filter(
				(p) => p.registry === "npm" && p.status === "deprecated",
			).map((p) => p.name),
		);
		for (const name of PUBLISHER_DEPRECATED_JS_PACKAGES)
			expect(deprecatedNpm.has(name)).toBe(true);
	});

	it("lists the Wallets Kit under both scopes", () => {
		const names = SDK_PACKAGES.map((p) => `${p.registry}:${p.name}`);
		expect(names).toContain("npm:@creit.tech/stellar-wallets-kit");
		expect(names).toContain("jsr:@creit-tech/stellar-wallets-kit");
	});

	it("each idiom pattern finds its own deprecated form", () => {
		for (const i of SDK_IDIOMS) {
			expect(new RegExp(i.pattern).test(i.example)).toBe(true);
			expect(i.appliesFrom.version).toMatch(/^\d+\.\d+\.\d+$/);
		}
	});

	it("covers every deprecated idiom doc-freshness flags in research docs", () => {
		// doc-freshness.ts DEPRECATED_IDIOMS: a doc teaching these is stale.
		for (const doc of [
			"rustup target add wasm32-unknown-unknown",
			"soroban-cli install",
			"soroban-cli deploy --wasm target/wasm32-unknown-unknown/release/x.wasm",
		]) {
			expect(docVersionStatus(doc)).toBe("deprecated");
			expect(SDK_IDIOMS.some((i) => new RegExp(i.pattern).test(doc))).toBe(
				true,
			);
		}
	});
});

describe("adoption by major", () => {
	it("counts soroban-sdk majors over readable pins, newest first", () => {
		const a = sorobanSdkAdoption([
			"29.0.1",
			"=29.0.0",
			"22",
			"^22.0.3",
			"22.0.0-rc.3",
			"workspace",
			null,
			"https://github.com/stellar/rs-soroban-sdk",
		]);
		expect(a.repos).toBe(7);
		expect(a.readable).toBe(5);
		expect(a.byMajor).toEqual([
			{ major: 29, repos: 2, share: 0.4 },
			{ major: 22, repos: 3, share: 0.6 },
		]);
	});

	it("counts only @stellar/stellar-sdk on the JS line, never a scanner marker", () => {
		const a = jsSdkAdoption([
			"@stellar/stellar-sdk@^17.0.1",
			"@stellar/stellar-sdk@16.4.1",
			"@stellar/stellar-sdk@^13",
			"@stellar/stellar-sdk@latest",
			"stellar-sdk@^13.0.0",
			"rust-infra:cargo.toml",
			"@stellar/freighter-api@6.0.1",
		]);
		expect(a.repos).toBe(4);
		expect(a.readable).toBe(2);
		expect(a.byMajor).toEqual([
			{ major: 17, repos: 1, share: 0.5 },
			{ major: 16, repos: 1, share: 0.5 },
		]);
	});

	it("answers an empty population with no majors, not a zero share", () => {
		expect(sorobanSdkAdoption([])).toEqual({
			repos: 0,
			readable: 0,
			byMajor: [],
		});
	});
});

describe("registry readers", () => {
	it("reads npm's deprecated field off the latest version", () => {
		const r = readNpm({
			"dist-tags": { latest: "13.3.0" },
			versions: {
				"13.3.0": { deprecated: "moved" },
				"13.2.0": { deprecated: "moved" },
			},
		});
		expect(r).toEqual({
			latestMajor: 13,
			deprecated: "moved",
			withdrawnVersions: [],
		});
	});

	it("lists versions npm deprecates one by one in a live package", () => {
		const r = readNpm({
			"dist-tags": { latest: "17.4.0" },
			versions: { "17.4.0": {}, "17.3.0": { deprecated: "broken build" } },
		});
		expect(r?.withdrawnVersions).toEqual(["17.3.0"]);
		expect(r?.deprecated).toBeNull();
	});

	it("reads crates.io's max stable major and yanked versions", () => {
		const r = readCrate({
			crate: { max_stable_version: "29.0.1" },
			versions: [
				{ num: "29.0.1", yanked: false },
				{ num: "21.0.0", yanked: true },
			],
		});
		expect(r).toEqual({
			latestMajor: 29,
			deprecated: null,
			withdrawnVersions: ["21.0.0"],
		});
	});

	it("answers null, never a reading, for an unparsable registry body", () => {
		expect(readNpm({ error: "Not found" })).toBeNull();
		expect(readCrate({ errors: [{ detail: "not found" }] })).toBeNull();
	});

	it("reads both advisory shapes into one", () => {
		const db = readAdvisory(
			{
				ghsa_id: "GHSA-aaaa-bbbb-cccc",
				cve_id: null,
				severity: "high",
				summary: "s",
				html_url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc",
				published_at: "2026-01-02T03:04:05Z",
				withdrawn_at: null,
				vulnerabilities: [
					{
						package: { ecosystem: "rust", name: "soroban-sdk" },
						vulnerable_version_range: "< 1.0.0",
						first_patched_version: "1.0.0",
					},
				],
			},
			"reviewed",
		);
		const repo = readAdvisory(
			{
				ghsa_id: "GHSA-aaaa-bbbb-cccc",
				cve_id: null,
				severity: "high",
				summary: "s",
				html_url:
					"https://github.com/o/r/security/advisories/GHSA-aaaa-bbbb-cccc",
				published_at: "2026-01-02T03:04:05Z",
				vulnerabilities: [
					{
						package: { ecosystem: "rust", name: "soroban-sdk" },
						vulnerable_version_range: "< 1.0.0",
						patched_versions: "1.0.0",
					},
				],
			},
			"repository",
		);
		expect(db?.affected).toEqual(repo?.affected);
		expect(db?.publishedAt).toBe("2026-01-02");
	});
});

describe("drift against upstream", () => {
	it("finds nothing when upstream agrees with every fact", () => {
		expect(sdkFactsDrift(agreeing())).toEqual([]);
	});

	it("reports an advisory the facts do not list", () => {
		const up = agreeing();
		up.database?.push({
			...SDK_ADVISORIES[0],
			ghsa: "GHSA-zzzz-zzzz-zzzz",
			source: "reviewed",
			withdrawn: false,
		});
		expect(sdkFactsDrift(up)).toEqual([
			expect.objectContaining({
				kind: "advisory-unlisted",
				subject: "GHSA-zzzz-zzzz-zzzz",
			}),
		]);
	});

	it("reports a repository advisory outside the database, but not one on a browser extension", () => {
		const up = agreeing();
		up.repositories["stellar/freighter"] = [
			{
				...SDK_ADVISORIES[0],
				ghsa: "GHSA-ext0-ext0-ext0",
				source: "repository",
				affected: [
					{
						ecosystem: "chrome extension",
						package: "Freighter",
						vulnerableRange: "< 5.3.1",
						firstPatched: "5.3.1",
					},
				],
				withdrawn: false,
			},
			{
				...SDK_ADVISORIES[0],
				ghsa: "GHSA-new0-new0-new0",
				source: "repository",
				withdrawn: false,
			},
		];
		expect(sdkFactsDrift(up).map((r) => r.subject)).toEqual([
			"GHSA-new0-new0-new0",
		]);
	});

	it("reports a changed affected range", () => {
		const up = agreeing();
		const first = up.database?.[0];
		if (!first) throw new Error("no database advisory");
		first.affected = [
			{ ...first.affected[0], vulnerableRange: "< 99.0.0" },
			...first.affected.slice(1),
		];
		expect(sdkFactsDrift(up)).toEqual([
			expect.objectContaining({
				kind: "advisory-changed",
				subject: first.ghsa,
			}),
		]);
	});

	it("reports a listed advisory the database withdrew", () => {
		const up = agreeing();
		const first = up.database?.[0];
		if (!first) throw new Error("no database advisory");
		first.withdrawn = true;
		expect(sdkFactsDrift(up)).toEqual([
			expect.objectContaining({
				kind: "advisory-not-upstream",
				subject: first.ghsa,
			}),
		]);
	});

	it("reports a new npm deprecation, a new major and a new yank", () => {
		const up = agreeing();
		up.registries["npm:@stellar/freighter-api"] = {
			latestMajor: 6,
			deprecated: "use @stellar/varial-sdk",
			withdrawnVersions: [],
		};
		const sdk = up.registries["crates.io:soroban-sdk"];
		if (!sdk) throw new Error("no soroban-sdk reading");
		sdk.latestMajor += 1;
		sdk.withdrawnVersions.push("29.0.0");
		expect(
			sdkFactsDrift(up)
				.map((r) => `${r.kind} ${r.subject}`)
				.sort(),
		).toEqual([
			"deprecation-unlisted npm:@stellar/freighter-api",
			"major-unlisted crates.io:soroban-sdk",
			"withdrawn-unlisted crates.io:soroban-sdk",
		]);
	});

	it("reports a deprecation message the publisher changed", () => {
		const up = agreeing();
		up.registries["npm:stellar-sdk"] = {
			latestMajor: 13,
			deprecated: "a new message",
			withdrawnVersions: [],
		};
		expect(sdkFactsDrift(up)).toEqual([
			expect.objectContaining({
				kind: "deprecation-changed",
				subject: "npm:stellar-sdk",
			}),
		]);
	});

	it("asks for a review of release notes past the reviewed date that name a deprecation", () => {
		const up = agreeing();
		up.releases["stellar/rs-soroban-sdk"] = [
			{
				tag: "v30.0.0",
				publishedAt: "2099-01-01",
				prerelease: false,
				deprecates: true,
				url: "https://github.com/stellar/rs-soroban-sdk/releases/tag/v30.0.0",
			},
			{
				tag: "v30.0.1",
				publishedAt: "2099-01-02",
				prerelease: false,
				deprecates: false,
				url: "https://github.com/stellar/rs-soroban-sdk/releases/tag/v30.0.1",
			},
			{
				tag: "v29.0.1",
				publishedAt: "2026-10-12",
				prerelease: false,
				deprecates: true,
				url: "https://github.com/stellar/rs-soroban-sdk/releases/tag/v29.0.1",
			},
		];
		expect(sdkFactsDrift(up)).toEqual([
			expect.objectContaining({
				kind: "idiom-review",
				subject: "stellar/rs-soroban-sdk v30.0.0",
			}),
		]);
	});

	it("never turns a source it could not read into a finding", () => {
		const up = agreeing();
		up.database = null;
		for (const k of Object.keys(up.registries)) up.registries[k] = null;
		for (const k of Object.keys(up.repositories)) up.repositories[k] = null;
		expect(sdkFactsDrift(up)).toEqual([]);
	});
});

describe("ledger feed", () => {
	it("maps every drift kind the check can write, and queues only table refreshes", () => {
		for (const k of DRIFT_KINDS) {
			expect(isKindMapped("sdk-facts", `sdk-${k}`)).toBe(true);
			// a wrong advisory or inherited range is a security fact served
			// wrong: a defect, never the refresh queue
			expect(MAINTENANCE_MODES.has(`sdk-${k}`)).toBe(
				!k.startsWith("advisory-") && k !== "also-affects-changed",
			);
		}
	});
});

describe("H1: advisories a soroban-sdk consumer inherits", () => {
	it("finds the macros advisory for a repo on soroban-sdk 25.1.0, and not on the patched line", () => {
		const on = (v: string) =>
			advisoriesAffecting("rust", "soroban-sdk", v).map((a) => a.ghsa);
		expect(on("25.1.0")).toContain("GHSA-4chv-4c6w-w254");
		expect(on("23.5.1")).toContain("GHSA-4chv-4c6w-w254");
		expect(on("25.1.1")).not.toContain("GHSA-4chv-4c6w-w254");
		// soroban-sdk pins soroban-env-host exactly; the host advisory ends at 26.
		expect(on("25.1.0")).toContain("GHSA-pm4j-7r4q-ccg8");
		expect(on("26.0.0")).not.toContain("GHSA-pm4j-7r4q-ccg8");
		// the advisory soroban-sdk itself carries still applies on its own ranges
		expect(on("25.1.0")).toContain("GHSA-x2hw-px52-wp4m");
	});

	it("names how the inherited range was read and which pin carries it", () => {
		const macros = SDK_ADVISORIES.find((a) => a.ghsa === "GHSA-4chv-4c6w-w254");
		expect(macros?.alsoAffects.length).toBeGreaterThan(0);
		for (const x of macros?.alsoAffects ?? []) {
			expect(x.package).toBe("soroban-sdk");
			expect(x.via).toBe("soroban-sdk-macros");
			expect(x.path).toEqual(["soroban-sdk", "soroban-sdk-macros"]);
			expect(x.pin).toBe("minimum");
			expect(x.basis).toMatch(/crates\.io/);
			expect(x.sourceUrl).toMatch(/^https:\/\//);
			expect(x.vulnerableRange).toMatch(RANGE);
			expect(x.targets).toHaveLength(x.path.length - 1);
		}
	});

	it("finds the stellar-xdr advisories two levels down, with the path", () => {
		const reach = (ghsa: string, v: string) =>
			(SDK_ADVISORIES.find((a) => a.ghsa === ghsa)?.alsoAffects ?? []).filter(
				(x) => inRange(x.vulnerableRange, v),
			);
		// soroban-sdk 29.0.1 = env-host 29.0.1 = env-common 29.0.1 = stellar-xdr 28.0.0
		const latest = reach("GHSA-3xhm-p452-9wjh", "29.0.1");
		expect(latest.map((x) => x.path.join(" > "))).toContain(
			"soroban-sdk > soroban-env-host > soroban-env-common > stellar-xdr",
		);
		expect(latest.find((x) => x.path[1] === "soroban-env-host")?.pin).toBe(
			"exact",
		);
		// 22.0.9 reaches stellar-xdr =22.1.0, inside both stellar-xdr advisories
		expect(reach("GHSA-3xhm-p452-9wjh", "22.0.9").length).toBeGreaterThan(0);
		expect(reach("GHSA-x57h-xx53-v53w", "22.0.9").length).toBeGreaterThan(0);
		// 29.0.1 reaches stellar-xdr 28.0.0, outside GHSA-x57h (<= 25.0.0)
		expect(reach("GHSA-x57h-xx53-v53w", "29.0.1")).toEqual([]);
		const on = (v: string) =>
			advisoriesAffecting("rust", "soroban-sdk", v).map((a) => a.ghsa);
		expect(on("29.0.1")).toContain("GHSA-3xhm-p452-9wjh");
		expect(on("29.0.1")).not.toContain("GHSA-x57h-xx53-v53w");
	});

	it("labels a host-only chain so a consumer that ignores target still sees it", () => {
		const pm4j = SDK_ADVISORIES.find((a) => a.ghsa === "GHSA-pm4j-7r4q-ccg8");
		const onModern = (pm4j?.alsoAffects ?? []).filter((x) =>
			inRange(x.vulnerableRange, "25.3.2"),
		);
		expect(onModern).toEqual([
			expect.objectContaining({
				vulnerableRange: ">= 20.0.0, <= 25.3.2",
				path: ["soroban-sdk", "soroban-env-host"],
				pin: "exact",
				appliesTo: "host builds and tests, not the deployed wasm contract",
			}),
		]);
		expect(onModern[0].targets[0]).toMatch(/not\(target_family/);
	});

	it("walks normal, non-optional dependencies transitively, up to the hop cap", () => {
		const NOT_WASM = 'cfg(not(target_family = "wasm"))';
		const WASM = 'cfg(target_family = "wasm")';
		const idx = {
			sdk: [
				{
					vers: "1.0.0",
					deps: [
						{ name: "soroban-host", req: "=1.0.0", target: NOT_WASM },
						{ name: "soroban-guest", req: "=1.0.0", target: WASM },
						{ name: "soroban-macros", req: "^1.0.0" },
						{ name: "stellar-opt", req: "=1.0.0", optional: true },
						{ name: "stellar-dev", req: "=1.0.0", kind: "dev" },
					],
				},
				{
					vers: "2.0.0",
					deps: [{ name: "soroban-host", req: "=2.0.0", target: NOT_WASM }],
				},
			],
			"soroban-host": [
				{ vers: "1.0.0", deps: [{ name: "soroban-common", req: "=1.0.0" }] },
				{ vers: "2.0.0", deps: [{ name: "soroban-common", req: "=2.0.0" }] },
			],
			"soroban-guest": [
				{ vers: "1.0.0", deps: [{ name: "soroban-common", req: "=1.0.0" }] },
			],
			"soroban-macros": [
				{ vers: "1.0.0", deps: [{ name: "stellar-xdr", req: "=1.0.0" }] },
				{ vers: "1.0.5", deps: [{ name: "stellar-xdr", req: "=1.1.0" }] },
			],
			"soroban-common": [
				{ vers: "1.0.0", deps: [{ name: "stellar-xdr", req: "=1.0.0" }] },
				{ vers: "2.0.0", deps: [{ name: "stellar-xdr", req: "=2.0.0" }] },
			],
			"stellar-opt": [
				{ vers: "1.0.0", deps: [{ name: "stellar-xdr", req: "=1.0.0" }] },
			],
			"stellar-dev": [
				{ vers: "1.0.0", deps: [{ name: "stellar-xdr", req: "=1.0.0" }] },
			],
			"stellar-xdr": [
				{ vers: "1.0.0", deps: [] },
				{ vers: "1.1.0", deps: [] },
				{ vers: "2.0.0", deps: [] },
			],
		};
		const adv = {
			affected: [
				{
					ecosystem: "rust",
					package: "stellar-xdr",
					vulnerableRange: "< 1.1.0",
					firstPatched: "1.1.0",
				},
			],
		};
		const rows = deriveAlsoAffects(adv, idx, { root: "sdk" });
		expect(
			rows.map((r) => [
				r.vulnerableRange,
				r.path.join(">"),
				r.pin,
				r.appliesTo,
			]),
		).toEqual(
			expect.arrayContaining([
				[
					"<= 1.0.0",
					"sdk>soroban-host>soroban-common>stellar-xdr",
					"exact",
					"host builds and tests, not the deployed wasm contract",
				],
				[
					"<= 1.0.0",
					"sdk>soroban-guest>soroban-common>stellar-xdr",
					"exact",
					"wasm contract builds only",
				],
				// the caret hop admits macros 1.0.0 (xdr 1.0.0) and 1.0.5 (xdr 1.1.0)
				[
					"<= 1.0.0",
					"sdk>soroban-macros>stellar-xdr",
					"minimum",
					"every build",
				],
			]),
		);
		expect(rows).toHaveLength(3);
		// optional and dev edges are never walked
		expect(
			rows.some(
				(r) => r.path.includes("stellar-opt") || r.path.includes("stellar-dev"),
			),
		).toBe(false);
		// the hop cap is a real cap: two hops cannot reach a three-hop leaf
		expect(
			deriveAlsoAffects(adv, idx, { root: "sdk", maxHops: 2 }).map((r) =>
				r.path.join(">"),
			),
		).toEqual(["sdk>soroban-macros>stellar-xdr"]);
	});

	it("reports an inherited range the crates.io index no longer supports", () => {
		const up = agreeing();
		up.crateIndex = {
			"soroban-sdk": [
				{
					vers: "29.0.1",
					deps: [{ name: "soroban-sdk-macros", req: "^29.0.1" }],
				},
			],
		};
		const rows = sdkFactsDrift(up);
		expect(rows.map((r) => r.kind)).toContain("also-affects-changed");
		expect(rows.map((r) => r.subject)).toContain("GHSA-4chv-4c6w-w254");
	});
});

describe("M1: soroban-cli is renamed as a binary, not as a library", () => {
	const cli = SDK_IDIOMS.find((i) => i.id === "soroban-cli");
	const re = new RegExp(cli?.pattern ?? "$^");
	it("matches installing or invoking the binary", () => {
		for (const line of [
			"cargo install --locked soroban-cli",
			"cargo install soroban-cli --version 21.0.0",
			"soroban contract deploy --wasm x.wasm",
			"$ soroban contract invoke --id C1 -- hello",
			"      - run: soroban contract build",
			"        run: soroban contract deploy --wasm x.wasm",
			"RUN soroban contract optimize --wasm x.wasm",
			"RUN cargo build && soroban contract build",
		])
			expect(re.test(line), line).toBe(true);
	});
	it("does not match a dependency line or prose", () => {
		for (const line of [
			'soroban-cli = { version = "=30.0.1" }',
			'soroban-cli = "30.0.1"',
			"soroban-cli is the library behind stellar-cli.",
			"Write a soroban contract that stores a counter.",
			"The Soroban contract SDK.",
			"Then run: a soroban contract test suite.",
			"soroban-cli = { workspace = true }",
		])
			expect(re.test(line), line).toBe(false);
	});
	it("says the crate remains a library", () => {
		const row = SDK_PACKAGES.find((p) => p.name === "soroban-cli");
		expect(row?.statusScope).toMatch(/library/);
		expect(row?.statusScope).toMatch(/stellar-cli/);
	});
});

describe("M2: an unread source never closes its findings", () => {
	const prior: DriftRow[] = [
		{
			kind: "advisory-unlisted",
			subject: "GHSA-aaaa-aaaa-aaaa",
			detail: "d",
			url: null,
			source: "advisory-database",
		},
		{
			kind: "major-unlisted",
			subject: "npm:@stellar/stellar-sdk",
			detail: "d",
			url: null,
			source: "npm:@stellar/stellar-sdk",
		},
	];
	it("carries forward the rows of a source that went unread", () => {
		const up = agreeing();
		up.database = null;
		const rows = carryForward(
			prior,
			sdkFactsDrift(up),
			unreadSources(up),
			"t0",
		);
		expect(rows).toEqual([
			expect.objectContaining({
				subject: "GHSA-aaaa-aaaa-aaaa",
				carriedFrom: "t0",
			}),
		]);
	});
	it("drops a row once its source is read again and no longer reports it", () => {
		const up = agreeing();
		expect(
			carryForward(prior, sdkFactsDrift(up), unreadSources(up), "t0"),
		).toEqual([]);
	});
});

describe("lows", () => {
	it("flags a release published at the reviewed timestamp itself", () => {
		const up = agreeing();
		up.releases["stellar/stellar-cli"] = [
			{
				tag: "v31.0.0",
				publishedAt: IDIOMS_REVIEWED_THROUGH,
				prerelease: false,
				deprecates: true,
				url: "https://github.com/stellar/stellar-cli/releases/tag/v31.0.0",
			},
		];
		expect(sdkFactsDrift(up).map((r) => r.kind)).toEqual(["idiom-review"]);
	});

	it("lists npm stellar-base as deprecated, pointing at @stellar/stellar-base", () => {
		const row = SDK_PACKAGES.find(
			(p) => p.registry === "npm" && p.name === "stellar-base",
		);
		expect(row?.status).toBe("deprecated");
		expect(row?.replacement?.name).toBe("@stellar/stellar-base");
	});
});
