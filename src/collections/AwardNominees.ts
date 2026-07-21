import type { CollectionConfig } from "payload";

/**
 * i³ Awards — nominees on a round's ballot.
 *
 * A nominee is a POINTER into the projects directory, not a copy: name,
 * logo and short description always resolve from the canonical directory
 * record, so the ballot can never drift from the directory (the
 * descriptions-as-routing-contracts lesson). The only award-specific prose
 * is `customBlurb` — the "why nominated" line, which overrides the
 * project's shortDescription on the ballot card when present.
 *
 * `category` must match one of the parent round's category keys; the
 * beforeValidate hook enforces it so a typo can't strand a nominee off
 * the ballot.
 */

export const AwardNominees: CollectionConfig = {
	slug: "award-nominees",
	labels: { singular: "Award Nominee", plural: "Award Nominees" },
	admin: {
		defaultColumns: ["project", "category", "round"],
		group: "Awards",
		description:
			"Shortlisted projects per round + category. Display data resolves live from the projects directory.",
	},
	access: {
		read: () => true,
		create: ({ req }) => !!req.user,
		update: ({ req }) => !!req.user,
		delete: ({ req }) => !!req.user,
	},
	fields: [
		{
			name: "round",
			type: "relationship",
			relationTo: "award-rounds",
			required: true,
			index: true,
			admin: { position: "sidebar" },
		},
		{
			name: "category",
			type: "text",
			required: true,
			index: true,
			admin: {
				description:
					"Category KEY from the round (e.g. impact / innovation / interoperability).",
			},
		},
		{
			name: "project",
			type: "relationship",
			relationTo: "projects",
			required: true,
			admin: {
				description:
					"Directory project this nominee points at. Name, logo and description come from here.",
			},
		},
		{
			name: "customBlurb",
			type: "textarea",
			admin: {
				description:
					"Why nominated — shown on the ballot card instead of the project's shortDescription when set.",
			},
		},
	],
	hooks: {
		beforeValidate: [
			async ({ data, req }) => {
				// Category must be a key the round actually defines.
				const roundRef = data?.round;
				const category =
					typeof data?.category === "string" ? data.category.trim() : "";
				if (!roundRef || !category) return data;
				const roundId =
					typeof roundRef === "object" && roundRef !== null
						? // biome-ignore lint/suspicious/noExplicitAny: Payload relationship shape
							((roundRef as any).id ?? (roundRef as any).value)
						: roundRef;
				try {
					const round = await req.payload.findByID({
						collection: "award-rounds",
						id: String(roundId),
						depth: 0,
					});
					const keys = (round?.categories ?? []).map(
						(c: { key: string }) => c.key,
					);
					if (keys.length > 0 && !keys.includes(category)) {
						throw new Error(
							`Category "${category}" is not defined on round "${round?.slug}" (valid: ${keys.join(", ")}).`,
						);
					}
				} catch (err) {
					// Re-throw our own validation error; swallow lookup failures so a
					// transient DB hiccup can't block an admin save with a cryptic error.
					if (err instanceof Error && err.message.startsWith("Category ")) {
						throw err;
					}
				}
				return { ...data, category };
			},
		],
	},
};
