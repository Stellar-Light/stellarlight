import { NextRequest, NextResponse } from "next/server";
import Airtable from "airtable";
import { getPayloadSafe } from "@/lib/payload-client";

// Airtable configuration from the provided URL
// URL: https://airtable.com/appnaTSKcxJfsgTQy/tblWf69pEPyhW8ntO/viwVVnH1gnbI9Fa7t
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID || "appnaTSKcxJfsgTQy";
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID || "tblWf69pEPyhW8ntO";
const AIRTABLE_VIEW_ID = process.env.AIRTABLE_VIEW_ID || "viwVVnH1gnbI9Fa7t";

export async function POST(request: NextRequest) {
	try {
		const apiKey = process.env.AIRTABLE_API_KEY;
		if (!apiKey) {
			return NextResponse.json(
				{ error: "AIRTABLE_API_KEY environment variable is not set" },
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
				const projectData: any = {
					name: fields.Name || fields.name || `Project ${record.id}`,
					slug: fields.Slug || fields.slug || fields.Name?.toLowerCase().replace(/\s+/g, "-") || `project-${record.id}`,
					shortDescription: fields.Description || fields.description || fields.ShortDescription || fields.shortDescription || "",
					category: fields.Category || fields.category || "Infrastructure",
					status: fields.Status || fields.status || "Draft",
					verificationLevel: fields.VerificationLevel || fields.verificationLevel || "Unverified",
					provenance: {
						source: "AdminEdit",
						sourceId: record.id,
						firstSeenAt: new Date().toISOString(),
					},
				};

				// Handle links
				if (fields.Website || fields.website || fields.URL || fields.url) {
					projectData.links = {
						website: fields.Website || fields.website || fields.URL || fields.url,
					};
				}
				if (fields.GitHub || fields.github || fields.GitHubURL || fields.githubUrl) {
					projectData.links = {
						...projectData.links,
						github: fields.GitHub || fields.github || fields.GitHubURL || fields.githubUrl,
					};
				}
				if (fields.Twitter || fields.twitter || fields.TwitterURL || fields.twitterUrl) {
					projectData.links = {
						...projectData.links,
						twitter: fields.Twitter || fields.twitter || fields.TwitterURL || fields.twitterUrl,
					};
				}
				if (fields.Docs || fields.docs || fields.Documentation || fields.documentation) {
					projectData.links = {
						...projectData.links,
						docs: fields.Docs || fields.docs || fields.Documentation || fields.documentation,
					};
				}

				// Handle GitHub org
				if (fields.OrgLogin || fields.orgLogin || fields.GitHubOrg || fields.githubOrg) {
					projectData.github = {
						orgLogin: fields.OrgLogin || fields.orgLogin || fields.GitHubOrg || fields.githubOrg,
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
				console.error(`Error processing record ${record.id}:`, error);
				stats.errors++;
			}
		}

		return NextResponse.json({
			success: true,
			stats,
			message: `Import completed: ${stats.inserted} inserted, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors`,
		});
	} catch (error) {
		console.error("Airtable import error:", error);
		return NextResponse.json(
			{
				error: error instanceof Error ? error.message : "Unknown error during import",
			},
			{ status: 500 },
		);
	}
}

