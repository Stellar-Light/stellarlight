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
					"Short reason when status=error and statusCode is null — e.g. 'timeout 10s', 'ENOTFOUND', 'self-signed-cert'.",
				condition: (data) => data?.status === "error",
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
					"How many consecutive check runs this URL has returned ERROR (redirect/blocked reset it — they are reachability, not death). 0 = currently healthy.",
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
