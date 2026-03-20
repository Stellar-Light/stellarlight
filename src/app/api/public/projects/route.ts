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
		const baseWhere: any = {
			status: {
				in: ["Development", "Pre-Release", "Live"],
			},
		};

		if (categoryFilter && categoryFilter !== "all") {
			baseWhere.category = { equals: categoryFilter };
		}

		if (searchQuery) {
			// Two-pass: name matches first, then description/org matches
			const nameWhere = { ...baseWhere, name: { contains: searchQuery } };
			const descWhere = {
				...baseWhere,
				and: [
					{
						or: [
							{ shortDescription: { contains: searchQuery } },
							{ "github.orgLogin": { contains: searchQuery } },
						],
					},
					{ name: { not_contains: searchQuery } },
				],
			};

			const [nameResults, descResults] = await Promise.all([
				payload.find({ collection: "projects", where: nameWhere, limit: 0, depth: 1, sort: "name" }),
				payload.find({ collection: "projects", where: descWhere, limit: 0, depth: 1, sort: "name" }),
			]);

			const allDocs = [...nameResults.docs, ...descResults.docs];
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
		}

		// Two-pass: featured first, then rest alphabetically
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

