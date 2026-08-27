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
	issuedVerdict,
	liveVerdict,
	maintainedVerdict,
	parseClaim,
	type RepoFacts,
	type StablecoinIssuerRow,
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

	const meta = {
		source: `${getAppUrl()}/api/verify`,
		generatedAt: new Date().toISOString(),
		methodology:
			"Verdicts assert over OUR indexed corpus, never over the world: supported = evidence on record; contradicted = we hold a dated record saying otherwise; unsupported = no evidence either way (the statement carries the denominator); unresolved = unknown subject.",
		...(paramWarning ? { warnings: [paramWarning] } : {}),
	};

	// "issued" verifies against the stablecoin registry — its subject is a
	// TICKER, so it never goes through project resolution.
	if (parsed.type === "issued") {
		if (!parsed.auditor) {
			return NextResponse.json(
				{
					error:
						'issued claims need the claimed company: ?type=issued&subject=EURC&auditor=Circle, or claim="is EURC issued by Circle".',
					supportedClaims: [],
				},
				{ status: 400 },
			);
		}
		const store = await payload.find({
			collection: "stablecoins",
			limit: 200,
			depth: 0,
		});
		const rows = (store.docs as unknown as Array<Record<string, unknown>>)
			.filter((d) => !d.retiredAt)
			.map(
				(d): StablecoinIssuerRow => ({
					ticker: (d.ticker as string) ?? null,
					company: (d.company as string) ?? null,
					issuer: (d.issuer as string) ?? null,
					issuerDomain: (d.issuerDomain as string) ?? null,
					verified: (d.verified as boolean) ?? null,
					updatedAt: (d.updatedAt as string) ?? null,
				}),
			);
		const result = issuedVerdict({
			ticker: parsed.subject,
			company: parsed.auditor,
			rows,
			corpusTotal: rows.length,
		});
		logApiHit({
			req,
			endpoint: "/api/verify",
			filters: { verdict: result.verdict },
		});
		return NextResponse.json(
			{
				meta: { ...meta, searched: { stablecoins: rows.length } },
				claim: parsed,
				...result,
			},
			{
				headers: {
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
				},
			},
		);
	}

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

	// The full labeled row for the subject card: links, types, provenance,
	// prominence — the SAME data the directory serves, so a verify answer
	// carries the project's info instead of a bare verdict.
	// biome-ignore lint/suspicious/noExplicitAny: raw Payload doc
	let full: any = null;
	try {
		const r = await payload.find({
			collection: "projects",
			where: { slug: { equals: slug } },
			limit: 1,
			depth: 0,
			select: {
				slug: true,
				name: true,
				status: true,
				statusBasis: true,
				statusAsOf: true,
				statusSourceUrl: true,
				types: true,
				links: true,
				prominence: true,
				verificationLevel: true,
				supportedNetworks: true,
			},
		});
		full = r.docs[0] ?? null;
	} catch {}

	const subjectCard = {
		asked: parsed.subject,
		resolvedSlug: slug,
		resolvedName: resolution.current.name ?? slug,
		matchedOn: resolution.matchedOn,
		status: full?.status ?? resolution.current.status ?? null,
		statusBasis: full?.statusBasis ?? null,
		statusAsOf: full?.statusAsOf ?? null,
		statusSourceUrl: full?.statusSourceUrl ?? null,
		types: Array.isArray(full?.types) ? full.types : [],
		links: {
			website: full?.links?.website ?? null,
			github: full?.links?.github ?? null,
			docs: full?.links?.docs ?? null,
		},
		prominence: typeof full?.prominence === "number" ? full.prominence : null,
		verificationLevel: full?.verificationLevel ?? null,
		supportedNetworks: Array.isArray(full?.supportedNetworks)
			? full.supportedNetworks
			: [],
	};

	// Repos joined for maintained claims AND the audit currency note — the
	// existing labels (activityState, repoScoreLabel, knowledgeNotes) ARE the
	// evidence, quoted rather than recomputed.
	let repoFacts: RepoFacts[] = [];
	let codeLastActiveAt: string | null = null;
	try {
		const repos = await payload.find({
			collection: "repos",
			where: { projectSlug: { equals: slug } },
			limit: 50,
			depth: 0,
			select: {
				fullName: true,
				lastCommitAt: true,
				activityState: true,
				isArchived: true,
				stars: true,
				repoScoreLabel: true,
				knowledgeNotes: true,
			},
		});
		// biome-ignore lint/suspicious/noExplicitAny: raw Payload docs
		repoFacts = (repos.docs as any[]).map((r) => ({
			fullName: String(r.fullName ?? ""),
			lastCommitAt: r.lastCommitAt ?? null,
			activityState: r.activityState ?? null,
			isArchived: !!r.isArchived,
			stars: typeof r.stars === "number" ? r.stars : null,
			repoScoreLabel: r.repoScoreLabel ?? null,
			knowledgeNotes: Array.isArray(r.knowledgeNotes)
				? r.knowledgeNotes
						.filter(
							// biome-ignore lint/suspicious/noExplicitAny: raw rows
							(n: any) => n?.note && (n.visibility ?? "public") === "public",
						)
						// biome-ignore lint/suspicious/noExplicitAny: raw rows
						.map((n: any) => ({
							note: String(n.note),
							source: String(n.source ?? ""),
							asOf: n.asOf ?? null,
						}))
				: [],
		}));
		for (const r of repoFacts)
			if (
				r.lastCommitAt &&
				(!codeLastActiveAt || r.lastCommitAt > codeLastActiveAt)
			)
				codeLastActiveAt = r.lastCommitAt;
	} catch {}

	if (parsed.type === "live") {
		const result = liveVerdict({
			slug,
			name: subjectCard.resolvedName,
			status: subjectCard.status,
			statusBasis: subjectCard.statusBasis,
			statusAsOf: subjectCard.statusAsOf,
			statusSourceUrl: subjectCard.statusSourceUrl,
		});
		logApiHit({
			req,
			endpoint: "/api/verify",
			filters: { verdict: result.verdict },
		});
		return NextResponse.json(
			{ meta, claim: parsed, subject: subjectCard, ...result },
			{
				headers: {
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
				},
			},
		);
	}
	if (parsed.type === "maintained") {
		const result = maintainedVerdict(subjectCard.resolvedName, repoFacts);
		logApiHit({
			req,
			endpoint: "/api/verify",
			filters: { verdict: result.verdict },
		});
		return NextResponse.json(
			{ meta, claim: parsed, subject: subjectCard, ...result },
			{
				headers: {
					"Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
				},
			},
		);
	}

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
			subject: subjectCard,
			...result,
		},
		{
			headers: {
				"Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
			},
		},
	);
}
