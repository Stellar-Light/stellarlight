import { ArrowLeft, ExternalLink, Github } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * Public partner profile page.
 *
 *   /partners/{slug}
 *
 * The human-facing detail view — partner-claimed facts + system-verified
 * signals + freshness, the same data GET /api/partners/{slug} serves to
 * agents. Published partners only; 404 otherwise.
 */

export const revalidate = 300;
export const dynamicParams = true;

const TYPE_LABELS: Record<string, string> = {
	anchor: "Anchor",
	"on-off-ramp": "On/Off Ramp",
	infrastructure: "Infrastructure",
	tooling: "Tooling",
	protocol: "Protocol",
	wallet: "Wallet",
	"audit-firm": "Audit firm",
	legal: "Legal",
	agency: "Agency",
	other: "Other",
};

const FRESH_BADGE: Record<string, { label: string; cls: string }> = {
	fresh: { label: "Fresh", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
	aging: { label: "Aging", cls: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10" },
	stale: { label: "Stale", cls: "text-orange-400 border-orange-500/30 bg-orange-500/10" },
	archived: { label: "Archived", cls: "text-red-400 border-red-500/30 bg-red-500/10" },
};

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

	const fresh = FRESH_BADGE[p.freshnessStatus ?? "fresh"] ?? FRESH_BADGE.fresh;
	const v = p.verified ?? {};
	const services: string[] = (p.services ?? [])
		.map((s: { tag: string }) => s.tag)
		.filter(Boolean);

	return (
		<main className="max-w-4xl mx-auto px-6 py-12">
			<Link
				href="/partners"
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-8 transition-colors"
			>
				<ArrowLeft className="w-3.5 h-3.5" />
				All partners
			</Link>

			{/* Header */}
			<div className="mb-8">
				<div className="flex items-baseline gap-3 mb-2 flex-wrap">
					<h1 className="text-3xl font-bold text-foreground tracking-tight">
						{p.name}
					</h1>
					<span className="text-[11px] uppercase tracking-wider text-muted-foreground border border-border/60 rounded px-2 py-0.5">
						{TYPE_LABELS[p.partnerType] ?? p.partnerType}
					</span>
					<span className={`text-[10px] px-2 py-0.5 rounded-full border ${fresh.cls}`}>
						{fresh.label}
					</span>
				</div>
				{p.tagline && (
					<p className="text-base text-muted-foreground leading-relaxed max-w-2xl">
						{p.tagline}
					</p>
				)}
			</div>

			{p.description && (
				<Section title="About">
					<p className="text-sm text-foreground/90 leading-relaxed max-w-2xl">
						{p.description}
					</p>
				</Section>
			)}

			{/* Verified signals */}
			<Section title="Verified by Stellar Light">
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					<Cell label="Last commit" value={fmtDate(v.githubLastCommitAt)} />
					<Cell label="Commits (90d)" value={v.githubCommits90d ?? "—"} />
					<Cell
						label="On-chain"
						value={v.onchainActive == null ? "—" : v.onchainActive ? "active" : "none"}
					/>
					<Cell label="SCF" value={v.scfInvolvement ?? "—"} />
				</div>
			</Section>

			{services.length > 0 && (
				<Section title="Services">
					<div className="flex flex-wrap gap-1.5">
						{services.map((s) => (
							<span
								key={s}
								className="text-[11px] text-foreground bg-white/[0.03] border border-border/50 rounded-full px-2.5 py-1"
							>
								{s}
							</span>
						))}
					</div>
				</Section>
			)}

			{(p.sectors?.length || p.regions?.length) && (
				<Section title="Coverage">
					<div className="flex flex-wrap gap-1.5">
						{(p.sectors ?? []).map((s: string) => (
							<span key={s} className="text-[11px] text-muted-foreground bg-white/[0.03] border border-border/40 rounded px-2 py-0.5">
								{s}
							</span>
						))}
						{(p.regions ?? []).map((r: string) => (
							<span key={r} className="text-[11px] text-muted-foreground/70 bg-white/[0.02] border border-border/30 rounded px-2 py-0.5">
								{r}
							</span>
						))}
					</div>
				</Section>
			)}

			{/* Engagement */}
			{(p.acceptingClients != null || p.pricingModel || p.leadTime) && (
				<Section title="Working together">
					<dl className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
						{p.acceptingClients != null && (
							<Field label="Accepting clients" value={p.acceptingClients ? "Yes" : "Not right now"} />
						)}
						{p.pricingModel && <Field label="Pricing" value={p.pricingModel} />}
						{p.leadTime && <Field label="Lead time" value={p.leadTime} />}
						{p.typicalEngagement && <Field label="Engagement" value={p.typicalEngagement} />}
						{p.responseSla && <Field label="Response" value={p.responseSla} />}
					</dl>
					{p.pricingNotes && (
						<p className="text-xs text-muted-foreground mt-3">{p.pricingNotes}</p>
					)}
				</Section>
			)}

			{/* Links */}
			<Section title="Links">
				<div className="flex flex-wrap gap-2">
					{p.websiteUrl && (
						<LinkBtn href={p.websiteUrl} icon={<ExternalLink className="w-3.5 h-3.5" />}>
							Website
						</LinkBtn>
					)}
					{p.docsUrl && (
						<LinkBtn href={p.docsUrl} icon={<ExternalLink className="w-3.5 h-3.5" />}>
							Docs
						</LinkBtn>
					)}
					{p.githubOrg && (
						<LinkBtn href={`https://github.com/${p.githubOrg}`} icon={<Github className="w-3.5 h-3.5" />}>
							GitHub
						</LinkBtn>
					)}
					{p.contactChannel && (
						<span className="inline-flex items-center px-3 py-1.5 rounded-lg border border-border/50 text-xs text-muted-foreground">
							Contact: {p.contactChannel}
						</span>
					)}
				</div>
			</Section>
		</main>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section className="mb-8">
			<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
				{title}
			</div>
			{children}
		</section>
	);
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="rounded-lg border border-border/40 bg-card/40 px-3 py-2">
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
				{label}
			</div>
			<div className="text-sm text-foreground/90 truncate">{value}</div>
		</div>
	);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div>
			<dt className="text-[10px] uppercase tracking-wide text-muted-foreground/60">
				{label}
			</dt>
			<dd className="text-foreground/90">{value}</dd>
		</div>
	);
}

function LinkBtn({
	href,
	icon,
	children,
}: {
	href: string;
	icon: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noopener noreferrer"
			className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-white/[0.03] hover:bg-white/[0.06] text-xs text-foreground transition-colors"
		>
			{icon}
			{children}
		</a>
	);
}

function fmtDate(d?: string | null): string {
	if (!d) return "—";
	try {
		return new Date(d).toLocaleDateString();
	} catch {
		return "—";
	}
}
