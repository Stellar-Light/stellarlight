import { readFile, readdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { simpleGit } from "simple-git";
import yaml from "js-yaml";
import configPromise from "@/payload.config";
import { getPayload } from "payload";
import { headers } from "next/headers";
import {
	extractEntryId,
	mapLumenloopEntry,
	type LumenloopEntry,
} from "@/lib/utils/lumenloop-mapper";
import { generateSlug } from "@/lib/utils/normalize";

interface SyncStats {
	projects: { inserted: number; updated: number; skipped: number; errors: number };
	entities: { created: number; linked: number; skipped: number; errors: number };
	total_files: number;
}

export async function POST(request: Request) {
	const headersList = await headers();
	const payload = await getPayload({ config: configPromise });

	// Authenticate admin user
	const { user } = await payload.auth({ headers: headersList });
	if (!user) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	// Check for dry-run mode
	const url = new URL(request.url);
	const dryRun = url.searchParams.get("dryRun") === "true";

	const stats: SyncStats = {
		projects: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
		entities: { created: 0, linked: 0, skipped: 0, errors: 0 },
		total_files: 0,
	};
	const errors: string[] = [];
	const dryRunLog: Array<{
		action: string;
		type: string;
		name: string;
		details?: string;
	}> = [];

	try {
		// Determine source path
		let repoPath: string;
		if (process.env.LUMENLOOP_PATH && existsSync(process.env.LUMENLOOP_PATH)) {
			repoPath = process.env.LUMENLOOP_PATH;
		} else {
			repoPath = "/tmp/stellar-ecosystem-db";
			const git = simpleGit();

			if (existsSync(repoPath)) {
				await git.cwd(repoPath).pull();
			} else {
				await git.clone(
					"https://github.com/lumenloop/stellar-ecosystem-db.git",
					repoPath,
					["--depth", "1"],
				);
			}
		}

		// Only scan the projects/ directory
		const projectsDir = join(repoPath, "projects");
		if (!existsSync(projectsDir)) {
			return Response.json(
				{ error: "projects/ directory not found in repo" },
				{ status: 500 },
			);
		}

		const yamlFiles = await findYamlFiles(projectsDir);
		stats.total_files = yamlFiles.length;

		// Phase 1: Collect all unique parent entities and create them
		const entityMap = new Map<string, string>(); // entity slug → entity ID
		const parentNames = new Set<string>();

		// First pass: collect parent names
		for (const filePath of yamlFiles) {
			try {
				const rawData = await readFile(filePath, "utf-8");
				const entry = yaml.load(rawData) as LumenloopEntry;
				if (entry?.parent) {
					parentNames.add(entry.parent);
				}
			} catch {
				// Skip files that can't be parsed in first pass
			}
		}

		// Create or find entities
		for (const parentName of parentNames) {
			try {
				const entitySlug = generateSlug(parentName);

				// Check if entity already exists
				const existing = await payload.find({
					collection: "entities",
					where: { slug: { equals: entitySlug } },
					limit: 1,
				});

				if (existing.docs.length > 0) {
					entityMap.set(entitySlug, existing.docs[0].id);
					stats.entities.skipped++;
					if (dryRun) {
						dryRunLog.push({
							action: "skip",
							type: "entity",
							name: parentName,
							details: "Already exists",
						});
					}
				} else if (dryRun) {
					entityMap.set(entitySlug, `dry-run-${entitySlug}`);
					stats.entities.created++;
					dryRunLog.push({
						action: "create",
						type: "entity",
						name: parentName,
					});
				} else {
					const created = await payload.create({
						collection: "entities",
						data: {
							name: parentName,
							slug: entitySlug,
						},
					});
					entityMap.set(entitySlug, created.id);
					stats.entities.created++;
				}
			} catch (error) {
				stats.entities.errors++;
				errors.push(
					`Entity "${parentName}": ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		// Phase 2: Process projects
		for (const filePath of yamlFiles) {
			const fileName = filePath.split("/").pop() || filePath;
			try {
				const rawData = await readFile(filePath, "utf-8");
				const entry = yaml.load(rawData) as LumenloopEntry;

				if (!entry || !entry.title) {
					stats.projects.skipped++;
					continue;
				}

				const entryId = extractEntryId(entry);
				const { project: mapped, parentEntity } =
					mapLumenloopEntry(entry, entryId);
				const slug = generateSlug(mapped.name!);

				// Check if project exists by slug
				const existing = await payload.find({
					collection: "projects",
					where: { slug: { equals: slug } },
					limit: 1,
				});

				if (existing.docs.length > 0) {
					const existingDoc = existing.docs[0];

					// Only update if source is LumenloopSeed or it's unverified
					if (
						existingDoc.provenance?.source === "LumenloopSeed" ||
						existingDoc.verificationLevel === "Unverified"
					) {
						if (dryRun) {
							dryRunLog.push({
								action: "update",
								type: "project",
								name: mapped.name!,
								details: `Existing slug: ${slug}`,
							});
							stats.projects.updated++;
						} else {
							await payload.update({
								collection: "projects",
								id: existingDoc.id,
								data: {
									...mapped,
									slug,
									provenance: {
										...mapped.provenance,
										firstSeenAt:
											existingDoc.provenance?.firstSeenAt ||
											mapped.provenance?.firstSeenAt,
									},
								},
							});
							stats.projects.updated++;
						}

						// Link entity if parent exists
						if (parentEntity) {
							await linkEntity(
								payload,
								parentEntity,
								existing.docs[0].id,
								entityMap,
								stats,
								errors,
								dryRun,
								dryRunLog,
							);
						}
					} else {
						stats.projects.skipped++;
						if (dryRun) {
							dryRunLog.push({
								action: "skip",
								type: "project",
								name: mapped.name!,
								details: `Source: ${existingDoc.provenance?.source}, Verified: ${existingDoc.verificationLevel}`,
							});
						}
					}
				} else {
					// Create new project
					if (dryRun) {
						dryRunLog.push({
							action: "create",
							type: "project",
							name: mapped.name!,
							details: `Category: ${mapped.category}`,
						});
						stats.projects.inserted++;

						if (parentEntity) {
							stats.entities.linked++;
							dryRunLog.push({
								action: "link",
								type: "entity",
								name: parentEntity,
								details: `→ ${mapped.name}`,
							});
						}
					} else {
						const created = await payload.create({
							collection: "projects",
							data: {
								...mapped,
								slug,
							} as any,
						});
						stats.projects.inserted++;

						// Link entity if parent exists
						if (parentEntity) {
							await linkEntity(
								payload,
								parentEntity,
								created.id,
								entityMap,
								stats,
								errors,
								dryRun,
								dryRunLog,
							);
						}
					}
				}
			} catch (error) {
				stats.projects.errors++;
				errors.push(
					`File ${fileName}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}

		return Response.json({
			success: true,
			dryRun,
			stats,
			errors: errors.length > 0 ? errors : undefined,
			...(dryRun ? { log: dryRunLog } : {}),
		});
	} catch (error) {
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
 * Link a parent entity to a project
 */
async function linkEntity(
	payload: any,
	parentName: string,
	projectId: string,
	entityMap: Map<string, string>,
	stats: SyncStats,
	errors: string[],
	dryRun: boolean,
	dryRunLog: Array<{ action: string; type: string; name: string; details?: string }>,
) {
	try {
		const entitySlug = generateSlug(parentName);
		const entityId = entityMap.get(entitySlug);

		if (!entityId) {
			return; // Entity wasn't created (error during creation)
		}

		if (dryRun) {
			stats.entities.linked++;
			return;
		}

		// Get current entity to check existing project links
		const entity = await payload.findByID({
			collection: "entities",
			id: entityId,
		});

		const existingProjects: string[] = Array.isArray(entity.projects)
			? entity.projects.map((p: any) => (typeof p === "string" ? p : p.id))
			: [];

		// Only add if not already linked
		if (!existingProjects.includes(projectId)) {
			await payload.update({
				collection: "entities",
				id: entityId,
				data: {
					projects: [...existingProjects, projectId],
				},
			});
			stats.entities.linked++;
		}
	} catch (error) {
		stats.entities.errors++;
		errors.push(
			`Link entity "${parentName}": ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

/**
 * Find YAML files in a directory (non-recursive, since all projects are flat)
 */
async function findYamlFiles(dir: string): Promise<string[]> {
	const entries = await readdir(dir, { withFileTypes: true });
	return entries
		.filter(
			(e) =>
				e.isFile() &&
				(e.name.endsWith(".yaml") || e.name.endsWith(".yml")),
		)
		.map((e) => join(dir, e.name))
		.sort();
}
