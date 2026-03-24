import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const secret = request.nextUrl.searchParams.get("secret");
	if (secret !== "tag123") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const dryRun =
		request.nextUrl.searchParams.get("dry") === "true";

	const payload = await getPayload({ config });

	// Fetch all projects with SCF data
	const allProjects: any[] = [];
	let page = 1;
	let hasNext = true;
	while (hasNext) {
		const result = await payload.find({
			collection: "projects",
			limit: 100,
			page,
			depth: 0,
		});
		allProjects.push(...result.docs);
		hasNext = result.hasNextPage;
		page++;
	}

	// Fetch existing changelog entries to avoid duplicates
	const existingChangelogs: any[] = [];
	page = 1;
	hasNext = true;
	while (hasNext) {
		const result = await payload.find({
			collection: "blog",
			where: { contentType: { equals: "changelog" } },
			limit: 100,
			page,
			depth: 0,
		});
		existingChangelogs.push(...result.docs);
		hasNext = result.hasNextPage;
		page++;
	}

	// Build a set of existing changelog keys for dedup
	const existingKeys = new Set(
		existingChangelogs.map((c: any) => {
			const d = c.changelogData || {};
			return `${d.projectSlug}-${d.changeType}-${d.newValue || ""}-${d.round || ""}`;
		}),
	);

	const created: any[] = [];
	const skipped: string[] = [];

	// Generate SCF funding changelog entries
	for (const project of allProjects) {
		if (!project.scf?.awarded) continue;

		const slug = project.slug || "";
		const name = project.name || "";
		const rounds: number[] = Array.isArray(project.scf.awardedRounds)
			? project.scf.awardedRounds
			: project.scf.lastAwardedRound
				? [project.scf.lastAwardedRound]
				: [];
		const totalAwarded = project.scf.totalAwarded || 0;

		// Create one entry per project (not per round) for SCF funding
		const key = `${slug}-scf-funding-awarded-`;
		if (existingKeys.has(key)) {
			skipped.push(`${name}: SCF funding (already exists)`);
			continue;
		}

		const roundsText = rounds.length > 0
			? ` in Round${rounds.length > 1 ? "s" : ""} ${rounds.join(", ")}`
			: "";
		const amountText = totalAwarded > 0
			? ` $${totalAwarded.toLocaleString()}`
			: "";
		const title = `${name} awarded${amountText} from SCF${roundsText}`;

		if (!dryRun) {
			try {
				await payload.create({
					collection: "blog",
					data: {
						title,
						slug: `changelog-scf-${slug}-${Date.now()}`,
						author: "StellarLight",
						excerpt: `${name} received funding from the Stellar Community Fund${roundsText}.`,
						contentType: "changelog",
						source: "changelog",
						category: "Update",
						status: "published",
						publishedAt: new Date().toISOString(),
						changelogData: {
							projectSlug: slug,
							projectName: name,
							changeType: "scf-funding",
							newValue: "awarded",
							numericValue: totalAwarded,
							round: rounds[rounds.length - 1] || 0,
						},
					} as any,
				});
			} catch (err: any) {
				skipped.push(`${name}: Error — ${err.message}`);
				continue;
			}
		}

		created.push({ name, type: "scf-funding", title });
		existingKeys.add(key);
	}

	// Generate status change entries for "Live" projects
	for (const project of allProjects) {
		if (project.status !== "Live") continue;

		const slug = project.slug || "";
		const name = project.name || "";
		const key = `${slug}-status-change-Live-`;

		if (existingKeys.has(key)) {
			skipped.push(`${name}: status Live (already exists)`);
			continue;
		}

		const title = `${name} is now Live on Stellar`;

		if (!dryRun) {
			try {
				await payload.create({
					collection: "blog",
					data: {
						title,
						slug: `changelog-live-${slug}-${Date.now()}`,
						author: "StellarLight",
						excerpt: `${name} has reached Live status in the Stellar ecosystem.`,
						contentType: "changelog",
						source: "changelog",
						category: "Update",
						status: "published",
						publishedAt: new Date().toISOString(),
						changelogData: {
							projectSlug: slug,
							projectName: name,
							changeType: "status-change",
							oldValue: "Development",
							newValue: "Live",
						},
					} as any,
				});
			} catch (err: any) {
				skipped.push(`${name}: Error — ${err.message}`);
				continue;
			}
		}

		created.push({ name, type: "status-change", title });
		existingKeys.add(key);
	}

	return NextResponse.json({
		dryRun,
		created: created.length,
		skipped: skipped.length,
		entries: created,
		skippedDetails: skipped.slice(0, 20),
	});
}
