/**
 * Verify v1 (PLAN.md §5): claim in → verdict + evidence + confidence out.
 * Slice 1 = audit claims. The skeleton (parse → resolve → evidence → verdict)
 * is the deliverable; later claim types drop into the same frame.
 */

import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import { logApiHit } from "@/lib/api-usage";
import { unknownParamWarning } from "@/lib/http-params";
import { type ResolvableProject, resolveProject } from "@/lib/resolve-project";
import { getAppUrl } from "@/lib/utils/app-url";
import {
	type AuditEvidenceRow,
	auditVerdict,
	parseClaim,
} from "@/lib/verify-claim";

export const revalidate = 300;

export async function GET(req: NextRequest) {
	const sp = req.nextUrl.searchParams;
	const paramWarning = unknownParamWarning(
		sp,
		["claim", "type", "subject", "auditor", "since"],
		{
			advertise: ["claim", "type", "subject", "auditor", "since"],
			hint: "Verify an audit claim: ?type=audited&subject=blend, or ?claim=is blend audited.",
		},
	);

	const parsed = parseClaim({
		claim: sp.get("claim"),
		type: sp.get("type"),
		subject: sp.get("subject"),
		auditor: sp.get("auditor"),
		since: sp.get("since"),
	});
	if ("error" in parsed) {
		return NextResponse.json(
			{ error: parsed.error, supportedClaims: parsed.supported },
			{ status: 400 },
		);
	}

	const payload = await getPayload({ config });

	// Subject resolution through the SAME machinery as /api/projects/resolve —
	// renames, aliases and canonical slugs are handled there, once.
	const projects = await payload.find({
		collection: "projects",
		limit: 5000,
		depth: 0,
		select: {
			slug: true,
			name: true,
			status: true,
			statusAsOf: true,
			statusBasis: true,
			statusSourceUrl: true,
			canonicalSlug: true,
			aliases: true,
		},
	});
	const resolution = resolveProject(
		parsed.subject,
		projects.docs as ResolvableProject[],
	);

	const meta = {
		source: `${getAppUrl()}/api/verify`,
		generatedAt: new Date().toISOString(),
		methodology:
			"Verdicts assert over OUR indexed corpus, never over the world: supported = report(s) on record for the resolved subject; unsupported = none on record (the statement carries the denominator); unresolved = the subject matched no known project. contradicted is deliberately not emitted in v1.",
		...(paramWarning ? { warnings: [paramWarning] } : {}),
	};

	if (!resolution.found || !resolution.current) {
		logApiHit({
			req,
			endpoint: "/api/verify",
			filters: { verdict: "unresolved" },
		});
		return NextResponse.json(
			{
				meta,
				claim: parsed,
				verdict: "unresolved",
				statement: `Could not resolve '${parsed.subject}' to a known project.`,
				resolution: { note: resolution.note },
				evidence: [],
				confidence: null,
			},
			{
				headers: {
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
				},
			},
		);
	}
	const slug = resolution.current.slug;

	// The audit registry is small — fetch once, filter in JS (never Payload
	// `contains` on identity strings; substring-vs-membership trap).
	const audits = await payload.find({
		collection: "audits",
		limit: 500,
		depth: 0,
		sort: "-publishedAt",
	});
	const allRows = audits.docs as unknown as AuditEvidenceRow[];
	const subjectRows = allRows.filter(
		(r) => (r.projectSlug ?? "").toLowerCase() === slug.toLowerCase(),
	);

	// The audits×code join: the subject's newest dated code activity.
	let codeLastActiveAt: string | null = null;
	try {
		const repos = await payload.find({
			collection: "repos",
			where: { projectSlug: { equals: slug } },
			limit: 50,
			depth: 0,
			select: { lastCommitAt: true },
		});
		for (const r of repos.docs as Array<{ lastCommitAt?: string | null }>) {
			if (
				r.lastCommitAt &&
				(!codeLastActiveAt || r.lastCommitAt > codeLastActiveAt)
			)
				codeLastActiveAt = r.lastCommitAt;
		}
	} catch {
		// evidence enrichment only — a repos hiccup must not fail the verdict
	}

	const result = auditVerdict({
		claim: parsed,
		resolvedSlug: slug,
		resolvedName: resolution.current.name ?? slug,
		subjectRows,
		corpusTotal: audits.totalDocs,
		codeLastActiveAt,
	});

	logApiHit({
		req,
		endpoint: "/api/verify",
		filters: { verdict: result.verdict },
	});
	return NextResponse.json(
		{
			meta: { ...meta, searched: { audits: audits.totalDocs } },
			claim: parsed,
			subject: {
				asked: parsed.subject,
				resolvedSlug: slug,
				resolvedName: resolution.current.name ?? slug,
				matchedOn: resolution.matchedOn,
				status: resolution.current.status ?? null,
			},
			...result,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
			},
		},
	);
}
