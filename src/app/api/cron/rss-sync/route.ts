import { NextResponse } from "next/server";
import configPromise from "@/payload.config";
import { getPayload } from "payload";

/**
 * Vercel Cron Job: Sync all enabled RSS feeds
 * Runs every 4 hours
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

		// Queue the RSS sync job using Payload's Jobs Queue
		const job = await payload.jobs.queue({
			task: "sync-rss-feed",
			input: {
				syncAll: true,
			},
			waitUntil: new Date(Date.now() + 1000), // Start immediately
		});

		console.log(`[RSS Sync Cron] Job queued: ${job.id}`);

		// Execute the job immediately
		const runResult = await payload.jobs.run({
			queue: job.queue || "default",
			limit: 1,
		});

		console.log(`[RSS Sync Cron] Job execution result:`, runResult);

		return NextResponse.json({
			success: true,
			jobId: job.id,
			message: "RSS sync job queued and executed successfully",
		});
	} catch (error) {
		console.error("RSS sync cron job error:", error);
		return NextResponse.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}

