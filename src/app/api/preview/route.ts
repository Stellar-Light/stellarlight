import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const secret = searchParams.get("secret");
	const slug = searchParams.get("slug");

	if (secret !== process.env.PAYLOAD_SECRET) {
		return new Response("Invalid token", { status: 401 });
	}

	if (!slug) {
		return new Response("Missing slug", { status: 400 });
	}

	const draft = await draftMode();
	draft.enable();

	redirect(`/blog/${slug}`);
}
