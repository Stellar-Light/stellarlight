/**
 * Per-partner share card.
 *
 *   /partners/{slug}/opengraph-image  → 1200×630 PNG
 *
 * Next.js auto-wires this as the profile's og:image + twitter:image, so when a
 * partner shares their stellarlight.xyz/partners/{slug} link on X / LinkedIn /
 * Slack / iMessage it renders a branded card instead of a bare URL. This is the
 * single biggest "tell everyone about your services" lever — partners want to
 * share a link that looks good.
 *
 * Satori gotchas (both 500 in prod until fixed): every multi-child element
 * needs explicit display:flex; non-Latin glyphs trigger a font fetch that 400s
 * — draw shapes with CSS, keep text Latin.
 */
import { ImageResponse } from "next/og";
import { PARTNER_TYPE_LABELS } from "@/lib/partner-labels";
import { getPayloadSafe } from "@/lib/payload-client";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Stellar Light partner";

interface OgPartner {
	name: string;
	partnerType: string;
	tagline?: string | null;
	pilot?: boolean;
	country?: string | null;
	slug: string;
}

async function load(slug: string): Promise<OgPartner | null> {
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
			select: {
				name: true,
				partnerType: true,
				tagline: true,
				pilot: true,
				country: true,
				slug: true,
			},
		});
		return (res.docs[0] as OgPartner | undefined) ?? null;
	} catch {
		return null;
	}
}

export default async function Image({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const p = await load(slug);
	const name = p?.name ?? "Stellar Partners";
	const typeLabel = p ? (PARTNER_TYPE_LABELS[p.partnerType] ?? "Partner") : "";
	const tagline =
		p?.tagline ?? "A verified partner in the Stellar ecosystem directory.";
	const monogram = name.charAt(0).toUpperCase();

	return new ImageResponse(
		<div
			style={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				background: "#0a0a0a",
				color: "#fff",
				padding: "72px",
				fontFamily: "sans-serif",
			}}
		>
			{/* Top — brand + chips */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					width: "100%",
				}}
			>
				<div
					style={{
						fontSize: 18,
						letterSpacing: 4,
						textTransform: "uppercase",
						color: "#9ca3af",
						display: "flex",
					}}
				>
					stellarlight · partners
				</div>
				<div style={{ display: "flex", gap: 12 }}>
					{p?.pilot && <Chip>Featured</Chip>}
					{typeLabel && <Chip>{typeLabel}</Chip>}
					{p?.country && <Chip>{p.country}</Chip>}
				</div>
			</div>

			{/* Middle — monogram + name + tagline */}
			<div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
				<div
					style={{
						display: "flex",
						width: 96,
						height: 96,
						borderRadius: 20,
						background: "rgba(253,218,36,0.14)",
						border: "1px solid rgba(253,218,36,0.35)",
						alignItems: "center",
						justifyContent: "center",
						fontSize: 52,
						fontWeight: 700,
						color: "#FDDA24",
					}}
				>
					{monogram}
				</div>
				<div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
					<div
						style={{
							fontSize: 84,
							fontWeight: 700,
							lineHeight: 1.05,
							letterSpacing: -2,
							display: "flex",
						}}
					>
						{name}
					</div>
					<div
						style={{
							fontSize: 32,
							color: "#d1d5db",
							lineHeight: 1.35,
							maxWidth: "92%",
							display: "flex",
						}}
					>
						{tagline}
					</div>
				</div>
			</div>

			{/* Bottom — URL + accent square */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					width: "100%",
					fontSize: 22,
					color: "#9ca3af",
				}}
			>
				<div style={{ display: "flex" }}>
					{`stellarlight.xyz/partners/${slug}`}
				</div>
				<div
					style={{
						display: "flex",
						width: 14,
						height: 14,
						background: "#FDDA24",
						borderRadius: 3,
					}}
				/>
			</div>
		</div>,
		size,
	);
}

function Chip({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				padding: "8px 16px",
				borderRadius: 999,
				border: "1px solid #4b5563",
				background: "rgba(255,255,255,0.04)",
				fontSize: 18,
				color: "#d1d5db",
				textTransform: "uppercase",
				letterSpacing: 2,
			}}
		>
			{children}
		</div>
	);
}
