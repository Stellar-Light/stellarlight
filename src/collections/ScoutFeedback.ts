import type { CollectionConfig } from "payload";

/**
 * ScoutFeedback — write-only public ingestion of feedback from agents
 * running the stellar-scout skill. Mirrors Colosseum Copilot's /feedback
 * endpoint pattern so the skill has a built-in error-reporting and
 * quality-signal loop, not a separate GitHub-issues workflow.
 *
 * Submission shape (from POST /api/feedback):
 *   {
 *     kind: "bug" | "missing-data" | "wrong-answer" | "suggestion",
 *     message: string,
 *     context: {
 *       query?: string,       // the user query the agent was answering
 *       endpoint?: string,    // the /api/* endpoint hit, if any
 *       skillVersion?: string,
 *       agentName?: string,   // claude-code, codex, etc.
 *       userAgent?: string,
 *     }
 *   }
 *
 * Access:
 *   - create: public (the whole point — agents POST here)
 *   - read/update/delete: admin only via Payload (review queue)
 *
 * Why a Payload collection and not, say, a Slack webhook:
 *   - Persistent + queryable; we can filter by kind + skillVersion later
 *   - Free (no external dependency to maintain)
 *   - Admin UI gives a triage view without building one
 */
export const ScoutFeedback: CollectionConfig = {
	slug: "scout-feedback",
	admin: {
		useAsTitle: "message",
		defaultColumns: ["kind", "message", "createdAt"],
		group: "Scout",
		description:
			"Feedback submitted by agents running the stellar-scout skill via POST /api/feedback. Public ingestion; admin-only review.",
	},
	access: {
		// Direct Payload REST create is DISABLED — the only writer is POST
		// /api/feedback, which rate-limits + hashes the IP and calls create with
		// overrideAccess. Leaving this open let anyone POST /api/scout-feedback
		// straight past the limiter (unbounded on the M0).
		create: () => false,
		read: ({ req }) => !!req.user,
		update: ({ req }) => !!req.user,
		delete: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "kind",
			type: "select",
			required: true,
			index: true,
			options: [
				{ label: "Bug", value: "bug" },
				{ label: "Missing data / no result", value: "missing-data" },
				{ label: "Wrong / misleading answer", value: "wrong-answer" },
				{ label: "Suggestion / improvement", value: "suggestion" },
				{ label: "Other", value: "other" },
			],
		},
		{
			name: "message",
			type: "textarea",
			required: true,
			admin: { description: "The freeform feedback text from the agent." },
		},
		{
			name: "query",
			type: "text",
			admin: {
				description:
					"The user query the agent was answering, if it was forwarded.",
			},
		},
		{
			name: "endpoint",
			type: "text",
			admin: { description: "Which /api/* endpoint was being called." },
		},
		{
			name: "skillVersion",
			type: "text",
			admin: { description: "SKILL.md frontmatter version (e.g. 1.0.0)." },
		},
		{
			name: "agentName",
			type: "text",
			admin: { description: "Agent harness (claude-code, codex, openclaw)." },
		},
		{
			name: "userAgent",
			type: "text",
			admin: { description: "Raw User-Agent header (best-effort)." },
		},
		{
			name: "ipHash",
			type: "text",
			index: true,
			admin: {
				description:
					"SHA-256(ip + secret). De-duplicate floods without logging raw IPs.",
				readOnly: true,
			},
		},
	],
	timestamps: true,
};
