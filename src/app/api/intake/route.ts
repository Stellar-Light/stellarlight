import { z } from "zod";
import configPromise from "@/payload.config";
import { getPayload } from "payload";
import { normalizeUrl, generateSlug } from "@/lib/utils/normalize";

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
				github: validated.github?.repos && validated.github.repos.length > 0
					? {
							orgLogin: validated.github.orgLogin || undefined,
							repos: validated.github.repos,
						}
					: validated.github?.orgLogin
						? {
								orgLogin: validated.github.orgLogin,
								repos: [],
							}
						: undefined,
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
