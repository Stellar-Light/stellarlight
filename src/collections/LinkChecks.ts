import type { CollectionConfig } from "payload";

/**
 * Curator Agent — Phase 1: link health.
 *
 * One record per UNIQUE URL across the directory. Populated by the daily
 * `scripts/check-links.ts` cron. The script HEAD-requests every URL,
 * records the result here, and Payload's auto-generated admin UI at
 * /admin/collections/link-checks doubles as the dashboard:
 *
 *   - Default sort:    consecutiveFailures desc → broken-est URLs first
 *   - Status filter:   chip across ok / redirect / error
 *   - targets:         every Project / Builder / Entity / Hackathon that
 *                      references this URL, so admin can jump straight to
 *                      the source record and fix the link.
 *
 * Dedup is by URL — if Soroswap and Aquarius both link to the same docs
 * page, one LinkCheck record carries both targets. Saves HTTP requests on
 * the cron + makes "which records depend on this URL" trivially queryable.
 *
 * Records are kept across runs so we can show *"this link has been
 * broken for 7 consecutive days"* in the UI (firstFailedAt /
 * consecutiveFailures). Cleanup of URLs that no longer appear anywhere
 * happens in the script too.
 *
 * TWO independent histories, because a link fails in two different ways
 * (lessons class 32):
 *   - `consecutiveFailures` — the URL is PROVEN broken (404/410, host does
 *     not resolve, connection refused). A finding on the first run.
 *   - `consecutiveUnverifiable` — the URL could not be checked (5xx, bot
 *     wall, timeout, bad cert). Proves nothing on any single run, so it is
 *     NOT a failure — but a URL we have been unable to verify for
 *     UNVERIFIABLE_RUNS_TO_ESCALATE consecutive runs is worth a human's
 *     time, and `needsReview` flips on to say so. That escalation is what
 *     lets the per-probe verdict stay honest without persistently broken
 *     origins quietly falling off the dashboard forever.
 */
export const LinkChecks: CollectionConfig = {
	slug: "link-checks",
	labels: {
		singular: "Link check",
		plural: "Link checks",
	},
	admin: {
		useAsTitle: "url",
		defaultColumns: [
			"status",
			"statusCode",
			"url",
			"consecutiveFailures",
			"needsReview",
			"consecutiveUnverifiable",
			"lastChecked",
		],
		description:
			"Daily link health checks across Projects, Builders, Entities, Hackathons, and curated skills. Sorted broken-first.",
		group: "Curator Agent",
	},
	defaultSort: "-consecutiveFailures",
	access: {
		// Same shape as other ops collections — admin reads/writes, no
		// public exposure
		read: ({ req }) => Boolean(req.user),
		create: ({ req }) => Boolean(req.user),
		update: ({ req }) => Boolean(req.user),
		delete: ({ req }) => Boolean(req.user),
	},
	fields: [
		{
			name: "url",
			type: "text",
			required: true,
			unique: true,
			index: true,
			admin: {
				description: "The URL being health-checked.",
			},
		},
		{
			name: "status",
			type: "select",
			required: true,
			index: true,
			defaultValue: "ok",
			options: [
				{ label: "OK (2xx)", value: "ok" },
				{ label: "Redirect (3xx)", value: "redirect" },
				{
					label: "Blocked (bot-protection — unverifiable, not dead)",
					value: "blocked",
				},
				{ label: "Error (4xx/5xx/timeout/dns)", value: "error" },
			],
		},
		{
			name: "statusCode",
			type: "number",
			admin: {
				description:
					"HTTP status from the last check, or null on network errors (DNS, timeout, TLS).",
			},
		},
		{
			name: "errorReason",
			type: "text",
			admin: {
				description:
					"Short reason the check did not return a clean 2xx — e.g. 'timeout 10s', 'ENOTFOUND', 'self-signed-cert', 'bot-protection', 'server-error HTTP 503'. Shown for both error (proven broken) and blocked (unverifiable).",
				condition: (data) =>
					data?.status === "error" || data?.status === "blocked",
			},
		},
		{
			name: "redirectTo",
			type: "text",
			admin: {
				description: "Final URL after following redirects.",
				condition: (data) => data?.status === "redirect",
			},
		},
		{
			name: "consecutiveFailures",
			type: "number",
			defaultValue: 0,
			index: true,
			admin: {
				description:
					"How many consecutive check runs this URL has been PROVEN broken — 404/410, host does not resolve, connection refused. Anything else (redirect, bot wall, 5xx, timeout) resets it: those are reachability problems, not death. 0 = not proven broken.",
			},
		},
		{
			name: "firstFailedAt",
			type: "date",
			admin: {
				description:
					"When the URL first started failing. Null = never failed since first observed.",
				condition: (data) => Boolean(data?.firstFailedAt),
			},
		},
		{
			name: "consecutiveUnverifiable",
			type: "number",
			defaultValue: 0,
			index: true,
			admin: {
				description:
					"How many consecutive runs the check could not reach a verdict — 5xx, bot wall, timeout, bad certificate. One such run proves nothing; a long streak means we have had no idea about this link for that many days.",
			},
		},
		{
			name: "firstUnverifiableAt",
			type: "date",
			admin: {
				description:
					"Start of the current unverifiable streak. Cleared as soon as any run reaches a verdict.",
				condition: (data) => Boolean(data?.firstUnverifiableAt),
			},
		},
		{
			name: "needsReview",
			type: "checkbox",
			defaultValue: false,
			index: true,
			admin: {
				description:
					"Set by the checker when consecutiveUnverifiable crosses its escalation threshold: no single probe proved this link broken, but we have been unable to verify it long enough that a human should look. Filter on this to find links hiding behind a permanently sick origin.",
			},
		},
		{
			name: "lastSuccessAt",
			type: "date",
			admin: {
				description:
					"Last time the URL returned 2xx. Null = never succeeded since first observed.",
				condition: (data) => Boolean(data?.lastSuccessAt),
			},
		},
		{
			name: "lastChecked",
			type: "date",
			required: true,
			index: true,
		},
		{
			name: "targets",
			type: "array",
			labels: { singular: "Reference", plural: "References" },
			admin: {
				description:
					"Every record in the directory that references this URL. Click through to the source to fix the link or remove the reference.",
			},
			fields: [
				{
					name: "collection",
					type: "text",
					required: true,
					admin: {
						description:
							"Source collection slug — projects / builders / entities / hackathons / curated-skills.",
					},
				},
				{
					name: "recordSlug",
					type: "text",
					required: true,
					admin: {
						description: "Slug or identifier within the source collection.",
					},
				},
				{
					name: "recordName",
					type: "text",
					admin: {
						description: "Human-readable name (helps in the admin UI).",
					},
				},
				{
					name: "field",
					type: "text",
					required: true,
					admin: {
						description:
							"Field path within the record — e.g. 'links.github', 'website_url', 'docs'.",
					},
				},
			],
		},
	],
	timestamps: true,
};
