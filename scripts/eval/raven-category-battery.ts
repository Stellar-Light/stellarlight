/**
 * Through-Raven category battery — find the #39 class BEFORE a reviewer does.
 *
 *   RAVEN_TOKEN=… npx tsx scripts/eval/raven-category-battery.ts
 *
 * On 2026-08-21 an SDF reviewer asked Raven "what card services can I
 * integrate on Stellar?" and got a defunct issuer first, the Playbook's lead
 * provider missing, and a list padded with anchors, wallets and a card game.
 * Every failure was ours, and we learned about it from the reviewer. This
 * battery asks Raven the same SHAPE of question for every category — the
 * real gateway, not a simulation — and grades what comes back against the
 * Stellar Playbook's own provider lists.
 *
 * Two layers, because the reviewer's failure had two layers:
 *   ROUTING  — Raven `search` with the natural question: does a Scout
 *              directory op (searchProjects / getPartners) reach the top 8?
 *              On 2026-08-21 it did for 3 of 16 categories.
 *   ANSWER   — Raven `execute` calling scout.searchProjects the way an agent
 *              would: are Playbook providers in the top 10? is an Inactive
 *              row in the top 5? are untyped rows padding the list?
 *
 * THE REFERENCE IS NOT GROUND TRUTH. The Playbook is what SDF reviewers grade
 * answers against, which is why we grade against it too — but its directory
 * data is hand-maintained in a Cloudflare bucket and its repo's last commit
 * was 2026-02-06 (checked 2026-08-21); it still listed Kulipa three weeks
 * after the shutdown. So: a Playbook provider MISSING from our top-10 is a
 * recall question worth a look; a provider PRESENT in the Playbook is not
 * proof it is alive. The battery prints the repo's last-commit date so a
 * reader can weigh it. (Filed brunomlr/wallets-playbook#5 for Kulipa.)
 *
 * Report-only by default; `--gate` exits 1 on a red (an Inactive row in the
 * top 5 of any category, or a Playbook provider that IS in the directory but
 * missing from the top 10 for its own category). Never mutates anything.
 */

import "../load-env";

const RAVEN_URL = process.env.RAVEN_URL || "https://agents.stellar.buzz/mcp";
const TOKEN = process.env.RAVEN_TOKEN?.trim();
const GATE = process.argv.includes("--gate");

type Cat = {
	key: string;
	q: string;
	/** Playbook page whose external links are the reference providers. */
	playbook?: string;
	/** Scout op an agent should be routed to for this question. */
	wantOp: string[];
};

const CATEGORIES: Cat[] = [
	{
		key: "cards",
		q: "what card services I can integrate on stellar?",
		playbook: "tradfi-integrations/debit-cards",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "vba",
		q: "which providers offer virtual bank accounts tied to Stellar wallets?",
		playbook: "tradfi-integrations/virtual-bank-accounts",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "ramps",
		q: "which on/off ramp providers can I integrate so users can buy USDC or XLM with fiat?",
		playbook: "on-off-ramps/ramps-directory",
		wantOp: ["scout.getPartners", "scout.searchProjects"],
	},
	{
		key: "bridges",
		q: "what bridges can I use to move assets between Ethereum and Stellar?",
		playbook: "defi-on-stellar/bridges",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "dex",
		q: "which DEXes or AMMs on Stellar can I integrate token swaps with?",
		playbook: "exchanges-liquidity/decentralized-exchanges-directory",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "custody",
		q: "which custody or wallet-as-a-service providers support Stellar?",
		playbook: "wallets/custody",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "yield",
		q: "what tokenized real-world assets and yield-bearing tokens are live on Stellar?",
		playbook: "yield-earnings/yield-bearing-assets",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "cex",
		q: "which centralized exchanges list XLM and support Stellar deposits?",
		playbook: "exchanges-liquidity/centralized-exchanges-directory",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "oracles",
		q: "what price oracle can I use from my Soroban contract?",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "walletkit",
		q: "what wallet connection kit should I use to support every Stellar wallet in my dapp?",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "indexer",
		q: "what indexer or data API can I use to query Soroban contract events?",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "lending",
		q: "which lending protocols on Stellar can I build on top of?",
		wantOp: ["scout.searchProjects"],
	},
	{
		key: "audit",
		q: "which audit firms can audit my Soroban smart contract?",
		wantOp: ["scout.getPartners"],
	},
	{
		key: "payouts",
		q: "what disbursement or payout providers can I integrate on Stellar?",
		wantOp: ["scout.searchProjects", "scout.getPartners"],
	},
	{
		key: "kyc",
		q: "what KYC or identity verification providers can I integrate for a Stellar anchor?",
		wantOp: ["scout.getPartners", "scout.searchProjects"],
	},
	{
		key: "agentpay",
		q: "what can I use to let AI agents pay with stablecoins on Stellar?",
		wantOp: ["scout.searchProjects"],
	},
];

