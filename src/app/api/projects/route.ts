import { NextRequest, NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";

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
		const where: any = {
			status: {
				in: ["Development", "Pre-Release", "Live"],
			},
		};

		if (searchQuery) {
			where.or = [
				{
					name: {
						contains: searchQuery,
					},
				},
				{
					shortDescription: {
						contains: searchQuery,
					},
				},
				{
					"github.orgLogin": {
						contains: searchQuery,
					},
				},
			];
		}

		if (categoryFilter && categoryFilter !== "all") {
			where.category = { equals: categoryFilter };
		}

		const result = await payload.find({
			collection: "projects",
			where,
			limit,
			page,
			sort: "-lastVerifiedAt",
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

