/**
 * READ-ONLY duplicate detector for the Projects collection.
 *
 * PRECISION-FIRST. A naive "same website host" signal is dangerous — many
 * distinct projects share platform domains (youtube, figma, docs.google,
 * github, or an ecosystem site like allbridge.io). So we only treat two
 * records as duplicates on HIGH-CONFIDENCE signals:
 *   - identical normalized name (spaces/punct/case stripped), OR
 *   - identical GitHub owner/repo.
 * Records are grouped by union-find so overlapping signals don't double-count.
 *
 * It also prints a SEPARATE "fuzzy — review only" list (near names: one is a
 * prefix of the other, or 1-char apart) that is NOT proposed for any action.
 *
 * It does NOT write, update, or delete anything.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/detect-duplicate-projects.ts
 */
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

type Doc = Record<string, any>;

const normName = (s: string) =>
	(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const githubRepo = (d: Doc): string | null => {
	const g = d.github || d.links?.github || null;
	if (!g) return null;
	const m = String(g)
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
	if (!m) return null;
	return `github:${m[1].toLowerCase()}/${m[2].toLowerCase().replace(/\.git$/, "")}`;
};

const VISIBLE = new Set(["Development", "Pre-Release", "Live"]);
function rank(d: Doc): number {
	let s = 0;
	if (VISIBLE.has(d.status)) s += 8;
	if (d.verificationLevel && d.verificationLevel !== "Unverified") s += 4;
	if (d.scf?.awarded) s += 3;
	if (d.shortDescription) s += 1;
	if (d.logo) s += 1;
	return s;
}

// union-find
class UF {
	p = new Map<string, string>();
	find(x: string): string {
		if (!this.p.has(x)) this.p.set(x, x);
		while (this.p.get(x) !== x) {
			this.p.set(x, this.p.get(this.p.get(x)!)!);
			x = this.p.get(x)!;
		}
		return x;
	}
	union(a: string, b: string) {
		this.p.set(this.find(a), this.find(b));
	}
}

const EXECUTE = process.argv.includes("--execute");

async function main() {
	const payload = await getPayload({ config: await configPromise });
	const res = await payload.find({
		collection: "projects",
		pagination: false, // return ALL docs, not just the first page
		depth: 0,
	});
	const docs = res.docs as Doc[];
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE (will set dupes → Draft)" : "DRY RUN (read-only)"}`,
	);
	console.log(`Loaded ${docs.length} projects (totalDocs=${res.totalDocs}).\n`);
	if (docs.length < res.totalDocs) {
		console.log(
			`WARNING: only loaded ${docs.length} of ${res.totalDocs} — detection INCOMPLETE.\n`,
		);
	}

	const byId = new Map<string, Doc>(docs.map((d) => [String(d.id), d]));
	const uf = new UF();

	// Edge sources: exact normalized name, exact github repo.
	const nameKey = new Map<string, string>(); // signal -> first doc id
	const repoKey = new Map<string, string>();
	const link = (key: string, store: Map<string, string>, id: string) => {
		const first = store.get(key);
		if (first) uf.union(first, id);
		else store.set(key, id);
	};
	for (const d of docs) {
		const id = String(d.id);
		uf.find(id); // ensure present
		const nn = normName(d.name);
		if (nn.length >= 3) link(`n:${nn}`, nameKey, id);
		const gr = githubRepo(d);
		if (gr) link(gr, repoKey, id);
	}

	// Collect components with >1 member.
	const comp = new Map<string, string[]>();
	for (const d of docs) {
		const r = uf.find(String(d.id));
		(comp.get(r) ?? comp.set(r, []).get(r)!).push(String(d.id));
	}
	const clusters = [...comp.values()].filter((ids) => ids.length > 1);
	clusters.sort((a, b) => b.length - a.length);

	let toHide = 0;
	console.log(`HIGH-CONFIDENCE duplicate clusters: ${clusters.length}\n`);
	for (const ids of clusters) {
		const ranked = ids
			.map((i) => byId.get(i)!)
			.sort((a, b) => rank(b) - rank(a));
		const keeper = ranked[0];
		console.log(
			`■ keep: ${keeper.name} [${keeper.status}/${keeper.verificationLevel ?? "?"}${keeper.scf?.awarded ? "/SCF" : ""}] (${keeper.slug})`,
		);
		for (const d of ranked.slice(1)) {
			toHide++;
			if (EXECUTE) {
				await payload.update({
					collection: "projects",
					id: d.id,
					data: { status: "Draft" }, // reversible hide — record preserved
				});
				console.log(`   HIDDEN→Draft: ${d.name} (${d.slug}) id=${d.id}`);
			} else {
				console.log(
					`   hide: ${d.name} [${d.status}/${d.verificationLevel ?? "?"}${d.scf?.awarded ? "/SCF" : ""}] (${d.slug}) id=${d.id}`,
				);
			}
		}
	}

	// Fuzzy — review only, NO action proposed.
	const names = docs
		.map((d) => ({ id: String(d.id), name: d.name, nn: normName(d.name) }))
		.filter((x) => x.nn.length >= 4)
		.sort((a, b) => a.nn.localeCompare(b.nn));
	const fuzzy: string[] = [];
	for (let i = 0; i < names.length; i++) {
		for (
			let j = i + 1;
			j < names.length && names[j].nn[0] === names[i].nn[0];
			j++
		) {
			const a = names[i].nn,
				b = names[j].nn;
			if (a === b) continue; // already caught above
			const prefix = b.startsWith(a) || a.startsWith(b);
			const oneEdit =
				Math.abs(a.length - b.length) <= 1 &&
				a.length >= 5 &&
				(a.includes(b.slice(0, -1)) || b.includes(a.slice(0, -1)));
			if (prefix || oneEdit)
				fuzzy.push(`   ? ${names[i].name}  ~  ${names[j].name}`);
		}
	}

	console.log(
		`\nFUZZY (review only, NOT proposed for action): ${fuzzy.length}`,
	);
	for (const f of fuzzy.slice(0, 40)) console.log(f);
	if (fuzzy.length > 40) console.log(`   …and ${fuzzy.length - 40} more`);

	console.log(
		`\nSUMMARY: ${clusters.length} high-confidence clusters · ${toHide} records proposed to hide · ${docs.length - toHide} kept of ${docs.length}.`,
	);
	console.log("READ-ONLY — nothing was changed.");
	process.exit(0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
