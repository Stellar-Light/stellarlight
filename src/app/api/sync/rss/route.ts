import { headers } from "next/headers";
import { getPayload } from "payload";
import { isAdmin } from "@/collections/access";
import configPromise from "@/payload.config";

export async function POST() {
	const headersList = await headers();
	const payload = await getPayload({ config: configPromise });

	// Admins only: a signed-in partner also sets user (src/collections/access.ts)
	const { user } = await payload.auth({ headers: headersList });
	if (!isAdmin(user)) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		// Queue the RSS sync job using Payload's Jobs Queue
		const job = await (payload.jobs.queue as any)({
			task: "sync-rss-feed",
			input: {
				syncAll: true,
			},
			waitUntil: new Date(Date.now() + 1000), // Start immediately
		});

		// Execute the job immediately
		await payload.jobs.run({
			queue: job.queue || "default",
			limit: 1,
		});

		return Response.json({
			success: true,
			jobId: job.id,
			message:
				"RSS sync job queued and executed successfully. Check the Sync Jobs panel to monitor progress.",
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
