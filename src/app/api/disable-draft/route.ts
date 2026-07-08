import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const slug = searchParams.get("slug") ?? "";

	const draft = await draftMode();
	draft.disable();

	redirect(slug ? `/blog/${slug}` : "/blog");
}
