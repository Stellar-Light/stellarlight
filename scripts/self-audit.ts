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

	// sls-043 award-facts lock: the official Band Protocol record
	// (communityfund.stellar.org/project/band-protocol-2ob) shows exactly ONE
	// award — SCF #16, $60K. The canonical row once carried an unsourced
	// #41/$100K; red here means award facts drifted from the official page.
	try {
		const d = await j("/api/projects/search?q=band+protocol+oracle&limit=10");
		const band = (d.projects ?? []).find(
			(p: { slug: string }) => p.slug === "band",
		);
		if (!band) bad("band award lock", "slug 'band' not in top-10");
		else if (
			band.scfAwarded === true &&
			band.scfTotalAwardedUSD === 60000 &&
			JSON.stringify(band.scfAwardedRounds) === "[16]"
		)
			ok("band award facts match the official record (SCF #16, $60K)");
		else
			bad(
				"band award lock (sls-043)",
				`served scfAwarded=${band.scfAwarded} total=${band.scfTotalAwardedUSD} rounds=${JSON.stringify(band.scfAwardedRounds)}; official = awarded, $60000, [16]`,
			);
	} catch (err) {
		bad("band award lock", `fetch failed: ${String(err)}`);
	}

	// sls-033 (#519) wallet-taxonomy fixtures: StellarTerm is a DEX/trading
	// client, NOT a wallet product — it must never (re)gain the Wallet type
	// (it appears in wallet-oriented SEMANTIC results, which is fine; the
	// exact-type enumeration is the contract). And the type=Wallet enumeration
	// must not regress to duplicate-name rows (the observed duplicate Stellar
	// Passport records under different slugs).
	try {
		const d = await j("/api/projects/search?q=stellarterm&limit=5");
		const st = (d.projects ?? []).find(
			(p: { slug: string }) => p.slug === "stellarterm",
		);
		if (!st) bad("stellarterm fixture (sls-033)", "slug not found in top-5");
		else if ((st.types ?? []).includes("Wallet"))
			bad(
				"stellarterm fixture (sls-033)",
				`typed Wallet — it is a DEX/trading client, not a wallet product (types=${JSON.stringify(st.types)})`,
			);
		else if ((st.types ?? []).includes("DEX"))
			ok("stellarterm typed DEX, not Wallet (sls-033 fixture)");
		else
			warn(
				"stellarterm fixture (sls-033)",
				`types=${JSON.stringify(st.types)} — DEX expected`,
			);
	} catch (err) {
		bad("stellarterm fixture (sls-033)", `fetch failed: ${String(err)}`);
	}
	try {
		const d = await j("/api/projects/search?type=Wallet&limit=100");
		const byName = new Map<string, string[]>();
		for (const p of d.projects ?? []) {
			const k = String(p.name ?? "").toLowerCase();
			byName.set(k, [...(byName.get(k) ?? []), p.slug]);
		}
		const dups = [...byName.entries()].filter(([, slugs]) => slugs.length > 1);
		if (dups.length)
			bad(
				"wallet-enum duplicates (sls-033)",
				dups
					.map(([n, slugs]) => `'${n}' served twice: ${slugs.join(", ")}`)
					.join("; "),
			);
		else ok("type=Wallet enumeration has no duplicate-name rows (sls-033)");
	} catch (err) {
		bad("wallet-enum duplicates (sls-033)", `fetch failed: ${String(err)}`);
	}

	// sls-034 (#518) exact-asset lookups: each named stablecoin/asset CODE must
	// resolve to its own Asset-category record — never only the issuer/org row
	// (Circle≠USDC-class conflation). usdy warns (not fails) until the seed
	// wave (curate-projects SEEDS) executes; PROMOTE to hard once live.
	for (const code of ["pyusd", "eurau", "mgusd", "ylds", "usdy"]) {
		try {
			const d = await j(`/api/projects/search?q=${code}&limit=5`);
			const row = (d.projects ?? []).find(
				(p: { slug: string }) => p.slug === code,
			);
			if (row?.category === "Asset")
				ok(`asset row '${code}' resolves as its own Asset record (sls-034)`);
			else if (row)
				bad(
					"asset-row fixture (sls-034)",
					`'${code}' resolves but category=${row.category} (Asset expected)`,
				);
			else if (code === "usdy")
				warn(
					"asset-row fixture (sls-034)",
					"usdy Asset row absent — seed wave pending (curate-projects SEEDS); promote to hard-fail once executed",
				);
			else
				bad(
					"asset-row fixture (sls-034)",
					`no '${code}' Asset row in top-5 for q=${code} — exact-asset lookup depends on an issuer/org row again`,
				);
		} catch (err) {
			bad("asset-row fixture (sls-034)", `fetch failed: ${String(err)}`);
		}
	}

	// sls-045 rfps row/count contract: synthetic scf-round rows must be
	// discriminated (rowType/synthetic) and the counts must be internally
	// consistent — open counts BRIEFS, returned counts ROWS incl. synthetic.
	try {
		const d = await j("/api/rfps?status=open");
		const rows: Array<{ rowType?: string; synthetic?: boolean }> = d.rfps ?? [];
		const untyped = rows.filter(
			(r) => r.rowType !== "rfp" && r.rowType !== "scf-round",
		);
		const briefs = rows.filter((r) => r.rowType === "rfp");
		const synth = rows.filter((r) => r.synthetic === true);
		if (untyped.length)
			bad(
				"rfps row contract (sls-045)",
				`${untyped.length} rows without a rowType discriminator`,
			);
		else if (synth.some((r) => r.rowType !== "scf-round"))
			bad("rfps row contract (sls-045)", "synthetic row not typed scf-round");
		else
			ok(
				`rfps rows discriminated (${briefs.length} rfp + ${synth.length} scf-round)`,
			);
		const c = d.meta?.counts ?? {};
		if (c.returned !== rows.length)
			bad(
				"rfps counts (sls-045)",
				`counts.returned=${c.returned} but ${rows.length} rows returned`,
			);
		else if (c.returned === c.matched && briefs.length !== c.open)
			bad(
				"rfps counts (sls-045)",
				`unpaginated open read: ${briefs.length} rfp-typed rows ≠ counts.open=${c.open} — brief/row bookkeeping drifted`,
			);
		else ok("rfps counts consistent (open=briefs, returned=rows)");
	} catch (err) {
		bad("rfps contract (sls-045)", `fetch failed: ${String(err)}`);
	}

	// sls-042 population parity: clusters and analyze aggregate the SAME
	// active-project population — per-category sizes and funded counts must
	// agree (small tolerance: the two reads aren't atomic). Before the fix,
	// clusters silently truncated at 500 of ~840 and the two endpoints named
	// different funded-share winners.
	try {
		const [an, cl] = await Promise.all([
			j("/api/analyze?dimension=categories"),
			j("/api/clusters?dimension=category&minSize=1"),
		]);
		const aPop = an.meta?.population?.id;
		const cPop = cl.meta?.population?.id;
		if (!aPop || aPop !== cPop)
			bad(
				"clusters⇄analyze population (sls-042/048)",
				`population ids differ or missing: analyze=${aPop} clusters=${cPop}`,
			);
		else if (cl.meta?.population?.truncated)
			bad(
				"clusters truncation (sls-042)",
				`clusters population truncated: included=${cl.meta.population.included} < totalAvailable=${cl.meta.population.totalAvailable}`,
			);
		else {
			const aByCat = new Map<string, { n: number; f: number }>(
				(an.categories?.distribution ?? []).map(
					(r: {
						category: string;
						projectCount: number;
						scfFundedCount: number;
					}) => [r.category, { n: r.projectCount, f: r.scfFundedCount }],
				),
			);
			let drift = "";
			for (const c of cl.clusters ?? []) {
				const a = aByCat.get(c.key);
				if (!a) continue; // clusters bucket only projects WITH a category
				const tol = Math.max(2, Math.ceil(a.n * 0.02));
				if (
					Math.abs(a.n - c.size) > tol ||
					Math.abs(a.f - c.scfFundedCount) > tol
				) {
					drift = `${c.key}: analyze ${a.n}/${a.f} vs clusters ${c.size}/${c.scfFundedCount}`;
					break;
				}
			}
			if (drift) bad("clusters⇄analyze parity (sls-042)", drift);
			else ok("clusters⇄analyze category sizes/funded counts agree");
		}
	} catch (err) {
		bad("clusters⇄analyze parity", `fetch failed: ${String(err)}`);
	}

	// sls-046/047 repo classification + ranking evidence: stellar-core must
	// never serve isDeployableContract=true, and a Stellar-scoped topic query
	// must not rank a no-evidence toolchain above Stellar-evidenced repos.
	try {
		const d = await j("/api/repos/search?q=consensus&limit=5");
		const core = (d.repos ?? []).find(
			(r: { fullName: string }) => r.fullName === "stellar/stellar-core",
		);
		if (!core)
			warn("stellar-core classification", "not in top-5 for q=consensus");
		else if (
			core.codeVerified &&
			core.codeVerified.isDeployableContract !== false
		)
			bad(
				"stellar-core classification (sls-046)",
				`isDeployableContract=${core.codeVerified.isDeployableContract} — core protocol software served as a deployable contract`,
			);
		else ok("stellar-core served as NOT a deployable contract");
	} catch (err) {
		bad("stellar-core classification", `fetch failed: ${String(err)}`);
	}
	try {
		const d = await j("/api/repos/search?q=zero-knowledge&limit=5");
		const rows: Array<{ fullName: string; stellarEvidence?: string }> =
			d.repos ?? [];
		const hasEvidenced = rows.some(
			(r) =>
				r.stellarEvidence === "code-verified" ||
				r.stellarEvidence === "sdf-org" ||
				r.stellarEvidence === "curated",
		);
		if (rows.length && hasEvidenced && rows[0].stellarEvidence === "none")
			bad(
				"repo ranking evidence (sls-047)",
				`top-1 ${rows[0].fullName} has stellarEvidence=none while Stellar-evidenced repos rank below it`,
			);
		else ok("zero-knowledge top-1 is Stellar-evidenced (or none available)");
	} catch (err) {
		bad("repo ranking evidence (sls-047)", `fetch failed: ${String(err)}`);
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
		{
			// sls-050: Vibrant → Vesseo rename continuity. The OLD name must keep
			// resolving to the renamed record (synonym-mapped, not dependent on
			// the description happening to contain "formerly Vibrant").
			q: "vibrant wallet",
			match: "vesseo",
			topK: 10,
			why: "sls-050: rename continuity — old brand name reaches the current record",
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

	// 4b. Semantic-fallback honesty (audit R1, openapi@1.7.9) — a response
	//     built entirely from the vector fallback must SAY so: matchMode
	//     "semantic" (never "strict"/"majority" over pure guesses) and no
	//     via:"semantic" row scoring above the 0.7 cap / "high" label. Guards
	//     the confident-wrong-answer class for agent consumers.
	console.log("\n── Semantic-fallback honesty ──");
	// Queries with no keyword hit in the directory — they exercise the
	// zero-keyword rescue rung. If a probe starts keyword-matching (record
	// added, retrieval improves), it passes vacuously; two probes of different
	// shapes keep the guard non-vacuous in practice.
	const SEMANTIC_PROBES = [
		"fonbank", // audit R1 original: not in directory; fallback served veur/boss-pay as "strict" 0.9+
		"charge autonomous AI agents per api call", // conceptual phrasing, x402-class
	];
	for (const probe of SEMANTIC_PROBES) {
		try {
			const d = await j(
				`/api/projects/search?q=${encodeURIComponent(probe)}&limit=10`,
			);
			const rows: Array<{
				via?: string;
				confidence?: { score?: number; label?: string };
			}> = d.projects ?? [];
			const semRows = rows.filter((p) => p.via === "semantic");
			const allSemantic = semRows.length > 0 && semRows.length === rows.length;
			if (allSemantic && d.meta?.matchMode !== "semantic")
				bad(
					`semantic honesty: matchMode ("${probe}")`,
					`all ${rows.length} rows are via:semantic but matchMode=${d.meta?.matchMode} (must be "semantic")`,
				);
			else
				ok(
					`semantic matchMode honest for "${probe}" (${semRows.length}/${rows.length} semantic, matchMode=${d.meta?.matchMode})`,
				);
			const overconfident = semRows.filter(
				(p) =>
					(p.confidence?.score ?? 0) > 0.7 || p.confidence?.label === "high",
			);
			if (overconfident.length)
				bad(
					`semantic honesty: confidence cap ("${probe}")`,
					`${overconfident.length} via:semantic row(s) above 0.7/"high" — the cap regressed`,
				);
			else if (semRows.length)
				ok(`semantic confidence capped ≤0.7 (${semRows.length} rows)`);
		} catch (err) {
			bad(`semantic honesty ("${probe}")`, `fetch failed: ${String(err)}`);
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

	// ---- Event recall: is the LATEST protocol/core release actually servable? ----
	// 2026-07-19: Protocol 27 "Zipper" reached mainnet (vote 07-08) and no
	// check noticed the corpus couldn't answer "what's the latest protocol
	// release" — source-freshness lanes only prove crons ran, not that a real
	// ecosystem EVENT is retrievable. This lane pins the class: fetch the
	// newest stable stellar-core tag from GitHub, then require our own
	// /api/research (source=release) to serve a doc for it. 5-day grace for
	// the daily refresh to pick a brand-new release up.
	try {
		const gh = await fetch(
			"https://api.github.com/repos/stellar/stellar-core/releases?per_page=5",
			{ headers: { "user-agent": "stellarlight-self-audit" } },
		);
		if (!gh.ok) throw new Error(`GitHub HTTP ${gh.status}`);
		const rels = (
			(await gh.json()) as Array<{
				tag_name: string;
				published_at: string;
				prerelease: boolean;
				draft: boolean;
			}>
		).filter((r) => !r.prerelease && !r.draft);
		const latest = rels[0];
		if (!latest) {
			warn("event recall", "GitHub returned no stable stellar-core releases");
		} else {
			const ageDays =
				(Date.now() - new Date(latest.published_at).getTime()) / 86_400_000;
			const res = await j(
				`/api/research?q=${encodeURIComponent(`stellar-core ${latest.tag_name}`)}&source=release&limit=5`,
			);
			const hit = (res.results ?? []).some(
				(r: { title?: string; url?: string }) =>
					(r.title ?? "").includes(latest.tag_name) ||
					(r.url ?? "").includes(latest.tag_name),
			);
			if (hit)
				ok(
					`event recall: stellar-core ${latest.tag_name} servable via source=release`,
				);
			else if (ageDays < 5)
				warn(
					"event recall",
					`stellar-core ${latest.tag_name} (${ageDays.toFixed(1)}d old) not yet in the release corpus — inside the 5d ingest grace`,
				);
			else
				bad(
					"event recall",
					`stellar-core ${latest.tag_name} released ${ageDays.toFixed(0)}d ago but /api/research?source=release cannot serve it — the release ingest is stalled or broken (the Protocol-27 class)`,
				);
		}
	} catch (err) {
		warn("event recall", `check skipped: ${String(err)}`);
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
