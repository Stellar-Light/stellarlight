import type { PayloadHandler } from "payload";
import Parser from "rss-parser";

interface RSSFeedTaskInput {
	feedId?: string;
	syncAll?: boolean;
}

interface FeedStats {
	feedName: string;
	feedId: string;
	postsImported: number;
	duplicatesSkipped: number;
	errors: number;
}

export const syncRSSFeedTask: PayloadHandler = async ({ input, req, job }) => {
	const { feedId, syncAll } = input as RSSFeedTaskInput;
	const startTime = Date.now();

	try {
		const payload = req.payload;
		const parser = new Parser({
			customFields: {
				item: ["media:thumbnail", "media:content"],
			},
		});

		// Get feeds to sync
		let feedsResult;
		if (syncAll) {
			feedsResult = await payload.find({
				collection: "rss-feeds",
				where: { enabled: { equals: true } },
			});
		} else {
			if (!feedId) {
				throw new Error("Feed ID is required when syncAll is false");
			}
			// Use findByID for single feed lookup
			const feed = await payload.findByID({
				collection: "rss-feeds",
				id: feedId,
			});
			feedsResult = { docs: [feed] };
		}

		if (!feedsResult.docs || feedsResult.docs.length === 0) {
			throw new Error("No feeds found to sync");
		}

		const feeds = feedsResult.docs;

		console.log(`[RSS Sync] Found ${feeds.length} feed(s) to sync`);

		const feedStats: FeedStats[] = [];
		const errorLog: string[] = [];
		let totalImported = 0;
		let totalDuplicates = 0;
		let totalErrors = 0;

		// Process each feed
		for (const feed of feeds) {
			const feedStat: FeedStats = {
				feedName: feed.name,
				feedId: feed.id,
				postsImported: 0,
				duplicatesSkipped: 0,
				errors: 0,
			};

			try {
				console.log(`[RSS Sync] Processing feed: ${feed.name} (${feed.feedUrl})`);
				// Parse RSS feed
				const rssFeed = await parser.parseURL(feed.feedUrl);
				console.log(`[RSS Sync] Found ${rssFeed.items?.length || 0} items in feed ${feed.name}`);

				// Process each item
				for (const item of rssFeed.items) {
					try {
						// Check if post already exists by GUID or title
						const existing = await payload.find({
							collection: "blog",
							where: {
								or: [
									{ rssItemId: { equals: item.guid || item.link } },
									{
										and: [
											{ title: { equals: item.title } },
											{ rssFeed: { equals: feed.id } },
										],
									},
								],
							},
							limit: 1,
						});

						if (existing.docs && existing.docs.length > 0) {
							feedStat.duplicatesSkipped++;
							continue;
						}

						// Extract featured image from various RSS formats
						let featuredImageUrl = null;
						if (item.enclosure?.url) {
							featuredImageUrl = item.enclosure.url;
						} else if (item["media:thumbnail"]?.url) {
							featuredImageUrl = item["media:thumbnail"].url;
						} else if (item["media:content"]?.url) {
							featuredImageUrl = item["media:content"].url;
						}
						
						// Also try to extract image from content HTML
						if (!featuredImageUrl && item.content) {
							const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/i);
							if (imgMatch && imgMatch[1]) {
								featuredImageUrl = imgMatch[1];
							}
						}

						// Generate slug
						const slug =
							item.title
								?.toLowerCase()
								.replace(/[^a-z0-9]+/g, "-")
								.replace(/(^-|-$)/g, "") || `post-${Date.now()}`;

						// Extract description/excerpt
						const description =
							item.contentSnippet ||
							item.content?.replace(/<[^>]*>/g, "").substring(0, 300) ||
							item.summary ||
							item.description ||
							"";

						// Ensure excerpt is at least 50 chars (required field)
						const excerpt = description.length > 0
							? description.substring(0, 300)
							: (item.title || "RSS Feed Post").substring(0, 300);

						// Create external RSS blog post
						try {
							const blogPost = await payload.create({
								collection: "blog",
								data: {
									title: item.title || "Untitled",
									slug,
									excerpt,
									author: item.creator || item.author || feed.author || "Unknown",
									publishedAt: item.pubDate
										? new Date(item.pubDate).toISOString()
										: new Date().toISOString(),
									category: feed.category || undefined,
									tags: feed.tags || [],
									rssFeed: feed.id,
									rssItemId: item.guid || item.link || slug,
									isRSSExternal: true,
									externalUrl: item.link || item.guid || "",
									rssDescription: description,
									rssImageUrl: featuredImageUrl || undefined,
									contentType: "richText",
									status: "published",
									meta: {
										description: excerpt.substring(0, 160),
									},
								},
							});

							console.log(`Created blog post: ${blogPost.id} - ${item.title}`);
							feedStat.postsImported++;
						} catch (createError) {
							throw createError; // Re-throw to be caught by outer catch
						}
					} catch (itemError) {
						feedStat.errors++;
						const errorMsg = `[${feed.name}] Item "${item.title}": ${itemError instanceof Error ? itemError.message : String(itemError)}`;
						errorLog.push(errorMsg);
						console.error(errorMsg, itemError);
					}
				}

				// Update feed stats
				await payload.update({
					collection: "rss-feeds",
					id: feed.id,
					data: {
						lastSyncedAt: new Date().toISOString(),
						lastSyncStatus: feedStat.errors > 0 ? "Success" : "Success",
						totalPostsImported:
							(feed.totalPostsImported || 0) + feedStat.postsImported,
					},
				});

				totalImported += feedStat.postsImported;
				totalDuplicates += feedStat.duplicatesSkipped;
				totalErrors += feedStat.errors;
			} catch (feedError) {
				feedStat.errors++;
				const errorMsg = `[${feed.name}] Feed sync failed: ${feedError instanceof Error ? feedError.message : String(feedError)}`;
				errorLog.push(errorMsg);
				console.error(errorMsg, feedError);

				// Update feed with error status
				await payload.update({
					collection: "rss-feeds",
					id: feed.id,
					data: {
						lastSyncedAt: new Date().toISOString(),
						lastSyncStatus: "Failed",
						lastSyncError:
							feedError instanceof Error ? feedError.message : String(feedError),
					},
				});
			}

			feedStats.push(feedStat);
		}

		const duration = Date.now() - startTime;

		// Build comprehensive log
		const logParts = [
			`RSS Sync Job Completed`,
			`Duration: ${(duration / 1000).toFixed(2)}s`,
			``,
			`Summary:`,
			`- Feeds processed: ${feeds.docs.length}`,
			`- Posts imported: ${totalImported}`,
			`- Duplicates skipped: ${totalDuplicates}`,
			`- Errors: ${totalErrors}`,
			``,
			`Feed Details:`,
		];

		feedStats.forEach((stat) => {
			logParts.push(
				`  ${stat.feedName}:`,
				`    - Imported: ${stat.postsImported}`,
				`    - Duplicates: ${stat.duplicatesSkipped}`,
				`    - Errors: ${stat.errors}`,
			);
		});

		if (errorLog.length > 0) {
			logParts.push(``, `Error Log:`, ...errorLog.map((e) => `  ${e}`));
		}

		const comprehensiveLog = logParts.join("\n");

		// Return output for Payload Jobs system
		return {
			success: true,
			feedsProcessed: feeds.docs.length,
			postsImported: totalImported,
			duplicatesSkipped: totalDuplicates,
			errors: totalErrors,
			duration,
			feedStats,
			log: comprehensiveLog,
		};
	} catch (error) {
		console.error("RSS sync task failed:", error);

		const errorMessage =
			error instanceof Error ? error.message : String(error);

		// Return error output
		throw new Error(errorMessage);
	}
};
