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
	"Tether (USDT0)": "/stablecoins/logos/usdt0.png",
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
	// 2026-09-02, owner-supplied: the flat square USDT0 mark. The issuer's
	// toml image (the round coin, on IPFS) still wins when it loads; this is
	// the bundled fallback when it does not.
	USDT0: "/stablecoins/logos/usdt0.png",
};

/**
 * Issuers whose asset domain is a SUBDOMAIN that serves no favicon.
 * MoneyGram publishes MGUSD's toml at mgusd.moneygram.com, and the icon
 * service 404s that host while moneygram.com resolves — so without this the
 * Top Issuers row for a real, verified issuer falls to a letter tile.
 */
const ISSUER_ICON_DOMAINS: Record<string, string> = {
	MoneyGram: "moneygram.com",
	"Currency One": "currency.one",
};

/** Favicon for an issuer domain — the last resort before a letter tile. */
export function faviconFor(domain: string | null | undefined): string | null {
	const d = (domain ?? "")
		.trim()
		.replace(/^https?:\/\//, "")
		.split("/")[0];
	return d ? `https://icons.duckduckgo.com/ip3/${d}.ico` : null;
}

const SIZES = {
	sm: "w-6 h-6",
	tile: "w-9 h-9",
	md: "w-10 h-10",
	lg: "w-14 h-14",
} as const;

export function IssuerLogo({
	company,
	domain,
	size = "md",
}: {
	company: string;
	domain?: string | null;
	size?: keyof typeof SIZES;
}) {
	const src =
		ISSUER_LOGOS[company] ?? faviconFor(ISSUER_ICON_DOMAINS[company] ?? domain);
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

/**
 * DeFi venue marks. Blend, Aquarius and Soroswap serve a real favicon, so the
 * shared favicon helper is enough — no invented brand art. SDEX is the network
 * itself and ships as a local asset; Phoenix serves no favicon, so it falls
 * through to the letter tile rather than showing a broken image.
 */
const VENUE_DOMAINS: Record<string, string> = {
	Blend: "blend.capital",
	"Fixed Pool": "blend.capital",
	"YieldBlox Pool": "blend.capital",
	Aquarius: "aqua.network",
	Aqua: "aqua.network",
	Soroswap: "soroswap.finance",
};

const VENUE_ASSETS: Record<string, string> = {
	SDEX: "/stellar-xlm-logo.png",
	Sushi: "/defi/sushi.png",
};

/**
 * Marks that are dark ink on transparency. The venue tile is dark, so these
 * vanish into it — the Stellar mark rendered as an empty black square until
 * this existed. They get a light backing, which is how the brand ships the
 * mark anyway.
 */
const VENUE_MARKS_NEED_LIGHT_BACKING = new Set(["SDEX"]);

export function VenueLogo({
	name,
	size = "tile",
}: {
	name: string;
	size?: keyof typeof SIZES;
}) {
	const src = VENUE_ASSETS[name] ?? faviconFor(VENUE_DOMAINS[name]);
	if (src)
		return (
			<div
				className={`${SIZES[size]} flex-shrink-0 rounded-lg overflow-hidden border border-white/10 flex items-center justify-center ${
					VENUE_MARKS_NEED_LIGHT_BACKING.has(name) ? "bg-white p-1" : "bg-white/5"
				}`}
			>
				{/* biome-ignore lint/performance/noImgElement: bundled or venue-hosted mark */}
				<img
					src={src}
					alt={name}
					className="w-full h-full object-contain"
					onError={(e) => {
						(e.currentTarget as HTMLImageElement).style.display = "none";
					}}
				/>
			</div>
		);
	return (
		<div
			className={`${SIZES[size]} flex-shrink-0 rounded-lg bg-[#262626] flex items-center justify-center`}
		>
			<span className="text-[#999999] text-xs font-medium">
				{name.charAt(0)}
			</span>
		</div>
	);
}
