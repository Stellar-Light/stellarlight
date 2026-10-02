/**
 * Ingest SCF submissions (communityfund.stellar.org) into the ResearchDocs
 * corpus as source "scf-proposal".
 *
 * The source existed in the enum and the collection since the corpus was
 * designed but held no documents; every scoped query answered zero rows. An
 * external agent routes funding and project questions to it.
 *
 * What a document is: ONE submission to ONE award round, keyed on the SCF
 * submission record id (stable across re-ingests), with the proposal's own
 * sections as they appear on the public submission page (Products & Services,
 * Traction Evidence, Go-To-Market Plan, the tranche deliverable roadmaps,
 * Team, ...) and the facts the page states about it (project, round, status,
 * award type, requested budget). Every status is kept, with the status in the
 * document and its tags, so "what did X propose and was it awarded" is one
 * read.
 *
 * Where the text lives: the site is a Next.js App Router app. The list
 * endpoint /backend/projects gives id, slug, title, category and the last
 * awarded round for every project (531 on 2026-10-02). Each project page
 * embeds a React Server Components flight payload holding the project record
 * with its submissions (id, title, status, round, budget, award type). Each
 * public submission page /submissions/<id> embeds the proposal sections as
 * h4 headings followed by text nodes, some of them references to separate
 * text chunks ("$1f") whose byte lengths are declared in hex. No JSON API
 * serves the proposal text; /backend/submissions/<id> returns an empty body.
 *
 * Usage:
 *   npx tsx scripts/ingest-scf-proposals.ts                 # dry run: fetch, chunk, plan, no DB
 *   npx tsx scripts/ingest-scf-proposals.ts --limit=5       # dry run on the first 5 projects
 *   npx tsx scripts/ingest-scf-proposals.ts --execute       # embed + write to Payload
 *   npx tsx scripts/ingest-scf-proposals.ts --replan        # DB diff, no write (idempotence gate)
 */

import "./load-env";
import { getPayload } from "payload";
import {
	chunkMarkdown,
	loadExistingChunks,
	upsertChunks,
} from "../src/lib/research-ingest";
import configPromise from "../src/payload.config";

const args = process.argv.slice(2);
const execute = args.includes("--execute");
const replan = args.includes("--replan");
const limitArg = args.find((a) => a.startsWith("--limit="));
const projectLimit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
const CONCURRENCY = 4;

const BASE = "https://communityfund.stellar.org";
const UA = "stellarlight-scout-ingest";

interface ListedProject {
	id: string;
	slug: string;
	title: string;
	category?: string | null;
	lastAwardedRound?: number | null;
}

interface SubmissionSummary {
	id: string;
	title: string;
	status: string;
	roundName: string;
	budget: number | string | null;
	awardType: string | null;
}

interface ProjectRecord {
	slug: string;
	title: string;
	description?: string;
	category?: string;
	submissions?: SubmissionSummary[];
}

async function fetchText(url: string): Promise<string> {
	const res = await fetch(url, {
		headers: { "User-Agent": UA, Accept: "text/html,application/json" },
		signal: AbortSignal.timeout(20_000),
	});
	if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
	return res.text();
}

// ── RSC flight parsing ──────────────────────────────────────────────────────
// The page inlines `self.__next_f.push([1, "<chunk>"])` calls. Joined, the
// chunks form lines of `<hexid>:<payload>`; a payload starting with `T<hex>,`
// is a text chunk whose length is given in BYTES, so the walk is on bytes.

type Segment = { kind: "T" | "J"; body: string };

function flightSegments(html: string): Map<string, Segment> {
	const pushes = [
		...html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g),
	].map((m) => JSON.parse(m[1]) as string);
	const raw = Buffer.from(pushes.join(""), "utf8");
	const segs = new Map<string, Segment>();
	let i = 0;
	const n = raw.length;
	const idRe = /^([0-9a-f]{1,3}):/;
	const tRe = /^T([0-9a-f]+),/;
	while (i < n) {
		const head = raw.subarray(i, i + 6).toString("latin1");
		const m = idRe.exec(head);
		if (!m) {
			const j = raw.indexOf(0x0a, i);
			i = j < 0 ? n : j + 1;
			continue;
		}
		const id = m[1];
		i += m[0].length;
		const t = tRe.exec(raw.subarray(i, i + 12).toString("latin1"));
		if (t) {
			const len = Number.parseInt(t[1], 16);
			i += t[0].length;
			segs.set(id, {
				kind: "T",
				body: raw.subarray(i, i + len).toString("utf8"),
			});
			i += len;
			if (raw[i] === 0x0a) i += 1;
		} else {
			const j = raw.indexOf(0x0a, i);
			const body = (j < 0 ? raw.subarray(i) : raw.subarray(i, j)).toString(
				"utf8",
			);
			segs.set(id, { kind: "J", body });
			i = j < 0 ? n : j + 1;
		}
	}
	return segs;
}

