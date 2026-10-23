/**
 * Sweep (lane PL): every listed event's winners, read from the live API
 * (getHackathon, read-only, 2 s apart, apiVersion at the start and the end),
 * grouped by award text. The pattern, from the brief: the same award text on
 * winners of one event with different placements (amounts are parsed from
 * placements). Written apart from the code under test. Prints placements,
 * not submission names: a name can hold a person's name.
 *
 *   node improvements/audits/2026-10-23-prize-labels/sweep.mjs
 */
const BASE = "https://stellarlight.xyz";
let last = 0;
async function get(path) {
	const wait = last + 2_000 - Date.now();
	if (wait > 0) await new Promise((r) => setTimeout(r, wait));
	last = Date.now();
	const res = await fetch(`${BASE}${path}`, {
		headers: { accept: "application/json" },
	});
	if (!res.ok) throw new Error(`HTTP ${res.status} ${path}`);
	return res.json();
}
// A dash outside ASCII prints as its escape, so this output adds none.
const q = (v) =>
	JSON.stringify(v).replace(/[\u2013\u2014]/g, (c) =>
		c === "\u2013" ? "\\u2013" : "\\u2014",
	);

const start = await get("/api/status");
const list = await get("/api/hackathons?limit=300");
const shared = [];
const own = [];
const none = [];
const noWinners = [];
for (const { slug } of list.hackathons) {
	const d = await get(`/api/hackathons/${encodeURIComponent(slug)}`);
	const hidden = d.hackathon?.stats?.hiddenWinners ?? [];
	const winners = [
		...d.winners.map((w) => ({
			placement: w.hackathonPlacement,
			award: w.award ?? null,
			prizeUsd: w.prizeUsd ?? null,
		})),
		...hidden.map((h) => ({
			placement: h.placement,
			award: h.award ?? null,
			prizeUsd: null,
			hidden: true,
		})),
	];
	if (!winners.length) {
		noWinners.push(slug);
		continue;
	}
	const byAward = new Map();
	for (const w of winners)
		if (w.award) byAward.set(w.award, [...(byAward.get(w.award) ?? []), w]);
	if (!byAward.size) {
		none.push(`${slug} (${winners.length} winners)`);
		continue;
	}
	for (const [award, ws] of byAward) {
		const places = new Set(
			ws.map((w) =>
				String(w.placement ?? "")
					.trim()
					.toLowerCase(),
			),
		);
		const line = `${slug}: award ${q(award)} on ${ws.length} winner(s), ${places.size} placement(s): ${ws
			.map(
				(w) =>
					`${q(w.placement)}${w.prizeUsd != null ? ` (prizeUsd ${w.prizeUsd})` : ""}${w.hidden ? " (hidden upstream)" : ""}`,
			)
			.join("; ")}`;
		(places.size > 1 ? shared : own).push(line);
	}
}
const end = await get("/api/status");
console.log(
	`apiVersion ${start.apiVersion} at the start, ${end.apiVersion} at the end; ${list.hackathons.length} listed events.\n`,
);
console.log(
	`## Same award text on winners of different placements (${shared.length} awards)\n\n${shared.join("\n")}\n`,
);
console.log(
	`## Award text that is each winner's own prize (${own.length} awards)\n\n${own.join("\n")}\n`,
);
console.log(`## Winners with no award text\n\n${none.join("\n")}\n`);
console.log(`## No winner served\n\n${noWinners.join(", ")}`);
