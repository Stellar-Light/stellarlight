/**
 * Self-audit — the StellarLight data-quality Guard.
 *
 * Runs GROUNDED checks against the LIVE API (no DB/auth needed): liveness +
 * shape, sane counts, freshness thresholds, and ground-truth spot-checks
 * derived from facts we KNOW are true. It deliberately does NOT run adversarial
 * "find the worst" judging — that manufactures problems and causes over-
 * rotation (the repo's hard-won lesson). Exits non-zero on a HARD failure
 * (something an agent / Tyler would actually hit), so CI catches regressions
 * before they ship. Complements check-api-drift.ts (which asserts API ⇄ spec ⇄
 * docs consistency); this one guards the DATA behind the contract.
 *
 *   SCOUT_BASE=https://stellarlight.xyz npx tsx scripts/self-audit.ts
 *
 * Wired into CI (.github/workflows/self-audit.yml, daily + manual).
 */

const BASE = process.env.SCOUT_BASE || "https://stellarlight.xyz";

let fails = 0;
let warns = 0;
let passes = 0;
const ok = (n: string) => {
	passes++;
	console.log(`  ✓ ${n}`);
};
const warn = (n: string, d: string) => {
	warns++;
	console.log(`  ⚠ ${n} — ${d}`);
};
const bad = (n: string, d: string) => {
	fails++;
	console.log(`  ✗ ${n}\n      ${d}`);
};

// biome-ignore lint/suspicious/noExplicitAny: dynamic JSON
async function j(path: string): Promise<any> {
	// One retry on transient failure (review finding 21: a single network blip
	// across ~40 sequential fetches filed a spurious daily issue).
	for (let attempt = 0; ; attempt++) {
		try {
			const r = await fetch(`${BASE}${path}`, {
				headers: { "user-agent": "stellarlight-self-audit" },
			});
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			return await r.json();
		} catch (e) {
			if (attempt >= 1) throw e;
			await new Promise((res) => setTimeout(res, 3000));
		}
	}
}

