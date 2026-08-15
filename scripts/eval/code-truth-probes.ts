/**
 * Code-truth answer-key probes — the engine's question-level gate over the
 * scan-derived layers (interfaces, domains, deps, usage, depth, contracts).
 *
 * The existing repo-search probes freeze IDENTITY truth (query → repo).
 * These freeze CODE truth: what the serve paths must answer about code we
 * have scanned. Every expected value was read from the live DB on
 * 2026-08-15 (reflector row: codeDomains ["oracle"], 48 interface entries,
 * codeDepth 0.74, codeInUse.contracts 1, stellarDeps ["soroban-sdk"];
 * dependsOn=soroban-sdk true count 299). Probes 1-2 and the explain
 * interface/usage keys also GATE the 2026-08-15 serve-path fixes: the
 * pool-cap defect (filter-only browse capped candidates at the top-200 by
 * repoScore, serving [] for domain= and 9/299 for dependsOn=) and the
 * explain assembly missing contractInterface/stellarDeps/codeInUse.
 *
 *   npx tsx scripts/eval/code-truth-probes.ts
 *   BASE_URL=http://localhost:3000 npx tsx scripts/eval/code-truth-probes.ts
 *
 * Exits 1 on any miss. Cache-busted (repos CDN cache ~5min).
 */
const BASE = process.env.BASE_URL || "https://stellarlight.xyz";

const REFLECTOR = "reflector-network/reflector-contract";

type Probe = {
	name: string;
	path: string;
	// biome-ignore lint/suspicious/noExplicitAny: probe bodies are shape-checked inline
	test: (body: any) => string | null; // null = pass, string = failure detail
};

const lower = (v: unknown) => String(v ?? "").toLowerCase();

const PROBES: Probe[] = [
	{
		name: "filter-only browse: domain=oracle surfaces reflector",
		path: "/api/repos/search?domain=oracle&limit=50",
		test: (b) =>
			(b.repos ?? []).some((r: { fullName?: string }) =>
				lower(r.fullName).includes(REFLECTOR),
			)
				? null
				: `reflector absent from ${b.repos?.length ?? 0} rows`,
	},
	{
		name: "filter-only browse: dependsOn=soroban-sdk sees the whole corpus",
		path: "/api/repos/search?dependsOn=soroban-sdk&limit=50",
		test: (b) => {
			const total = b.meta?.counts?.total ?? 0;
			if (total < 250) return `total ${total} < 250 (pool-cap regression)`;
			return (b.repos ?? []).some((r: { fullName?: string }) =>
				lower(r.fullName).includes("blend-capital/blend-contracts"),
			)
				? null
				: "blend-contracts absent from served rows";
		},
	},
	{
		name: "filtered search: q=oracle&domain=oracle ranks reflector top-3",
		path: "/api/repos/search?q=oracle&domain=oracle&limit=3",
		test: (b) =>
			(b.repos ?? []).some((r: { fullName?: string }) =>
				lower(r.fullName).includes(REFLECTOR),
			)
				? null
				: `top-3 was [${(b.repos ?? []).map((r: { fullName?: string }) => r.fullName).join(", ")}]`,
	},
	{
		name: "explain: scan-derived layers all served",
		path: `/api/repos/explain?q=${encodeURIComponent("what price feeds does this oracle expose")}&repo=${REFLECTOR}`,
		test: (b) => {
			const cv = b.codeVerified;
			if (!cv) return "codeVerified null";
			if (!(cv.codeDomains ?? []).includes("oracle"))
				return `codeDomains ${JSON.stringify(cv.codeDomains)}`;
			if (!(typeof cv.codeDepth === "number" && cv.codeDepth > 0.5))
				return `codeDepth ${cv.codeDepth}`;
			const iface: string[] = cv.contractInterface ?? [];
			if (iface.length < 40)
				return `contractInterface ${iface.length} entries (< 40)`;
			if (!iface.some((s) => lower(s).includes("lastprice")))
				return "no lastprice entry in contractInterface";
			if (!(cv.stellarDeps ?? []).includes("soroban-sdk"))
				return `stellarDeps ${JSON.stringify(cv.stellarDeps)}`;
			const contracts = cv.codeInUse?.contracts;
			if (!(typeof contracts === "number" && contracts >= 1))
				return `codeInUse.contracts ${contracts}`;
			return null;
		},
	},
	{
		name: "contracts registry: reflector fully joined (id + audits + domain)",
		path: "/api/contracts?limit=20",
		test: (b) => {
			const row = (b.contracts ?? []).find(
				(c: { repo?: { fullName?: string } }) =>
					lower(c.repo?.fullName) === REFLECTOR,
			);
			if (!row) return "reflector row absent";
			const id = row.contractId ?? row.mainnetContractId ?? "";
			if (!String(id).startsWith("CAFJZQWSED6Y"))
				return `contractId ${id}`;
			if ((row.audits ?? []).length < 3)
				return `audits ${(row.audits ?? []).length} (< 3)`;
			return null;
		},
	},
	{
		name: "contracts registry: domain=oracle filter",
		path: "/api/contracts?domain=oracle&limit=20",
		test: (b) =>
			(b.contracts ?? []).some(
				(c: { repo?: { fullName?: string } }) =>
					lower(c.repo?.fullName) === REFLECTOR,
			)
				? null
				: "reflector absent from domain=oracle",
	},
	{
		name: "row plumbing floor: reflector scan state + usage persisted",
		path: `/api/repos?where%5BfullName%5D%5Bequals%5D=${encodeURIComponent(REFLECTOR)}&limit=1&depth=0`,
		test: (b) => {
			const d = b.docs?.[0];
			if (!d) return "row absent";
			if (d.codeScanState !== "scanned") return `codeScanState ${d.codeScanState}`;
			if (!(Array.isArray(d.codeDomains) && d.codeDomains.includes("oracle")))
				return `codeDomains ${JSON.stringify(d.codeDomains)}`;
			if (!((d.codeInUse?.subinvocations ?? 0) > 100_000))
				return `codeInUse.subinvocations ${d.codeInUse?.subinvocations}`;
			return null;
		},
	},
];

async function main(): Promise<number> {
	let failed = 0;
	for (const p of PROBES) {
		const url = `${BASE}${p.path}${p.path.includes("?") ? "&" : "?"}_probe=${Date.now()}`;
		let detail: string | null;
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`http ${res.status}`);
			detail = p.test(await res.json());
		} catch (err) {
			detail = `request failed: ${(err as Error).message}`;
		}
		if (detail === null) {
			console.log(`✓ ${p.name}`);
		} else {
			console.error(`✗ ${p.name} — ${detail}`);
			failed += 1;
		}
	}
	console.log(`\n${PROBES.length - failed}/${PROBES.length} code-truth probes passed`);
	return failed === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
