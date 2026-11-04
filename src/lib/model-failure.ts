import Anthropic from "@anthropic-ai/sdk";

/**
 * What a failed language model call means for the caller (#1908), decided
 * by the SDK's error class and HTTP status, never by message wording:
 *
 * - "rate-limited": the model's own 429; wait for its Retry-After.
 * - "unavailable": the provider refused OUR request or account (any other
 *   4xx: bad key, no permission, no credit, a model or parameter it no
 *   longer accepts). Every resend fails the same way until we fix it, so
 *   the caller falls back and does not retry.
 * - "failed": the provider failed this one call (5xx, overloaded, no
 *   connection, timeout). A later resend can succeed.
 * - "unexpected": not a provider error at all, so a fault in this service.
 */
export type ModelFailure =
	| "rate-limited"
	| "unavailable"
	| "failed"
	| "unexpected";

export function classifyModelError(err: unknown): ModelFailure {
	if (!(err instanceof Anthropic.APIError)) return "unexpected";
	if (err instanceof Anthropic.RateLimitError) return "rate-limited";
	const status = err.status;
	return typeof status === "number" && status >= 400 && status < 500
		? "unavailable"
		: "failed";
}
