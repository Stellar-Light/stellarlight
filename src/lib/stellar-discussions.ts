/**
 * The Stellar org's GitHub Discussions (hosted on stellar/stellar-protocol)
 * as research corpus chunks, source `stellar-discussions`. One document per
 * discussion: the opening post, then every comment and reply in order, each
 * signed with its author and day, packed into chunks of up to
 * MAX_CHARS_PER_CHUNK. CAP threads hold most of their argument in the
 * comments, so they are read too.
 *
 * Fetching (GitHub GraphQL, read whole or not at all) lives in
 * scripts/ingest-stellar-discussions.ts; this is the pure part.
 */

import {
	MAX_CHARS_PER_CHUNK,
	type ResearchChunk,
	sha256,
	splitOversized,
} from "./research-ingest";
import { identifierTargets } from "./research-rank";
import { deriveCleanTitle } from "./title-quality";

export interface DiscussionPost {
	/** null: the account was deleted. */
	author: string | null;
	createdAt: string;
	body: string;
	isAnswer?: boolean;
	replies?: DiscussionPost[];
}

export interface Discussion {
	number: number;
	title: string;
	url: string;
	category: { slug: string; name: string };
	author: string | null;
	createdAt: string;
	updatedAt: string;
	body: string;
	comments: DiscussionPost[];
}

const day = (iso: string) => iso.slice(0, 10);
const count = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;
const who = (login: string | null) =>
	login ? `@${login}` : "a deleted account";
const clean = (md: string) =>
	md
		.replace(/\r\n?/g, "\n")
		.replace(/<!--[\s\S]*?-->/g, "")
		.trim();

/**
 * Every chunk opens with the same header (number, category, title, who
 * opened it and when, when GitHub last updated it, how many comments and
 * replies, the proposals it names), so a row read alone says which thread
 * it is from. `publishedAt` is the discussion's createdAt, never the read
 * date. A comment or reply split across chunks carries its signature on
 * every piece.
 */
export function discussionChunks(d: Discussion): ResearchChunk[] {
	// A comment left out (deleted, spam) has no text but keeps its replies.
	const comments = d.comments.filter((c) => clean(c.body)).length;
	const replies = d.comments.reduce((n, c) => n + (c.replies?.length ?? 0), 0);
	// The CAP/SEP/SLP numbers the title and opening post name, title first,
	// in canonical form (CAP-0067).
	const ids = identifierTargets(`${d.title}\n${d.body}`, { exact: true }).map(
		(id) => id.toUpperCase(),
	);
	const header = `Stellar discussion #${d.number} in ${d.category.name}: ${d.title.trim()}. Opened by ${who(d.author)} on ${day(d.createdAt)}; last updated on GitHub ${day(d.updatedAt)}; ${count(comments, "comment")} and ${count(replies, "reply", "replies")}.${ids.length ? ` Names ${ids.join(", ")}.` : ""}`;
	const blocks: Array<{ label: string; text: string }> = [
		{
			label: `Opening post by ${who(d.author)} on ${day(d.createdAt)}`,
			// so a discussion with no text and no comments still has its row
			text: clean(d.body) || "(no text)",
		},
	];
	for (const c of d.comments) {
		blocks.push({
			label: `Comment by ${who(c.author)} on ${day(c.createdAt)}${c.isAnswer ? " (marked as the answer)" : ""}`,
			text: c.body,
		});
		for (const r of c.replies ?? [])
			blocks.push({
				label: `Reply by ${who(r.author)} on ${day(r.createdAt)} to ${who(c.author)}`,
				text: r.body,
			});
	}

	// Greedy packing; every piece of a post carries its signature line.
	const budget = MAX_CHARS_PER_CHUNK - header.length - 2;
	const chunks: Array<{ section: string; text: string }> = [];
	for (const b of blocks) {
		const text = clean(b.text);
		if (!text) continue;
		const pieces = splitOversized(text, budget - b.label.length - 30);
		for (const [i, p] of pieces.entries()) {
			const piece = `**${b.label}${i ? " (continued)" : ""}:**\n\n${p}`;
			const last = chunks.at(-1);
			if (last && last.text.length + piece.length + 2 <= budget)
				last.text += `\n\n${piece}`;
			else chunks.push({ section: b.label, text: piece });
		}
	}

	const parentDocId = `discussion-${d.number}`;
	const title = deriveCleanTitle(d.title, d.url);
	return chunks.map((c, chunkIndex) => {
		const content = `${header}\n\n${c.text}`;
		return {
			parentDocId,
			chunkIndex,
			title,
			section: c.section,
			url: d.url,
			content,
			contentHash: sha256(content),
			tags: [
				"stellar-discussions",
				d.category.slug,
				...ids.map((i) => i.toLowerCase()),
			],
			publishedAt: d.createdAt,
			discussionCategory: d.category.slug,
		};
	});
}
