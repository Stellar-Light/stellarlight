/**
 * Single-purpose embedding helper for the Stellar Scout research corpus.
 *
 * Uses **Voyage AI** (Anthropic's recommended embedding partner —
 * Anthropic invested in them). Model: `voyage-3` (1024 dims, ~$0.06 /
 * 1M tokens). Anthropic doesn't ship its own embedding model; Voyage
 * is the canonical "in the Anthropic family" choice.
 *
 * If you ever need to swap providers, the contract (`Promise<number[]>`
 * of length `EMBEDDING_DIMS`) stays stable — only this file changes.
 *
 * Env: VOYAGE_API_KEY must be set in .env.local for local ingestion
 *      runs and in Vercel for any server-side embedding (query-embed
 *      at /api/research request time). Get a key at
 *      https://dash.voyageai.com/api-keys
 */

const VOYAGE_EMBED_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-3";
const DIMS = 1024;

/**
 * Embed a single text into a 1024-dim vector. Throws on missing key /
 * API error — fail loud during ingestion rather than silently producing
 * a corrupt corpus.
 */
export async function embed(text: string): Promise<number[]> {
	const key = process.env.VOYAGE_API_KEY;
	if (!key) {
		throw new Error(
			"VOYAGE_API_KEY is not set. Add it to .env.local for local ingestion or Vercel env for production runs. Get a key at https://dash.voyageai.com/api-keys",
		);
	}

	const res = await fetch(VOYAGE_EMBED_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${key}`,
		},
		body: JSON.stringify({ model: MODEL, input: text }),
	});

	if (!res.ok) {
		throw new Error(
			`Voyage AI embedding failed: ${res.status} ${await res.text().catch(() => "")}`,
		);
	}

	const body = (await res.json()) as {
		data: Array<{ embedding: number[] }>;
	};
	const vec = body.data[0]?.embedding;
	if (!vec || vec.length !== DIMS) {
		throw new Error(
			`Voyage AI returned unexpected embedding shape (len ${vec?.length}, expected ${DIMS})`,
		);
	}
	return vec;
}

/**
 * Batch embed up to 128 texts in a single API call — meaningfully
 * cheaper for ingestion runs over hundreds of chunks. Voyage's hard
 * batch limit is 128 inputs per request.
 */
export async function embedBatch(texts: string[]): Promise<number[][]> {
	if (texts.length === 0) return [];
	if (texts.length > 128) {
		// API hard limit; recurse with chunks of 128 to stay simple
		const out: number[][] = [];
		for (let i = 0; i < texts.length; i += 128) {
			const batch = await embedBatch(texts.slice(i, i + 128));
			out.push(...batch);
		}
		return out;
	}

	const key = process.env.VOYAGE_API_KEY;
	if (!key) {
		throw new Error("VOYAGE_API_KEY is not set.");
	}

	const res = await fetch(VOYAGE_EMBED_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${key}`,
		},
		body: JSON.stringify({ model: MODEL, input: texts }),
	});

	if (!res.ok) {
		throw new Error(
			`Voyage AI embedding failed: ${res.status} ${await res.text().catch(() => "")}`,
		);
	}

	const body = (await res.json()) as {
		data: Array<{ embedding: number[]; index: number }>;
	};
	// API returns the array in input order, but sort defensively by index
	const sorted = [...body.data].sort((a, b) => a.index - b.index);
	return sorted.map((d) => d.embedding);
}

export const EMBEDDING_DIMS = DIMS;
export const EMBEDDING_MODEL = MODEL;
