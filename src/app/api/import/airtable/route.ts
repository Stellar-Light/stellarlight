import { NextRequest, NextResponse } from "next/server";
import Airtable from "airtable";
import { getPayloadSafe } from "@/lib/payload-client";

// Airtable configuration - must be set via environment variables
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID;
const AIRTABLE_VIEW_ID = process.env.AIRTABLE_VIEW_ID;

export async function POST(request: NextRequest) {
	try {
		const apiKey = process.env.AIRTABLE_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: "AIRTABLE_API_KEY environment variable is not set" },
				{ status: 500 },
			);
		}

		if (!AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID || !AIRTABLE_VIEW_ID) {
			return NextResponse.json(
				{ error: "AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, and AIRTABLE_VIEW_ID environment variables must be set" },
				{ status: 500 },
			);
		}

		const payload = await getPayloadSafe();
		if (!payload) {
			return NextResponse.json(
				{ error: "Payload client not available" },
				{ status: 500 },
			);
		}

		// Initialize Airtable
		const base = new Airtable({ apiKey }).base(AIRTABLE_BASE_ID);
		const table = base(AIRTABLE_TABLE_ID);

		// Fetch all records from the view
		const records = await table
			.select({
				view: AIRTABLE_VIEW_ID,
			})
			.all();

		const stats = {
			inserted: 0,
			updated: 0,
			skipped: 0,
			errors: 0,
		};

		// Process each record
		for (const record of records) {
			try {
				const fields = record.fields;

				// Map Airtable fields to PayloadCMS Projects schema
				// Adjust field names based on actual Airtable schema
				const getName = (): string => {
					const name = fields.Name || fields.name;
					if (typeof name === "string") return name;
					return `Project ${record.id}`;
				};

				const getSlug = (name: string): string => {
					const slug = fields.Slug || fields.slug;
					if (typeof slug === "string") return slug;
					if (name) {
						return name.toLowerCase().replace(/\s+/g, "-");
					}
					return `project-${record.id}`;
				};

				const name = getName();
				const projectData: any = {
					name,
					slug: getSlug(name),
					shortDescription: (typeof (fields.Description || fields.description || fields.ShortDescription || fields.shortDescription) === "string") 
						? (fields.Description || fields.description || fields.ShortDescription || fields.shortDescription) 
						: "",
					category: (typeof (fields.Category || fields.category) === "string")
						? (fields.Category || fields.category)
						: "Infrastructure",
					status: (typeof (fields.Status || fields.status) === "string")
						? (fields.Status || fields.status)
						: "Draft",
					verificationLevel: (typeof (fields.VerificationLevel || fields.verificationLevel) === "string")
						? (fields.VerificationLevel || fields.verificationLevel)
						: "Unverified",
					provenance: {
						source: "AdminEdit",
						sourceId: record.id,
						firstSeenAt: new Date().toISOString(),
					},
				};

				// Handle links - ensure they're strings
				const getStringField = (...options: any[]): string | undefined => {
					for (const option of options) {
						if (typeof option === "string" && option.trim()) {
							return option;
						}
					}
					return undefined;
				};

				const website = getStringField(fields.Website, fields.website, fields.URL, fields.url);
				const github = getStringField(fields.GitHub, fields.github, fields.GitHubURL, fields.githubUrl);
				const twitter = getStringField(fields.Twitter, fields.twitter, fields.TwitterURL, fields.twitterUrl);
				const docs = getStringField(fields.Docs, fields.docs, fields.Documentation, fields.documentation);
				const orgLogin = getStringField(fields.OrgLogin, fields.orgLogin, fields.GitHubOrg, fields.githubOrg);

				if (website || github || twitter || docs) {
					projectData.links = {};
					if (website) projectData.links.website = website;
					if (github) projectData.links.github = github;
					if (twitter) projectData.links.twitter = twitter;
					if (docs) projectData.links.docs = docs;
				}

				// Handle GitHub org
				if (orgLogin) {
					projectData.github = {
						orgLogin,
					};
				}

				// Check if project already exists (by slug or name)
				const existing = await payload.find({
					collection: "projects",
					where: {
						or: [
							{
								slug: {
									equals: projectData.slug,
								},
							},
							{
								name: {
									equals: projectData.name,
								},
							},
						],
					},
					limit: 1,
				});

				if (existing.docs.length > 0) {
					// Update existing project
					const existingProject = existing.docs[0];
					await payload.update({
						collection: "projects",
						id: existingProject.id,
						data: {
							...projectData,
							provenance: {
								...existingProject.provenance,
								sourceId: record.id,
							},
						},
					});
					stats.updated++;
				} else {
					// Create new project
					await payload.create({
						collection: "projects",
						data: projectData,
					});
					stats.inserted++;
				}
			} catch (error) {
				stats.errors++;
			}
		}

		return NextResponse.json({
			success: true,
			stats,
			message: `Import completed: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`,
		});
	} catch (error) {
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Unknown error during import",
			},
			{ status: 500 },
		);
	}
}

