/**
 * Hold every indexed repo whose default branch carries malware indicators,
 * and release a hold once a check finds them gone.
 *
 *   pnpm exec tsx scripts/check-repo-security.ts            # dry run, writes nothing
 *   pnpm exec tsx scripts/check-repo-security.ts --execute  # hold and release
 *   pnpm exec tsx scripts/check-repo-security.ts --repos=a/b,c/d  # just these, no database
 *
 * Files are read as text and bytes, never run (src/lib/repo-security.ts).
 * A held repo is left out of every read but trust and explain, which serve
 * it with a warning (the Repos collection's access and beforeOperation hook).
 *
 * Two stages, so a sweep of the whole index stays inside GITHUB_TOKEN's
 * limits (raw.githubusercontent.com throttles a runner long before 13k
 * repos x 3 files):
 * 1. every repo: .vscode/tasks.json, .vscode/settings.json and the root
 *    package.json, 50 repos to a GraphQL query;
 * 2. repos stage 1 flags, that have a tasks.json, or that are held: the
 *    full tree through the REST API, then every package.json and font in it
 *    from raw (fonts first, and only their first 64 bytes).
 * ponytail: a nested install hook in a repo with no tasks.json and nothing
 * at its root is not seen; read every tree when a token has room for one
 * tree call per repo a run.
 *
 * What was read is evidence enough to hold a repo. Clearing one needs every
 * read to succeed, so a failed read never releases a hold: that repo is
 * could-not-check and keeps its state.
 */

import "./load-env";
import { getPayload } from "payload";
import {
	checkVerdict,
	detectIndicators,
	FONT_EXT,
	type Indicator,
	isSecurityRelevant,
	type SecurityHold,
	shouldHold,
} from "../src/lib/repo-security";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const TOKEN = process.env.GITHUB_TOKEN;
const CONTEXT = { internal: true, includeSecurityHeld: true };
/** Files read per repo in stage 2; a repo with more is could-not-check
 * unless what was read already holds it. */
const MAX_FILES = 200;
const ROOT_FILES = {
	tasks: ".vscode/tasks.json",
	settings: ".vscode/settings.json",
	pkg: "package.json",
} as const;
const REPO_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
/** No repo to read under this name: deleted, private, or a stored name
 * GitHub does not know. Could-not-check, but not an instrument failure. */
const NOT_FOUND = "not found on GitHub under this name";
const BAD_NAME = "not a GitHub owner/name";
const NO_SUCH_REPO = new Set([NOT_FOUND, BAD_NAME]);

type File = { path: string; text?: string; bytes?: Uint8Array };
type Root = { files: File[]; gaps: string[] };
type Read = { ok: true; text?: string; bytes?: Uint8Array } | { ok: false };
type Blob = { text?: string | null; isTruncated?: boolean } | null;
type GraphqlBody = {
	data?: Record<string, Record<string, Blob> | null>;
	errors?: Array<{ type?: string; path?: unknown[] }>;
};

