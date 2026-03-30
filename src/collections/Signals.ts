import type { CollectionConfig } from "payload";

export const Signals: CollectionConfig = {
	slug: "signals",
	admin: {
		useAsTitle: "project",
	},
	access: {
		read: () => true,
	},
	fields: [
		{
			name: "project",
			type: "relationship",
			relationTo: "projects",
			required: true,
			unique: true,
		},
		{
			name: "fetchedAt",
			type: "date",
		},
		{
			name: "github",
			type: "group",
			fields: [
				{
					name: "lastActivityAt",
					type: "date",
				},
				{
					name: "openIssuesTotal",
					type: "number",
				},
				{
					name: "totalStars",
					type: "number",
				},
				{
					name: "repos",
					type: "array",
					fields: [
						{
							name: "owner",
							type: "text",
						},
						{
							name: "name",
							type: "text",
						},
						{
							name: "url",
							type: "text",
						},
						{
							name: "lastCommitAt",
							type: "date",
						},
						{
							name: "openIssues",
							type: "number",
						},
						{
							name: "stargazerCount",
							type: "number",
						},
						{
							name: "error",
							type: "text",
						},
					],
				},
			],
		},
	],
};
