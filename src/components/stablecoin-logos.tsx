"use client";

/**
 * Bundled issuer/token logos for the stablecoin explorer — the eight marks
 * the original explorer shipped as local assets (re-labelled by sight on
 * 2026-08-22; the FxDAO penguin was deliberately not carried over). Used as
 * the fallback when an issuer's stellar.toml serves no usable image, which is
 * the case for USDC and PYUSD.
 */

export const ISSUER_LOGOS: Record<string, string> = {
	Circle: "/stablecoins/logos/circle.png",
	"PayPal / Paxos": "/stablecoins/logos/paypal.png",
	"GMO Trust": "/stablecoins/logos/gmo-trust.png",
	Stasis: "/stablecoins/logos/stasis.png",
	"Novatti Group": "/stablecoins/logos/novatti.png",
	"Ondo Finance": "/stablecoins/logos/ondo.png",
};

export const TOKEN_LOGOS: Record<string, string> = {
	// Circle's stellar.toml serves no usable image, so USDC and EURC fell
	// through to the ISSUER mark — the Circle logo on both, which reads as
	// "Circle" twice instead of as two distinct assets. These are the tokens'
	// own marks.
	USDC: "/stablecoins/logos/usdc.png",
	EURC: "/stablecoins/logos/eurc.png",
	PYUSD: "/stablecoins/logos/pyusd.png",
	USDY: "/stablecoins/logos/usdy.png",
};

/** Favicon for an issuer domain — the last resort before a letter tile. */
export function faviconFor(domain: string | null | undefined): string | null {
	const d = (domain ?? "")
		.trim()
		.replace(/^https?:\/\//, "")
		.split("/")[0];
	return d ? `https://icons.duckduckgo.com/ip3/${d}.ico` : null;
}

const SIZES = { sm: "w-6 h-6", md: "w-10 h-10", lg: "w-14 h-14" } as const;

export function IssuerLogo({
	company,
	domain,
	size = "md",
}: {
	company: string;
	domain?: string | null;
	size?: keyof typeof SIZES;
}) {
	const src = ISSUER_LOGOS[company] ?? faviconFor(domain);
	if (src)
		return (
			<div
				className={`${SIZES[size]} flex-shrink-0 rounded-full overflow-hidden bg-white/5 border border-white/10 flex items-center justify-center`}
			>
				{/* biome-ignore lint/performance/noImgElement: bundled or issuer-hosted mark */}
				<img
					src={src}
					alt={company}
					className="w-full h-full object-cover"
					onError={(e) => {
						(e.currentTarget as HTMLImageElement).style.display = "none";
					}}
				/>
			</div>
		);
	return (
		<div
			className={`${SIZES[size]} flex-shrink-0 rounded-full bg-[#262626] flex items-center justify-center`}
		>
			<span className="text-[#999999] text-xs font-medium">
				{company.charAt(0)}
			</span>
		</div>
	);
}
