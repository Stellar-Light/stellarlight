/**
 * Note-freshness detector — re-verifies the registry facts cited in public
 * REPO_KNOWLEDGE_NOTES after their asOf date.
 *
 * A curated note like "npm @stellar/stellar-base — 15.0.0 (2026-03-30 …)" is
 * true on its date and rots silently as the registry moves; nothing re-read
 * it and the board had no "notes stale" signal. This lane parses each public
 * note for a registry identity WITH a version (conservative: both must be
 * unambiguous, an unparseable note is not a finding), reads the registry
 * read-only, and files a finding when the latest version differs from the
 * cited one AND was published after asOf. Trinary per claim: current /
 * stale / unchecked (fetch failure — counted, never a finding).
 *
 *   pnpm exec tsx scripts/check-note-freshness.ts              # network only
 *   pnpm exec tsx scripts/check-note-freshness.ts --self-test  # parser check
 *
 * Never writes to the DB. Exit 1 only when the run could check NOTHING (an
 * instrument failure, not an absence).
 */
import { strict as assert } from "node:assert";
import { REPO_KNOWLEDGE_NOTES } from "../src/lib/repo-knowledge";
import { type NightlyFailure, writeNightlyFindings } from "./nightly-findings";

type Registry =
	| "npm"
	| "crates"
	| "pypi"
	| "pub"
	| "packagist"
	| "maven"
	| "docker";
export interface Claim {
	registry: Registry;
	name: string;
	/** version as written in the note; for docker the cited YYYY-MM-DD push date */
	cited: string;
}
interface Latest {
	latest: string;
	publishedAt: string | null;
}

const UA = "stellarlight-note-freshness/1.0 (+https://stellarlight.xyz)";
const VER = String.raw`v?\d+\.\d+\.\d+(?:[-+.]?[0-9A-Za-z][0-9A-Za-z.+-]*)?`;
const DATE = String.raw`\d{4}-\d{2}-\d{2}`;

