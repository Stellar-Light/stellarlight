/**
 * Build src/data/hackmeridian-2026-hackproof.json: HackMeridian 2026 records
 * from HackProof at one pinned commit, kept and checked by Scout's own reads.
 * scripts/import-curated-builds.ts stores the file's rows.
 *
 *   pnpm exec tsx scripts/build-hackmeridian-2026-hackproof.ts          # dry run: reads, prints the diff, writes nothing
 *   pnpm exec tsx scripts/build-hackmeridian-2026-hackproof.ts --write  # write the file
 *
 * Reads, all GETs but the RPC's read-only getLedgerEntries: HackProof's files
 * at PIN; each record's repo (GitHub API, GITHUB_TOKEN or GH_TOKEN): its
 * name, description, topics, README and, when those are silent, up to 500 of
 * its other markdown files; and for each kept record every contract id it
 * cites: the cited file at HEAD, the instance on testnet, its creation on
 * stellar.expert. The rules are src/lib/hackproof.ts.
 *
 * Refresh: move PIN to a new commit and run the dry run. It prints the rows
 * added and dropped, the placements that changed and the contracts kept, so
 * nothing changes unread. A record or id that could not be checked is left
 * out with its reason, never written as absent, and the run exits 2.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Contract } from "@stellar/stellar-sdk";
import yaml from "js-yaml";
import { CURATED_HACKATHONS } from "../src/data/curated-hackathons";
import {
	type ContractChecks,
	clean,
	contractVerdict,
	entryBasisOf,
	expertProbe,
	fileProbe,
	firstHeading,
	type Mention,
	namedUpFront,
	type RepoRead,
	type RepoText,
	rpcProbes,
} from "../src/lib/hackproof";

const PIN = "ea7e1982c9beea491048e668fa6dfb62a4f9a8e5";
const SOURCE = "https://github.com/devodii/hackproof";
const RAW = `https://raw.githubusercontent.com/devodii/hackproof/${PIN}`;
const BLOB = `${SOURCE}/blob/${PIN}`;
const EVENT = "hackmeridian-2026";
const OUT = join(
	dirname(fileURLToPath(import.meta.url)),
	"../src/data/hackmeridian-2026-hackproof.json",
);
const RPC = "https://soroban-testnet.stellar.org";
const EXPERT = "https://api.stellar.expert/explorer/testnet/contract/";
/** Every other markdown file of a silent repo, bounded: 60 left two repos
 * read in part (94 and 353 files). */
const DOCS_MAX = 500;
const VENDORED = /(^|\/)(node_modules|vendor|target|dist|build|\.next|out)\//i;
/** The strongest chain match first: the order the research ranked them. */
const METHODS = [
	"contract_in_repo",
	"deployer_in_repo",
	"wasm_hash_match",
	"wasm_meta",
	"asset_in_repo",
];
const WRITE = process.argv.includes("--write");
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const UA = "stellarlight-hackproof-import (read-only)";

interface Evidence {
	kind: string;
	subject: string;
	method: string;
	file_url?: string | null;
}
interface HpRecord {
	event: string;
	repo_url: string;
	track: string;
	track_declared: boolean;
	award?: "first" | "runner-up" | null;
	evidence_tier: "verified" | "likely";
	commits_in_window?: number | null;
	chain: { evidence: Evidence[] };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Text from bytes: UTF-16 when a byte-order mark says so, else UTF-8. */
function decode(b: Uint8Array): string {
	if (b[0] === 0xff && b[1] === 0xfe)
		return new TextDecoder("utf-16le").decode(b.subarray(2));
	if (b[0] === 0xfe && b[1] === 0xff)
		return new TextDecoder("utf-16be").decode(b.subarray(2));
	return new TextDecoder().decode(b).replace(/^﻿/, "");
}

/** One GET (or the RPC POST), retried on a rate limit, a 5xx or a network
 * failure; status null when no answer came. */
async function http(
	url: string,
	init: { github?: boolean; body?: unknown } = {},
): Promise<{ status: number | null; bytes: Uint8Array | null }> {
	const headers: Record<string, string> = { "User-Agent": UA };
	if (init.github) {
		headers.Accept = "application/vnd.github+json";
		if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
	}
	if (init.body) headers["Content-Type"] = "application/json";
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const res = await fetch(url, {
				method: init.body ? "POST" : "GET",
				headers,
				body: init.body ? JSON.stringify(init.body) : undefined,
				signal: AbortSignal.timeout(30_000),
			});
			const limited =
				res.status === 429 ||
				res.status >= 500 ||
				(res.status === 403 &&
					res.headers.get("x-ratelimit-remaining") === "0");
			if (limited && attempt < 3) {
				// stellar.expert's limit needs tens of seconds to clear.
				await sleep((res.status === 429 ? 10_000 : 3000) * 2 ** attempt);
				continue;
			}
			return {
				status: res.status,
				bytes: new Uint8Array(await res.arrayBuffer()),
			};
		} catch {
			if (attempt < 3) await sleep(2000 * (attempt + 1));
		}
	}
	return { status: null, bytes: null };
}

