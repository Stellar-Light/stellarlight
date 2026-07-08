import { headers } from "next/headers";
import { getPayload } from "payload";
import configPromise from "@/payload.config";

export async function POST(
	request: Request,
	{ params }: { params: Promise<{ id?: string }> },
) {
	const headersList = await headers();
	const payload = await getPayload({ config: configPromise });
	const resolvedParams = await params;

	// Authenticate admin user
	const { user } = await payload.auth({ headers: headersList });
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		if (!resolvedParams.id) {
			return Response.json(
				{
					success: false,
					error: "Feed ID is required",
				},
				{ status: 400 },
			);
		}

		// Verify feed exists and is enabled
		const feed = await payload.findByID({
			collection: "rss-feeds",
			id: resolvedParams.id,
		});

		if (!feed.enabled) {
			return Response.json(
				{
					success: false,
					error: "Feed is disabled",
				},
				{ status: 400 },
			);
		}

		// Queue the RSS sync job for this specific feed
		const job = await (payload.jobs.queue as any)({
			task: "sync-rss-feed",
			input: {
				feedId: resolvedParams.id,
				syncAll: false,
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
			message: `RSS sync job queued and executed for feed "${feed.name}". Check the Sync Jobs panel to monitor progress.`,
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
