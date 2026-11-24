/**
 * Ingest the Stellar org's GitHub Discussions (hosted on
 * stellar/stellar-protocol) into the research corpus as source
 * `stellar-discussions`, one document per discussion with its comments and
 * replies, and its category slug in `discussionCategory` (the research
 * `category` filter). Chunking: discussionChunks in
 * src/lib/stellar-discussions.ts.
 *
 * Read whole or not at all: every category in DISCUSSION_CATEGORIES, every
 * discussion in it, every comment and reply, each listing checked against
 * GitHub's own totalCount before anything is written. A stored discussion
 * the listing no longer holds is deleted only when GitHub answers that its
 * number no longer exists; chunks past a discussion's new chunk count are
 * deleted with it. Both count as planned writes in --replan.
 *
 * GraphQL needs a token: GITHUB_TOKEN (the workflow's own token suffices).
 *
 *   pnpm exec tsx scripts/ingest-stellar-discussions.ts             dry run: read + chunk, no database
 *   pnpm exec tsx scripts/ingest-stellar-discussions.ts --execute   embed + write
 *   pnpm exec tsx scripts/ingest-stellar-discussions.ts --replan    the DB diff, no writes
 */
import "./load-env";
import { getPayload } from "payload";
import { loadExistingChunks, upsertChunks } from "../src/lib/research-ingest";
import { DISCUSSION_CATEGORIES } from "../src/lib/research-sources";
import {
	type Discussion,
	type DiscussionPost,
	discussionChunks,
} from "../src/lib/stellar-discussions";
import configPromise from "../src/payload.config";

const execute = process.argv.includes("--execute");
const replan = process.argv.includes("--replan");
const SOURCE = "stellar-discussions";
const REPO = 'repository(owner: "stellar", name: "stellar-protocol")';

interface Page<T> {
	totalCount: number;
	pageInfo: { hasNextPage: boolean; endCursor: string | null };
	nodes: T[];
}
type RawPost = {
	author: { login: string } | null;
	createdAt: string;
	body: string;
	isMinimized: boolean;
	minimizedReason: string | null;
	deletedAt: string | null;
};
type RawComment = RawPost & {
	id: string;
	isAnswer: boolean;
	replies: Page<RawPost>;
};

async function gql(
	query: string,
	variables: Record<string, unknown> = {},
	// biome-ignore lint/suspicious/noExplicitAny: GraphQL answers are read by path
): Promise<{ data?: any; errors?: Array<{ type?: string; message: string }> }> {
	const token = process.env.GITHUB_TOKEN;
	if (!token)
		throw new Error(
			"GITHUB_TOKEN is required: GitHub GraphQL takes no anonymous reads",
		);
	for (let attempt = 1; ; attempt++) {
		const res = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				"User-Agent": "stellarlight-scout-ingest",
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables }),
			signal: AbortSignal.timeout(30_000),
		});
		if (res.ok) return res.json();
		if (attempt >= 3 || res.status < 500)
			throw new Error(`GitHub GraphQL ${res.status}`);
		await new Promise((r) => setTimeout(r, 2000 * attempt));
	}
}

/** A GraphQL answer with any error is a failed read, never a partial one. */
async function gqlData(query: string, variables: Record<string, unknown> = {}) {
	const r = await gql(query, variables);
	if (r.errors?.length || !r.data)
		throw new Error(
			`GitHub GraphQL: ${r.errors?.map((e) => e.message).join("; ") ?? "no data"}`,
		);
	return r.data;
}

/** Every node of a connection, or a throw: the pages must add up to the
 * connection's own totalCount. */
async function readAll<T>(
	what: string,
	first: Page<T> | null,
	next: (after: string) => Promise<Page<T>>,
): Promise<T[]> {
	let page = first ?? (await next(""));
	const nodes = [...page.nodes];
	while (page.pageInfo.hasNextPage && page.pageInfo.endCursor) {
		page = await next(page.pageInfo.endCursor);
		nodes.push(...page.nodes);
	}
	if (nodes.length !== page.totalCount)
		throw new Error(`${what}: read ${nodes.length} of ${page.totalCount}`);
	return nodes;
}

const POST =
	"author { login } createdAt body isMinimized minimizedReason deletedAt";
const PAGE = "totalCount pageInfo { hasNextPage endCursor }";

/** Deleted posts and posts hidden as spam or abuse are left out. One
 * minimized for another reason (outdated, resolved, off-topic) is still
 * readable on GitHub, so it is kept and says it was minimized. */
const shown = (p: RawPost) =>
	!p.deletedAt &&
	!(p.isMinimized && /spam|abuse/i.test(p.minimizedReason ?? ""));
const post = (p: RawPost): DiscussionPost => ({
	author: p.author?.login ?? null,
	createdAt: p.createdAt,
	body: p.isMinimized
		? `(Minimized on GitHub as ${p.minimizedReason ?? "hidden"}.)\n\n${p.body}`
		: p.body,
});

async function readComments(number: number): Promise<DiscussionPost[]> {
	const comments = await readAll<RawComment>(
		`discussion #${number} comments`,
		null,
		async (after) =>
			(
				await gqlData(
					`query($n: Int!, $after: String) { ${REPO} { discussion(number: $n) { comments(first: 50, after: $after) { ${PAGE} nodes { id isAnswer ${POST} replies(first: 50) { ${PAGE} nodes { ${POST} } } } } } } }`,
					{ n: number, after: after || null },
				)
			).repository.discussion.comments,
	);
	const out: DiscussionPost[] = [];
	for (const c of comments) {
		const replies = await readAll<RawPost>(
			`discussion #${number} replies`,
			c.replies,
			async (after) =>
				(
					await gqlData(
						`query($id: ID!, $after: String) { node(id: $id) { ... on DiscussionComment { replies(first: 50, after: $after) { ${PAGE} nodes { ${POST} } } } } }`,
						{ id: c.id, after },
					)
				).node.replies,
		);
		// A comment left out keeps its replies, as GitHub shows them.
		out.push({
			...post(c),
			body: shown(c) ? post(c).body : "",
			isAnswer: c.isAnswer,
			replies: replies.filter(shown).map(post),
		});
	}
	return out;
}

