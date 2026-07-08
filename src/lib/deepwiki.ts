/**
 * DeepWiki client — pulls source-grounded answers about a GitHub repo's
 * internals from DeepWiki's free public MCP server (Cognition/Devin).
 *
 * This is the "answer" half of code intelligence: our repo index knows WHICH
 * repo is authoritative (canonicalFor), DeepWiki knows WHAT'S INSIDE it. Used
 * by /api/repos/explain so an agent gets a deep "where/how" answer (e.g. where
 * transaction result codes are defined in stellar-core) in one call, instead of
 * just a link.
 *
 * Endpoint: https://mcp.deepwiki.com/mcp — free, public, no auth, public repos
 * only. Streamable-HTTP MCP; a stateless tools/call works (no handshake), and
 * the JSON-RPC result comes back as a single SSE `data:` frame.
 */

const DEEPWIKI_MCP = "https://mcp.deepwiki.com/mcp";

export interface DeepWikiAnswer {
	repo: string;
	answer: string;
	/** DeepWiki's permalink to this specific Q&A, when present in the answer footer. */
	searchUrl: string | null;
}

// Pull the JSON-RPC result out of an SSE body (`event: message\ndata: {...}`).
function parseSse(body: string): unknown | null {
	for (const line of body.split(/\r?\n/)) {
		if (!line.startsWith("data:")) continue;
		try {
			const j = JSON.parse(line.slice(5).trim());
			if (j && typeof j === "object") return j;
		} catch {
			// keep scanning — a later data frame may hold the result
		}
	}
	return null;
}

/**
 * Ask DeepWiki a natural-language question about a public repo. Returns null on
 * any failure (network, timeout, repo not indexed) so callers degrade to "here's
 * the authoritative repo" rather than erroring.
 */
export async function askDeepWiki(
	repo: string,
	question: string,
	timeoutMs = 25_000,
): Promise<DeepWikiAnswer | null> {
	const ctrl = new AbortController();
	const timer = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(DEEPWIKI_MCP, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json, text/event-stream",
			},
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "tools/call",
				params: {
					name: "ask_question",
					arguments: { repoName: repo, question },
				},
			}),
			signal: ctrl.signal,
		});
		if (!res.ok) return null;
		// biome-ignore lint/suspicious/noExplicitAny: JSON-RPC envelope is dynamic
		const env = parseSse(await res.text()) as any;
		if (!env?.result || env.result.isError) return null;
		const text: string | null =
			env.result.structuredContent?.result ??
			env.result.content?.[0]?.text ??
			null;
		if (!text || !text.trim()) return null;
		// DeepWiki signals "repo not indexed" / internal failures as a NORMAL text
		// answer (not isError), so a naive caller would surface the error string as
		// if it were a real answer. Detect those and treat them as a miss → the
		// endpoint then degrades to "here's the authoritative repo + deepWikiUrl".
		if (
			/^Error processing question:|Repository not found|to index it\b|No wiki found|not been indexed/i.test(
				text.trim(),
			)
		) {
			return null;
		}
		const m = text.match(/View this search on DeepWiki:\s*(\S+)/);
		// Strip the trailing "Wiki pages..." + "View this search..." footer from
		// the answer body; expose the permalink separately as searchUrl.
		const answer = text
			.split(/\n+Wiki pages you might want to explore:/)[0]
			.trim();
		return { repo, answer: answer || text.trim(), searchUrl: m ? m[1] : null };
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
