import { getPayload } from "payload";
import { z } from "zod";
import { parseGithubIdentity } from "@/lib/github-identity";
import { generateSlug, normalizeUrl } from "@/lib/utils/normalize";
import configPromise from "@/payload.config";

const intakeSchema = z.object({
	name: z.string().min(1).max(200),
	website: z.string().url().optional().or(z.literal("")),
	shortDescription: z.string().min(10).max(1000),
	category: z.enum([
		"Infrastructure",
		"Tooling",
		"Partner Integration",
		"User-Facing App",
		"Asset",
		"Protocol/Contract",
		"Anchor",
	]),
	github: z
		.object({
			orgLogin: z.string().optional(),
			repos: z
				.array(
					z.object({
						owner: z.string().min(1),
						name: z.string().min(1),
					}),
				)
				.optional(),
		})
		.optional(),
});

/**
 * The submitted GitHub block, normalised. `orgLogin` is free text on the form,
 * so it has arrived as a submission URL, an owner/repo pair, another forge's
 * hostname and comma-joined junk — all of which every downstream reader
 * rejects, leaving the row undiscoverable. Parse it into a real login here, at
 * the boundary, and keep the repository when the submitter named one.
 */
function submittedGithub(
	g:
		| { orgLogin?: string; repos?: Array<{ owner: string; name: string }> }
		| undefined,
):
	| { orgLogin?: string; repos: Array<{ owner: string; name: string }> }
	| undefined {
	const { orgLogin, repo } = parseGithubIdentity(g?.orgLogin);
	const repos = [...(g?.repos ?? [])];
	if (
		repo &&
		!repos.some((r) => r.owner === repo.owner && r.name === repo.name)
	)
		repos.push(repo);
	if (!orgLogin && repos.length === 0) return undefined;
	return { ...(orgLogin ? { orgLogin } : {}), repos };
}

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const validated = intakeSchema.parse(body);

		const payload = await getPayload({ config: configPromise });

		// Duplicate guard - check by slug or normalized domain
		const slug = generateSlug(validated.name);
		const normalizedDomain = validated.website
			? normalizeUrl(validated.website)
			: null;

		const existing = await payload.find({
			collection: "projects",
			where: {
				or: [
					{ slug: { equals: slug } },
					...(normalizedDomain
						? [
								{
									and: [
										{
											"links.website": {
												exists: true,
											},
										},
										{
											"links.website": {
												contains: normalizedDomain,
											},
										},
									],
								},
							]
						: []),
				],
			},
			limit: 1,
		});

		if (existing.docs.length > 0) {
			return Response.json(
				{
					error: "Duplicate project",
					message: "A project with this name or website already exists.",
				},
				{ status: 409 },
			);
		}

		// Create project (overrideAccess since we've validated ourselves)
		// All frontend submissions are set to Draft status and require admin approval
		const project = await payload.create({
			collection: "projects",
			overrideAccess: true,
			data: {
				name: validated.name,
				slug,
				shortDescription: validated.shortDescription,
				category: validated.category,
				status: "Draft", // Always Draft for frontend submissions
				links: {
					website: validated.website || undefined,
				},
				github: submittedGithub(validated.github),
				verificationLevel: "Unverified",
				provenance: {
					source: "UserSubmitted",
					firstSeenAt: new Date().toISOString(),
				},
			} as any, // Payload types are complex, but data is validated via Zod
		});

		// Transparency log is created automatically via Projects afterChange hook

		return Response.json({
			success: true,
			id: project.id,
			slug: project.slug,
			message: "Your project has been submitted and is pending admin approval.",
		});
	} catch (error) {
		if (error instanceof z.ZodError) {
			return Response.json(
				{
					error: "Validation error",
					details: error.issues,
				},
				{ status: 400 },
			);
		}

		return Response.json(
			{
				error: "Internal server error",
				message: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 },
		);
	}
}
