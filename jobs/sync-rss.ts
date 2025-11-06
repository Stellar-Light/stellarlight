import "dotenv/config";
import Parser from "rss-parser";
import configPromise from "../src/payload.config";
import { getPayload } from "payload";

const parser = new Parser({
	customFields: {
		item: ["content:encoded", "media:thumbnail"],
	},
});

async function run() {
	const payload = await getPayload({
		config: configPromise,
	});

	// Create sync job
	const syncJob = await payload.create({
		collection: "sync-jobs",
		data: {
			source: "RSS Feed",
			status: "Running",
			startedAt: new Date().toISOString(),
			stats: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
			log: "Starting RSS sync...",
		},
	});

	const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
	const errors: string[] = [];

	try {
		// Fetch all enabled RSS feeds
		const feedsResult = await payload.find({
			collection: "rss-feeds",
			where: {
				enabled: {
					equals: true,
				},
			},
			limit: 100,
		});

		const feeds = feedsResult.docs;

		if (feeds.length === 0) {
			await payload.update({
				collection: "sync-jobs",
				id: syncJob.id,
				data: {
					status: "Completed",
					finishedAt: new Date().toISOString(),
					stats,
					log: "No enabled RSS feeds found",
				},
			});
			return;
		}

		// Process each feed
		for (const feed of feeds) {
			try {
				// Parse RSS feed
				const feedData = await parser.parseURL(feed.feedUrl as string);

				// Process each item
				for (const item of feedData.items) {
					try {
						// Generate unique ID for RSS item
						const rssItemId =
							item.guid || item.id || item.link || item.title || "";

						if (!rssItemId || !item.title) {
							stats.skipped++;
							continue;
						}

						// Generate slug from title
						const slug = item.title
							.toLowerCase()
							.replace(/[^a-z0-9]+/g, "-")
							.replace(/(^-|-$)/g, "");

						// Check if blog post already exists by rssItemId or slug
						const existing = await payload.find({
							collection: "blog",
							where: {
								or: [
									{ rssItemId: { equals: rssItemId } },
									{ slug: { equals: slug } },
								],
							},
							limit: 1,
						});

						// Extract content
						const content = item["content:encoded"] || item.content || item.description || "";
						
						// Extract excerpt
						const excerpt = item.contentSnippet || item.description || content.slice(0, 200).replace(/<[^>]*>/g, "");
						
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
						if (!featuredImageUrl && content) {
							const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
							if (imgMatch && imgMatch[1]) {
								featuredImageUrl = imgMatch[1];
							}
						}

						// Prepare blog post data
						const blogData: any = {
							title: item.title,
							slug,
							excerpt: excerpt.length > 300 ? excerpt.slice(0, 300) + "..." : excerpt,
							author: item.creator || item.author || feed.author || "Unknown",
							publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
							category: feed.category || undefined,
							tags: feed.tags || [],
							rssFeed: feed.id,
							rssItemId,
							rssImageUrl: featuredImageUrl || undefined,
							contentType: "markdown",
							status: feed.autoPublish ? "published" : "draft",
							meta: {
								description: excerpt,
							},
						};

						// Convert HTML content to markdown
						if (content) {
							const markdownContent = content
								.replace(/<p>/g, "\n\n")
								.replace(/<\/p>/g, "")
								.replace(/<br\s*\/?>/g, "\n")
								.replace(/<strong>(.*?)<\/strong>/g, "**$1**")
								.replace(/<em>(.*?)<\/em>/g, "*$1*")
								.replace(/<a href="([^"]*)">(.*?)<\/a>/g, "[$2]($1)")
								.replace(/<h[1-6]>(.*?)<\/h[1-6]>/g, "\n## $1\n")
								.replace(/<[^>]+>/g, "")
								.trim();
							
							blogData.markdownContent = markdownContent || content;
						}

						if (existing.docs.length > 0) {
							// Update existing post (only if it came from RSS)
							const existingDoc = existing.docs[0];
							if (existingDoc.rssFeed) {
								await payload.update({
									collection: "blog",
									id: existingDoc.id,
									data: {
										...blogData,
										slug: existingDoc.slug, // Preserve existing slug
									},
								});
								stats.updated++;
							} else {
								stats.skipped++;
							}
						} else {
							// Create new post
							await payload.create({
								collection: "blog",
								data: blogData,
							});
							stats.inserted++;
						}
					} catch (error) {
						stats.errors++;
						errors.push(
							`Item "${item.title}" from feed "${feed.name}": ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}

				// Update feed sync status
				await payload.update({
					collection: "rss-feeds",
					id: feed.id,
					data: {
						lastSyncedAt: new Date().toISOString(),
						lastSyncStatus: "Success",
						totalPostsImported: (feed.totalPostsImported || 0) + stats.inserted,
					},
				});
			} catch (error) {
				stats.errors++;
				errors.push(
					`Feed "${feed.name}" (${feed.feedUrl}): ${error instanceof Error ? error.message : String(error)}`,
				);

				// Update feed sync status with error
				await payload.update({
					collection: "rss-feeds",
					id: feed.id,
					data: {
						lastSyncedAt: new Date().toISOString(),
						lastSyncStatus: "Failed",
						lastSyncError: error instanceof Error ? error.message : String(error),
					},
				});
			}
		}

		// Update sync job
		await payload.update({
			collection: "sync-jobs",
			id: syncJob.id,
			data: {
				status: "Completed",
				finishedAt: new Date().toISOString(),
				stats,
				log:
					errors.length > 0 ? errors.join("\n") : "RSS sync completed successfully",
			},
		});

		console.log("RSS sync completed:", stats);
	} catch (error) {
		// Update sync job with error
		await payload.update({
			collection: "sync-jobs",
			id: syncJob.id,
			data: {
				status: "Failed",
				finishedAt: new Date().toISOString(),
				stats,
				log: error instanceof Error ? error.message : String(error),
			},
		});

		console.error("RSS sync error:", error);
		throw error;
	}
}

run()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});