function joinedTree(segs: Map<string, Segment>): string {
	return [...segs.values()]
		.filter((s) => s.kind === "J")
		.map((s) => s.body)
		.join("\n");
}

/** The JSON object containing `needle`, found by walking back to its `{` and forward to the matching `}`. */
function recordAround(tree: string, needle: string): unknown | null {
	const at = tree.indexOf(needle);
	if (at < 0) return null;
	const start = tree.lastIndexOf("{", at);
	let depth = 0;
	let inString = false;
	for (let j = start; j < tree.length; j++) {
		const c = tree[j];
		if (inString) {
			if (c === "\\") j += 1;
			else if (c === '"') inString = false;
			continue;
		}
		if (c === '"') inString = true;
		else if (c === "{") depth += 1;
		else if (c === "}") {
			depth -= 1;
			if (depth === 0) {
				try {
					return JSON.parse(tree.slice(start, j + 1));
				} catch {
					return null;
				}
			}
		}
	}
	return null;
}

function unescapeJsonString(s: string): string {
	try {
		return JSON.parse(`"${s}"`) as string;
	} catch {
		return s;
	}
}

/** Ordered (heading, text) sections of a submission page, references resolved. */
function submissionSections(
	segs: Map<string, Segment>,
): Array<{ heading: string; text: string }> {
	const tree = joinedTree(segs);
	const resolve = (s: string): string => {
		const m = /^\$([0-9a-f]{1,3})$/.exec(s);
		const seg = m ? segs.get(m[1]) : undefined;
		return seg && seg.kind === "T" ? seg.body : s;
	};
	const items: Array<[number, "h4" | "text", string]> = [];
	for (const m of tree.matchAll(
		/\["\$","h4",null,\{"children":"((?:[^"\\]|\\.)*)"/g,
	)) {
		items.push([m.index ?? 0, "h4", unescapeJsonString(m[1])]);
	}
	for (const m of tree.matchAll(/"text":"((?:[^"\\]|\\.)*)"/g)) {
		items.push([m.index ?? 0, "text", resolve(unescapeJsonString(m[1]))]);
	}
	items.sort((a, b) => a[0] - b[0]);
	const out: Array<{ heading: string; text: string }> = [];
	let open = false;
	for (const [, kind, value] of items) {
		if (kind === "h4") {
			// The page closes with a list of the project's other submissions.
			if (value === "Other Submissions") break;
			out.push({ heading: value, text: "" });
			open = true;
		} else if (open) {
			out[out.length - 1].text += value;
		}
	}
	return out.filter((s) => s.text.trim().length > 0);
}

// ── Document assembly ───────────────────────────────────────────────────────

const slugify = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

/** "$$50.0K" on the page is one dollar sign too many. */
const cleanBudget = (b: unknown): string | null => {
	if (b === null || b === undefined || b === "") return null;
	if (typeof b === "number") return `$${b.toLocaleString("en-US")}`;
	return String(b).replace(/^\$\$/, "$");
};

function buildMarkdown(
	project: ListedProject,
	rec: ProjectRecord | null,
	sub: SubmissionSummary,
	sections: Array<{ heading: string; text: string }>,
): string {
	const facts = [
		`Project: ${rec?.title ?? project.title} (${BASE}/project/${project.slug})`,
		`Award round: ${sub.roundName}`,
		`Status: ${sub.status.trim()}`,
		sub.awardType ? `Award type: ${sub.awardType}` : null,
		cleanBudget(sub.budget)
			? `Requested budget: ${cleanBudget(sub.budget)}`
			: null,
		project.category ? `Category: ${project.category}` : null,
	].filter(Boolean);
	const body = sections
		.map((s) => `## ${s.heading}\n\n${s.text.trim()}`)
		.join("\n\n");
	const intro = rec?.description ? `${rec.description.trim()}\n\n` : "";
	return `# ${sub.title} (SCF submission, ${sub.roundName})\n\n${facts.join("\n")}\n\n${intro}${body}\n`;
}

async function pool<T, R>(
	items: T[],
	n: number,
	fn: (t: T, i: number) => Promise<R>,
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (next < items.length) {
				const i = next++;
				out[i] = await fn(items[i], i);
			}
		}),
	);
	return out;
}

