/**
 * Curator agent (phase 3, first instance) — wallet availability drafts.
 *
 * The LLM half of the self-sustaining loop, built to the agreed division:
 * THE AGENT PROPOSES, THE DETERMINISTIC LAYER DISPOSES. This script reads
 * wallets with empty `availability` (the sls-033 residual: ~50 rows nobody
 * wants to store-check by hand), fetches each operator's own site, and asks
 * Claude to extract per-platform availability WITH evidence — but it writes
 * NOTHING to the DB. Output is a dated drafts file the workflow commits via
 * PR (the human gate is the diff review), and a separate applier
 * (apply-wallet-availability.ts, dry-run default) lands only reviewed
 * drafts, only into empty fields, with read-back verification.
 *
 * Evidence rules the prompt enforces and the code re-checks:
 *   - a platform claim needs a store/product URL from the fetched text;
 *   - no URL, no claim — "unclear" is a valid and expected answer;
 *   - the agent never marks anything `unavailable` (absence of evidence is
 *     not evidence of absence — delisting verdicts stay human, per sls-033).
 *
 *   ANTHROPIC_API_KEY=… DATABASE_URI=… PAYLOAD_SECRET=… \
 *     pnpm exec tsx scripts/agents/enrich-wallet-availability.ts --limit 10
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { getPayload } from "payload";
import config from "../../src/payload.config";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = Number((limitIdx !== -1 && process.argv[limitIdx + 1]) || "10");
const MODEL = "claude-opus-4-8";
const PLATFORMS = [
	"ios",
	"android",
	"web",
	"browser-extension",
	"desktop",
	"hardware-device",
] as const;

interface Draft {
	slug: string;
	name: string;
	website: string;
	entries: Array<{
		platform: (typeof PLATFORMS)[number];
		state: "available";
		storeUrl: string;
		checkedAt: string;
		note: string;
	}>;
	agentNote: string | null;
}

function stripHtml(html: string): string {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, " ")
		.replace(/<style[\s\S]*?<\/style>/gi, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.slice(0, 14_000);
}

/** Also surface raw store hrefs — the JS-rendered-hero lesson: store links
 * often live in markup the text-strip flattens away. */
function storeHrefs(html: string): string[] {
	const re =
		/https?:\/\/(?:apps\.apple\.com|play\.google\.com|chromewebstore\.google\.com|chrome\.google\.com\/webstore|addons\.mozilla\.org|microsoftedge\.microsoft\.com)[^"'\s<>)]+/g;
	return [...new Set(html.match(re) ?? [])].slice(0, 12);
}

async function main() {
	const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
	if (!apiKey) {
		console.log(
			"::warning::ANTHROPIC_API_KEY not set — curator agent skipped (add the secret to enable; nothing is broken)",
		);
		return;
	}
	const anthropic = new Anthropic({ apiKey });
	const payload = await getPayload({ config });

	const wallets = await payload.find({
		collection: "projects",
		where: {
			and: [{ type: { equals: "Wallet" } }],
		},
		limit: 200,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	const rows = (wallets.docs as any[])
		.filter((d) => !(Array.isArray(d.availability) && d.availability.length))
		.filter((d) => d.links?.website)
		.slice(0, LIMIT);
	console.log(
		`${rows.length} wallet(s) with empty availability + a website (cap ${LIMIT})\n`,
	);

	const today = new Date().toISOString().slice(0, 10);
	const drafts: Draft[] = [];
	for (const row of rows) {
		const site: string = row.links.website;
		let html = "";
		try {
			html = await (
				await fetch(site, {
					headers: { "User-Agent": "stellarlight-curator (availability check)" },
					redirect: "follow",
					signal: AbortSignal.timeout(15_000),
				})
			).text();
		} catch (e) {
			console.log(`  skip ${row.slug}: site unreachable (${e instanceof Error ? e.message : e})`);
			continue;
		}
		const text = stripHtml(html);
		const hrefs = storeHrefs(html);

		const msg = await anthropic.messages.create({
			model: MODEL,
			max_tokens: 1200,
			thinking: { type: "adaptive" },
			messages: [
				{
					role: "user",
					content: `You are extracting per-platform availability for the Stellar wallet "${row.name}" from its own website text. Claim ONLY what the evidence shows.

Platforms (closed set): ${PLATFORMS.join(", ")}.

Rules:
- A claim REQUIRES a concrete evidence URL: a store link (App Store / Play / Chrome Web Store / …) from the list below, or the site itself for platform "web" ONLY when the text clearly shows the wallet runs in-browser (not just a marketing site).
- If evidence is unclear for a platform, OMIT it. Returning few or zero entries is correct and expected.
- Never claim "unavailable" — absence of evidence is not evidence of absence.

Store links found in the page markup:
${hrefs.length ? hrefs.map((h) => `- ${h}`).join("\n") : "- (none found)"}

Page text (truncated):
${text}

Reply with ONLY a JSON object: {"entries":[{"platform":"…","storeUrl":"…","note":"one-line evidence quote/paraphrase"}],"agentNote":"anything a reviewer should know, or null"}`,
				},
			],
		});
		const textOut = msg.content
			.filter((b): b is Anthropic.TextBlock => b.type === "text")
			.map((b) => b.text)
			.join("");
		let parsed: {
			entries?: Array<{ platform?: string; storeUrl?: string; note?: string }>;
			agentNote?: string | null;
		} = {};
		try {
			parsed = JSON.parse(textOut.slice(textOut.indexOf("{"), textOut.lastIndexOf("}") + 1));
		} catch {
			console.log(`  skip ${row.slug}: unparseable agent reply`);
			continue;
		}
		// Deterministic re-check: platform in the closed set, storeUrl present
		// AND actually appearing in the fetched page (no invented links).
		const entries = (parsed.entries ?? [])
			.filter(
				(e): e is { platform: (typeof PLATFORMS)[number]; storeUrl: string; note?: string } =>
					PLATFORMS.includes(e.platform as never) &&
					typeof e.storeUrl === "string" &&
					(html.includes(e.storeUrl) || e.storeUrl === site || `${e.storeUrl}/` === site || e.storeUrl === `${site}/`),
			)
			.map((e) => ({
				platform: e.platform,
				state: "available" as const,
				storeUrl: e.storeUrl,
				checkedAt: today,
				note: `curator-agent draft: ${(e.note ?? "").slice(0, 140)}`,
			}));
		console.log(
			`  ${row.slug.padEnd(24)} ${entries.length} evidenced platform(s)${parsed.agentNote ? ` · note: ${String(parsed.agentNote).slice(0, 60)}` : ""}`,
		);
		if (entries.length)
			drafts.push({
				slug: row.slug,
				name: row.name,
				website: site,
				entries,
				agentNote: parsed.agentNote ?? null,
			});
	}

	const out = join(ROOT, `improvements/drafts/wallet-availability-${today}.json`);
	mkdirSync(dirname(out), { recursive: true });
	writeFileSync(
		out,
		`${JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, drafts }, null, "\t")}\n`,
	);
	console.log(`\n${drafts.length} draft(s) → ${out} — review via PR, land via apply-wallet-availability.ts (dry-run default)`);
}

main().then(() => process.exit(0)).catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