let rpcId = 0;
async function rpc(method: string, params: unknown): Promise<unknown> {
	rpcId++;
	const res = await fetch(RAVEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${TOKEN}`,
			"MCP-Protocol-Version": "2025-06-18",
			// Cloudflare bans the default node/python UA on this host.
			"User-Agent":
				"Mozilla/5.0 stellar-light-battery/1.0 (+https://stellarlight.xyz)",
		},
		body: JSON.stringify({ jsonrpc: "2.0", id: rpcId, method, params }),
	});
	const raw = await res.text();
	if (!res.ok) throw new Error(`raven ${res.status}: ${raw.slice(0, 200)}`);
	if (raw.trimStart().startsWith("{")) return JSON.parse(raw);
	const msgs = raw
		.split("\n")
		.filter((l) => l.startsWith("data:") && l.slice(5).trim().startsWith("{"))
		.map((l) => JSON.parse(l.slice(5).trim()));
	return msgs[msgs.length - 1];
}
async function tool(name: string, args: unknown): Promise<string> {
	const r = (await rpc("tools/call", { name, arguments: args })) as {
		result?: { content?: Array<{ type: string; text?: string }> };
	};
	return (r.result?.content ?? [])
		.filter((c) => c.type === "text")
		.map((c) => c.text ?? "")
		.join("\n");
}
/** Raven appends coaching text after the JSON; take the leading object. */
function leadingJson<T>(text: string): T {
	const i = text.indexOf("{");
	let depth = 0;
	for (let j = i; j < text.length; j++) {
		if (text[j] === "{") depth++;
		else if (text[j] === "}") depth--;
		if (depth === 0) return JSON.parse(text.slice(i, j + 1)) as T;
	}
	throw new Error("unbalanced JSON in execute result");
}
const reg = (host: string) =>
	host
		.toLowerCase()
		.replace(/^www\./, "")
		.split(".")
		.slice(-2)
		.join(".");

async function playbookDomains(page: string): Promise<string[]> {
	try {
		const html = await (
			await fetch(`https://stellarplaybook.com/${page}/`, {
				headers: { "User-Agent": "Mozilla/5.0" },
			})
		).text();
		const main = /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
		const skip =
			/stellarplaybook|github\.com\/brunomuler|developers\.stellar\.org|stellar\.org|github\.com\/stellar\/|x\.com|twitter\.com|linkedin|discord|t\.me|medium\.com|youtube/;
		const out: string[] = [];
		for (const m of main.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
			if (skip.test(m[1])) continue;
			const d = reg(new URL(m[1]).hostname);
			if (d && !out.includes(d)) out.push(d);
		}
		return out;
	} catch {
		return [];
	}
}

