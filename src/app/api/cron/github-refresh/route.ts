import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { getAppUrl } from "@/lib/utils/app-url";
import configPromise from "@/payload.config";

/**
 * Vercel Cron Job: Refresh GitHub statistics for all projects
 *
 * Current Schedule: Daily at 2:00 AM UTC (Hobby plan compatible)
 * To run more frequently (e.g., every 6 hours), upgrade to Pro plan and update vercel.json
 *
 * Security: Protected by Vercel Cron secret
 */
export async function GET(request: Request) {
	// Verify this is a Vercel Cron request
	// Vercel automatically adds Authorization header with CRON_SECRET
	const authHeader = request.headers.get("authorization");
	const cronSecret = process.env.CRON_SECRET || process.env.VERCEL_CRON_SECRET;

	if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const payload = await getPayload({ config: configPromise });

		// Get all projects with GitHub repos
		const projects = await payload.find({
			collection: "projects",
			where: {
				and: [
					{
						"github.repos": {
							exists: true,
						},
					},
					{
						status: {
							in: ["Development", "Pre-Release", "Live"],
						},
					},
				],
			},
			limit: 500,
		});

		const appUrl = getAppUrl();
		let successCount = 0;
		let errorCount = 0;

		// Refresh GitHub data for each project
		for (const project of projects.docs) {
			try {
				const response = await fetch(
					`${appUrl}/api/projects/${project.id}/github?refresh=true`,
					{
						method: "GET",
						headers: {
							"Content-Type": "application/json",
						},
					},
				);

				if (response.ok) {
					successCount++;
				} else {
					errorCount++;
				}

				// Rate limiting: wait 250ms between requests
				await new Promise((resolve) => setTimeout(resolve, 250));
			} catch (error) {
				errorCount++;
			}
		}

		return NextResponse.json({
			success: true,
			message: "GitHub refresh completed",
			stats: {
				total: projects.docs.length,
				success: successCount,
				errors: errorCount,
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
