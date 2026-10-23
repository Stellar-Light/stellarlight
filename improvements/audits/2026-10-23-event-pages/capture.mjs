// Read-only GETs against production, 2 s apart, for the event pages replay.
// Captures /api/status apiVersion at start and end, the event listing
// (/api/hackathons?limit=300) and every listed event's detail
// (/api/hackathons/<slug>), each with its status code.
// The output holds upstream submission text: write it to a scratch
// directory, never commit it.
// Usage, from the repository root:
//   node improvements/audits/2026-10-23-event-pages/capture.mjs <out.json>
import { writeFileSync } from "node:fs";

const [, , outPath] = process.argv;
if (!outPath) throw new Error("usage: capture.mjs <out.json>");
const BASE = "https://www.stellarlight.xyz";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path) {
	await sleep(2000);
	const res = await fetch(`${BASE}${path}`, {
		headers: { "User-Agent": "stellarlight-event-pages-replay" },
	});
	return { status: res.status, body: await res.json() };
}

const version = async () => (await get("/api/status")).body.apiVersion;

const startedAt = new Date().toISOString();
const apiVersionStart = await version();
const listing = await get("/api/hackathons?limit=300");
const details = {};
for (const h of listing.body.hackathons) {
	details[h.slug] = await get(`/api/hackathons/${encodeURIComponent(h.slug)}`);
	process.stderr.write(`${h.slug} ${details[h.slug].status}\n`);
}
const apiVersionEnd = await version();
writeFileSync(
	outPath,
	JSON.stringify({
		startedAt,
		endedAt: new Date().toISOString(),
		apiVersionStart,
		apiVersionEnd,
		listing: listing.body,
		details,
	}),
);
process.stderr.write(
	`${Object.keys(details).length} events, apiVersion ${apiVersionStart} to ${apiVersionEnd}\n`,
);
