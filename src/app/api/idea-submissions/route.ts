import { type NextRequest, NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
	// Public unauthenticated write — cap it so it can't flood the M0.
	const limit = rateLimit(request, {
		endpoint: "/api/idea-submissions",
		limit: 10,
		windowMs: 60_000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ message: "Too many submissions — try again shortly." },
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}
	try {
		const body = await request.json();

		const {
			name,
			email,
			ecosystemNeed,
			needSize,
			approach,
			additionalContext,
		} = body;

		if (!name || !ecosystemNeed || !needSize || !approach) {
			return NextResponse.json(
				{ message: "Missing required fields" },
				{ status: 400 },
			);
		}

		const validNeedSizes = ["critical", "important", "nice-to-have"];
		const validApproaches = ["net-new-rfp", "existing-team", "unsure"];

		if (
			!validNeedSizes.includes(needSize) ||
			!validApproaches.includes(approach)
		) {
			return NextResponse.json(
				{ message: "Invalid field values" },
				{ status: 400 },
			);
		}

		const payload = await getPayloadSafe();

		if (!payload) {
			return NextResponse.json(
				{ message: "Service unavailable" },
				{ status: 503 },
			);
		}

		await payload.create({
			collection: "idea-submissions",
			overrideAccess: true,
			data: {
				name,
				email: email || undefined,
				ecosystemNeed,
				needSize,
				approach,
				additionalContext: additionalContext || undefined,
			},
		});

		return NextResponse.json(
			{ message: "Submission received" },
			{ status: 201 },
		);
	} catch (error) {
		console.error("Idea submission error:", error);
		return NextResponse.json({ message: "Failed to submit" }, { status: 500 });
	}
}
