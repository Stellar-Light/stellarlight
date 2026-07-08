import { NextResponse } from "next/server";
import { getPayload } from "payload";
import { fetchRepoInfo } from "@/lib/github";
import configPromise from "@/payload.config";

export async function GET(
	_: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { id } = await params;
	const payload = await getPayload({ config: configPromise });

	// Check for cache bypass query parameter
	const url = new URL(_.url);
	const forceRefresh = url.searchParams.get("refresh") === "true";

	const project = await payload.findByID({
		collection: "projects",
		id,
	});

	const repos = project?.github?.repos ?? [];

	if (!repos.length) {
		return NextResponse.json({
			lastActivityAt: null,
			openIssuesTotal: 0,
			repos: [],
		});
	}

	// Try cache (unless force refresh)
	if (!forceRefresh) {
		const existing = await payload.find({
			collection: "signals",
			where: { project: { equals: id } },
			limit: 1,
		});

		const cached = existing.docs[0];

		// Check if repos have changed by comparing repo list
		const currentReposKey = JSON.stringify(
			repos.map((r: any) => `${r.owner}/${r.name}`).sort(),
		);
		const cachedReposKey = cached?.github?.repos
			? JSON.stringify(
					cached.github.repos.map((r: any) => `${r.owner}/${r.name}`).sort(),
				)
			: null;

		const reposChanged = currentReposKey !== cachedReposKey;

		const fresh =
			cached?.fetchedAt &&
			Date.now() - new Date(cached.fetchedAt).getTime() < 6 * 60 * 60 * 1000 && // 6h
			!reposChanged; // Also invalidate if repos changed

		if (cached && fresh) {
			return NextResponse.json(cached.github);
		}
	}

	// Fetch live
	const results = await Promise.allSettled(
		repos.map((r: any) => fetchRepoInfo(r.owner, r.name)),
	);

	const enriched = repos.map((r: any, i: number) => {
		const v = results[i];

		if (v.status === "fulfilled") {
			return {
				owner: r.owner,
				name: r.name,
				url: v.value.url,
				lastCommitAt: v.value.lastCommitAt,
				openIssues: v.value.openIssues,
				stargazerCount: v.value.stargazerCount ?? 0,
			};
		}

		const errorMessage = String((v as PromiseRejectedResult).reason);
		// Only mark as private if error explicitly says it's private
		const isPrivate = errorMessage.includes("Private repository");

		return {
			owner: r.owner,
			name: r.name,
			url: `https://github.com/${r.owner}/${r.name}`,
			lastCommitAt: null,
			openIssues: 0,
			stargazerCount: 0,
			error: errorMessage,
			skipped: isPrivate,
		};
	});

	const lastTs = Math.max(
		...enriched.map((x) =>
			x.lastCommitAt ? new Date(x.lastCommitAt).getTime() : 0,
		),
	);

	const payloadDoc = {
		lastActivityAt: lastTs > 0 ? new Date(lastTs).toISOString() : null,
		openIssuesTotal: enriched.reduce((s, x) => s + (x.openIssues || 0), 0),
		totalStars: enriched.reduce((s, x) => s + (x.stargazerCount || 0), 0),
		repos: enriched,
	};

	// Get or create cache entry
	const existing = await payload.find({
		collection: "signals",
		where: { project: { equals: id } },
		limit: 1,
	});

	const cached = existing.docs[0];

	if (cached) {
		await payload.update({
			collection: "signals",
			id: cached.id,
			data: {
				fetchedAt: new Date().toISOString(),
				github: payloadDoc,
			},
		});
	} else {
		await payload.create({
			collection: "signals",
			data: {
				project: id,
				fetchedAt: new Date().toISOString(),
				github: payloadDoc,
			},
		});
	}

	return NextResponse.json(payloadDoc);
}
