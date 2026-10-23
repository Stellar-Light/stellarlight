/**
 * Hand check (criterion d, lane PL): 10 winners' served award fields against
 * DoraHacks' own winner assignments for their events, read live, read-only,
 * 2 s apart, with the browser headers the sync uses.
 *
 *   node improvements/audits/2026-10-23-prize-labels/handcheck.mjs <lane-bodies> <raw-out-dir>
 *
 * The served side is the lane replay's getHackathonSubmission body for each
 * winner. Pass: when the winner's DoraHacks award holds several differently
 * named prizes, the served award is null, awardCategory is the award's title
 * and placement is the prize this buidl holds; when the award holds one
 * prize, the served award is the title and awardCategory null.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [bodies, rawOut] = process.argv.slice(2);
if (!rawOut)
	throw new Error("usage: handcheck.mjs <lane-bodies> <raw-out-dir>");
mkdirSync(rawOut, { recursive: true });

const WINNERS = [
	["stellar-hacks-zk", 46541],
	["stellar-agents-x402-stripe-mpp", 42585],
	["scaffoldstellar", 36328],
	["stellar-hacks-blend", 27456],
	["stellar-hacks-kale-reflector", 32712],
	["stellar-hacks-paltalabs", 30677],
	["build-on-stellar", 25335],
	["stellar-hacks-zk-gaming", 39840],
	["buildonstellarchile", 40191],
	["stellar-latam", 28436],
];
const HEADERS = {
	Accept: "application/json",
	"Accept-Language": "en-US,en;q=0.9",
	Referer: "https://dorahacks.io/",
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

// Quoted titles keep their exact text; a dash outside ASCII prints as its
// escape, so this file adds no en or em dash.
const q = (v) =>
	String(v).replace(/[\u2013\u2014]/g, (c) =>
		c === "\u2013" ? "\\u2013" : "\\u2014",
	);
const rows = [];
let fails = 0;
for (const [event, buidl] of WINNERS) {
	await new Promise((r) => setTimeout(r, 2_000));
	const res = await fetch(
		`https://dorahacks.io/api/v1/hub/hackathon-winner-assignments?hackathon=${event}`,
		{ headers: HEADERS },
	);
	if (!res.ok) throw new Error(`DoraHacks ${event}: HTTP ${res.status}`);
	const body = await res.json();
	writeFileSync(join(rawOut, `${event}.json`), JSON.stringify(body));
	const award = (body.award_list ?? []).find((a) =>
		(a.prizes ?? []).some((p) => (p.buidls ?? []).includes(buidl)),
	);
	const prize = award?.prizes.find((p) => p.buidls.includes(buidl));
	const names = new Set(
		(award?.prizes ?? []).map((p) => String(p.name).trim().toLowerCase()),
	);
	const served = JSON.parse(
		readFileSync(join(bodies, `build_dorahacks-buidl-${buidl}.json`), "utf8"),
	).build;
	const category = names.size > 1;
	const pass =
		!!award &&
		served.placement === prize.name &&
		(category
			? served.award === null && served.awardCategory === award.title
			: served.award === award.title && served.awardCategory === null);
	if (!pass) fails++;
	rows.push(
		`| ${event} | ${buidl} | ${q(served.name)} | ${q(award?.title ?? "(not found)")} | ${award?.prizes.length ?? 0} (${names.size} names) | ${q(prize?.name ?? "(none)")} | ${q(served.placement)} | ${q(served.award ?? "null")} | ${q(served.awardCategory ?? "null")} | ${served.prizeUsd ?? "null"} | ${pass ? "pass" : "FAIL"} |`,
	);
}
console.log(
	`Read ${new Date().toISOString()}: DoraHacks winner assignments for ${WINNERS.length} events.\n`,
);
console.log(
	"| event | buidl | name | DoraHacks award | prizes in it | prize this buidl holds | served placement | served award | served awardCategory | served prizeUsd | verdict |",
);
console.log(
	"| --- | ---: | --- | --- | --- | --- | --- | --- | --- | ---: | --- |",
);
console.log(rows.join("\n"));
console.log(`\n${WINNERS.length - fails} of ${WINNERS.length} pass.`);
process.exit(fails ? 1 : 0);