async function main() {
	console.log(`Self-audit → ${BASE}\n`);

	// 1. Liveness + shape — every public endpoint returns and carries data.
	console.log("── Liveness + shape ──");
	const endpoints: Array<{ path: string; listKey?: string; min: number }> = [
		{
			path: "/api/projects/search?q=stellar&limit=5",
			listKey: "projects",
			min: 1,
		},
		{ path: "/api/repos/search?q=soroban&limit=5", listKey: "repos", min: 1 },
		{ path: "/api/research?q=soroban&limit=3", listKey: "results", min: 1 },
		{ path: "/api/partners?all=1&limit=100", listKey: "partners", min: 20 },
		{ path: "/api/builders?limit=20", listKey: "builders", min: 20 },
		{ path: "/api/rfps", listKey: "rfps", min: 1 },
		{ path: "/api/clusters?dimension=types", listKey: "clusters", min: 5 },
		{ path: "/api/hackathons", listKey: "hackathons", min: 1 },
		{ path: "/api/skills", listKey: "skills", min: 5 },
		{ path: "/api/leaderboard", min: 0 },
	];
	for (const e of endpoints) {
		try {
			const d = await j(e.path);
			if (e.listKey) {
				const arr = d[e.listKey];
				const n = Array.isArray(arr) ? arr.length : -1;
				if (n < 0) bad(e.path, `missing/invalid '${e.listKey}' array`);
				else if (n < e.min)
					bad(e.path, `only ${n} ${e.listKey} (expected ≥${e.min})`);
				else ok(`${e.path} → ${n} ${e.listKey}`);
			} else {
				ok(`${e.path} → ${Object.keys(d).length} keys`);
			}
		} catch (err) {
			bad(e.path, `fetch failed: ${String(err)}`);
		}
	}

	// 2. Freshness thresholds — a stalled cron shows up as a stale source.
	console.log("\n── Freshness ──");
	let status: any = {};
	try {
		status = await j("/api/status");
	} catch (e) {
		bad("/api/status", `fetch failed after retry: ${String(e)}`);
	}
	const sources: Array<{ name: string; lastUpdatedAt: string | null }> =
		status.sources ?? [];
	const MAX_AGE_DAYS: Record<string, number> = {
		projects: 14,
		repos: 7,
		builders: 14,
		ecosystemStats: 45,
	};
	const now = Date.now();
	for (const s of sources) {
		const max = MAX_AGE_DAYS[s.name];
		if (!max) continue;
		if (!s.lastUpdatedAt) {
			warn(s.name, "no lastUpdatedAt");
			continue;
		}
		const ageDays = (now - new Date(s.lastUpdatedAt).getTime()) / 86_400_000;
		if (ageDays > max)
			bad(
				`${s.name} freshness`,
				`${ageDays.toFixed(1)}d old (max ${max}d) — refresh cron may be stalled`,
			);
		else ok(`${s.name} fresh (${ageDays.toFixed(1)}d)`);
	}

	// 3. Served-count sanity — encodes the lesson: hackathons `curated: 0` is BY
	//    DESIGN (served live via DoraHacks). Guard the SERVED total, not the
	//    curated sub-count, so this never false-alarms as "0 hackathons".
	console.log("\n── Served-count sanity (curated 0 ≠ broken) ──");
	try {
		const hk = await j("/api/hackathons");
		const served = (hk.hackathons ?? []).length;
		if (served < 1)
			bad("hackathons served", "0 served — the DoraHacks fallback may be down");
		else
			ok(
				`hackathons served ${served} (curated ${hk.meta?.counts?.curated ?? "?"}, live fallback OK)`,
			);
	} catch (err) {
		bad("hackathons served", `fetch failed: ${String(err)}`);
	}

	// 4. Ground truth — facts we KNOW are true (an answer key, not an opinion).
	console.log("\n── Ground truth ──");
	try {
		const audit = await j("/api/partners?type=audit-firm&limit=20");
		const names = (audit.partners ?? []).map((p: { name: string }) =>
			p.name.toLowerCase(),
		);
		for (const known of ["halborn", "certora", "ottersec"]) {
			if (names.some((n: string) => n.includes(known)))
				ok(`partners: ${known} present under type=audit-firm`);
			else
				bad(
					"partners ground truth",
					`known audit firm '${known}' missing from type=audit-firm`,
				);
		}
	} catch (err) {
		bad("partners ground truth", `fetch failed: ${String(err)}`);
	}
	try {
		const proj = await j("/api/projects/search?q=blend&limit=5");
		if ((proj.projects ?? []).some((p: { slug: string }) => p.slug === "blend"))
			ok("projects: 'blend' resolves for q=blend");
		else
			bad(
				"projects ground truth",
				"known project 'blend' not found for q=blend",
			);
	} catch (err) {
		bad("projects ground truth", `fetch failed: ${String(err)}`);
	}

	// Bridge corridor guard (2026-07-09): every Bridge-typed project must
	// carry a non-empty supportedNetworks — an empty list is the
	// omission-equals-negation trap that made Solana/EVM corridor queries
	// miss real launched bridges (Rozo/Helix class). Chain lists themselves
	// are curated in scripts/data/curate-projects.ts SUPPORTED_NETWORKS.
	try {
		const br = await j("/api/projects/search?q=bridge&limit=20");
		const bridges = (br.projects ?? []).filter(
			(p: { types?: string[] }) =>
				Array.isArray(p.types) && p.types.includes("Bridge"),
		);
		const empty = bridges.filter(
			(p: { supportedNetworks?: string[] }) =>
				!Array.isArray(p.supportedNetworks) || !p.supportedNetworks.length,
		);
		if (!bridges.length)
			bad("bridge corridors", "no Bridge-typed rows for q=bridge");
		else if (empty.length)
			bad(
				"bridge corridors",
				`${empty.length} Bridge-typed project(s) with EMPTY supportedNetworks: ${empty.map((p: { slug: string }) => p.slug).join(", ")} — add verified chains to SUPPORTED_NETWORKS`,
			);
		else
			ok(
				`bridge corridors: ${bridges.length} Bridge-typed rows all carry supportedNetworks`,
			);
	} catch (err) {
		bad("bridge corridors", `fetch failed: ${String(err)}`);
	}

	// Emir's demo class (2026-07-09): if a round is in Submission, /api/rfps
	// must serve it as a first-class OPEN row — meta-only placement made a
	// row-reading agent conclude "nothing is open". Guard both directions of
	// the contract: phase says Submission ⇔ an open scf-round row exists.
	try {
		const rf = await j("/api/rfps?status=open");
		const round = rf.meta?.scfRound;
		const openRoundRows = (rf.rfps ?? []).filter(
			(r: { id?: string; status?: string }) =>
				String(r.id ?? "").startsWith("scf-round-") && r.status === "open",
		);
		const inSubmission = /submission/i.test(String(round?.currentPhase ?? ""));
		if (inSubmission && openRoundRows.length === 0)
			bad(
				"rfps open round",
				`scfRound says '${round.currentPhase}' but no open scf-round row served — the Emir miss regressed`,
			);
		else if (!inSubmission && openRoundRows.length > 0)
			bad(
				"rfps open round",
				"open scf-round row served while no round is in Submission — stale open call",
			);
		else
			ok(
				`rfps open round: phase='${round?.currentPhase ?? "none"}' ⇔ ${openRoundRows.length} open round row(s)`,
			);
	} catch (err) {
		bad("rfps open round", `fetch failed: ${String(err)}`);
	}

	// F6 guard (lessons class 23): wallet/protocol partners must be VISIBLE
	// under the default quality bar — type=wallet returning 0 read as "none
	// exist" while 5 sat behind null taglines. filteredOut discloses hidden
	// rows; this asserts the marquee types actually surface.
	try {
		for (const [ptype, min] of [
			["wallet", 3],
			["protocol", 3],
		] as const) {
			const pr = await j(`/api/partners?type=${ptype}`);
			const n = pr.meta?.counts?.returned ?? 0;
			const hidden = pr.meta?.counts?.filteredOut ?? 0;
			if (n < min)
				bad(
					`partners ${ptype} visibility`,
					`type=${ptype} returned ${n} (< ${min}) with ${hidden} filtered out — quality bar re-hiding marquee partners`,
				);
			else ok(`partners ${ptype} visibility: ${n} visible, ${hidden} filtered`);
		}
	} catch (err) {
		bad("partners visibility", `fetch failed: ${String(err)}`);
	}

	// 5. Known-item recall — the answer to "how do we catch important misses?"
	//    (Tyler, raven#8: Etherfuse, SushiSwap). A prose-only search silently
	//    DROPS a well-known entity when a category/corridor query is phrased in
	//    vocabulary its description doesn't literally contain. Precision evals
	//    can't see a recall hole — you have to assert the KNOWN-GOOD entity is
	//    present for its natural query. This is a growing answer key: every miss
	//    Tyler (or our own dogfooding) surfaces becomes a permanent regression
	//    guard here. `match` is substring on name/slug; `topK` is how deep the
	//    entity may sit and still count (recall, not #1 ranking).
	console.log("\n── Known-item recall (category/corridor misses) ──");
	const RECALL: Array<{
		q: string;
		match: string;
		topK: number;
		why: string;
	}> = [
		{
			q: "Mexico on-ramp fiat MXN peso deposit anchor",
			match: "etherfuse",
			topK: 20,
			why: "sls-018: coverage serves Mexico/MXN; prose is about Stablebonds",
		},
		{
			// sls-019: type=DEX record whose prose says "liquidity provision" (not
			// "pool") was dropped from category queries by strict-AND. It's now
			// retrievable; this asserts a distinctive-but-natural DEX query keeps
			// it high. (On the maximally-generic "dex amm swap liquidity pool" it's
			// retrieved but ranks low — new-to-Stellar, no local prominence — which
			// is a ranking axis, not recall; the exact admission rule is unit-tested.)
			q: "AMM perpetuals trading multichain exchange",
			match: "sushi",
			topK: 15,
			why: "sls-019: type=DEX category recall (perpetuals is distinctive to it)",
		},
		{
			q: "AMM decentralized exchange Soroban",
			match: "soroswap",
			topK: 20,
			why: "flagship Soroban AMM — control that must never regress",
		},
	];
	for (const r of RECALL) {
		try {
			const d = await j(
				`/api/projects/search?q=${encodeURIComponent(r.q)}&limit=${r.topK}`,
			);
			const names = (d.projects ?? []).map(
				(p: { name?: string; slug?: string }) =>
					`${p.name ?? ""} ${p.slug ?? ""}`.toLowerCase(),
			);
			if (names.some((n: string) => n.includes(r.match)))
				ok(`recall: '${r.match}' surfaces for "${r.q}"`);
			else
				bad(
					`recall miss: '${r.match}'`,
					`absent from top-${r.topK} of "${r.q}" (${r.why}). ${(d.projects ?? []).length} returned, matchMode=${d.meta?.matchMode}`,
				);
		} catch (err) {
			bad(`recall: '${r.match}'`, `fetch failed: ${String(err)}`);
		}
	}

	// 5. Advertised versions exist — every npm package version the LIVE changelog
	//    names must actually be installable. Encodes the 2026-07-08 lesson: the
	//    changelog listed scout-mcp@1.1.8 for ~1h while the publish was blocked on
	//    an expired token — an agent reading the changelog in that window would
	//    npm-install a 404. (SHIPPING.md verify-before-advertise, mechanized.)
	console.log("\n── Advertised versions exist on npm ──");
	try {
		const cl = await j("/api/changelog");
		const entries: Array<{ version?: string }> =
			cl.changelog ?? cl.entries ?? [];
		// Short names used by older entries → their scoped npm packages.
		const SCOPE: Record<string, string> = {
			"scout-mcp": "@stellar-light/scout-mcp",
			"api-client": "@stellar-light/api-client",
		};
		const wanted = new Map<string, string>(); // "pkg@ver" → pkg,ver checked
		for (const e of entries) {
			if (!e.version) continue;
			for (const tok of e.version.split(",").map((s) => s.trim())) {
				// "openapi 1.6.1" is the SPEC version, not an npm package — skip.
				if (!tok || tok.startsWith("openapi ")) continue;
				const at = tok.lastIndexOf("@");
				if (at <= 0) continue;
				const name = SCOPE[tok.slice(0, at)] ?? tok.slice(0, at);
				const ver = tok.slice(at + 1);
				if (name.startsWith("@stellar-light/") && ver)
					wanted.set(`${name}@${ver}`, "");
			}
		}
		if (wanted.size === 0)
			warn("advertised versions", "no npm versions named in changelog");
		for (const key of wanted.keys()) {
			const at = key.lastIndexOf("@");
			const name = key.slice(0, at);
			const ver = key.slice(at + 1);
			const r = await fetch(
				`https://registry.npmjs.org/${encodeURIComponent(name).replace("%2F", "/")}/${ver}`,
				{ headers: { "user-agent": "stellarlight-self-audit" } },
			);
			if (r.ok) ok(`npm: ${key} installable`);
			else
				bad(
					"advertised version missing",
					`changelog names ${key} but the npm registry returns ${r.status} — published changelog must never advertise an uninstallable version (verify-before-advertise)`,
				);
		}
	} catch (err) {
		bad("advertised versions", `check failed: ${String(err)}`);
	}

	console.log(
		`\n${fails ? "✗ FAIL" : "✓ PASS"} — ${passes} passed, ${warns} warnings, ${fails} failures`,
	);
	process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("Self-audit crashed:", e);
	process.exit(2);
});
