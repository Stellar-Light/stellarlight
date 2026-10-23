// Read-only capture for the dead-protocol guard replay (lane DQ1).
//
//   node improvements/audits/2026-10-23-dead-protocol-guard/capture.mjs <out.json>
//
// GETs the 30 fixed query pages from the live API, 2 s apart, and records the
// API version (openapi info.version) at the start and the end. The pages'
// rows are the replay's documents. Nothing is written anywhere but <out.json>.
import { writeFileSync } from "node:fs";

export const QUERIES = [
	"allbridge",
	"bridge",
	"cross-chain bridge",
	"solana to stellar bridge",
	"lending",
	"dex",
	"amm",
	"yield",
	"stablecoin",
	"wallet",
	"anchor",
	"payments",
	"remittance",
	"oracle",
	"rwa",
	"tokenized treasury",
	"nft",
	"explorer",
	"sdk",
	"soroswap",
	"blend",
	"aquarius",
	"lobstr",
	"freighter",
	"etherfuse",
	"mexico on-ramp",
	"passkey smart wallet",
	"ai agent payments",
	"highest tvl",
	"defi protocol",
];

const BASE = "https://www.stellarlight.xyz";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = async (path) => {
	const res = await fetch(`${BASE}${path}`, {
		headers: { "User-Agent": "stellarlight-dq1-replay-capture" },
	});
	if (!res.ok) throw new Error(`${res.status} ${path}`);
	return res.json();
};
const version = async () => (await get("/api/openapi.json")).info.version;

const out = process.argv[2];
if (!out) throw new Error("usage: capture.mjs <out.json>");
const start = { apiVersion: await version(), at: new Date().toISOString() };
const pages = {};
for (const q of QUERIES) {
	await sleep(2000);
	pages[q] = await get(`/api/projects/search?q=${encodeURIComponent(q)}`);
}
await sleep(2000);
const end = { apiVersion: await version(), at: new Date().toISOString() };
writeFileSync(out, JSON.stringify({ start, end, pages }));
console.log(JSON.stringify({ start, end, queries: QUERIES.length }));
