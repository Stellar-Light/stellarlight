/**
 * Receipt capture (QUALITY.md §5, stellar-raven's WisdomTree pattern):
 * a human-verified correction should carry its committed fetch evidence —
 * URL, fetch time, response identity headers, the markers that decided the
 * verdict, and a body hash — so "verified on <date>" is re-checkable
 * instead of taken on faith, and a later dispute can diff what the page
 * said THEN against what it says NOW.
 *
 *   pnpm exec tsx scripts/data/capture-receipt.ts <slug> <url> [marker...]
 *
 * Writes improvements/receipts/<slug>-<YYYY-MM-DD>.json. Markers are
 * case-insensitive substrings; each hit is captured with surrounding text.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [slug, url, ...markers] = process.argv.slice(2);
if (!slug || !url) {
	console.error("usage: capture-receipt.ts <slug> <url> [marker...]");
	process.exit(1);
}

const res = await fetch(url, {
	headers: { "User-Agent": "stellarlight-receipt/1.0" },
	redirect: "follow",
});
const raw = await res.text();
const text = raw
	.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
	.replace(/<[^>]+>/g, " ")
	.replace(/\s+/g, " ")
	.trim();

// A marker is looked for in the rendered TEXT first. When the text has no
// match, the raw markup is searched too and the hit is recorded as
// `where: "markup"` — a parked domain (GoDaddy's lander: no text nodes at
// all, only `window._trfd ap:"parking"` and /parking-lander/ assets) carries
// its evidence in scripts, and a receipt that can only read text could never
// cite it (polaris-lend, 2026-09-06). The record says where the marker was,
// so a reader can weigh markup evidence for what it is.
const rawLower = raw.toLowerCase();
const found = markers.map((m) => {
	const i = text.toLowerCase().indexOf(m.toLowerCase());
	if (i >= 0)
		return {
			marker: m,
			found: true,
			where: "text" as const,
			excerpt: text.slice(Math.max(0, i - 120), i + 180),
		};
	const j = rawLower.indexOf(m.toLowerCase());
	return {
		marker: m,
		found: j >= 0,
		where: j >= 0 ? ("markup" as const) : null,
		excerpt: j >= 0 ? raw.slice(Math.max(0, j - 120), j + 180) : null,
	};
});

const date = new Date().toISOString().slice(0, 10);
const out = {
	slug,
	url,
	finalUrl: res.url,
	fetchedAt: new Date().toISOString(),
	httpStatus: res.status,
	headers: {
		date: res.headers.get("date"),
		etag: res.headers.get("etag"),
		lastModified: res.headers.get("last-modified"),
		server: res.headers.get("server"),
	},
	bodyTextSha256: createHash("sha256").update(text).digest("hex"),
	bodyTextChars: text.length,
	markers: found,
	note: "Captured by scripts/data/capture-receipt.ts — markers are the evidence the correction rests on; re-run to diff what the page says now against this record.",
};
mkdirSync(join(process.cwd(), "improvements/receipts"), { recursive: true });
const path = join(process.cwd(), `improvements/receipts/${slug}-${date}.json`);
writeFileSync(path, `${JSON.stringify(out, null, 1)}\n`);
console.log(
	`${path}\n  status=${res.status} markers: ${found.map((f) => `${f.marker}=${f.found ? `FOUND (${f.where})` : "absent"}`).join(" · ")}`,
);
if (markers.length && !found.some((f) => f.found)) {
	console.error(
		"  ⚠ NO marker found — the evidence this receipt was meant to capture is not on the page. Do not cite it.",
	);
	process.exitCode = 1;
}
