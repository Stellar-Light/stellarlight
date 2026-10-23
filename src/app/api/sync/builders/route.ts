import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { isAdmin } from "@/collections/access";
import { secretMatches } from "@/lib/admin-auth";
import {
	fetchAllBuilders,
	fetchBuilder,
	transformBuilderForPayload,
} from "@/lib/integrations/stellar-passport";
import config from "@/payload.config";

/**
 * API endpoint to sync builder profiles from Stellar Passport
 *
 * GET /api/sync/builders - Sync all builders
 * GET /api/sync/builders?username=xyz - Sync specific builder
 *
 * GET takes only the env Bearer token (the daily cron in vercel.json). An
 * admin session must use POST (the admin panel button does), so a cross-site
 * link cannot start a sync from an admin's browser.
 */
export async function GET(request: NextRequest) {
	return sync(request, false);
}

/**
 * POST endpoint to trigger manual sync from admin panel
 */
export async function POST(request: NextRequest) {
	return sync(request, true);
}

async function sync(request: NextRequest, allowSession: boolean) {
	try {
		const headersList = await headers();
		const payload = await getPayload({ config });

		// Check authorization: accept the env Bearer token OR an admin session
		const authHeader = headersList.get("authorization");
		const expectedKey = process.env.CRON_SECRET || process.env.SYNC_API_KEY;
		const hasBearerAuth = secretMatches(
			authHeader,
			expectedKey ? `Bearer ${expectedKey}` : null,
		);

		// Admins only: a signed-in partner also sets user (src/collections/access.ts)
		const hasSessionAuth =
			allowSession &&
			isAdmin((await payload.auth({ headers: headersList })).user);

		if (!hasBearerAuth && !hasSessionAuth) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}
		const searchParams = request.nextUrl.searchParams;
		const username = searchParams.get("username");

		let buildersToSync = [];

		if (username) {
			// Sync specific builder
			const builder = await fetchBuilder(username);
			if (builder) {
				buildersToSync = [builder];
			} else {
				return NextResponse.json(
					{ error: `Builder ${username} not found` },
					{ status: 404 },
				);
			}
		} else {
			// Sync all builders
			buildersToSync = await fetchAllBuilders();
		}

		const results = {
			synced: 0,
			created: 0,
			updated: 0,
			errors: [] as Array<{ username: string | null; error: string }>,
		};

		// Process each builder
		for (const builder of buildersToSync) {
			try {
				if (!builder.github_username) {
					console.log(
						`Skipping builder without GitHub username: ${builder.display_name}`,
					);
					continue;
				}

				const transformedBuilder = transformBuilderForPayload(builder);

				// Check if builder already exists
				const existingBuilder = await payload.find({
					collection: "builders",
					where: {
						github_username: {
							equals: builder.github_username,
						},
					},
					limit: 1,
				});

				if (existingBuilder.docs.length > 0) {
					// Update existing builder
					await payload.update({
						collection: "builders",
						id: existingBuilder.docs[0].id,
						data: transformedBuilder,
					});
					results.updated++;
				} else {
					// Create new builder
					await payload.create({
						collection: "builders",
						data: transformedBuilder,
					});
					results.created++;
				}

				results.synced++;
			} catch (error) {
				console.error(
					`Error syncing builder ${builder.github_username}:`,
					error,
				);
				results.errors.push({
					username: builder.github_username,
					error: error instanceof Error ? error.message : "Unknown error",
				});
			}
		}

		return NextResponse.json({
			success: true,
			message: `Successfully synced ${results.synced} builders`,
			results,
		});
	} catch (error) {
		console.error("Builder sync error:", error);
		return NextResponse.json(
			{
				success: false,
				error:
					error instanceof Error ? error.message : "Failed to sync builders",
			},
			{ status: 500 },
		);
	}
}