// ── parser ──────────────────────────────────────────────────────────────────
// Registry keyword + optional filler words ("npm name is", "crates.io it ships
// as BOTH", "PyPI package") + optional backtick, then the name pattern.
const FILL = String.raw`(?:\s+(?:package|packages|sdk|name|names|is|as|the|unscoped|named|simply|crate|crates|it|ships|both|coordinates|artifact))*\s*:?\s+\x60?`;
const NAME: Record<Registry, string> = {
	npm: String.raw`(?=\S*[a-z])(?:@[a-z0-9~][a-z0-9._~-]*\/)?[a-z0-9~][a-z0-9._~-]*`,
	crates: String.raw`(?=\S*[a-z])[a-z0-9_-]+`,
	pypi: String.raw`(?=\S*[a-z])[a-z0-9][a-z0-9._-]*`,
	pub: String.raw`(?=\S*[a-z])[a-z0-9_]+`,
	packagist: String.raw`[a-z0-9_.-]+\/[a-z0-9_.-]+`,
	maven: String.raw`[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+:[a-z0-9_.-]+`,
	docker: String.raw`(?:docker\.io\/)?[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*`,
};
// "Published on JSR, not npm: @creit-tech/… — 0.2.0" is a negated registry,
// not a claim (it read as a 404 = "unchecked" until this guard).
const NOT = String.raw`(?<!\bnot\s+(?:on\s+)?)`;
const LEAD: Array<[Registry, RegExp]> = [
	["npm", new RegExp(String.raw`${NOT}\bnpm${FILL}`, "gi")],
	["crates", new RegExp(String.raw`${NOT}\bcrates\.io${FILL}`, "gi")],
	["pypi", new RegExp(String.raw`${NOT}\bpypi${FILL}`, "gi")],
	["pub", new RegExp(String.raw`${NOT}\bpub\.dev${FILL}`, "gi")],
	["packagist", new RegExp(String.raw`${NOT}\bpackagist${FILL}`, "gi")],
	["maven", new RegExp(String.raw`${NOT}\bmaven\s+central${FILL}`, "gi")],
	["docker", /\bdocker\s+hub\s+image(?:\s+moved\s+too)?:?\s+/gi],
	// "Docker image org/image (Docker Hub, registered …" / "… on Docker Hub (…"
	["docker", /\bdocker\s+image\s+(?=\S+\s*(?:\(|on\s+)docker\s+hub)/gi],
	// registry URLs followed by a version
	["npm", /registry\.npmjs\.org\/|npmjs\.com\/package\//gi],
	["crates", /crates\.io\/crates\//gi],
	["pypi", /pypi\.org\/project\//gi],
	["pub", /pub\.dev\/packages\//gi],
	["packagist", /packagist\.org\/packages\//gi],
	["docker", /hub\.docker\.com\/r\//gi],
];
// After the name: "— 1.2.3", "(1.2.3,", ": 1.2.3", " 1.2.3", "is frozen at 1.2.3",
// "(parenthetical) — 1.2.3", "— N versions from 0.1.0 (…) to 1.2.3".
const AFTER = [
	new RegExp(
		String.raw`\x60?(?:\s*[—–:-]\s*|\s*\(\s*|\s+)(?:is\s+)?(?:deprecated\s+and\s+)?(?:frozen\s+at\s+)?(${VER})`,
		"y",
	),
	new RegExp(String.raw`\x60?\s*\([^()]{0,120}\)\s*[—–:-]\s*(${VER})`, "y"),
	new RegExp(
		String.raw`\s*[—–-]\s*\d+\s+versions\s+from\s+${VER}(?:\s*\([^()]*\))?\s+to\s+(${VER})`,
		"y",
	),
];
const CHAIN = /(?:\s*\([^()]*\))?\s*(?:,\s*(?:and\s+)?|\s+and\s+)/y;
const SHARED = new RegExp(
	String.raw`(?:\s*[—–-]\s*|\s*\(\s*|\s+)(?:both|all)(?:\s+at)?\s+(${VER})`,
	"y",
);
const GRADLE = new RegExp(
	String.raw`\b([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+):([a-z0-9_.-]+):(${VER})\b`,
	"gi",
);
const ON_CRATES = new RegExp(
	String.raw`\b([a-z0-9_-]+)\s+on\s+crates\.io\s*\(\s*(${VER})`,
	"gi",
);

function sticky(re: RegExp | string, text: string, at: number) {
	const r = new RegExp(re instanceof RegExp ? re.source : re, "iy");
	r.lastIndex = at;
	return r.exec(text);
}
const stripV = (v: string) => v.replace(/^v/, "");

/** Docker: the cited fact is a push date — only "updated|pushed DATE" counts.
 * "(~1.11M pulls, 2026-09-01)" dates a pull-count read, not a push; treating
 * it as one made every actively-pushed image perpetually stale. */
function dockerDate(text: string, at: number): string | null {
	const win = text.slice(at, at + 160);
	return (
		win.match(new RegExp(String.raw`(?:updated|pushed)\s+(${DATE})`))?.[1] ??
		null
	);
}

export function parseClaims(note: string): Claim[] {
	const out: Claim[] = [];
	const push = (registry: Registry, name: string, cited: string) => {
		name = name.replace(/^docker\.io\//, "").toLowerCase();
		if (!out.some((c) => c.registry === registry && c.name === name))
			out.push({ registry, name, cited: stripV(cited) });
	};
	for (const [registry, lead] of LEAD) {
		lead.lastIndex = 0;
		for (let m = lead.exec(note); m; m = lead.exec(note)) {
			let at = m.index + m[0].length;
			const nm = sticky(NAME[registry], note, at);
			// "matches the npm version (v4.0.2 latest)" — a word, not a package
			if (!nm || /^(?:version|versions|install|run|i)$/i.test(nm[0])) continue;
			if (registry === "docker") {
				const d = dockerDate(note, at + nm[0].length);
				if (d) push(registry, nm[0], d);
				continue;
			}
			// name(, name)* (and name)? — each with its own version, or one
			// shared "— all 1.2.3" / "(both 1.2.3" version at the end
			const names = [nm[0]];
			at += nm[0].length;
			let ver = AFTER.map((re) => sticky(re, note, at)).find(Boolean);
			if (ver) {
				push(registry, nm[0], ver[1]);
				at += ver[0].length;
				for (;;) {
					const sep = sticky(CHAIN, note, at);
					const nn = sep && sticky(NAME[registry], note, at + sep[0].length);
					const nv =
						nn &&
						sep &&
						AFTER.slice(0, 2)
							.map((re) => sticky(re, note, at + sep[0].length + nn[0].length))
							.find(Boolean);
					if (!nn || !nv || !sep) break;
					push(registry, nn[0], nv[1]);
					at += sep[0].length + nn[0].length + nv[0].length;
				}
				continue;
			}
			for (;;) {
				const sep = sticky(CHAIN, note, at);
				const nn = sep && sticky(NAME[registry], note, at + sep[0].length);
				if (!nn || !sep) break;
				names.push(nn[0]);
				at += sep[0].length + nn[0].length;
			}
			ver =
				names.length > 1 ? (sticky(SHARED, note, at) ?? undefined) : undefined;
			if (ver) for (const n of names) push(registry, n, ver[1]);
		}
	}
	for (const m of note.matchAll(GRADLE)) push("maven", `${m[1]}:${m[2]}`, m[3]);
	for (const m of note.matchAll(ON_CRATES)) push("crates", m[1], m[2]);
	return out;
}

// ── registries (read-only) ──────────────────────────────────────────────────
async function get(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "User-Agent": UA, Accept: "application/json, text/xml" },
		signal: AbortSignal.timeout(15_000),
	});
	if (!res.ok) throw new Error(`${res.status} ${url}`);
	return res.text();
}
// biome-ignore lint/suspicious/noExplicitAny: registry payloads
const json = async (url: string): Promise<any> => JSON.parse(await get(url));

async function fetchLatest(c: Claim): Promise<Latest> {
	switch (c.registry) {
		case "npm": {
			const j = await json(
				`https://registry.npmjs.org/${c.name.replace("/", "%2F")}`,
			);
			const latest = j["dist-tags"].latest;
			return { latest, publishedAt: j.time?.[latest] ?? null };
		}
		case "crates": {
			const j = await json(`https://crates.io/api/v1/crates/${c.name}`);
			const latest = j.crate.max_stable_version ?? j.crate.max_version;
			const v = (j.versions ?? []).find(
				(x: { num: string }) => x.num === latest,
			);
			return { latest, publishedAt: v?.created_at ?? j.crate.updated_at };
		}
		case "pypi": {
			const j = await json(`https://pypi.org/pypi/${c.name}/json`);
			return {
				latest: j.info.version,
				publishedAt: j.urls?.[0]?.upload_time_iso_8601 ?? null,
			};
		}
		case "pub": {
			const j = await json(`https://pub.dev/api/packages/${c.name}`);
			return { latest: j.latest.version, publishedAt: j.latest.published };
		}
		case "packagist": {
			const j = await json(`https://repo.packagist.org/p2/${c.name}.json`);
			const p = j.packages[c.name][0];
			return { latest: p.version, publishedAt: p.time };
		}
		case "maven": {
			// search.maven.org's index answered numFound:0 for
			// network.lightsail:stellar-sdk (2026-09-02); maven-metadata.xml on
			// repo1 is the authoritative file every deploy regenerates.
			const [g, a] = c.name.split(":");
			const xml = await get(
				`https://repo1.maven.org/maven2/${g.replace(/\./g, "/")}/${a}/maven-metadata.xml`,
			);
			const latest = xml.match(/<(?:release|latest)>([^<]+)</)?.[1];
			if (!latest) throw new Error(`no release in metadata for ${c.name}`);
			const t = xml.match(/<lastUpdated>(\d{14})</)?.[1];
			return {
				latest,
				publishedAt: t
					? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(8, 10)}:${t.slice(10, 12)}:${t.slice(12)}Z`
					: null,
			};
		}
		case "docker": {
			const j = await json(`https://hub.docker.com/v2/repositories/${c.name}/`);
			return {
				latest: String(j.last_updated).slice(0, 10),
				publishedAt: j.last_updated,
			};
		}
	}
}

type Verdict = "current" | "stale" | "unchecked";
function verdict(c: Claim, r: Latest | null, asOf: string): Verdict {
	if (!r) return "unchecked";
	if (stripV(r.latest) === c.cited) return "current";
	// A newer version that predates asOf means the note already described a
	// superseded state on its date — still true as written.
	// >= : asOf is a date, so a same-day publish with a differing version
	// means the note predates the release (else it would cite it).
	return r.publishedAt && r.publishedAt.slice(0, 10) >= asOf
		? "stale"
		: "current";
}

// ── main ────────────────────────────────────────────────────────────────────
async function main(): Promise<number> {
	const rows: Array<{ repo: string; asOf: string; claim: Claim }> = [];
	let notes = 0;
	let withClaim = 0;
	for (const [repo, list] of Object.entries(REPO_KNOWLEDGE_NOTES)) {
		for (const n of list) {
			if (n.visibility === "internal") continue;
			notes += 1;
			const claims = parseClaims(n.note);
			if (claims.length) withClaim += 1;
			for (const claim of claims) rows.push({ repo, asOf: n.asOf, claim });
		}
	}
	console.log(
		`public notes ${notes} · with a parseable registry claim ${withClaim} · without ${notes - withClaim} (not a finding) · claims ${rows.length}\n`,
	);

	// one fetch per registry:name, ≤4 in flight
	const keys = [
		...new Set(rows.map((r) => `${r.claim.registry}:${r.claim.name}`)),
	];
	const latest = new Map<string, Latest | null>();
	const queue = [...keys];
	await Promise.all(
		Array.from({ length: 4 }, async () => {
			for (let k = queue.shift(); k; k = queue.shift()) {
				const c = rows.find((r) => `${r.claim.registry}:${r.claim.name}` === k);
				if (!c) continue;
				try {
					latest.set(k, await fetchLatest(c.claim));
				} catch (e) {
					latest.set(k, null);
					console.error(`  could not check ${k}: ${(e as Error).message}`);
				}
			}
		}),
	);

	const counts = { current: 0, stale: 0, unchecked: 0 };
	const failures: NightlyFailure[] = [];
	console.log(
		`${"repo".padEnd(44)} ${"registry".padEnd(9)} ${"name".padEnd(44)} ${"cited → latest".padEnd(28)} ${"published".padEnd(10)} verdict`,
	);
	for (const { repo, asOf, claim } of rows) {
		const r = latest.get(`${claim.registry}:${claim.name}`) ?? null;
		const v = verdict(claim, r, asOf);
		counts[v] += 1;
		console.log(
			`${repo.padEnd(44)} ${claim.registry.padEnd(9)} ${claim.name.padEnd(44)} ${`${claim.cited} → ${r?.latest ?? "?"}`.padEnd(28)} ${(r?.publishedAt ?? "").slice(0, 10).padEnd(10)} ${v}`,
		);
		if (v === "stale" && r)
			failures.push({
				probe: `note-stale:${repo}:${claim.registry}:${claim.name}`,
				note: `note (asOf ${asOf}) cites ${claim.cited}; registry latest is ${r.latest} (published ${(r.publishedAt ?? "?").slice(0, 10)})`,
				surface: "code",
			});
	}
	// Written on clean runs too — an empty array is the auto-clear signal.
	writeNightlyFindings("note-freshness", failures);
	console.log(
		`\nnotes ${notes} · claims ${rows.length} · current ${counts.current} · stale ${counts.stale} · unchecked ${counts.unchecked}`,
	);
	return counts.current + counts.stale === 0 ? 1 : 0;
}

/** The smallest check that fails if the parser regresses — real note fragments. */
function selfTest() {
	const cases: Array<[string, Claim[]]> = [
		[
			"npm @x402/stellar — 2.24.0 (2026-08-27; 18 versions since 2026-03-10)",
			[{ registry: "npm", name: "@x402/stellar", cited: "2.24.0" }],
		],
		[
			"npm @creit.tech/stellar-wallets-kit (2.6.0, 2026-08-28; first published 2024-01-12) and JSR @creit-tech/stellar-wallets-kit (2.6.0)",
			[
				{
					registry: "npm",
					name: "@creit.tech/stellar-wallets-kit",
					cited: "2.6.0",
				},
			],
		],
		[
			"npm @stellarpay-sdk/core, @stellarpay-sdk/client and @stellarpay-sdk/mcp — all 0.1.0 (2026-08-04)",
			["core", "client", "mcp"].map((n) => ({
				registry: "npm" as const,
				name: `@stellarpay-sdk/${n}`,
				cited: "0.1.0",
			})),
		],
		[
			"npm soroban-client is deprecated and frozen at 1.0.1 (2024-01-03; 33 versions)",
			[{ registry: "npm", name: "soroban-client", cited: "1.0.1" }],
		],
		[
			"crates.io: loam-cli 0.14.4, loam-sdk 0.6.16, loam-soroban-sdk 0.6.16, loam-sdk-macro 0.8.6 (2026-02-01)",
			[
				{ registry: "crates", name: "loam-cli", cited: "0.14.4" },
				{ registry: "crates", name: "loam-sdk", cited: "0.6.16" },
				{ registry: "crates", name: "loam-soroban-sdk", cited: "0.6.16" },
				{ registry: "crates", name: "loam-sdk-macro", cited: "0.8.6" },
			],
		],
		[
			"PyPI name is simply `soroban` (`pip install soroban`): 0.9.1 uploaded 2024-11-12",
			[{ registry: "pypi", name: "soroban", cited: "0.9.1" }],
		],
		[
			"Maven Central coordinates network.lightsail:stellar-sdk — 34 versions from 0.43.1 (2024-03-31) to 5.0.0 (2026-09-01)",
			[
				{
					registry: "maven",
					name: "network.lightsail:stellar-sdk",
					cited: "5.0.0",
				},
			],
		],
		[
			"Docker image openzeppelin/openzeppelin-monitor (Docker Hub, registered 2025-04-04): tags v1.6.0 / 1.6.0 / latest pushed 2026-07-16",
			[
				{
					registry: "docker",
					name: "openzeppelin/openzeppelin-monitor",
					cited: "2026-07-16",
				},
			],
		],
		[
			"README install: `npm install rango-sdk --save`. https://www.npmjs.com/package/rango-sdk",
			[],
		],
		[
			"not on npm. Docker Hub image stellar/stellar-core (~1.22M pulls). not on crates.io, no releases",
			[],
		],
		[
			"Published on JSR, not npm: @creit-tech/stellar-sep-0005 — 0.2.0 (2025-08-17). Docker Hub image stellar/quickstart (~1.11M pulls, 2026-09-01)",
			[],
		],
		["a GitHub release whose tag matches the npm version (v4.0.2 latest)", []],
	];
	for (const [note, want] of cases)
		assert.deepEqual(parseClaims(note), want, note);
	console.log(`self-test ok (${cases.length} cases)`);
}

if (process.argv.includes("--self-test")) selfTest();
else
	main()
		.then((code) => process.exit(code))
		.catch((e) => {
			console.error("FATAL:", e);
			process.exit(1);
		});
