import { NextRequest, NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";
import { rankedProjectSearch } from "@/lib/search/ranked-project-search";

export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const page = parseInt(searchParams.get("page") || "1", 10);
	const limit = parseInt(searchParams.get("limit") || "12", 10);
	const searchQuery = searchParams.get("q") || undefined;
	const categoryFilter = searchParams.get("category") || undefined;

	const payload = await getPayloadSafe();

	if (!payload) {
		return NextResponse.json(
			{ error: "Payload not available" },
			{ status: 500 }
		);
	}

	try {
		if (searchQuery) {
			const result = await rankedProjectSearch(payload, {
				query: searchQuery,
				category: categoryFilter,
				page,
				limit,
			});
			return NextResponse.json(result);
		}

		// Two-pass: featured first, then rest alphabetically
		const baseWhere: any = {
			status: {
				in: ["Development", "Pre-Release", "Live"],
			},
		};

		if (categoryFilter && categoryFilter !== "all") {
			baseWhere.category = { equals: categoryFilter };
		}

		const featuredWhere = { ...baseWhere, featured: { equals: true } };
		const restWhere = { ...baseWhere, featured: { not_equals: true } };

		const [featuredResults, restResults] = await Promise.all([
			payload.find({ collection: "projects", where: featuredWhere, limit: 0, depth: 1, sort: "name" }),
			payload.find({ collection: "projects", where: restWhere, limit: 0, depth: 1, sort: "name" }),
		]);

		const allDocs = [...featuredResults.docs, ...restResults.docs];
		const totalDocs = allDocs.length;
		const totalPages = Math.ceil(totalDocs / limit);
		const start = (page - 1) * limit;

		return NextResponse.json({
			docs: allDocs.slice(start, start + limit),
			totalDocs,
			totalPages,
			page,
			hasNextPage: page < totalPages,
			hasPrevPage: page > 1,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to fetch projects" },
			{ status: 500 }
		);
	}
}

