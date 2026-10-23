/**
 * Lists every difference between two replays' bodies and classes each one
 * against the ledger's criteria (lane PL); also checks the base replay
 * against the live capture it was rebuilt from.
 *
 *   node improvements/audits/2026-10-23-prize-labels/diff.mjs <capture> <base-bodies> <lane-bodies>
 *
 * Allowed differences, fixed before the replay was read: (1) the key
 * awardCategory added beside a served award; (2) on a row of a listed
 * event, award null with its old text in awardCategory. Anything else is
 * unintended and makes the exit code 1.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const [cap, baseDir, laneDir] = process.argv.slice(2);
if (!laneDir) throw new Error("usage: diff.mjs <capture> <base> <lane>");

/** Events whose award text winners of different placements share. */
const LISTED = new Set([
	"stellar-hacks-zk",
	"stellar-agents-x402-stripe-mpp",
	"scaffoldstellar",
	"stellar-hacks-blend",
	"stellar-hacks-kale-reflector",
	"stellar-hacks-paltalabs",
	"build-on-stellar",
]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const eventOf = (o, inherited) =>
	typeof o.hackathonSlug === "string"
		? o.hackathonSlug
		: isObj(o.hackathon) && typeof o.hackathon.slug === "string"
			? o.hackathon.slug
			: inherited;

/** Every difference between a and b: [path, a, b, event]. */
function diff(a, b, path, event, out) {
	if (Array.isArray(a) && Array.isArray(b)) {
		const n = Math.max(a.length, b.length);
		for (let i = 0; i < n; i++) diff(a[i], b[i], `${path}[${i}]`, event, out);
		return out;
	}
	if (isObj(a) && isObj(b)) {
		const ev = eventOf(a, event);
		for (const k of new Set([...Object.keys(a), ...Object.keys(b)]))
			if (!(k in a)) out.push([`${path}.${k}`, undefined, b[k], ev, a, b]);
			else if (!(k in b)) out.push([`${path}.${k}`, a[k], undefined, ev, a, b]);
			else diff(a[k], b[k], `${path}.${k}`, ev, out);
		return out;
	}
	if (JSON.stringify(a) !== JSON.stringify(b)) out.push([path, a, b, event]);
	return out;
}

/** The parent objects of a leaf difference, to class award changes. */
function parentOf(root, path) {
	const parts = path.match(/\.[^.[\]]+|\[\d+\]/g) ?? [];
	let o = root;
	for (const p of parts.slice(0, -1))
		o = p.startsWith("[") ? o[Number(p.slice(1, -1))] : o[p.slice(1)];
	return o;
}

function classify(path, before, after, event, laneRoot, baseRoot) {
	const key = path.split(".").pop();
	if (key === "awardCategory" && before === undefined) {
		const base = parentOf(baseRoot, path);
		return isObj(base) && "award" in base
			? "allowed (1): awardCategory added beside award"
			: "UNINTENDED: awardCategory where no award is served";
	}
	if (key === "award" && typeof before === "string" && after === null) {
		const lane = parentOf(laneRoot, path);
		return LISTED.has(event) && lane?.awardCategory === before
			? "allowed (2): listed event, award text moved to awardCategory"
			: "UNINTENDED: award dropped";
	}
	return "UNINTENDED";
}

const files = readdirSync(baseDir).sort();
let unintended = 0;
let changedRows = 0;
const lines = [];
const summary = [];
for (const f of files) {
	const base = JSON.parse(readFileSync(join(baseDir, f), "utf8"));
	const lane = JSON.parse(readFileSync(join(laneDir, f), "utf8"));
	const root = f.startsWith("event_")
		? f.slice("event_".length, -".json".length)
		: undefined;
	const ds = diff(base, lane, "", root, []);
	const counts = {};
	for (const [path, before, after, event] of ds) {
		const c = classify(path, before, after, event, lane, base);
		counts[c] = (counts[c] ?? 0) + 1;
		if (c.startsWith("UNINTENDED")) unintended++;
		if (c.startsWith("allowed (2)")) {
			changedRows++;
			lines.push(
				`${f}  ${path}  award ${JSON.stringify(before)} -> null, awardCategory ${JSON.stringify(after === null ? before : after)}`,
			);
		} else if (!c.startsWith("allowed (1)"))
			lines.push(
				`${f}  ${path}  ${JSON.stringify(before)} -> ${JSON.stringify(after)}  ${c}`,
			);
	}
	summary.push(
		`${f}: ${ds.length} differences${
			ds.length
				? ` (${Object.entries(counts)
						.map(([c, n]) => `${n} ${c}`)
						.join("; ")})`
				: ""
		}`,
	);
}

// Fidelity: the base replay against the live bodies it was rebuilt from,
// generatedAt aside.
const fidelity = [];
const strip = (o) => {
	if (isObj(o?.meta)) delete o.meta.generatedAt;
	return o;
};
for (const f of files) {
	const base = strip(JSON.parse(readFileSync(join(baseDir, f), "utf8")));
	let live;
	let m = /^event_(.+)\.json$/.exec(f);
	if (m)
		live = strip(
			JSON.parse(readFileSync(join(cap, "detail", `${m[1]}.json`), "utf8")),
		);
	m = /^build_(.+)\.json$/.exec(f);
	if (m)
		live = strip(
			JSON.parse(readFileSync(join(cap, "build", `${m[1]}.json`), "utf8")),
		);
	m = /^builds_hackathon=([^&]+)&limit=100&offset=(\d+)\.json$/.exec(f);
	if (m) {
		const rows = JSON.parse(
			readFileSync(join(cap, "builds", `${m[1]}.json`), "utf8"),
		);
		const off = Number(m[2]);
		const ds = diff(
			base.builds,
			rows.slice(off, off + 100),
			".builds",
			undefined,
			[],
		);
		fidelity.push(`${f}: ${ds.length} differences from the live rows`);
		continue;
	}
	if (!live) continue;
	const ds = diff(base, live, "", undefined, []);
	fidelity.push(
		`${f}: ${ds.length} differences from the live body${
			ds.length
				? `: ${ds
						.slice(0, 4)
						.map(([p]) => p)
						.join(", ")}${ds.length > 4 ? ", ..." : ""}`
				: ""
		}`,
	);
}

// Criterion (a): in the lane's bodies, no row of a listed event serves award
// text; every other row's award equals the base (checked by the diff above).
const served = {
	listedRows: 0,
	listedAwardText: 0,
	listedCategory: 0,
	otherRows: 0,
	otherCategory: 0,
};
function walk(o, event) {
	if (Array.isArray(o)) {
		for (const v of o) walk(v, event);
		return;
	}
	if (!isObj(o)) return;
	const ev = eventOf(o, event);
	if ("award" in o) {
		if (LISTED.has(ev)) {
			served.listedRows++;
			if (o.award !== null) served.listedAwardText++;
			if (o.awardCategory !== null) served.listedCategory++;
		} else {
			served.otherRows++;
			if (o.awardCategory !== null) served.otherCategory++;
		}
	}
	for (const v of Object.values(o)) walk(v, ev);
}
for (const f of files) {
	const root = f.startsWith("event_")
		? f.slice("event_".length, -".json".length)
		: undefined;
	walk(JSON.parse(readFileSync(join(laneDir, f), "utf8")), root);
}
if (served.listedAwardText || served.otherCategory) unintended++;

console.log(
	"# Base replay against the live capture (meta.generatedAt aside)\n",
);
console.log(fidelity.join("\n"));
console.log("\n# Base against lane, per request\n");
console.log(summary.join("\n"));
console.log(
	`\n# Every award that moved (${changedRows}) and every other difference not of kind (1)\n`,
);
console.log(lines.join("\n") || "(none)");
console.log(
	`\n# Criterion (a) over the lane's bodies\n\nrows with an award field on the listed events: ${served.listedRows}; with award text: ${served.listedAwardText}; with awardCategory: ${served.listedCategory}. Rows with an award field elsewhere: ${served.otherRows}; with awardCategory: ${served.otherCategory}.`,
);
console.log(`\nunintended differences: ${unintended}`);
process.exit(unintended ? 1 : 0);
