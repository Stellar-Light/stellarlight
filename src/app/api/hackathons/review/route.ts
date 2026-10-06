/**
 * Review one hackathon submission from a link, with no sign-in:
 *
 *   GET /api/hackathons/review?link=github.com/rajkaria/toll
 *   GET /api/hackathons/review?link=https://dorahacks.io/buidl/42585
 *
 * Composition lives in src/lib/hackathon-review.ts: the submission's stored
 * facts, mechanical checks, the submissions closest in meaning, and the SCF
 * pitch view over its summary.
 */
import { type NextRequest, NextResponse } from "next/server";
import { logApiHit } from "@/lib/api-usage";
import { getHackathonBuildsIndex } from "@/lib/hackathon-builds";
import { buildHackathonReview } from "@/lib/hackathon-review";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { serverTiming } from "@/lib/server-timing";

export const dynamic = "force-dynamic";

const SUPPORTED_PARAMS = ["link"] as const;
const UNAVAILABLE =
	"The submissions store did not answer. This is an outage, not a finding about the project. Retry after a moment.";

export async function GET(req: NextRequest) {
	const startedAt = Date.now();
	const sp = req.nextUrl.searchParams;
	const unknown = [...new Set(sp.keys())].filter(
		(k) => !(SUPPORTED_PARAMS as readonly string[]).includes(k),
	);
	if (unknown.length)
		return NextResponse.json(
			{
				error: `Unsupported query parameter(s): ${unknown.join(", ")}.`,
				supportedParams: SUPPORTED_PARAMS,
			},
			{ status: 400 },
		);
	const link = sp.get("link")?.trim();
	if (!link)
		return NextResponse.json(
			{
				error:
					"Pass `link`: the submission's GitHub repo or its DoraHacks link.",
				examples: [
					"link=github.com/rajkaria/toll",
					"link=https://dorahacks.io/buidl/42585",
				],
			},
			{ status: 400 },
		);
	const payload = await getPayloadSafe();
	if (!payload)
		return NextResponse.json(
			{ error: "submissions store unavailable", advisory: UNAVAILABLE },
			{ status: 503, headers: { "Retry-After": "2" } },
		);
	let review: Awaited<ReturnType<typeof buildHackathonReview>>;
	try {
		review = await buildHackathonReview(
			payload,
			link,
			await getHackathonBuildsIndex(),
		);
	} catch {
		return NextResponse.json(
			{ error: "submissions store unavailable", advisory: UNAVAILABLE },
			{ status: 503, headers: { "Retry-After": "2" } },
		);
	}
	if (!review)
		return NextResponse.json(
			{
				error: `No stored Stellar hackathon submission matches '${link}'.`,
				advisory:
					"Not stored here is not proof it was never submitted: the store holds submissions to ended Stellar hackathons on DoraHacks. For a repo outside them use getRepoTrust; for an idea, vetIdea or scfPitch.",
			},
			{ status: 404 },
		);
	try {
		logApiHit({
			endpoint: "/api/hackathons/review",
			query: link,
			req,
			startedAt,
			status: 200,
		});
	} catch {}
	return NextResponse.json(
		{
			meta: {
				source: "https://stellarlight.xyz/api/hackathons/review",
				generatedAt: new Date().toISOString(),
				note: "Evidence, not a verdict. Each check is a fact about the submission (ok null = could not be checked, never a no). similar = the stored submissions closest in meaning to it. pitch = the SCF pitch view over its summary: live round, funded peers, competitors, maturity, prior art and the vertical's supply gap.",
			},
			review,
		},
		{ headers: serverTiming(startedAt) },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
