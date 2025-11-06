import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { simpleGit } from "simple-git";
import configPromise from "@/payload.config";
import { getPayload } from "payload";
import { headers } from "next/headers";
import {
	extractEntryId,
	mapLumenloopEntry,
} from "@/lib/utils/lumenloop-mapper";
import { generateSlug } from "@/lib/utils/normalize";

export async function POST() {
	const headersList = await headers();
	const payload = await getPayload({ config: configPromise });

	// Authenticate admin user (in PayloadCMS, authenticated users are admins)
	const { user } = await payload.auth({ headers: headersList });
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Create sync job
	const syncJob = await payload.create({
		collection: "sync-jobs",
		data: {
			source: "Lumenloop",
			status: "Running",
			startedAt: new Date().toISOString(),
			stats: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
			log: "Starting sync...",
		},
	});

	const stats = { inserted: 0, updated: 0, skipped: 0, errors: 0 };
	const errors: string[] = [];

	try {
		// Determine source path
		let repoPath: string;
		if (process.env.LUMENLOOP_PATH && existsSync(process.env.LUMENLOOP_PATH)) {
			repoPath = process.env.LUMENLOOP_PATH;
		} else {
			// Clone repo to /tmp
			repoPath = "/tmp/stellar-ecosystem-db";
			const git = simpleGit();

			if (existsSync(repoPath)) {
				// Pull latest if exists
				await git.cwd(repoPath).pull();
			} else {
				// Clone shallow
				await git.clone(
					"https://github.com/lumenloop/stellar-ecosystem-db.git",
					repoPath,
					["--depth", "1"],
				);
			}
		}

		// Find and parse data files (JSON/YAML)
		const dataFiles = await findDataFiles(repoPath);

		for (const filePath of dataFiles) {
			try {
				const rawData = await readFile(filePath, "utf-8");
				const entries = parseDataFile(rawData, filePath);

				for (const [index, entry] of entries.entries()) {
					try {
						const entryId = extractEntryId(entry, index);
						const mapped = mapLumenloopEntry(entry, entryId);

						if (!mapped.name) {
							stats.skipped++;
							continue;
						}

						// Check if project exists by slug or normalized domain
						const slug = generateSlug(mapped.name);
						const existing = await payload.find({
							collection: "projects",
							where: {
								or: [
									{ slug: { equals: slug } },
									...(mapped.links?.website
										? [
												{
													"links.website": {
														contains: mapped.links.website,
													},
												},
											]
										: []),
								],
							},
							limit: 1,
						});

						if (existing.docs.length > 0) {
							// Update existing
							const existingDoc = existing.docs[0];
							// Only update if source is LumenloopSeed or it's unverified
							if (
								existingDoc.provenance?.source === "LumenloopSeed" ||
								existingDoc.verificationLevel === "Unverified"
							) {
								await payload.update({
									collection: "projects",
									id: existingDoc.id,
									data: {
										...mapped,
										slug, // Preserve slug
										provenance: {
											...mapped.provenance,
											firstSeenAt:
												existingDoc.provenance?.firstSeenAt ||
												mapped.provenance?.firstSeenAt,
										},
									},
								});
								stats.updated++;
							} else {
								stats.skipped++;
							}
						} else {
							// Create new
							await payload.create({
								collection: "projects",
								data: {
									...mapped,
									slug,
								},
							});
							stats.inserted++;
						}
					} catch (error) {
						stats.errors++;
						errors.push(
							`Entry ${index} in ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
			} catch (error) {
				stats.errors++;
				errors.push(
					`File ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
				);
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
					errors.length > 0 ? errors.join("\n") : "Sync completed successfully",
			},
		});

		return Response.json({
			success: true,
			stats,
			errors: errors.length > 0 ? errors : undefined,
		});
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

		return Response.json(
			{
				success: false,
				error: error instanceof Error ? error.message : String(error),
				stats,
			},
			{ status: 500 },
		);
	}
}

/**
 * Find data files (JSON/YAML) in the repo
 */
async function findDataFiles(rootPath: string): Promise<string[]> {
	const files: string[] = [];
	const extensions = [".json", ".yaml", ".yml"];

	async function walkDir(dir: string): Promise<void> {
		try {
			const entries = await readdir(dir, { withFileTypes: true });
			for (const entry of entries) {
				const fullPath = join(dir, entry.name);

				if (
					entry.isDirectory() &&
					!entry.name.startsWith(".") &&
					entry.name !== "node_modules"
				) {
					await walkDir(fullPath);
				} else if (entry.isFile()) {
					const ext = entry.name.toLowerCase();
					if (extensions.some((e) => ext.endsWith(e))) {
						files.push(fullPath);
					}
				}
			}
		} catch {
			// Skip directories we can't read
		}
	}

	await walkDir(rootPath);
	return files;
}

/**
 * Parse a data file (JSON or YAML) into an array of entries
 */
function parseDataFile(
	content: string,
	filePath: string,
): Record<string, unknown>[] {
	const ext = filePath.toLowerCase();

	if (ext.endsWith(".json")) {
		try {
			const parsed = JSON.parse(content);
			// If it's an array, return it; if it's an object, wrap it
			return Array.isArray(parsed) ? parsed : [parsed];
		} catch {
			return [];
		}
	}

	if (ext.endsWith(".yaml") || ext.endsWith(".yml")) {
		// For MVP, we'll handle YAML as JSON-compatible or skip
		// In production, you'd use a YAML parser like js-yaml
		try {
			// Try parsing as JSON first (some YAML is JSON-compatible)
			const parsed = JSON.parse(content);
			return Array.isArray(parsed) ? parsed : [parsed];
		} catch {
			// Skip YAML files for now (can add js-yaml later if needed)
			return [];
		}
	}

	return [];
}
