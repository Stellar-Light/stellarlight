/**
 * What a stored hackathon submission is embedded as, for search by meaning.
 * Pure, so the sync lane and the tests share one definition, and a change to
 * it shows up as a changed hash (the lane re-embeds only rows whose text
 * moved).
 */
import { createHash } from "node:crypto";

/** Name, one-line summary, track and the start of the team's write-up, with
 * markdown noise stripped. The write-up is where a build says what it does;
 * the summary alone is a slogan. */
export function buildEmbeddingText(b: {
	name: string;
	vision?: string | null;
	track?: string | null;
	description?: string | null;
}): string {
	const writeUp = (b.description ?? "")
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/<[^>]+>/g, " ")
		.replace(/[#>*_`~|]/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 3000);
	return [b.name, b.vision, b.track, writeUp]
		.filter((s) => s?.trim())
		.join(". ")
		.slice(0, 4000);
}

export const embeddingTextHash = (text: string): string =>
	createHash("sha1").update(text).digest("hex");