/** One GraphQL request; null = no data after three tries. */
async function graphql(query: string): Promise<GraphqlBody | null> {
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch("https://api.github.com/graphql", {
				method: "POST",
				headers: {
					Authorization: `Bearer ${TOKEN}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ query }),
				signal: AbortSignal.timeout(60_000),
			});
			if (res.ok) {
				const body = (await res.json()) as GraphqlBody;
				if (body?.data) return body;
			}
		} catch {}
		await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
	}
	return null;
}

/** Stage 1: the three root files of every repo, 50 repos to a query. A
 * repo or file that does not exist reads as no file. */
async function rootFiles(names: string[]): Promise<Map<string, Root>> {
	const out = new Map<string, Root>();
	const valid = names.filter((n) => {
		if (REPO_NAME.test(n)) return true;
		out.set(n, { files: [], gaps: [BAD_NAME] });
		return false;
	});
	const fields = Object.entries(ROOT_FILES)
		.map(
			([alias, path]) =>
				`${alias}: object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Blob { text isTruncated } }`,
		)
		.join(" ");
	for (let i = 0; i < valid.length; i += 50) {
		const batch = valid.slice(i, i + 50);
		const query = `query { ${batch
			.map((n, k) => {
				const [owner, name] = n.split("/");
				return `r${k}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${fields} }`;
			})
			.join(" ")} }`;
		const body = await graphql(query);
		batch.forEach((n, k) => {
			const root: Root = { files: [], gaps: [] };
			const errors = body?.errors?.filter((e) => e.path?.[0] === `r${k}`) ?? [];
			const repo = body?.data?.[`r${k}`];
			if (!body) root.gaps.push("could not read the root files");
			else if (errors.some((e) => e.type === "NOT_FOUND"))
				root.gaps.push(NOT_FOUND);
			// Any other error, or no data and no error: not read, never clean.
			else if (errors.length || !repo)
				root.gaps.push(
					`could not read the root files (${errors[0]?.type ?? "no data"})`,
				);
			else
				for (const [alias, path] of Object.entries(ROOT_FILES)) {
					const blob = repo[alias];
					if (!blob) continue;
					if (blob.isTruncated || typeof blob.text !== "string")
						root.gaps.push(`could not read ${path}`);
					else root.files.push({ path, text: blob.text });
				}
			out.set(n, root);
		});
	}
	return out;
}

/** One raw file at the default branch, for a path the tree listed (stage
 * 2), so a 404 is a failed read, not an absence. A font's magic number sits
 * in its first bytes, so binary reads stop at 64. */
async function raw(full: string, path: string, binary = false): Promise<Read> {
	const url = `https://raw.githubusercontent.com/${full}/HEAD/${path
		.split("/")
		.map(encodeURIComponent)
		.join("/")}`;
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url, {
				headers: binary ? { Range: "bytes=0-63" } : undefined,
				signal: AbortSignal.timeout(20_000),
			});
			// A range past the end: the file is empty.
			if (binary && res.status === 416)
				return { ok: true, bytes: new Uint8Array(0) };
			if (res.ok) {
				if (binary)
					return { ok: true, bytes: new Uint8Array(await res.arrayBuffer()) };
				return { ok: true, text: await res.text() };
			}
			if (res.status !== 429 && res.status < 500) return { ok: false };
		} catch {}
		await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
	}
	return { ok: false };
}

/** The default branch's file paths, through the REST API (which follows a
 * renamed repo). null = could not read all of them. */
async function tree(full: string): Promise<string[] | null> {
	const res = await fetch(
		`https://api.github.com/repos/${full}/git/trees/HEAD?recursive=1`,
		{
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Bearer ${TOKEN}`,
			},
			signal: AbortSignal.timeout(30_000),
		},
	).catch(() => null);
	if (!res?.ok) return null;
	const body = (await res.json().catch(() => null)) as {
		tree?: Array<{ path: string; type: string }>;
		truncated?: boolean;
	} | null;
	if (!body?.tree || body.truncated) return null;
	return body.tree.filter((t) => t.type === "blob").map((t) => t.path);
}

type Outcome =
	| { repo: string; state: "checked"; indicators: Indicator[] }
	| { repo: string; state: "could-not-check"; why: string };

/** Stage 2 where stage 1 calls for it, then the verdict. `held`: the repo
 * is held now, so it gets the full read a release needs. */
async function check(
	full: string,
	held: boolean,
	root: Root,
): Promise<Outcome> {
	const files = [...root.files];
	let gaps = [...root.gaps];
	const noRepo = gaps.some((g) => NO_SUCH_REPO.has(g));
	const deep =
		held ||
		(gaps.length > 0 && !noRepo) ||
		files.some((f) => f.path === ROOT_FILES.tasks) ||
		detectIndicators(files).length > 0;
	if (deep) {
		const paths = await tree(full);
		// The tree read re-reads whatever stage 1 could not, with its own gaps.
		if (paths) gaps = [];
		else gaps.push("could not read the tree");
		const todo = (paths ?? [])
			.filter(
				(p) =>
					isSecurityRelevant(p) &&
					!/(^|\/)node_modules\//.test(p) &&
					!files.some((f) => f.path === p),
			)
			// The payload first, so the cap never cuts a fake font.
			.sort((a, b) => Number(!FONT_EXT.test(a)) - Number(!FONT_EXT.test(b)));
		if (todo.length > MAX_FILES)
			gaps.push(`${todo.length} files to read, more than ${MAX_FILES}`);
		for (const p of todo.slice(0, MAX_FILES)) {
			const r = await raw(full, p, FONT_EXT.test(p));
			if (!r.ok) {
				gaps.push(`could not read ${p}`);
				continue;
			}
			files.push({ path: p, text: r.text, bytes: r.bytes });
		}
	}
	const indicators = detectIndicators(files);
	if (checkVerdict(indicators, gaps) === "could-not-check")
		return { repo: full, state: "could-not-check", why: gaps[0] };
	return { repo: full, state: "checked", indicators };
}

async function pool<T, R>(
	items: T[],
	n: number,
	fn: (x: T) => Promise<R>,
): Promise<R[]> {
	const out: R[] = new Array(items.length);
	let i = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (i < items.length) {
				const k = i++;
				out[k] = await fn(items[k]);
			}
		}),
	);
	return out;
}

const list = (ind: Indicator[]) =>
	ind.map((i) => `${i.kind} ${i.path}`).join("; ");

/** --repos=a/b,c/d: check just these, print, touch no database. */
const ONLY = process.argv
	.find((a) => a.startsWith("--repos="))
	?.slice("--repos=".length)
	.split(",")
	.filter(Boolean);

type Repo = {
	id: string;
	fullName?: string;
	securityHeld?: boolean;
	securityHold?: SecurityHold | null;
};

async function main() {
	if (!TOKEN) {
		console.error("✗ GITHUB_TOKEN is not set; stage 1 reads through GraphQL");
		process.exitCode = 1;
		return;
	}
	if (ONLY) {
		const roots = await rootFiles(ONLY);
		for (const o of await pool(ONLY, 4, (r) =>
			check(r, false, roots.get(r) as Root),
		))
			console.log(
				o.state === "checked"
					? `${o.repo}: ${o.indicators.length ? `${shouldHold(o.indicators) ? "HOLD" : "report only"}: ${list(o.indicators)}` : "no indicators"}`
					: `${o.repo}: could not check (${o.why})`,
			);
		return;
	}
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`check-repo-security: ${EXECUTE ? "EXECUTE, holds and releases are written" : "dry run, writes nothing"}`,
	);
	const res = await payload.find({
		collection: "repos",
		pagination: false,
		depth: 0,
		select: { fullName: true, securityHeld: true, securityHold: true },
		context: CONTEXT,
	});
	// One check per repo, written to every row that names it: rows that
	// differ only in case are the same repo on GitHub, and each is served.
	const groups = new Map<string, Repo[]>();
	for (const r of res.docs as Repo[]) {
		if (!r.fullName) continue;
		const k = r.fullName.toLowerCase();
		groups.set(k, [...(groups.get(k) ?? []), r]);
	}
	const names = [...groups.values()].map((rows) => String(rows[0].fullName));
	if (!names.length) {
		console.error("✗ read no indexed repos; nothing was checked");
		process.exitCode = 1;
		return;
	}
	console.log(`${names.length} indexed repos to check`);

	const roots = await rootFiles(names);
	console.log(
		`stage 1: root files of ${roots.size} repos, ${[...roots.values()].filter((r) => r.gaps.length).length} not read`,
	);
	const now = new Date().toISOString();
	type Write = {
		id: string;
		repo: string;
		data: { securityHeld: boolean; securityHold: Record<string, unknown> };
		change: "HOLD" | "still held" | "RELEASE";
	};
	const writes: Write[] = [];
	let failed = 0;
	/** The writes one outcome calls for, applied as soon as it is known, so
	 * a run that dies later keeps the holds it found. */
	const settle = async (o: Outcome) => {
		if (o.state !== "checked") return;
		for (const r of groups.get(o.repo.toLowerCase()) ?? []) {
			const repo = String(r.fullName);
			let w: Write | null = null;
			if (shouldHold(o.indicators)) {
				const heldAt =
					r.securityHeld && r.securityHold?.heldAt
						? r.securityHold.heldAt
						: now;
				w = {
					id: r.id,
					repo,
					data: {
						securityHeld: true,
						securityHold: { indicators: o.indicators, checkedAt: now, heldAt },
					},
					change: r.securityHeld ? "still held" : "HOLD",
				};
			} else if (r.securityHeld)
				w = {
					id: r.id,
					repo,
					data: {
						securityHeld: false,
						securityHold: {
							indicators: [],
							checkedAt: now,
							releasedAt: now,
							heldAt: r.securityHold?.heldAt ?? null,
						},
					},
					change: "RELEASE",
				};
			if (!w) continue;
			writes.push(w);
			if (!EXECUTE) continue;
			try {
				await payload.update({
					collection: "repos",
					id: w.id,
					data: w.data,
					context: CONTEXT,
				});
			} catch (e) {
				failed++;
				console.error(`  ✗ ${w.repo}: ${(e as Error).message}`);
			}
		}
	};
	const outcomes = await pool(names, 6, async (n) => {
		const o = await check(
			n,
			(groups.get(n.toLowerCase()) ?? []).some((r) => r.securityHeld),
			roots.get(n) as Root,
		);
		await settle(o);
		return o;
	});
	const unchecked = outcomes.filter((o) => o.state === "could-not-check");
	const notFound = unchecked.filter((o) => NO_SUCH_REPO.has(o.why));
	for (const w of writes) {
		const ind = w.data.securityHold.indicators as Indicator[];
		console.log(
			`  ${w.change.padEnd(10)} ${w.repo}${ind.length ? `: ${list(ind)}` : ""}`,
		);
	}
	const count = (c: string) => writes.filter((w) => w.change === c).length;
	console.log(
		`\nchecked ${outcomes.length - unchecked.length}, held ${count("HOLD") + count("still held")} (${count("HOLD")} new), released ${count("RELEASE")}, could not check ${unchecked.length} (${notFound.length} not on GitHub under that name)`,
	);
	for (const u of unchecked
		.filter((o) => !NO_SUCH_REPO.has(o.why))
		.slice(0, 20))
		console.log(`  could not check ${u.repo}: ${u.why}`);
	// More than a tenth unreadable is an instrument failure, not a clean
	// sweep, in a dry run too. Repos GitHub has no record of are the data,
	// not the instrument. The holds found are written all the same.
	const failedReads = unchecked.length - notFound.length;
	if (failedReads > outcomes.length / 10) {
		console.error(
			`✗ ${failedReads} of ${outcomes.length} repos could not be read`,
		);
		process.exitCode = 2;
	}

	if (!EXECUTE) {
		console.log(
			"dry run: nothing written. Re-run with --execute to hold and release.",
		);
		return;
	}
	// Read back: a hold that did not persist leaves a malicious repo served.
	const back = await payload.find({
		collection: "repos",
		where: { securityHeld: { equals: true } },
		pagination: false,
		depth: 0,
		select: { fullName: true },
		context: CONTEXT,
	});
	const stored = new Set(back.docs.map((d) => String(d.id)));
	const missing = writes.filter(
		(w) => w.data.securityHeld && !stored.has(String(w.id)),
	);
	if (failed || missing.length) {
		console.error(
			`✗ ${failed} write(s) failed; ${missing.length} hold(s) did not persist: ${missing.map((m) => m.repo).join(", ")}`,
		);
		process.exitCode = 1;
	} else
		console.log(
			`${writes.length} write(s); ${stored.size} repo row(s) held now`,
		);
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
