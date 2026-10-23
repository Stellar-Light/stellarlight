import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { isAdminRequest } from "@/lib/admin-auth";

/**
 * Turns on draft mode for an admin, so a blog post can be previewed before it
 * is published. The editor clicks Preview in the admin panel while signed in,
 * so the session is the credential; no secret ever goes in this URL.
 */
export async function GET(request: NextRequest) {
	if (!(await isAdminRequest(request.headers))) {
		return new Response("Unauthorized", { status: 401 });
	}

	const slug = request.nextUrl.searchParams.get("slug");
	if (!slug) {
		return new Response("Missing slug", { status: 400 });
	}

	const draft = await draftMode();
	draft.enable();

	redirect(`/blog/${slug}`);
}
