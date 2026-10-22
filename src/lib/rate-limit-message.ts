/**
 * The line a page shows people when one of our routes answers 429. The
 * body's own `error` and `hint` are written for agents ("resend the same
 * request"); this reads the wait from `retryAfterSeconds` instead.
 */
export function tooManyMessage(body: unknown, what: string): string {
	const s = (body as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds;
	return typeof s === "number" && Number.isFinite(s) && s > 0
		? `Too many ${what}. Try again in ${s} second${s === 1 ? "" : "s"}.`
		: `Too many ${what}. Try again shortly.`;
}
