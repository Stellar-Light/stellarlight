import {
	Activity,
	ArrowLeft,
	Boxes,
	CheckCircle2,
	ExternalLink,
	FileText,
	Github,
	Globe,
	Mail,
	MessageCircle,
	ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartnerClaimProfile } from "@/components/partner-claim-profile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { regionLabel, sectorLabel, typeLabel } from "@/lib/partner-labels";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * Public partner profile page.
 *
 *   /partners/{slug}
 *
 * The human-facing detail view — partner-claimed facts + system-verified
 * signals + freshness, the same data GET /api/partners/{slug} serves to
 * agents. Styled to match the project detail page (/project/{slug}): a
 * card-based hero + Card sections + link/stat tiles. Published partners
 * only; 404 otherwise.
 */

export const revalidate = 300;
export const dynamicParams = true;

// Freshness → a colored status dot in the hero (Fresh is normal/neutral; only
// decay states warn).
const FRESH: Record<string, { label: string; dot: string }> = {
	fresh: { label: "Fresh", dot: "bg-green-500" },
	aging: { label: "Aging", dot: "bg-yellow-500" },
	stale: { label: "Stale", dot: "bg-orange-500" },
	archived: { label: "Archived", dot: "bg-muted-foreground/60" },
};

const PRICING_LABELS: Record<string, string> = {
	free: "Free",
	freemium: "Freemium",
	subscription: "Subscription",
	"usage-based": "Usage-based",
	fixed: "Fixed fee",
	hourly: "Hourly",
	"rev-share": "Revenue share",
	custom: "Custom — contact them",
};

const SEP_LABEL: Record<string, string> = {
	"sep-6": "SEP-6 · programmatic deposit/withdraw",
	"sep-24": "SEP-24 · interactive deposit/withdraw",
	"sep-31": "SEP-31 · cross-border payments",
};

/** "soroban-audit" → "Soroban Audit"; leaves normal words alone. */
function prettify(s: string): string {
	return s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
async function getPartner(slug: string): Promise<any | null> {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	try {
		const res = await payload.find({
			collection: "partner-accounts",
			where: {
				and: [{ slug: { equals: slug } }, { status: { equals: "published" } }],
			},
			limit: 1,
			depth: 0,
		});
		return res.docs[0] ?? null;
	} catch {
		return null;
	}
}

// One-line "what they do for you", by type — the git-free equivalent of a
// GitHub summary for closed-source partners.
const TYPE_BLURB: Record<string, string> = {
	anchor: "Fiat ⇄ Stellar on/off-ramp",
	"on-off-ramp": "Fiat ⇄ Stellar on/off-ramp",
	infrastructure: "Infrastructure for building on Stellar",
	tooling: "Developer tooling for Stellar",
	protocol: "On-chain protocol on Stellar",
	wallet: "Stellar wallet",
	"audit-firm": "Smart-contract security audits",
	legal: "Legal & compliance",
	agency: "Development agency",
};

/**
 * The matching project in our directory (if any). Many partners are also
 * tracked projects, which carry SCF/GitHub/status data the partner record
 * lacks — so a closed-source anchor can still show verifiable ecosystem
 * signals. Join on slug, stripping the "anchor-" prefix.
 */
// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
async function getMatchingProject(partnerSlug: string): Promise<any | null> {
	const payload = await getPayloadSafe();
	if (!payload) return null;
	try {
		const res = await payload.find({
			collection: "projects",
			where: {
				and: [
					{ slug: { equals: partnerSlug.replace(/^anchor-/, "") } },
					{ status: { in: ["Development", "Pre-Release", "Live"] } },
				],
			},
			limit: 1,
			depth: 1,
			select: {
				slug: true,
				status: true,
				verificationLevel: true,
				scf: true,
				github: true,
			},
		});
		return res.docs[0] ?? null;
	} catch {
		return null;
	}
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ slug: string }>;
}): Promise<Metadata> {
	const { slug } = await params;
	const p = await getPartner(slug);
	if (!p) return { title: "Partner not found | Stellar Light" };
	return {
		title: `${p.name} | Stellar Partners`,
		description: p.tagline ?? `${p.name} — a Stellar ecosystem partner.`,
	};
}