const json = (b: Uint8Array | null) =>
	b ? (JSON.parse(new TextDecoder().decode(b)) as unknown) : null;
const encodePath = (p: string) =>
	p.split("/").map(encodeURIComponent).join("/");

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
	const out: R[] = [];
	let i = 0;
	await Promise.all(
		Array.from({ length: Math.min(n, items.length) }, async () => {
			while (i < items.length) {
				const k = i++;
				out[k] = await fn(items[k]);
			}
		}),
	);
	return out;
}

interface RepoMeta {
	fullName: string;
	name: string;
	description: string | null;
	homepage: string | null;
	createdAt: string | null;
	branch: string;
	readme: string | null;
}

/** The repo's own text, read now. */
async function readRepo(
	full: string,
): Promise<{ read: RepoRead; meta?: RepoMeta }> {
	const r = await http(`https://api.github.com/repos/${full}`, {
		github: true,
	});
	if (r.status === 404 || r.status === 451) return { read: { state: "gone" } };
	if (r.status !== 200)
		return {
			read: {
				state: "could-not-check",
				reason: `the repo read answered ${r.status ?? "nothing"}`,
			},
		};
	const m = json(r.bytes) as {
		full_name: string;
		name: string;
		description: string | null;
		topics?: string[];
		homepage: string | null;
		created_at: string | null;
		default_branch: string;
	};
	const rd = await http(`https://api.github.com/repos/${m.full_name}/readme`, {
		github: true,
	});
	if (rd.status !== 200 && rd.status !== 404)
		return {
			read: {
				state: "could-not-check",
				reason: `the README read answered ${rd.status ?? "nothing"}`,
			},
		};
	const body =
		rd.status === 200
			? (json(rd.bytes) as { path: string; content: string })
			: null;
	const readme = body
		? {
				path: body.path,
				text: decode(new Uint8Array(Buffer.from(body.content, "base64"))),
			}
		: null;
	const meta: RepoMeta = {
		fullName: m.full_name,
		name: m.name,
		description: m.description,
		homepage: m.homepage,
		createdAt: m.created_at,
		branch: m.default_branch,
		readme: readme?.text ?? null,
	};
	const text: RepoText = {
		name: m.name,
		description: m.description,
		topics: m.topics ?? [],
		readme,
		docs: [],
	};
	if (namedUpFront(text))
		return { read: { state: "read", text, docsRead: 0, docsTotal: 0 }, meta };
	// Silent so far: every other markdown file, shallowest first, up to 500.
	const t = await http(
		`https://api.github.com/repos/${m.full_name}/git/trees/${encodeURIComponent(m.default_branch)}?recursive=1`,
		{ github: true },
	);
	if (t.status !== 200)
		return {
			read: {
				state: "could-not-check",
				reason: `the file tree read answered ${t.status ?? "nothing"}`,
			},
			meta,
		};
	const tree = json(t.bytes) as {
		truncated?: boolean;
		tree: Array<{ path: string; type: string; size?: number }>;
	};
	const mds = tree.tree
		.filter(
			(e) =>
				e.type === "blob" &&
				e.path.toLowerCase().endsWith(".md") &&
				!VENDORED.test(e.path) &&
				e.path !== readme?.path &&
				(e.size ?? 0) < 400_000,
		)
		.map((e) => e.path)
		.sort(
			(a, b) => a.split("/").length - b.split("/").length || (a < b ? -1 : 1),
		);
	const docs = await pool(mds.slice(0, DOCS_MAX), 4, async (p) => {
		const d = await http(
			`https://raw.githubusercontent.com/${m.full_name}/${encodeURIComponent(m.default_branch)}/${encodePath(p)}`,
		);
		return d.status === 200 && d.bytes
			? { path: p, text: decode(d.bytes) }
			: null;
	});
	const ok = docs.filter((d): d is { path: string; text: string } => !!d);
	return {
		read: {
			state: "read",
			text: { ...text, docs: ok },
			docsRead: ok.length,
			// A cut listing never reads as every file read.
			docsTotal: tree.truncated
				? Math.max(mds.length, ok.length + 1)
				: mds.length,
		},
		meta,
	};
}

