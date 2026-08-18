import { ArrowLeft, ExternalLink, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import {
	type BuilderRowData,
	BuildersDirectory,
} from "@/components/builders-directory";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AMBASSADORS } from "@/data/stellar-ambassadors";
import { builderCodeActivity, type CodeActivity } from "@/lib/builder-code";
import {
	fetchAllBuilders,
	type PassportBuilder,
} from "@/lib/integrations/stellar-passport";
import { getPayloadSafe } from "@/lib/payload-client";

// One source of truth: the Payload `builders` mirror (synced from Stellar
// Passport daily by /api/sync/builders). The list used to hit the live
// Passport demo host while /builders/[username] read the mirror, so a name
// on the list could 404 when clicked. Live Passport is only a fallback for
// an empty mirror. ISR, not force-dynamic: the mirror moves once a day.
export const revalidate = 300;

export const metadata: Metadata = {
	title: "Builders | Stellar Light",
	description:
		"Discover talented builders and developers in the Stellar ecosystem",
};

export default async function BuildersPage() {
	let builders: PassportBuilder[] = [];
	const activity = new Map<string, CodeActivity>();
	let syncedAt: string | null = null;

	const payload = await getPayloadSafe();
	if (payload) {
		try {
			const mirror = await payload.find({
				collection: "builders",
				where: { visibility: { not_equals: "hidden" } },
				limit: 1000,
				depth: 0,
			});
			builders = mirror.docs as unknown as PassportBuilder[];
			for (const d of mirror.docs as any[])
				if (d.last_synced && (!syncedAt || d.last_synced > syncedAt))
					syncedAt = d.last_synced;
		} catch (error) {
			console.error("builders mirror read failed:", error);
		}
	}
	if (builders.length === 0) {
		try {
			builders = await fetchAllBuilders();
		} catch (error) {
			console.error("Failed to fetch builders:", error);
		}
	}

	// Filter out builders without a github username
	builders = builders.filter((b) => b.github_username);

	// What each builder has actually shipped in the Stellar repos we index
	// (owned, Passport-declared, contributor pass); see src/lib/builder-code.ts
	if (payload && builders.length) {
		try {
			for (const [k, v] of await builderCodeActivity(payload, builders as any))
				activity.set(k, v);
		} catch (error) {
			console.error("builders repo activity failed:", error);
		}
	}
	const act = (b: PassportBuilder) =>
		activity.get(String(b.github_username).toLowerCase());
	// free-text locations ("São Paulo, Brazil", "Lagos, Nigeria") -> a country we can flag
	const COUNTRIES: Array<[RegExp, string, string]> = [
		[/brazil|brasil|são paulo|sao paulo|rio de janeiro/i, "BR", "Brazil"],
		[/nigeria|lagos|abuja/i, "NG", "Nigeria"],
		[/chile|santiago/i, "CL", "Chile"],
		[/costa rica/i, "CR", "Costa Rica"],
		[/argentina|buenos aires/i, "AR", "Argentina"],
		[/mexico|méxico|cdmx/i, "MX", "Mexico"],
		[/colombia|bogot/i, "CO", "Colombia"],
		[/peru|lima/i, "PE", "Peru"],
		[/india|bengaluru|bangalore|mumbai|delhi|hyderabad|jaipur/i, "IN", "India"],
		[/indonesia|jakarta/i, "ID", "Indonesia"],
		[/vietnam|hanoi|ho chi minh/i, "VN", "Vietnam"],
		[/philippines|manila/i, "PH", "Philippines"],
		[/t[üu]rkiye|turkey|istanbul|ankara/i, "TR", "Türkiye"],
		[/kenya|nairobi/i, "KE", "Kenya"],
		[/ghana|accra/i, "GH", "Ghana"],
		[/south africa|cape town|johannesburg/i, "ZA", "South Africa"],
		[/portugal|lisbon|lisboa|porto/i, "PT", "Portugal"],
		[/spain|españa|madrid|barcelona/i, "ES", "Spain"],
		[/germany|deutschland|berlin|munich/i, "DE", "Germany"],
		[/france|paris/i, "FR", "France"],
		[/united kingdom|\buk\b|england|london/i, "GB", "United Kingdom"],
		[/canada|toronto|vancouver|montreal/i, "CA", "Canada"],
		[
			/united states|\busa?\b|new york|san francisco|california|texas|austin|miami|seattle|boston|chicago/i,
			"US",
			"United States",
		],
		[/uruguay|montevideo/i, "UY", "Uruguay"],
		[/venezuela|caracas/i, "VE", "Venezuela"],
		[/ecuador|quito/i, "EC", "Ecuador"],
		[/bolivia/i, "BO", "Bolivia"],
		[/pakistan|karachi|lahore/i, "PK", "Pakistan"],
		[/bangladesh|dhaka/i, "BD", "Bangladesh"],
		[/singapore/i, "SG", "Singapore"],
		[/australia|sydney|melbourne/i, "AU", "Australia"],
		[/italy|italia|milan|rome/i, "IT", "Italy"],
		[/netherlands|amsterdam/i, "NL", "Netherlands"],
		[/poland|warsaw/i, "PL", "Poland"],
		[/ukraine|kyiv/i, "UA", "Ukraine"],
		[/japan|tokyo/i, "JP", "Japan"],
		[/korea|seoul/i, "KR", "South Korea"],
		[/uae|dubai|emirates/i, "AE", "United Arab Emirates"],
		[/egypt|cairo/i, "EG", "Egypt"],
	];
	const countryOf = (loc: string | null | undefined) => {
		if (!loc) return null;
		for (const [re, code, name] of COUNTRIES)
			if (re.test(loc)) return { code, name };
		return null;
	};
	const rows: BuilderRowData[] = builders.map((b) => {
		const a = act(b);
		const handle = String(b.github_username);
		return {
			handle,
			name: b.display_name || handle,
			avatar: b.avatar_url ?? null,
			role: b.role_title ?? null,
			location: b.location ?? null,
			bio: b.bio ?? null,
			twitter: b.twitter_handle ?? null,
			website: b.website_url ?? null,
			featured: !!b.is_featured,
			commits30d: b.stats?.totalCommits30d ?? 0,
			passportProjects: b.projects?.length ?? 0,
			repos: a?.repos.length ?? 0,
			stars: a?.stars ?? 0,
			commits90d: a?.commits90d ?? 0,
			lastCommitAt: a?.lastCommitAt ?? null,
			projects: a
				? [...a.projects.entries()].map(([slug, name]) => ({ slug, name }))
				: [],
			contributesTo: a
				? [...a.contributesTo.entries()].map(([slug, name]) => ({ slug, name }))
				: [],
			languages: a?.languages ?? [],
			country: countryOf(b.location),
			ambassador: AMBASSADORS[handle.toLowerCase()]
				? {
						tier: AMBASSADORS[handle.toLowerCase()].tier,
						region: AMBASSADORS[handle.toLowerCase()].region,
					}
				: null,
		};
	});

	return (
		<div className="min-h-screen relative">
			<main className="max-w-7xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Home</span>
				</Link>

				<div className="mb-8">
					<p className="text-xs font-medium uppercase tracking-wider text-neutral-500 mb-2">
						Directory
					</p>
					<h1 className="text-3xl md:text-4xl font-semibold tracking-tight text-foreground mb-2">
						Builders
					</h1>
					<p className="text-muted-foreground">
						{builders.length} developers building on Stellar. Profiles from
						Stellar Passport, code activity from the repos we index.
						{syncedAt
							? ` Profiles synced ${new Date(syncedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`
							: ""}
					</p>
				</div>

				{rows.length > 0 ? (
					<BuildersDirectory rows={rows} />
				) : (
					<Card className="border border-border/50 bg-card">
						<CardContent className="py-16 text-center">
							<Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
							<p className="text-muted-foreground">
								The builder directory is empty right now. Profiles come from
								Stellar Passport; if you have one, it will appear after the next
								sync.
							</p>
						</CardContent>
					</Card>
				)}

				{/* CTA */}
				<div className="mt-16 text-center py-12 px-8 rounded-2xl border border-border bg-card">
					<h3 className="text-2xl font-semibold mb-3">
						Are you building on Stellar?
					</h3>
					<p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
						Create your Stellar Passport profile to showcase your work and
						connect with the community
					</p>
					<Button asChild size="lg">
						<a
							href="https://demo.stellarpassport.xyz"
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-2"
						>
							Create Your Profile
							<ExternalLink className="w-4 h-4" />
						</a>
					</Button>
				</div>
			</main>
		</div>
	);
}
