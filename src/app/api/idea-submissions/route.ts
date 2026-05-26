import { NextResponse } from "next/server";
import { getPayloadSafe } from "@/lib/payload-client";

export async function POST(request: Request) {
	try {
		const body = await request.json();

		const { name, email, ecosystemNeed, needSize, approach, additionalContext } = body;

		if (!name || !ecosystemNeed || !needSize || !approach) {
			return NextResponse.json(
				{ message: "Missing required fields" },
				{ status: 400 },
			);
		}

		const validNeedSizes = ["critical", "important", "nice-to-have"];
		const validApproaches = ["net-new-rfp", "existing-team", "unsure"];

		if (!validNeedSizes.includes(needSize) || !validApproaches.includes(approach)) {
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
			data: {
				name,
				email: email || undefined,
				ecosystemNeed,
				needSize,
				approach,
				additionalContext: additionalContext || undefined,
			},
		});

		return NextResponse.json({ message: "Submission received" }, { status: 201 });
	} catch (error) {
		console.error("Idea submission error:", error);
		return NextResponse.json(
			{ message: "Failed to submit" },
			{ status: 500 },
		);
	}
}
