import { getPayload } from "payload";
import configPromise from "@/payload.config";

/**
 * Safely get Payload instance with error handling
 * Returns null if connection fails, allowing pages to render gracefully.
 *
 * One retry after a short pause: Atlas resets a pooled connection now and
 * then (a TLS "internal error" on the first request after it), and the very
 * next attempt succeeds. Seen 2026-09-24 during a ten-voter burst: two Pilots
 * were told "no award round exists" by a blip that lasted one request.
 *
 * The retry only works because the adapter's exit is trapped below:
 * `@payloadcms/db-mongodb` calls `process.exit(1)` when it cannot connect,
 * it never throws, so without the trap a blip killed the whole function and
 * every route on it answered a bare 500 page (2026-09-25 01:37 local: /awards
 * itself, five times in a row, during an Atlas TLS burst). With it, the exit
 * becomes a rejection, the retry runs, and a failed retry is a 503 "try
 * again" from the routes and the page's unavailable state.
 */
export async function getPayloadSafe() {
	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			return await withExitTrapped(() => getPayload({ config: configPromise }));
		} catch {
			if (attempt === 2) return null;
			await new Promise((r) => setTimeout(r, 400));
		}
	}
	return null;
}

/**
 * Run `fn` with `process.exit(1)` turned into a thrown error, so a library
 * that exits on failure rejects instead. Restored afterwards; any other exit
 * code passes through untouched.
 */
async function withExitTrapped<T>(fn: () => Promise<T>): Promise<T> {
	const realExit = process.exit;
	// biome-ignore lint/suspicious/noExplicitAny: replacing a node builtin
	(process as any).exit = (code?: number) => {
		if (code === 1) {
			throw new Error("process.exit(1) during Payload init (trapped)");
		}
		return realExit(code);
	};
	try {
		return await fn();
	} finally {
		process.exit = realExit;
	}
}
