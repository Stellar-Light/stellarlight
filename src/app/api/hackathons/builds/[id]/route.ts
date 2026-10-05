/**
 * One stored hackathon submission in full: the team's write-up, self-reported
 * tags, event, placement, links, the directory project it became, and the
 * dates we read it. The detail half of searchHackathonBuilds.
 *
 *   GET /api/hackathons/builds/dorahacks-buidl-42585
 *   GET /api/hackathons/builds/42585
 */
import { type NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/api-error";
import { logApiHit } from "@/lib/api-usage";
import { DEFAULT_READ_TIMEOUT_MS, withReadTimeout } from "@/lib/degraded-read";
import { parseBuildId } from "@/lib/hackathon-build-links";
import { buildDetailFromStored } from "@/lib/hackathon-builds";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { serverTiming } from "@/lib/server-timing";
import type { HackathonBuild } from "@/payload-types";

export const dynamic = "force-dynamic";

const UNAVAILABLE =
	"The submission store did not answer. This is an outage, not a statement that the submission is unknown. Retry after Retry-After.";

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ id: string }> },
) {
	const startedAt = Date.now();
	const { id: raw } = await params;
	const unknown = [...req.nextUrl.searchParams.keys()];
	if (unknown.length)
		return apiError({
			status: 400,
			error: `Unsupported query parameter(s): ${unknown.join(", ")}. This operation takes none.`,
			startedAt,
		});
	const id = parseBuildId(decodeURIComponent(raw));
	if (!id)
		return apiError({
			status: 400,
			error: `Not a submission id: '${raw}'.`,
			advisory:
				"Use the `id` searchHackathonBuilds returns (dorahacks-buidl-<n>) or the bare number from the dorahacks.io/buidl/<n> link.",
			startedAt,
		});

	const payload = await getPayloadSafe();
	if (!payload)
		return apiError({
			status: 503,
			error: "hackathon build store unavailable",
			advisory: UNAVAILABLE,
			retryAfterSeconds: 2,
			startedAt,
		});
	let doc: HackathonBuild | undefined;
	try {
		const res = await withReadTimeout(
			payload.find({
				collection: "hackathon-builds",
				where: {
					and: [
						{ buildId: { equals: id } },
						{ hiddenUpstream: { not_equals: true } },
					],
				},
				limit: 1,
				depth: 0,
			}),
			DEFAULT_READ_TIMEOUT_MS,
		);
		doc = res.docs[0] as HackathonBuild | undefined;
	} catch {
		return apiError({
			status: 503,
			error: "hackathon build store unavailable",
			advisory: UNAVAILABLE,
			retryAfterSeconds: 2,
			startedAt,
		});
	}
	if (!doc)
		return apiError({
			status: 404,
			error: `Submission ${id} is not in Scout's store.`,
			advisory:
				"Not stored here is not proof it does not exist. The store holds submissions to ended Stellar hackathons on DoraHacks; ones their teams deleted or made private are not served.",
			startedAt,
		});

	try {
		logApiHit({
			endpoint: "/api/hackathons/builds/[id]",
			req,
			startedAt,
			status: 200,
		});
	} catch {}
	return NextResponse.json(
		{
			meta: {
				source: `https://stellarlight.xyz/api/hackathons/builds/${id}`,
				upstream: "dorahacks.io",
				generatedAt: new Date().toISOString(),
				note: "One stored submission in full. writeUp is the team's own text as published (markdown): a claim about what they built, not evidence that it shipped. Check the repo, the demo and `project`.",
			},
			build: buildDetailFromStored(doc),
		},
		{ headers: serverTiming(startedAt) },
	);
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