async function main() {
	if (!TOKEN) {
		console.error(
			"✗ RAVEN_TOKEN is not set — this battery runs against the REAL Raven gateway or not at all.",
		);
		process.exit(2);
	}
	console.log(
		`through-Raven category battery — ${CATEGORIES.length} categories · ${RAVEN_URL}`,
	);
	try {
		const c = (await (
			await fetch(
				"https://api.github.com/repos/brunomlr/wallets-playbook/commits/main",
				{ headers: { "User-Agent": "stellar-light-battery" } },
			)
		).json()) as { commit?: { committer?: { date?: string } } };
		const d = c.commit?.committer?.date?.slice(0, 10);
		if (d)
			console.log(
				`reference: stellarplaybook.com — repo last updated ${d} (a stale reference is still a reference; weigh it)`,
			);
	} catch {}
	console.log("");

	// ROUTING layer
	const routing: Record<string, string[]> = {};
	for (const c of CATEGORIES) {
		const txt = await tool("search", { query: c.q });
		const hits = (leadingJson<{ hits?: Array<{ id: string }> }>(txt).hits ?? [])
			.map((h) => h.id)
			.slice(0, 8);
		routing[c.key] = hits;
	}

	// ANSWER layer — three categories per execute (result cap ~6k tokens)
	const rows: Record<
		string,
		{ total: number | null; rows: Array<[string, string, string, string]> }
	> = {};
	for (let i = 0; i < CATEGORIES.length; i += 3) {
		const batch = CATEGORIES.slice(i, i + 3);
		const code = `
const qs=${JSON.stringify(batch.map((c) => ({ k: c.key, q: c.q })))};
const out={};
await Promise.all(qs.map(async ({k,q})=>{
  const r=await scout.searchProjects({ q, limit: 10 });
  if(!r.ok){ out[k]={error:r.error}; return; }
  out[k]={ total: r.data.meta?.counts?.total ?? null, rows: (r.data.projects||[]).map(p=>[p.slug,p.status,(p.types||[]).join('/'),(p.links?.website||'').replace(/^https?:\\/\\/(www\\.)?/,'').replace(/\\/$/,'')]) };
}));
return out;`;
		const txt = await tool("execute", { code });
		Object.assign(rows, leadingJson<typeof rows>(txt));
	}

	// GRADE
	let reds = 0;
	for (const c of CATEGORIES) {
		const hits = routing[c.key] ?? [];
		const routed = c.wantOp.find((op) => hits.includes(op));
		const r = rows[c.key];
		const top = r?.rows ?? [];
		const inactiveTop5 = top
			.slice(0, 5)
			.filter((x) => x[1] === "Inactive")
			.map((x) => x[0]);
		const untyped = top.filter((x) => !x[2]).map((x) => x[0]);
		let playbookNote = "";
		if (c.playbook) {
			const ref = await playbookDomains(c.playbook);
			const got = new Set(top.map((x) => reg(x[3].split("/")[0] || "-")));
			const present = ref.filter((d) => got.has(d));
			playbookNote =
				` playbook ${present.length}/${ref.length} in top10` +
				(ref.length && !present.length ? " ✗" : "");
		}
		const red = inactiveTop5.length > 0;
		if (red) reds++;
		console.log(
			`${red ? "✗" : routed ? "✓" : "~"} ${c.key.padEnd(9)} routing:${routed ? routed.replace("scout.", "") : "MISS"}${"".padEnd(Math.max(0, 16 - (routed ?? "MISS").replace("scout.", "").length))} total:${String(r?.total ?? "?").padEnd(4)}${playbookNote}` +
				(inactiveTop5.length
					? `  INACTIVE-in-top5:${inactiveTop5.join(",")}`
					: "") +
				(untyped.length ? `  untyped:${untyped.length}` : ""),
		);
		console.log(
			`     ${top
				.slice(0, 6)
				.map((x) => x[0])
				.join(" · ")}`,
		);
	}
	const routedCount = CATEGORIES.filter((c) =>
		c.wantOp.some((op) => (routing[c.key] ?? []).includes(op)),
	).length;
	console.log(
		`\nrouting: a Scout directory op in Raven's top-8 for ${routedCount}/${CATEGORIES.length} categories`,
	);
	console.log(`reds (Inactive in top 5): ${reds}`);
	if (GATE && reds > 0) process.exit(1);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
