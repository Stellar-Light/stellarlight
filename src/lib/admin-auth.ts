import crypto from "node:crypto";
import { isAdmin } from "@/collections/access";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * Header that carries ADMIN_ROUTE_SECRET for a scripted call. Never a query
 * parameter: query strings land in access logs.
 */
export const ADMIN_SECRET_HEADER = "x-admin-secret";

/**
 * An ADMIN_ROUTE_SECRET shorter than this is treated as unset, so a short
 * guessable value cannot open the admin routes.
 */
export const ADMIN_SECRET_MIN_LENGTH = 32;

/**
 * Constant-time string compare. Both sides are hashed first so they are the
 * same length; timingSafeEqual then leaks neither content nor length.
 */
export function secretMatches(
	presented: string | null | undefined,
	expected: string | null | undefined,
): boolean {
	if (!presented || !expected) return false;
	const a = crypto.createHash("sha256").update(presented).digest();
	const b = crypto.createHash("sha256").update(expected).digest();
	return crypto.timingSafeEqual(a, b);
}

/**
 * True only when the request comes from an admin: either the server-only
 * ADMIN_ROUTE_SECRET (set, long enough) presented in ADMIN_SECRET_HEADER, or
 * a Payload session from the `users` collection. A signed-in partner sets
 * req.user too, so a session alone is never enough. Every failure (no
 * Payload, an auth error) is a deny.
 */
export async function isAdminRequest(headers: Headers): Promise<boolean> {
	const envSecret = process.env.ADMIN_ROUTE_SECRET;
	if (
		envSecret &&
		envSecret.length >= ADMIN_SECRET_MIN_LENGTH &&
		secretMatches(headers.get(ADMIN_SECRET_HEADER), envSecret)
	) {
		return true;
	}
	const payload = await getPayloadSafe();
	if (!payload) return false;
	try {
		const { user } = await payload.auth({ headers });
		return isAdmin(user);
	} catch {
		return false;
	}
}
