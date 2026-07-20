/**
 * Single source of truth for the API contract version.
 *
 * `API_VERSION` is the semantic version of the public API contract (the
 * OpenAPI spec). Bump it on any observable contract change — new/removed
 * endpoints or fields, response-shape changes, param/enum changes, AND additive
 * changes like new paths or materially rewritten operation descriptions — so
 * that `/api/openapi.json` (`info.version`) and `/api/status` (`apiVersion`)
 * can never drift apart, and agents can reason about "as-of-what-contract".
 * Downstream consumers (e.g. Raven's drift CI) diff this string to know the
 * catalog is stale — a description-only change that doesn't bump it is invisible
 * to them, so bump even when only descriptions move.
 *
 * It is intentionally distinct from:
 *   - the `X-API-Version` header (a coarse MAJOR pin, currently "1"),
 *   - the Scout skill/service release line (`SCOUT_SERVICE_VERSION`),
 *   - the independently-versioned npm packages (scout-mcp, api-client).
 */
export const API_VERSION = "1.8.8";

/** The Scout skill/service release line — surfaced at /api/status as `version`. */
export const SCOUT_SERVICE_VERSION = "scout-1.0.0";
