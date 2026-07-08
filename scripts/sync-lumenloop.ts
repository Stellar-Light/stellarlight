/**
 * Standalone script to sync projects and entities from the Lumenloop stellar-ecosystem-db.
 *
 * Usage:
 *   npx tsx scripts/sync-lumenloop.ts                  # Dry run (default)
 *   npx tsx scripts/sync-lumenloop.ts --execute        # Actually write to DB
 *   npx tsx scripts/sync-lumenloop.ts --execute --skip-entities  # Skip entity creation
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { getPayload } from "payload";
import {
	extractEntryId,
	type LumenloopEntry,
	mapLumenloopEntry,
} from "../src/lib/utils/lumenloop-mapper";
import { generateSlug } from "../src/lib/utils/normalize";
import configPromise from "../src/payload.config";

// --- CLI args ---
const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const skipEntities = args.includes("--skip-entities");

// --- Stats ---
const stats = {
	projects: { inserted: 0, updated: 0, skipped: 0, errors: 0 },
	entities: { created: 0, linked: 0, skipped: 0, errors: 0 },
	total_files: 0,
};
const errors: string[] = [];

async function main() {
	console.log("=== Lumenloop Ecosystem Sync ===");
	console.log(
		`Mode: ${dryRun ? "DRY RUN (no changes)" : "EXECUTE (writing to DB)"}`,
	);
	console.log(`Entities: ${skipEntities ? "SKIPPED" : "ENABLED"}`);
	console.log("");

	// 1. Clone/pull repo
	const repoPath = "/tmp/stellar-ecosystem-db";
	if (existsSync(repoPath)) {
		console.log("Pulling latest from stellar-ecosystem-db...");
		execSync("git pull", { cwd: repoPath, stdio: "pipe" });
	} else {
		console.log("Cloning stellar-ecosystem-db...");
		execSync(
			"git clone --depth 1 https://github.com/lumenloop/stellar-ecosystem-db.git " +
				repoPath,
			{ stdio: "pipe" },
		);
	}

	// 2. Read YAML files
	const projectsDir = join(repoPath, "projects");
	const yamlFiles = readdirSync(projectsDir)
		.filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
		.sort();
	stats.total_files = yamlFiles.length;
	console.log(`Found ${yamlFiles.length} YAML files\n`);

	// 3. Parse all entries
	const entries: Array<{ file: string; entry: LumenloopEntry }> = [];
	for (const file of yamlFiles) {
		try {
			const raw = readFileSync(join(projectsDir, file), "utf-8");
			const entry = yaml.load(raw) as LumenloopEntry;
			if (entry && entry.title) {
				entries.push({ file, entry });
			}
		} catch (e) {
			stats.projects.errors++;
			errors.push(
				`Parse error ${file}: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}
	console.log(`Parsed ${entries.length} valid entries\n`);

	// 4. Initialize Payload
	console.log("Connecting to database...");
	const payload = await getPayload({ config: configPromise });
	console.log("Connected.\n");

	// 5. Phase 1: Create entities from parent fields
	const entityMap = new Map<string, string>(); // slug → ID

	if (!skipEntities) {
		const parentNames = new Set<string>();
		for (const { entry } of entries) {
			if (entry.parent) parentNames.add(entry.parent);
		}
		console.log(`Found ${parentNames.size} unique parent entities\n`);

		for (const name of parentNames) {
			const slug = generateSlug(name);
			try {
				const existing = await payload.find({
					collection: "entities",
					where: { slug: { equals: slug } },
					limit: 1,
				});

				if (existing.docs.length > 0) {
					entityMap.set(slug, existing.docs[0].id);
					stats.entities.skipped++;
					console.log(`  ENTITY EXISTS: ${name} (${slug})`);
				} else if (dryRun) {
					entityMap.set(slug, `dry-run-${slug}`);
					stats.entities.created++;
					console.log(`  ENTITY CREATE: ${name} (${slug})`);
				} else {
					const created = await payload.create({
						collection: "entities",
						data: { name, slug },
					});
					entityMap.set(slug, created.id);
					stats.entities.created++;
					console.log(`  ENTITY CREATED: ${name} → ${created.id}`);
				}
			} catch (e) {
				stats.entities.errors++;
				errors.push(
					`Entity "${name}": ${e instanceof Error ? e.message : String(e)}`,
				);
				console.error(
					`  ENTITY ERROR: ${name}: ${e instanceof Error ? e.message : String(e)}`,
				);
			}
		}
		console.log("");
	}

	// 6. Phase 2: Sync projects
	console.log("Syncing projects...\n");

	for (const { file, entry } of entries) {
		try {
			const entryId = extractEntryId(entry);
			const { project: mapped, parentEntity } = mapLumenloopEntry(
				entry,
				entryId,
			);
			const slug = generateSlug(mapped.name!);

			// Check if project exists
			const existing = await payload.find({
				collection: "projects",
				where: { slug: { equals: slug } },
				limit: 1,
			});

			if (existing.docs.length > 0) {
				const doc = existing.docs[0];

				// Only update LumenloopSeed or Unverified projects
				if (
					doc.provenance?.source === "LumenloopSeed" ||
					doc.verificationLevel === "Unverified"
				) {
					if (dryRun) {
						console.log(`  UPDATE: ${mapped.name} (${slug})`);
					} else {
						await payload.update({
							collection: "projects",
							id: doc.id,
							data: {
								...mapped,
								slug,
								provenance: {
									...mapped.provenance,
									firstSeenAt:
										doc.provenance?.firstSeenAt ||
										mapped.provenance?.firstSeenAt,
								},
							},
						});
						console.log(`  UPDATED: ${mapped.name} → ${doc.id}`);
					}
					stats.projects.updated++;

					// Link entity
					if (parentEntity && !skipEntities) {
						await linkEntity(payload, parentEntity, doc.id, entityMap, dryRun);
					}
				} else {
					stats.projects.skipped++;
				}
			} else {
				// Create new project
				if (dryRun) {
					console.log(`  CREATE: ${mapped.name} [${mapped.category}]`);
					stats.projects.inserted++;

					if (parentEntity && !skipEntities) {
						stats.entities.linked++;
					}
				} else {
					const created = await payload.create({
						collection: "projects",
						data: { ...mapped, slug } as any,
					});
					console.log(`  CREATED: ${mapped.name} → ${created.id}`);
					stats.projects.inserted++;

					// Link entity
					if (parentEntity && !skipEntities) {
						await linkEntity(
							payload,
							parentEntity,
							created.id,
							entityMap,
							dryRun,
						);
					}
				}
			}
		} catch (e) {
			stats.projects.errors++;
			const msg = `${file}: ${e instanceof Error ? e.message : String(e)}`;
			errors.push(msg);
			console.error(`  ERROR: ${msg}`);
		}
	}

	// 7. Print summary
	console.log("\n=== SYNC SUMMARY ===");
	console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTED"}`);
	console.log(`Files scanned: ${stats.total_files}`);
	console.log("");
	console.log("Projects:");
	console.log(`  New:     ${stats.projects.inserted}`);
	console.log(`  Updated: ${stats.projects.updated}`);
	console.log(`  Skipped: ${stats.projects.skipped}`);
	console.log(`  Errors:  ${stats.projects.errors}`);
	console.log("");
	console.log("Entities:");
	console.log(`  Created: ${stats.entities.created}`);
	console.log(`  Linked:  ${stats.entities.linked}`);
	console.log(`  Existing:${stats.entities.skipped}`);
	console.log(`  Errors:  ${stats.entities.errors}`);

	if (errors.length > 0) {
		console.log(`\n=== ERRORS (${errors.length}) ===`);
		for (const e of errors) {
			console.log(`  - ${e}`);
		}
	}

	if (dryRun) {
		console.log("\n*** This was a DRY RUN. No changes were made. ***");
		console.log("*** Run with --execute to apply changes. ***");
	}

	process.exit(0);
}

async function linkEntity(
	payload: any,
	parentName: string,
	projectId: string,
	entityMap: Map<string, string>,
	dryRun: boolean,
) {
	const slug = generateSlug(parentName);
	const entityId = entityMap.get(slug);
	if (!entityId) return;

	if (dryRun) {
		stats.entities.linked++;
		return;
	}

	try {
		const entity = await payload.findByID({
			collection: "entities",
			id: entityId,
		});

		const existingProjects: string[] = Array.isArray(entity.projects)
			? entity.projects.map((p: any) => (typeof p === "string" ? p : p.id))
			: [];

		if (!existingProjects.includes(projectId)) {
			await payload.update({
				collection: "entities",
				id: entityId,
				data: { projects: [...existingProjects, projectId] },
			});
			stats.entities.linked++;
			console.log(`    LINKED: ${parentName} → project ${projectId}`);
		}
	} catch (e) {
		stats.entities.errors++;
		errors.push(
			`Link "${parentName}": ${e instanceof Error ? e.message : String(e)}`,
		);
	}
}

main().catch((e) => {
	console.error("Fatal error:", e);
	process.exit(1);
});