async function run() {
	const startedAt = Date.now();
	console.log(
		execute ? "EXECUTE MODE" : replan ? "REPLAN MODE" : "DRY RUN MODE",
	);
	console.log(`source: ${BASE}\n`);

	const payload =
		execute || replan ? await getPayload({ config: configPromise }) : null;
	const existing = payload
		? await loadExistingChunks(payload, "scf-proposal")
		: new Map();
	if (payload) {
		const total = [...existing.values()].reduce((s, m) => s + m.size, 0);
		console.log(`  ${total} existing chunks already in collection\n`);
	}

	const listed = (await fetchText(`${BASE}/backend/projects`).then((t) =>
		JSON.parse(t),
	)) as ListedProject[];
	const projects = listed.slice(0, projectLimit);
	console.log(
		`Projects listed: ${listed.length}${Number.isFinite(projectLimit) ? ` (processing ${projects.length})` : ""}`,
	);

	let pageErrors = 0;
	let submissionsSeen = 0;
	let submissionsEmpty = 0;
	const statusCounts = new Map<string, number>();
	const allChunks: ReturnType<typeof chunkMarkdown> = [];
	// A holder, not a let: assignments inside the pool callback are invisible
	// to control-flow narrowing, which typed the later read as never.
	const sample: { md: string | null } = { md: null };

	await pool(projects, CONCURRENCY, async (project) => {
		let rec: ProjectRecord | null = null;
		try {
			const html = await fetchText(`${BASE}/project/${project.slug}`);
			rec = recordAround(
				joinedTree(flightSegments(html)),
				`"slug":"${project.slug}"`,
			) as ProjectRecord | null;
		} catch (err) {
			console.error(`  x project ${project.slug}: ${(err as Error).message}`);
			pageErrors += 1;
			return;
		}
		const subs = rec?.submissions ?? [];
		for (const sub of subs) {
			if (!sub?.id) continue;
			submissionsSeen += 1;
			const status = (sub.status ?? "unknown").trim();
			statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
			try {
				const html = await fetchText(`${BASE}/submissions/${sub.id}`);
				const sections = submissionSections(flightSegments(html));
				if (sections.length === 0) {
					submissionsEmpty += 1;
					continue;
				}
				const md = buildMarkdown(project, rec, sub, sections);
				if (!sample.md) sample.md = md;
				const chunks = chunkMarkdown({
					md,
					parentDocId: `scf-submission-${sub.id}`,
					title: `${sub.title} (SCF submission, ${sub.roundName})`,
					url: `${BASE}/submissions/${sub.id}`,
					tags: [
						"scf-proposal",
						"scf",
						project.slug,
						`round-${slugify(sub.roundName)}`,
						`status-${slugify(status)}`,
						...(project.category ? [slugify(project.category)] : []),
					],
				});
				allChunks.push(...chunks);
			} catch (err) {
				console.error(`  x submission ${sub.id}: ${(err as Error).message}`);
				pageErrors += 1;
			}
		}
	});

	const stats = { new: 0, updated: 0, unchanged: 0, toEmbed: 0 };
	for (const c of allChunks) {
		const prev = existing.get(c.parentDocId)?.get(c.chunkIndex);
		if (prev && prev.contentHash === c.contentHash) stats.unchanged += 1;
		else if (prev) {
			stats.updated += 1;
			stats.toEmbed += 1;
		} else {
			stats.new += 1;
			stats.toEmbed += 1;
		}
	}

	console.log(
		`\nSubmissions: ${submissionsSeen} seen, ${submissionsEmpty} without text`,
	);
	console.log(
		`  by status: ${[...statusCounts.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`,
	);
	console.log(`Chunks: ${allChunks.length} total`);
	console.log(`  new: ${stats.new}`);
	console.log(`  updated: ${stats.updated}`);
	console.log(`  unchanged: ${stats.unchanged}`);
	console.log(`  to embed: ${stats.toEmbed}`);
	console.log(`  page errors: ${pageErrors}`);
	if (sample.md && !execute && !replan) {
		console.log("\nSample document (first 1200 chars):\n");
		console.log(sample.md.slice(0, 1200));
	}

	if ((!execute && !replan) || !payload) {
		console.log("\nDry run complete. Pass --execute to embed + write.");
		return;
	}

	const r = await upsertChunks({
		payload,
		source: "scf-proposal",
		chunks: allChunks,
		existing,
		dryRun: replan,
	});
	console.log(
		`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s, errors: ${r.errors}`,
	);
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