/** The cited file at HEAD, read once per repo and path. */
const files = new Map<
	string,
	Promise<{ status: number | null; text: string | null }>
>();
function readCited(fileUrl: string, fullName: string) {
	const m = /^https:\/\/github\.com\/[^/]+\/[^/]+\/blob\/[^/]+\/(.+)$/.exec(
		fileUrl,
	);
	const url = m
		? `https://raw.githubusercontent.com/${fullName}/HEAD/${encodePath(decodeURIComponent(m[1]))}`
		: fileUrl;
	let p = files.get(url);
	if (!p) {
		p = http(url).then((r) => ({
			status: r.status,
			text: r.status === 200 && r.bytes ? decode(r.bytes) : null,
		}));
		files.set(url, p);
	}
	return { path: m ? decodeURIComponent(m[1]) : fileUrl, read: p };
}

async function main() {
	const event = CURATED_HACKATHONS.find((h) => h.uname === EVENT);
	if (!event) throw new Error(`${EVENT} is not a curated event`);
	const window = {
		start: new Date(event.start_time * 1000).toISOString(),
		end: new Date(event.end_time * 1000).toISOString(),
	};
	console.log(
		`build-hackmeridian-2026-hackproof: ${WRITE ? "WRITE" : "dry run, writes nothing"}; HackProof at ${PIN}; window ${window.start} to ${window.end}${TOKEN ? "" : "; no GitHub token, unauthenticated reads"}`,
	);
	const treeRes = await http(
		`https://api.github.com/repos/devodii/hackproof/git/trees/${PIN}?recursive=1`,
		{ github: true },
	);
	const tree = json(treeRes.bytes) as {
		truncated?: boolean;
		tree?: Array<{ path: string }>;
	} | null;
	if (treeRes.status !== 200 || !tree?.tree || tree.truncated)
		throw new Error(`HackProof's tree at ${PIN} could not be read whole`);
	const keys = tree.tree
		.map((e) => /^data\/2026\/([a-z0-9-]+)\.yml$/.exec(e.path)?.[1])
		.filter((k): k is string => !!k);
	const text = async (path: string) => {
		const r = await http(`${RAW}/${path}`);
		if (r.status !== 200 || !r.bytes)
			throw new Error(`${path} at ${PIN} answered ${r.status}`);
		return decode(r.bytes);
	};
	const license = (await text("LICENSE")).trim();
	const config = yaml.load(await text("data/hackmeridian-2026.yaml")) as {
		awards: Array<{ project_id: string; place: string }>;
	};
	const awards = new Map(
		config.awards.map((a) => [
			a.project_id.replace(/^repo:/, "").toLowerCase(),
			a.place,
		]),
	);
	const records = await pool(keys, 8, async (k) => ({
		file: k,
		rec: yaml.load(await text(`data/2026/${k}.yml`)) as HpRecord,
	}));
	// The event file and the records must agree on every placement.
	const repoOf = (r: HpRecord) =>
		r.repo_url.replace(/^https:\/\/github\.com\//, "").replace(/\/$/, "");
	const mismatch = records.filter(
		({ rec }) =>
			(rec.award ?? undefined) !== awards.get(repoOf(rec).toLowerCase()),
	);
	if (
		mismatch.length ||
		[...awards.keys()].length !== records.filter((r) => r.rec.award).length
	)
		throw new Error(
			`placements disagree between the event file and the records: ${mismatch.map((m) => m.file).join(", ")}`,
		);
	console.log(`${records.length} records, ${awards.size} placements`);

	const checkedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
	const rows: Array<Record<string, unknown> & { file: string }> = [];
	const left: Array<{
		file: string;
		repo: string;
		reason: string;
		couldNotCheck?: true;
	}> = [];
	const contractsLeft: Array<{
		file: string;
		id: string;
		reason: string;
		couldNotCheck?: true;
	}> = [];
	const reads = await pool(records, 4, async ({ file, rec }) => ({
		file,
		rec,
		...(await readRepo(repoOf(rec))),
	}));
	const kept: Array<{
		file: string;
		rec: HpRecord;
		meta: RepoMeta;
		basis: string;
		mention: Mention | null;
	}> = [];
	for (const { file, rec, read, meta } of reads) {
		const d = entryBasisOf(read, !!rec.award);
		if ("left" in d || !meta) {
			const why =
				"left" in d ? d : { left: "no repo metadata", couldNotCheck: true };
			left.push({
				file,
				repo: repoOf(rec),
				reason: why.left,
				...(why.couldNotCheck ? { couldNotCheck: true as const } : {}),
			});
			continue;
		}
		kept.push({ file, rec, meta, basis: d.basis, mention: d.mention });
	}

	// Every contract id a kept record cites in its repo, with its citing files.
	const cited = kept.flatMap(({ file, rec, meta }) => {
		const byId = new Map<string, string[]>();
		for (const e of rec.chain.evidence)
			if (
				e.kind === "contract" &&
				e.method === "contract_in_repo" &&
				e.file_url
			)
				byId.set(e.subject, [...(byId.get(e.subject) ?? []), e.file_url]);
		return [...byId].map(([id, urls]) => ({
			file,
			id,
			urls,
			fullName: meta.fullName,
		}));
	});
	const keyOf = new Map(
		cited.map((c) => [c.id, new Contract(c.id).getFootprint().toXDR("base64")]),
	);
	const rpc = new Map<string, ContractChecks["rpc"]>();
	const allKeys = [...new Set(keyOf.values())];
	for (let i = 0; i < allKeys.length; i += 100) {
		const batch = allKeys.slice(i, i + 100);
		const r = await http(RPC, {
			body: {
				jsonrpc: "2.0",
				id: 1,
				method: "getLedgerEntries",
				params: { keys: batch },
			},
		});
		for (const [k, p] of rpcProbes(
			batch,
			r.status === 200 ? json(r.bytes) : null,
		))
			rpc.set(k, p);
	}
	const expert = new Map<string, ContractChecks["expert"]>();
	for (const id of new Set(cited.map((c) => c.id))) {
		const r = await http(EXPERT + id);
		let body: unknown = null;
		try {
			body = r.status === 200 ? json(r.bytes) : null;
		} catch {
			body = null;
		}
		expert.set(
			id,
			expertProbe(r.status === 200 && !body ? null : r.status, body),
		);
		await sleep(600);
	}
	const contractsOf = new Map<
		string,
		Array<{ id: string; createdAt: string; path: string }>
	>();
	for (const c of cited) {
		// The first citing file that holds the id; else the first one read.
		let file: ContractChecks["file"] = {
			state: "could-not-check",
			why: "no file read",
		};
		let path = "";
		for (const u of c.urls) {
			const f = readCited(u, c.fullName);
			const r = await f.read;
			const probe = fileProbe(r.status, r.text, c.id);
			if (!path || probe.state === "found") {
				file = probe;
				path = f.path;
			}
			if (probe.state === "found") break;
		}
		const v = contractVerdict(
			{
				file,
				rpc: rpc.get(keyOf.get(c.id) ?? "") ?? {
					state: "could-not-check",
					why: "not asked",
				},
				expert: expert.get(c.id) ?? {
					state: "could-not-check",
					why: "not asked",
				},
			},
			window,
		);
		if (v.keep)
			contractsOf.set(c.file, [
				...(contractsOf.get(c.file) ?? []),
				{ id: c.id, createdAt: v.createdAt, path },
			]);
		else
			contractsLeft.push({
				file: c.file,
				id: c.id,
				reason: v.reason,
				...(v.couldNotCheck ? { couldNotCheck: true as const } : {}),
			});
	}

	for (const { file, rec, meta, basis, mention } of kept) {
		const homepage = /^https?:\/\//i.test(meta.homepage ?? "")
			? meta.homepage
			: null;
		const methods = new Set(rec.chain.evidence.map((e) => e.method));
		rows.push({
			file,
			repo: meta.fullName,
			url: `${BLOB}/data/2026/${file}.yml`,
			name: firstHeading(meta.readme) ?? meta.name,
			description: meta.description ? clean(meta.description) || null : null,
			homepage,
			track: rec.track_declared
				? rec.track.charAt(0).toUpperCase() + rec.track.slice(1)
				: null,
			placement:
				rec.award === "first"
					? "First place"
					: rec.award === "runner-up"
						? "Runner-up"
						: null,
			basis,
			mention,
			tier: rec.evidence_tier,
			method: METHODS.find((x) => methods.has(x)) ?? null,
			repoCreatedAt: meta.createdAt,
			commitsInWindow: rec.commits_in_window ?? null,
			contracts: (contractsOf.get(file) ?? []).sort((a, b) =>
				a.id < b.id ? -1 : 1,
			),
		});
	}
	rows.sort((a, b) => (a.file < b.file ? -1 : 1));
	left.sort((a, b) => (a.file < b.file ? -1 : 1));
	contractsLeft.sort((a, b) =>
		a.file < b.file ? -1 : a.file > b.file ? 1 : a.id < b.id ? -1 : 1,
	);

	const out = {
		about: `HackMeridian 2026 records from HackProof (${SOURCE}) at commit ${PIN}, kept where the repo's own text names the event (basis repo-names-event) or HackProof lists a placement (placement-listed), with Scout's own reads of each repo and of each contract it cites, made at checkedAt. Built by scripts/build-hackmeridian-2026-hackproof.ts; refresh only through its dry run. Each row's url is its HackProof record at that commit. HackProof's license follows.`,
		license,
		source: {
			repo: SOURCE,
			commit: PIN,
			records: `${BLOB}/data/2026`,
			awards: `${BLOB}/data/hackmeridian-2026.yaml`,
		},
		event: EVENT,
		window,
		checkedAt,
		rows,
		left,
		contractsLeft,
	};

	// What changed against the committed file, so a refresh is read first.
	const prev = existsSync(OUT)
		? (JSON.parse(readFileSync(OUT, "utf8")) as typeof out)
		: null;
	const before = new Map((prev?.rows ?? []).map((r) => [r.file, r]));
	const now = new Map(rows.map((r) => [r.file, r]));
	const added = [...now.keys()].filter((k) => !before.has(k));
	const dropped = [...before.keys()].filter((k) => !now.has(k));
	const moved = [...now].filter(
		([k, r]) => before.has(k) && before.get(k)?.placement !== r.placement,
	);
	const count = (k: string) => rows.filter((r) => r.basis === k).length;
	const kinds = new Map<string, number>();
	for (const c of contractsLeft) {
		const kind = c.couldNotCheck
			? "could not check"
			: c.reason
					.split(":")[0]
					.replace(/^created .*/, "created outside the window");
		kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
	}
	const keptIds = rows.reduce(
		(n, r) => n + (r.contracts as unknown[]).length,
		0,
	);
	console.log(
		`\nrows: ${rows.length} (repo-names-event ${count("repo-names-event")}, placement-listed ${count("placement-listed")}); placements ${rows.filter((r) => r.placement).length}; left out ${left.length} (${left.filter((l) => l.couldNotCheck).length} could not check)`,
	);
	console.log(
		`contracts: ${cited.length} cited by kept rows, ${keptIds} kept on ${rows.filter((r) => (r.contracts as unknown[]).length).length} rows, ${contractsLeft.length} left out: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ") || "none"}`,
	);
	console.log(
		prev
			? `against the committed file (checked ${prev.checkedAt}): ${added.length} added${added.length ? ` (${added.join(", ")})` : ""}, ${dropped.length} dropped${dropped.length ? ` (${dropped.join(", ")})` : ""}, ${moved.length} placements changed${moved.length ? ` (${moved.map(([k, r]) => `${k}: ${before.get(k)?.placement ?? "none"} -> ${r.placement ?? "none"}`).join(", ")})` : ""}`
			: "no committed file yet",
	);
	for (const l of left) console.log(`  left out ${l.file}: ${l.reason}`);
	for (const c of contractsLeft)
		console.log(`  contract left out ${c.file} ${c.id}: ${c.reason}`);
	const unchecked =
		left.filter((l) => l.couldNotCheck).length +
		contractsLeft.filter((c) => c.couldNotCheck).length;
	if (WRITE) {
		writeFileSync(OUT, `${JSON.stringify(out, null, "\t")}\n`);
		console.log(`\nwrote ${OUT}`);
	} else
		console.log(
			"\ndry run: nothing written. Re-run with --write to write the file.",
		);
	if (unchecked) {
		console.error(
			`✗ ${unchecked} record(s) or contract(s) could not be checked and are left out; re-run to read them again`,
		);
		process.exitCode = 2;
	}
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
