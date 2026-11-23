/**
 * Build src/data/onchain-map.json: the mainnet contracts and accounts linked
 * to directory projects, from a checked map export. The on-chain lane
 * (scripts/data/enrich-onchain-projects.ts) is the only reader.
 *
 *   pnpm exec tsx scripts/build-onchain-map.ts <map.csv> <openings.csv> <close-times.json>          # dry run: prints the counts and the diff
 *   pnpm exec tsx scripts/build-onchain-map.ts <map.csv> <openings.csv> <close-times.json> --write  # write the file
 *
 * Inputs, all built read-only from public sources:
 *   map.csv          one row per project and address: slug, address, kind,
 *                    evidence, foundAt, note, createdAt, createdLedger,
 *                    dateBasis, tier (strong, labelled, weaker)
 *   openings.csv     dated events; its "account opened" rows give an
 *                    account's opening ledger, found as a CREATED entry in
 *                    that ledger's metadata (detail "<G...>; ledger <n>; ...")
 *   close-times.json ledger sequence to close time, from the SDF history
 *                    archive
 * The rules are src/lib/onchain-map.ts. A link a curator has said is another
 * product's (DEPLOYMENT_VERIFIED retractions, ONCHAIN_NOT_THIS_ROW) or that a
 * hand-verified seed gives to another project is left out with its reason.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	ONCHAIN_NOT_THIS_ROW,
	ONCHAIN_SEEDS,
} from "../src/data/onchain-contracts";
import { parseCsv } from "../src/lib/awards/csv";
import { addressesIn } from "../src/lib/onchain-join";
import {
	ONCHAIN_MAP_ATTRIBUTION,
	type OnchainMapLink,
	selectLinks,
} from "../src/lib/onchain-map";
import { DEPLOYMENT_VERIFIED } from "./data/curation-maps";

const OUT = join(
	dirname(fileURLToPath(import.meta.url)),
	"../src/data/onchain-map.json",
);
const WRITE = process.argv.includes("--write");
const [mapPath, openingsPath, closeTimesPath] = process.argv
	.slice(2)
	.filter((a) => !a.startsWith("--"));
if (!mapPath || !openingsPath || !closeTimesPath) {
	console.error(
		"usage: build-onchain-map.ts <map.csv> <openings.csv> <close-times.json> [--write]",
	);
	process.exit(2);
}

const PUBLIC_DIRECTORY_LICENSE = `MIT License

Copyright (c) 2022 StellarExpert

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const EVIDENCE_KINDS = {
	directory: "already in the Stellar Light directory for this project",
	"own-repo-interface":
		"named in a deployment or config file of the project's repo, and the deployed code exposes the functions one of the project's repos defines",
	"own-wasm-meta":
		"named in the project's repo, and the deployed code's own metadata (SEP-55 source_repo) names a repo of the project",
	"own-pages-confirmed":
		"named on the project's own pages or SCF proposal, and the code is tied to the project as above",
	"own-deployer-confirmed":
		"created by the account that deployed one of the project's proved contracts, and the code is the project's too",
	"own-account":
		"an account whose home domain points back to the project's site, or one its stellar.toml declares",
	"protocol-registry":
		"the anchor contract (factory, or the earliest contract) of a protocol in Stellar Index's registry",
	"public-directory-label":
		"stellar-expert/public-directory labels the address under the project's own domain (entries flagged malicious or unsafe are left out)",
	"named-on-own-pages": "named on the project's own pages",
	"same-deployer":
		"created by the account that deployed one of the project's proved contracts",
};

const csvRows = parseCsv(readFileSync(mapPath, "utf8"));
// Account openings: ledger from the events, close time from the archive.
const closeTimes = JSON.parse(readFileSync(closeTimesPath, "utf8")) as Record<
	string,
	string
>;
const openedLedger = new Map<string, number>();
for (const e of parseCsv(readFileSync(openingsPath, "utf8"))) {
	if (e.event !== "account opened") continue;
	const m = /^(G[A-Z2-7]{55}); ledger (\d+);/.exec(e.detail ?? "");
	if (m) openedLedger.set(m[1], Number(m[2]));
}

const labelOf = (evidence: string[], note: string): string | null =>
	/labelled "([^"]+)"/.exec(note)?.[1] ??
	(evidence[0] === "directory" && note.trim() ? note.trim() : null);
// The sharing and the label are fields of their own; the note keeps the rest.
const noteOf = (note: string): string | null =>
	note
		.split("; ")
		.filter(
			(p) =>
				p.trim() &&
				!/^shared with /.test(p) &&
				!/^labelled "/.test(p) &&
				!/^domain shared by /.test(p),
		)
		.join("; ") || null;

const problems: string[] = [];
const rows: Array<Omit<OnchainMapLink, "sharedWithinFamily">> = [];
for (const r of csvRows) {
	const evidence = r.evidence.split("; ").filter(Boolean);
	const found = r.foundat ?? "";
	const deployer = /^deployer (G[A-Z2-7]{55})$/.exec(found)?.[1];
	const sourceUrl = deployer
		? `https://api.stellarindex.io/v1/accounts/${deployer}/operations`
		: found;
	if (!/^https:\/\//.test(sourceUrl))
		problems.push(`${r.slug} ${r.address}: source is not a public URL`);
	if (r.kind !== "contract" && r.kind !== "account")
		problems.push(`${r.slug} ${r.address}: kind ${r.kind}`);
	if (
		!/^[CG][A-Z2-7]{55}$/.test(r.address) ||
		(r.kind === "contract") !== r.address.startsWith("C")
	)
		problems.push(`${r.slug} ${r.address}: not a ${r.kind} address`);
	let createdLedger = r.createdledger ? Number(r.createdledger) : null;
	if (r.kind === "account" && createdLedger === null)
		createdLedger = openedLedger.get(r.address) ?? null;
	const createdAt =
		r.createdat ||
		(createdLedger !== null ? closeTimes[createdLedger] : "") ||
		null;
	if (
		r.kind === "contract" &&
		r.tier !== "weaker" &&
		(!createdAt || !createdLedger)
	)
		problems.push(`${r.slug} ${r.address}: contract without a proved creation`);
	rows.push({
		slug: r.slug,
		address: r.address,
		kind: r.kind as "contract" | "account",
		tier: r.tier as OnchainMapLink["tier"],
		evidence,
		label: labelOf(evidence, r.note ?? ""),
		note: noteOf(r.note ?? ""),
		sourceUrl,
		createdAt,
		createdLedger,
		dateBasis: !createdAt
			? null
			: r.kind === "contract"
				? "creation proved in the ledger"
				: "account opening proved in the ledger (not a launch date)",
	});
}

const { kept, left } = selectLinks(rows);

// Curator readings and hand-verified seeds outrank the map.
const retracted = new Map<string, Set<string>>();
for (const [slug, v] of Object.entries(DEPLOYMENT_VERIFIED))
	if (v.network === "unknown") retracted.set(slug, addressesIn(v.note));
for (const x of ONCHAIN_NOT_THIS_ROW)
	retracted.set(x.slug, (retracted.get(x.slug) ?? new Set()).add(x.address));
const seedOwner = new Map<string, string>();
for (const s of ONCHAIN_SEEDS)
	for (const c of s.contracts ?? []) seedOwner.set(c.address, s.slug);
const links: OnchainMapLink[] = [];
for (const l of kept) {
	const owner = seedOwner.get(l.address);
	if (retracted.get(l.slug)?.has(l.address))
		left.push({ row: l, reason: "a curator named it as another product's" });
	else if (owner && owner !== l.slug)
		left.push({ row: l, reason: `a hand-verified seed gives it to ${owner}` });
	else links.push(l);
}
links.sort(
	(a, b) =>
		a.slug.localeCompare(b.slug) ||
		a.kind.localeCompare(b.kind) ||
		a.address.localeCompare(b.address),
);

const count = (xs: OnchainMapLink[]) => {
	const out: Record<string, number> = {};
	for (const x of xs)
		out[`${x.kind} ${x.tier}`] = (out[`${x.kind} ${x.tier}`] ?? 0) + 1;
	return out;
};
const leftByReason: Record<string, number> = {};
for (const x of left)
	leftByReason[x.reason] = (leftByReason[x.reason] ?? 0) + 1;

const out = {
	about:
		"Mainnet contracts and accounts linked to Stellar Light directory projects, each with why (evidence), how strong (tier), the public page it was read from (sourceUrl) and, where proved, when it was created: a contract's creation or an account's opening found in that ledger's own metadata from an archive RPC (createdLedger, createdAt; an account's opening is not a launch date). Built 2026-11-21 to 2026-11-23 read-only from public sources: the directory, the projects' own repos, pages, stellar.toml files and SCF proposals, Stellar Index, stellar-expert/public-directory, Horizon and the ledger itself. The own-code test was checked on contracts whose owner was already known: it called 1 of 112 other projects' contracts its own and recognised 53 of 70 own contracts, so a contract missing here is not proof it is not the project's. An address linked to more than one project is linked to none, except within an issuer-and-token family (kept for each member, one tier down, sharedWithinFamily naming them, issuer first) and the groups given to one member by hand (src/lib/onchain-map.ts). Weaker links (named on the project's own pages only, or the same deployer only) are left out. Built by scripts/build-onchain-map.ts; read by the on-chain lane, which serves the links on project rows (onchain.contracts, onchain.accounts) and on /api/contracts and re-checks each week that every address still exists.",
	builtAt: "2026-11-23",
	attribution: ONCHAIN_MAP_ATTRIBUTION,
	licenses: { "stellar-expert/public-directory": PUBLIC_DIRECTORY_LICENSE },
	evidenceKinds: EVIDENCE_KINDS,
	tiers: {
		strong:
			"the directory, a code proof, a protocol registry anchor or the project's own account",
		labelled:
			"a public-directory label under the project's own domain (a third party's label, not a verification), or an address shared within an issuer-and-token family",
	},
	counts: {
		links: links.length,
		byKindAndTier: count(links),
		left: leftByReason,
	},
	links,
};

console.log(`map rows: ${csvRows.length}`);
console.log(`links: ${links.length}`, count(links));
console.log(
	`projects: ${new Set(links.map((l) => l.slug)).size} (contracts ${new Set(links.filter((l) => l.kind === "contract").map((l) => l.slug)).size}, accounts ${new Set(links.filter((l) => l.kind === "account").map((l) => l.slug)).size})`,
);
console.log("left out:", leftByReason);
for (const x of left.filter((x) => x.reason !== "weaker tier"))
	console.log(`  left ${x.row.slug} ${x.row.address}: ${x.reason}`);
console.log(
	`undated: ${
		links
			.filter((l) => !l.createdAt)
			.map((l) => `${l.slug} ${l.address.slice(0, 8)}`)
			.join(", ") || "none"
	}`,
);
let prior: { links?: OnchainMapLink[] } = {};
try {
	prior = JSON.parse(readFileSync(OUT, "utf8"));
} catch {
	// first build
}
const key = (l: OnchainMapLink) => `${l.slug} ${l.address}`;
const before = new Map(
	(prior.links ?? []).map((l) => [key(l), JSON.stringify(l)]),
);
const after = new Map(links.map((l) => [key(l), JSON.stringify(l)]));
const added = [...after.keys()].filter((k) => !before.has(k));
const dropped = [...before.keys()].filter((k) => !after.has(k));
const changed = [...after.keys()].filter(
	(k) => before.has(k) && before.get(k) !== after.get(k),
);
console.log(
	`diff against the file: +${added.length} -${dropped.length} ~${changed.length}`,
);
for (const k of dropped) console.log(`  - ${k}`);
if (problems.length) {
	console.error(
		`STOP: ${problems.length} problem(s)\n  ${problems.join("\n  ")}`,
	);
	process.exit(1);
}
if (WRITE) {
	writeFileSync(OUT, `${JSON.stringify(out, null, "\t")}\n`);
	console.log(`wrote ${OUT}`);
} else console.log("dry run: --write to write the file");
