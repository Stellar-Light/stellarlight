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
 */
export async function getPayloadSafe() {
	for (let attempt = 1; attempt <= 2; attempt++) {
		try {
			return await getPayload({ config: configPromise });
		} catch {
			if (attempt === 2) return null;
			await new Promise((r) => setTimeout(r, 400));
		}
	}
	return null;
}
