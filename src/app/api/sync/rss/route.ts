import configPromise from "@/payload.config";
import { getPayload } from "payload";
import { headers } from "next/headers";

export async function POST() {
	const headersList = await headers();
	const payload = await getPayload({ config: configPromise });

	// Authenticate admin user
	const { user } = await payload.auth({ headers: headersList });
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Queue the RSS sync job using Payload's Jobs Queue
		const job = await payload.jobs.queue({
			task: "sync-rss-feed",
			input: {
				syncAll: true,
			},
			waitUntil: new Date(Date.now() + 1000), // Start immediately
		});

		console.log(`[RSS Sync] Job queued: ${job.id}`);

		// Execute the job immediately
		const runResult = await payload.jobs.run({
			queue: job.queue || "default",
			limit: 1,
		});

		console.log(`[RSS Sync] Job execution result:`, runResult);

		return Response.json({
			success: true,
			jobId: job.id,
			message: "RSS sync job queued and executed successfully. Check the Sync Jobs panel to monitor progress.",
		});
	} catch (error) {
		return Response.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}

