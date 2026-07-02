import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PartnersDirectory } from "@/components/partners-directory";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * Public partner directory.
 *
 *   /partners
 *
 * Browsable list of published ecosystem partners — anchors, ramps, infra,
 * tooling, protocols — that builders can integrate with. Each card shows
 * partner-claimed facts AND a freshness badge so a builder never reaches
 * out to a dead integration. Server-fetches the published set on load;
 * the client component handles filtering.
 *
 * This is the human-facing twin of GET /api/partners (which agents call).
 */

export const metadata: Metadata = {
	title: "Stellar Partners | Stellar Light",
	description:
		"Ecosystem partners builders can integrate with on Stellar — anchors, on/off ramps, infrastructure, tooling, protocols. Each profile is partner-maintained and freshness-verified.",
};

export const revalidate = 300;

interface DirectoryPartner {
	slug: string;
	name: string;
	partnerType: string;
	tagline: string | null;
	sectors: string[];
	regions: string[];
	/** stellar.toml-verified anchor capabilities (empty for non-anchors). */
	assets: string[];
	seps: string[];
	rampTypes: string[];
	country: string | null;
	acceptingClients: boolean | null;
	/** Has a direct contact path (email/channel) — gates the Available chip. */
	contactable: boolean;
	logoUrl: string | null;
	freshness: { status: string };
	verified: { scfInvolvement: string | null; onchainActive: boolean | null };
	websiteUrl: string | null;
}

async function getPartners(): Promise<DirectoryPartner[]> {
	const payload = await getPayloadSafe();
	if (!payload) return [];
	try {
		const result = await payload.find({
			collection: "partner-accounts",
			where: { status: { equals: "published" } },
			limit: 200,
			depth: 0,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		return (result.docs as any[]).map((p) => ({
			slug: p.slug,
			name: p.name,
			partnerType: p.partnerType,
			tagline: p.tagline ?? null,
			sectors: p.sectors ?? [],
			regions: p.regions ?? [],
			assets: (p.assets ?? [])
				.map((a: { code: string }) => a.code)
				.filter(Boolean),
			seps: p.seps ?? [],
			rampTypes: p.rampTypes ?? [],
			country: p.country ?? null,
			acceptingClients: p.acceptingClients ?? null,
			contactable: Boolean(p.contactEmail || p.contactChannel),
			logoUrl: p.logoUrl ?? null,
			freshness: { status: p.freshnessStatus ?? "fresh" },
			verified: {
				scfInvolvement: p.verified?.scfInvolvement ?? null,
				onchainActive: p.verified?.onchainActive ?? null,
			},
			websiteUrl: p.websiteUrl ?? null,
		}));
	} catch {
		return [];
	}
}

export default async function PartnersPage() {
	const partners = await getPartners();
	return (
		<div className="min-h-screen relative">
			<div className="max-w-4xl mx-auto px-4 sm:px-6 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-4 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>
			</div>
			<PartnersDirectory initial={partners} />
		</div>
	);
}