export default async function PartnerProfilePage({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const p = await getPartner(slug);
	if (!p) notFound();

	const proj = await getMatchingProject(slug);
	const scf = proj?.scf?.awarded ? proj.scf : null;
	const scfRounds: number[] =
		scf && Array.isArray(scf.awardedRounds) && scf.awardedRounds.length > 0
			? (scf.awardedRounds as number[])
			: scf?.lastAwardedRound > 0
				? [scf.lastAwardedRound]
				: [];
	const repoCount: number = proj?.github?.repos?.length ?? 0;

	const fresh = FRESH[p.freshnessStatus ?? "fresh"] ?? FRESH.fresh;
	const v = p.verified ?? {};
	const assets: string[] = (p.assets ?? [])
		.map((a: { code: string }) => a.code)
		.filter(Boolean);
	const seps: string[] = p.seps ?? [];
	const ramps: string[] = p.rampTypes ?? [];
	const sectors: string[] = p.sectors ?? [];
	const regions: string[] = p.regions ?? [];
	const contactable = Boolean(p.contactEmail || p.contactChannel);
	const available = Boolean(p.acceptingClients && contactable);

	// Services, minus any that just duplicate the asset codes (a common
	// enrichment artifact) — prettified so tags read as words, not slugs.
	const assetLower = new Set(assets.map((a) => a.toLowerCase()));
	const services: string[] = (p.services ?? [])
		.map((s: { tag: string }) => s.tag)
		.filter((t: string) => t && !assetLower.has(t.toLowerCase()));

	const hasCapabilities =
		assets.length > 0 || seps.length > 0 || ramps.length > 0;
	const hasEngagement =
		p.acceptingClients != null ||
		p.pricingModel ||
		p.leadTime ||
		p.typicalEngagement ||
		p.responseSla;

	const c = p.compliance ?? {};
	const licenses: Array<{
		authority?: string;
		jurisdiction?: string;
		type?: string;
	}> = c.licenses ?? [];
	const csv = (s?: string): string[] =>
		s
			? String(s)
					.split(",")
					.map((x) => x.trim())
					.filter(Boolean)
			: [];
	const currencies = csv(c.currencies);
	const customers = csv(c.notableCustomers);
	const hasCompliance =
		licenses.length > 0 ||
		Boolean(c.kycRequired) ||
		Boolean(c.travelRule) ||
		currencies.length > 0 ||
		Boolean(c.settlementTime) ||
		customers.length > 0;

	// On-chain proof — the anchor's OWN issued assets, live on mainnet
	// (domain-matched from stellar.expert). The git-free trust signal: real
	// holders + payment activity distinguish a live issuer from a dormant one.
	const onchain: Array<{
		code?: string;
		issuer?: string;
		holders?: number;
		payments?: number;
		rating?: number;
		asOf?: string;
	}> = Array.isArray(p.onchain) ? p.onchain : [];
	const hasOnchain = onchain.length > 0;
	const onchainAsOf = onchain.find((o) => o.asOf)?.asOf ?? null;

	const verifiedCells: Array<{ label: string; value: string }> = [];
	if (p.githubOrg) {
		verifiedCells.push({
			label: "Last commit",
			value: fmtDate(v.githubLastCommitAt),
		});
		verifiedCells.push({
			label: "Commits (90d)",
			value: v.githubCommits90d != null ? String(v.githubCommits90d) : "—",
		});
	}
	if (v.onchainActive != null)
		verifiedCells.push({
			label: "On-chain",
			value: v.onchainActive ? "Active" : "None",
		});
	if (v.scfInvolvement)
		verifiedCells.push({ label: "SCF", value: String(v.scfInvolvement) });

	const links: Array<{
		key: string;
		href: string;
		sub: string;
		Icon: typeof Globe;
	}> = [];
	if (p.websiteUrl)
		links.push({
			key: "Website",
			href: p.websiteUrl,
			sub: cleanUrl(p.websiteUrl),
			Icon: Globe,
		});
	if (p.docsUrl)
		links.push({
			key: "Docs",
			href: p.docsUrl,
			sub: cleanUrl(p.docsUrl),
			Icon: FileText,
		});
	if (p.githubOrg)
		links.push({
			key: "GitHub",
			href: `https://github.com/${p.githubOrg}`,
			sub: `github.com/${p.githubOrg}`,
			Icon: Github,
		});
	if (p.contactEmail)
		links.push({
			key: "Contact",
			href: `mailto:${p.contactEmail}`,
			sub: p.contactEmail,
			Icon: Mail,
		});

	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
				{/* Back */}
				<Link
					href="/partners"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Partners</span>
				</Link>

				{/* Hero */}
				<Card className="mb-12 border border-border/50 bg-card shadow-sm">
					<CardContent className="p-8">
						<div className="flex flex-col gap-6">
							<div className="flex flex-col md:flex-row items-start gap-5">
								{/* Logo / monogram */}
								{p.logoUrl ? (
									<div className="relative flex-shrink-0">
										<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FDDA24]/20 via-transparent to-transparent blur-xl opacity-50" />
										{/* Remote stellar.toml ORG_LOGO domain — plain img. */}
										{/* eslint-disable-next-line @next/next/no-img-element */}
										<img
											src={p.logoUrl}
											alt={`${p.name} logo`}
											className="relative w-[120px] h-[120px] rounded-2xl border border-border/50 bg-white/[0.03] object-contain p-3 shadow-2xl"
										/>
									</div>
								) : (
									<div className="relative flex-shrink-0">
										<div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#FDDA24]/20 via-transparent to-transparent blur-xl opacity-50" />
										<div className="relative w-[120px] h-[120px] rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-border/50 shadow-2xl text-4xl font-bold text-foreground/80">
											{String(p.name).charAt(0).toUpperCase()}
										</div>
									</div>
								)}

								{/* Title + badges */}
								<div className="flex flex-col gap-4 items-start flex-1 min-w-0">
									<h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">
										{p.name}
									</h1>
									{TYPE_BLURB[p.partnerType] && (
										<p className="-mt-1 text-sm text-muted-foreground">
											{TYPE_BLURB[p.partnerType]}
										</p>
									)}

									<div className="flex flex-wrap items-center gap-3">
										<Badge
											variant="outline"
											className="text-sm px-4 py-1.5 font-semibold border-border/50 shadow-sm"
										>
											{typeLabel(p.partnerType)}
										</Badge>
										<Badge
											variant="outline"
											className="text-sm px-4 py-1.5 font-semibold border-border/50 shadow-sm flex items-center gap-1.5"
										>
											<span className={`w-2 h-2 rounded-full ${fresh.dot}`} />
											{fresh.label}
										</Badge>
										{available && (
											<Badge className="bg-gradient-to-r from-green-500/20 to-green-500/10 text-green-400 border-green-500/30 text-sm px-4 py-1.5 font-semibold shadow-sm flex items-center gap-1.5">
												<CheckCircle2 className="w-3.5 h-3.5" />
												Available
											</Badge>
										)}
										{scf && (
											<Badge className="bg-gradient-to-r from-[#FDDA24]/20 to-[#FDDA24]/10 text-[#FDDA24] border-[#FDDA24]/30 text-sm px-4 py-1.5 font-semibold shadow-sm flex items-center gap-1.5">
												<CheckCircle2 className="w-3.5 h-3.5" />
												SCF-funded
											</Badge>
										)}
										{hasCapabilities && (
											<Badge
												variant="outline"
												className="text-sm px-4 py-1.5 font-medium border-border/50 text-muted-foreground flex items-center gap-1.5"
											>
												<ShieldCheck className="w-3.5 h-3.5" />
												stellar.toml verified
											</Badge>
										)}
									</div>

									{(sectors.length > 0 || p.country || regions.length > 0) && (
										<div className="flex flex-wrap items-center gap-2.5">
											{sectors.map((s) => (
												<Badge
													key={s}
													variant="secondary"
													className="text-sm px-3.5 py-1.5 font-semibold border border-border/50 shadow-sm"
												>
													{sectorLabel(s)}
												</Badge>
											))}
											{p.country && (
												<Badge
													variant="outline"
													className="text-sm px-3.5 py-1.5 font-medium border-border/50"
												>
													{p.country}
												</Badge>
											)}
											{regions
												.filter((r) => regionLabel(r) !== p.country)
												.map((r) => (
													<Badge
														key={r}
														variant="outline"
														className="text-sm px-3.5 py-1.5 font-medium border-border/50 text-muted-foreground"
													>
														{regionLabel(r)}
													</Badge>
												))}
										</div>
									)}
								</div>
							</div>

							{/* About */}
							<div className="space-y-4 pt-5 border-t border-border/50">
								<h2 className="text-xl font-bold text-foreground">
									About {p.name}
								</h2>
								{p.tagline && (
									<p className="text-base text-foreground/90 leading-relaxed">
										{p.tagline}
									</p>
								)}
								{p.description && (
									<p className="text-base text-muted-foreground leading-relaxed">
										{p.description}
									</p>
								)}
								{!p.tagline && !p.description && (
									<p className="text-base text-muted-foreground italic">
										No description available yet.
									</p>
								)}
								{p.websiteUrl && (
									<Button asChild className="mt-2">
										<a
											href={p.websiteUrl}
											target="_blank"
											rel="noopener noreferrer"
											className="inline-flex items-center gap-2"
										>
											Visit {p.name}
											<ExternalLink className="w-4 h-4" />
										</a>
									</Button>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{/* Stellar Community Fund — a real, verifiable ecosystem signal that
				    works for closed-source partners (from the matching project). */}
				{scf && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">
								Stellar Community Fund
							</CardTitle>
							<CardDescription>Awarded funding from the SCF</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
								{scfRounds.length > 0 && (
									<div className="p-4 rounded-xl border border-border/50 bg-background/50">
										<p className="text-sm font-medium text-muted-foreground mb-2">
											{scfRounds.length > 1 ? "Funded rounds" : "Funded round"}
										</p>
										<div className="flex flex-wrap gap-2">
											{scfRounds.map((r) => (
												<span
													key={r}
													className="inline-flex items-center justify-center px-3 py-1 rounded-lg bg-white/10 text-sm font-bold text-foreground border border-border/50"
												>
													{r}
												</span>
											))}
										</div>
									</div>
								)}
								{scf.totalAwarded > 0 && (
									<div className="p-4 rounded-xl border border-border/50 bg-background/50">
										<p className="text-sm font-medium text-muted-foreground mb-1">
											Total funded
										</p>
										<p className="text-2xl font-bold text-foreground">
											${scf.totalAwarded.toLocaleString()}
										</p>
									</div>
								)}
								{scf.slug && (
									<a
										href={`https://communityfund.stellar.org/project/${scf.slug}`}
										target="_blank"
										rel="noopener noreferrer"
										className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background hover:border-border transition-all duration-150"
									>
										<div className="flex-1 min-w-0">
											<p className="text-sm font-medium text-muted-foreground mb-1">
												SCF page
											</p>
											<p className="text-sm font-semibold text-foreground truncate">
												View on Community Fund
											</p>
										</div>
										<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
									</a>
								)}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Cross-link to the fuller project record (repos, GitHub activity,
				    on-chain) — many partners are also tracked projects. */}
				{proj && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardContent className="p-6">
							<Link
								href={`/project/${proj.slug}`}
								className="group flex items-center gap-4"
							>
								<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 group-hover:border-primary/40 transition-all duration-150 flex-shrink-0">
									<Boxes className="h-6 w-6 text-primary" />
								</div>
								<div className="flex-1 min-w-0">
									<p className="font-semibold text-foreground group-hover:text-primary transition-colors">
										Also tracked as a project
									</p>
									<p className="text-sm text-muted-foreground">
										See its repos
										{repoCount > 0
											? ` (${repoCount} ${repoCount === 1 ? "repo" : "repos"})`
											: ""}
										, GitHub activity, and full project record →
									</p>
								</div>
								<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
							</Link>
						</CardContent>
					</Card>
				)}

				{/* Capabilities (anchors — from stellar.toml) */}
				{hasCapabilities && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Capabilities</CardTitle>
							<CardDescription>
								Verified from this partner&apos;s stellar.toml (SEP-1)
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{ramps.length > 0 && (
								<div>
									<div className="text-sm font-semibold mb-3 text-muted-foreground">
										Ramps
									</div>
									<div className="flex flex-wrap gap-2">
										{ramps.map((r) => (
											<span
												key={r}
												className="px-3.5 py-1.5 rounded-lg bg-background/50 border border-border/50 text-sm font-medium text-foreground"
											>
												{r === "on-ramp"
													? "On-ramp (fiat → Stellar)"
													: "Off-ramp (Stellar → fiat)"}
											</span>
										))}
									</div>
								</div>
							)}
							{assets.length > 0 && (
								<div>
									<div className="text-sm font-semibold mb-3 text-muted-foreground">
										Assets issued / supported
									</div>
									<div className="flex flex-wrap gap-2">
										{assets.map((a) => (
											<span
												key={a}
												className="px-3.5 py-1.5 rounded-lg bg-white/[0.06] border border-border/50 font-mono text-sm font-semibold text-foreground"
											>
												{a}
											</span>
										))}
									</div>
								</div>
							)}
							{seps.length > 0 && (
								<div>
									<div className="text-sm font-semibold mb-3 text-muted-foreground">
										Standards
									</div>
									<div className="flex flex-wrap gap-2">
										{seps.map((s) => (
											<span
												key={s}
												className="px-3.5 py-1.5 rounded-lg bg-background/50 border border-border/50 text-sm text-foreground/90"
											>
												{SEP_LABEL[s] ?? s}
											</span>
										))}
									</div>
								</div>
							)}
						</CardContent>
					</Card>
				)}

				{/* Live on Stellar — the anchor's OWN issued assets on mainnet,
				    domain-matched from stellar.expert. The git-free proof-of-life:
				    real holders + payment volume, not a self-claim. */}
				{hasOnchain && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold flex items-center gap-2">
								<Activity className="w-5 h-5 text-green-400" />
								Live on Stellar
							</CardTitle>
							<CardDescription>
								This partner&apos;s own assets on Stellar mainnet — holders and
								payment activity from stellar.expert
								{onchainAsOf ? ` (as of ${onchainAsOf})` : ""}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="space-y-3">
								{onchain.map((o) => {
									const href = o.issuer
										? `https://stellar.expert/explorer/public/asset/${o.code}-${o.issuer}`
										: null;
									const inner = (
										<div className="flex flex-wrap items-center gap-x-6 gap-y-3 p-4 rounded-xl border border-border/50 bg-background/50 group-hover:border-green-500/40 transition-colors duration-150">
											<span className="font-mono text-base font-bold text-foreground min-w-[5rem]">
												{o.code}
											</span>
											<div className="flex flex-wrap items-center gap-x-6 gap-y-2 flex-1">
												<InlineStat label="Holders" value={fmtNum(o.holders)} />
												<InlineStat
													label="Payments"
													value={fmtNum(o.payments)}
												/>
												{o.rating != null && o.rating > 0 && (
													<InlineStat label="Rating" value={`${o.rating}/10`} />
												)}
											</div>
											{href && (
												<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-green-400 transition-colors flex-shrink-0" />
											)}
										</div>
									);
									return href ? (
										<a
											key={o.code}
											href={href}
											target="_blank"
											rel="noopener noreferrer"
											className="group block"
										>
											{inner}
										</a>
									) : (
										<div key={o.code} className="group">
											{inner}
										</div>
									);
								})}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Compliance & corridors — curator-verified; the decision-critical
				    facts for a closed-source anchor (regulatory standing + rails). */}
				{hasCompliance && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold flex items-center gap-2">
								<ShieldCheck className="w-5 h-5 text-primary" />
								Compliance &amp; corridors
							</CardTitle>
							<CardDescription>
								Verified from the partner&apos;s own disclosures / regulator
								registries
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{(c.kycRequired || c.travelRule) && (
								<div className="flex flex-wrap gap-2">
									{c.kycRequired && (
										<span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/50 border border-border/50 text-sm text-foreground/90">
											<CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
											KYC
										</span>
									)}
									{c.travelRule && (
										<span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/50 border border-border/50 text-sm text-foreground/90">
											<CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
											Travel Rule
										</span>
									)}
								</div>
							)}

							{licenses.length > 0 && (
								<div>
									<div className="text-sm font-semibold mb-3 text-muted-foreground">
										Licenses &amp; registrations
									</div>
									<div className="space-y-2">
										{licenses.map((l, i) => (
											<div
												key={`${l.authority}-${i}`}
												className="flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-background/50"
											>
												<ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
												<div className="min-w-0">
													<div className="text-sm font-medium text-foreground">
														{l.authority}
														{l.jurisdiction ? ` · ${l.jurisdiction}` : ""}
													</div>
													{l.type && (
														<div className="text-xs text-muted-foreground">
															{l.type}
														</div>
													)}
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							{(currencies.length > 0 ||
								c.settlementTime ||
								customers.length > 0) && (
								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									{currencies.length > 0 && (
										<StatTile
											label="Currencies"
											value={currencies.join(", ")}
										/>
									)}
									{c.settlementTime && (
										<StatTile label="Settlement" value={c.settlementTime} />
									)}
									{customers.length > 0 && (
										<StatTile
											label="Notable customers"
											value={customers.join(", ")}
										/>
									)}
								</div>
							)}
						</CardContent>
					</Card>
				)}

				{/* Services */}
				{services.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">Services</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="flex flex-wrap gap-2">
								{services.map((s) => (
									<span
										key={s}
										className="px-3.5 py-1.5 rounded-lg bg-background/50 border border-border/50 text-sm text-foreground/90"
									>
										{prettify(s)}
									</span>
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Working together */}
				{hasEngagement && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">
								Working together
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 md:grid-cols-3 gap-4">
								{p.acceptingClients != null && (
									<StatTile
										label="Accepting clients"
										value={p.acceptingClients ? "Yes" : "Not right now"}
									/>
								)}
								{p.pricingModel && (
									<StatTile
										label="Pricing"
										value={PRICING_LABELS[p.pricingModel] ?? p.pricingModel}
									/>
								)}
								{p.leadTime && (
									<StatTile label="Lead time" value={p.leadTime} />
								)}
								{p.typicalEngagement && (
									<StatTile label="Engagement" value={p.typicalEngagement} />
								)}
								{p.responseSla && (
									<StatTile label="Response" value={p.responseSla} />
								)}
							</div>
							{p.pricingNotes && (
								<p className="text-sm text-muted-foreground mt-4">
									{p.pricingNotes}
								</p>
							)}
						</CardContent>
					</Card>
				)}

				{/* Verified by Stellar Light */}
				{verifiedCells.length > 0 && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold flex items-center gap-2">
								<ShieldCheck className="w-5 h-5 text-[#FDDA24]" />
								Verified by Stellar Light
							</CardTitle>
							<CardDescription>
								Independent signals we check, not partner-claimed
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 md:grid-cols-4 gap-4">
								{verifiedCells.map((c) => (
									<StatTile key={c.label} label={c.label} value={c.value} />
								))}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Links & Resources */}
				{(links.length > 0 || p.contactChannel) && (
					<Card className="mb-8 border border-border/50 bg-card shadow-sm">
						<CardHeader className="pb-4">
							<CardTitle className="text-xl font-bold">
								Links &amp; Resources
							</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
								{links.map(({ key, href, sub, Icon }) => (
									<a
										key={key}
										href={href}
										target="_blank"
										rel="noopener noreferrer"
										className="group flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 hover:bg-background hover:border-primary/50 transition-all duration-150 hover:shadow-sm hover:-translate-y-0.5 overflow-hidden"
									>
										<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 group-hover:border-primary/40 group-hover:bg-primary/20 transition-all duration-150 flex-shrink-0">
											<Icon className="h-6 w-6 text-primary" />
										</div>
										<div className="flex-1 min-w-0">
											<span className="block font-semibold text-foreground group-hover:text-primary transition-colors truncate">
												{key}
											</span>
											<span className="block text-xs text-muted-foreground truncate">
												{sub}
											</span>
										</div>
										<ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
									</a>
								))}
								{p.contactChannel && (
									<div className="flex items-center gap-4 p-4 rounded-xl border border-border/50 bg-background/50 overflow-hidden">
										<div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 flex-shrink-0">
											<MessageCircle className="h-6 w-6 text-primary" />
										</div>
										<div className="flex-1 min-w-0">
											<span className="block font-semibold text-foreground truncate">
												Contact
											</span>
											<span className="block text-xs text-muted-foreground truncate">
												{p.contactChannel}
											</span>
										</div>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				)}

				{/* Claim path */}
				<div id="claim" className="scroll-mt-28">
					<PartnerClaimProfile orgName={p.name} />
				</div>
			</main>
		</div>
	);
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="p-4 rounded-xl border border-border/50 bg-background/50">
			<p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
			<p className="text-lg font-bold text-foreground leading-tight">{value}</p>
		</div>
	);
}

function InlineStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col">
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			<span className="text-base font-bold text-foreground leading-tight">
				{value}
			</span>
		</div>
	);
}

function cleanUrl(u: string): string {
	return u.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/** 12345 → "12,345"; nullish/negatives → "—". */
function fmtNum(n?: number | null): string {
	if (n == null || Number.isNaN(n) || n < 0) return "—";
	return n.toLocaleString("en-US");
}

function fmtDate(d?: string | null): string {
	if (!d) return "—";
	try {
		return new Date(d).toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
			year: "numeric",
		});
	} catch {
		return "—";
	}
}