async function readDiscussions(): Promise<Discussion[]> {
	const cats = (
		await gqlData(
			`{ ${REPO} { discussionCategories(first: 50) { nodes { id slug name } } } }`,
		)
	).repository.discussionCategories.nodes as Array<{
		id: string;
		slug: string;
		name: string;
	}>;
	const known = new Set<string>(DISCUSSION_CATEGORIES);
	const other = cats.filter((c) => !known.has(c.slug));
	if (other.length)
		console.log(
			`  not read (not a category of this source): ${other.map((c) => c.slug).join(", ")}`,
		);
	const out: Discussion[] = [];
	for (const slug of DISCUSSION_CATEGORIES) {
		const cat = cats.find((c) => c.slug === slug);
		// A category that is gone or renamed is a broken read: without it every
		// stored discussion in it would look deleted.
		if (!cat)
			throw new Error(`category ${slug} not found on stellar/stellar-protocol`);
		const listed = await readAll<
			Omit<Discussion, "comments" | "author"> & {
				author: { login: string } | null;
			}
		>(
			`${slug} discussions`,
			null,
			async (after) =>
				(
					await gqlData(
						`query($id: ID!, $after: String) { ${REPO} { discussions(first: 50, after: $after, categoryId: $id) { ${PAGE} nodes { number title url body createdAt updatedAt author { login } category { slug name } } } } }`,
						{ id: cat.id, after: after || null },
					)
				).repository.discussions,
		);
		for (const d of listed)
			out.push({
				...d,
				author: d.author?.login ?? null,
				comments: await readComments(d.number),
			});
		console.log(`  ${slug}: ${listed.length} discussions`);
	}
	return out;
}

/** Does stellar/stellar-protocol still hold discussion #n? Only GitHub's
 * NOT_FOUND answers no; any other failure throws (could not check). */
async function discussionExists(n: number): Promise<boolean> {
	const r = await gql(
		`query($n: Int!) { ${REPO} { discussion(number: $n) { number } } }`,
		{ n },
	);
	if (r.data?.repository?.discussion) return true;
	if (r.errors?.length && r.errors.every((e) => e.type === "NOT_FOUND"))
		return false;
	throw new Error(
		`discussion #${n}: ${r.errors?.map((e) => e.message).join("; ") ?? "no data"}`,
	);
}

async function run() {
	console.log(execute ? "EXECUTE MODE" : replan ? "REPLAN" : "DRY RUN MODE");
	const discussions = await readDiscussions();
	const chunks = discussions.flatMap(discussionChunks);
	const byCat = new Map<
		string,
		{ docs: number; comments: number; replies: number; chunks: number }
	>();
	for (const d of discussions) {
		const s = byCat.get(d.category.slug) ?? {
			docs: 0,
			comments: 0,
			replies: 0,
			chunks: 0,
		};
		s.docs += 1;
		s.comments += d.comments.filter((c) => c.body.trim()).length;
		s.replies += d.comments.reduce((n, c) => n + (c.replies?.length ?? 0), 0);
		byCat.set(d.category.slug, s);
	}
	for (const c of chunks) {
		const s = byCat.get(c.discussionCategory ?? "");
		if (s) s.chunks += 1;
	}
	for (const [slug, s] of byCat)
		console.log(
			`  ${slug}: ${s.docs} discussions, ${s.comments} comments, ${s.replies} replies, ${s.chunks} chunks`,
		);
	console.log(`  ${discussions.length} discussions, ${chunks.length} chunks`);

	if (!execute && !replan) {
		console.log("\nDry run. --execute to embed + write.");
		return;
	}
	const payload = await getPayload({ config: configPromise });
	const existing = await loadExistingChunks(payload, SOURCE);
	const s = await upsertChunks({
		payload,
		source: SOURCE,
		chunks,
		existing,
		dryRun: replan,
	});

	// Rows to delete: chunks past a listed discussion's new count, and every
	// chunk of a discussion GitHub says is gone.
	const count = new Map<string, number>();
	for (const c of chunks) count.set(c.parentDocId, c.chunkIndex + 1);
	let tail = 0;
	let gone = 0;
	const doomed: string[] = [];
	for (const [pid, rows] of existing) {
		const n = count.get(pid);
		if (n === undefined) {
			const num = Number(pid.replace(/^discussion-/, ""));
			if (!Number.isInteger(num) || (await discussionExists(num))) {
				console.log(
					`  kept ${pid}: still on GitHub, outside the categories read`,
				);
				continue;
			}
			gone += 1;
		}
		for (const [idx, ref] of rows)
			if (n === undefined || idx >= n) {
				doomed.push(ref.id);
				if (n !== undefined) tail += 1;
			}
	}
	const line = `writes=${doomed.length} deletes=${doomed.length} (chunks past a discussion's end ${tail}, discussions gone ${gone})`;
	if (replan) {
		console.log(`replan: ${line}`);
		return;
	}
	let failed = 0;
	for (const id of doomed)
		await payload.delete({ collection: "research-docs", id }).catch((e) => {
			console.error(`  ✗ delete ${id}: ${(e as Error).message}`);
			failed += 1;
		});
	console.log(`deleted: ${line}`);
	if (s.errors || failed)
		throw new Error(`${s.errors + failed} write(s) failed`);
}

run()
	.then(() => process.exit(0))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
