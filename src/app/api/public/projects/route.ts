import { NextRequest, NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";
import { rankedProjectSearch } from "@/lib/search/ranked-project-search";

export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const page = parseInt(searchParams.get("page") || "1", 10);
	const limit = parseInt(searchParams.get("limit") || "12", 10);
	const searchQuery = searchParams.get("q") || undefined;
	const typeFilter = searchParams.get("type") || undefined;

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
				typeFilter,
				page,
				limit,
			});
			return NextResponse.json(result);
		}

		const baseWhere: any = {
			status: {
				in: ["Development", "Pre-Release", "Live"],
			},
		};

		if (typeFilter && typeFilter !== "all") {
			baseWhere.types = { in: [typeFilter] };
		}

		const result = await payload.find({
			collection: "projects",
			where: baseWhere,
			limit,
			page,
			sort: "-relevanceScore",
			depth: 1,
		});

		return NextResponse.json({
			docs: result.docs,
			totalDocs: result.totalDocs,
			totalPages: result.totalPages,
			page: result.page,
			hasNextPage: result.hasNextPage,
			hasPrevPage: result.hasPrevPage,
		});
	} catch (error) {
		return NextResponse.json(
			{ error: "Failed to fetch projects" },
			{ status: 500 }
		);
	}
}

