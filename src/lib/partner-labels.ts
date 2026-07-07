/**
 * Shared partner display labels — plain constants (NO "use client"), so both
 * the server components (/partners page, /partners/[slug]) and the client
 * components (partners-directory, partner-concierge-chat) import the SAME maps.
 * Kills the 3× duplication and keeps casing Title-Case site-wide.
 */

export const PARTNER_TYPE_LABELS: Record<string, string> = {
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

export const SECTOR_LABELS: Record<string, string> = {
	defi: "DeFi",
	payments: "Payments",
	rwa: "RWA",
	stablecoins: "Stablecoins",
	identity: "Identity",
	data: "Data",
	ai: "AI",
	gaming: "Gaming",
	other: "Other",
};

export const REGION_LABELS: Record<string, string> = {
	global: "Global",
	"north-america": "North America",
	latam: "LatAm",
	europe: "Europe",
	africa: "Africa",
	mena: "MENA",
	asia: "Asia",
	oceania: "Oceania",
};

export const RAMP_LABELS: Record<string, string> = {
	"on-ramp": "On-ramp",
	"off-ramp": "Off-ramp",
};

export const SEP_LABELS: Record<string, string> = {
	"sep-6": "SEP-6",
	"sep-24": "SEP-24",
	"sep-31": "SEP-31",
};

/** Non-fresh freshness → a short Title-Case pill label (fresh renders nothing). */
export const FRESHNESS_LABELS: Record<string, string> = {
	aging: "Aging",
	stale: "Stale",
	archived: "Archived",
};

/** Freshness → text color class (shared by card + profile). */
export const FRESHNESS_COLOR: Record<string, string> = {
	fresh: "text-emerald-400/90",
	aging: "text-yellow-400/90",
	stale: "text-orange-400/90",
	archived: "text-red-400/90",
};

/**
 * "Pairs well with" — for a partner of a given type, the complementary partner
 * types a team integrating them would also need (in priority order). Powers
 * partner-to-partner discovery on the profile page: viewing an anchor surfaces
 * the audit / legal / infra partners that round out the stack. Deliberately
 * asymmetric — an anchor needs an audit firm; an audit firm's "customers" are
 * protocols/infra, not other anchors.
 */
export const COMPLEMENTARY_TYPES: Record<string, string[]> = {
	anchor: ["audit-firm", "legal", "infrastructure", "wallet"],
	"on-off-ramp": ["audit-firm", "legal", "infrastructure", "wallet"],
	infrastructure: ["audit-firm", "protocol", "tooling"],
	tooling: ["audit-firm", "infrastructure", "agency"],
	protocol: ["audit-firm", "legal", "infrastructure", "wallet"],
	wallet: ["anchor", "on-off-ramp", "infrastructure"],
	"audit-firm": ["protocol", "infrastructure", "tooling"],
	legal: ["anchor", "on-off-ramp", "protocol"],
	agency: ["tooling", "infrastructure", "audit-firm"],
	other: ["infrastructure", "audit-firm", "tooling"],
};

/** Plural type label for section headers ("Other anchors", "audit firms"). */
export const PARTNER_TYPE_PLURAL: Record<string, string> = {
	anchor: "anchors",
	"on-off-ramp": "on/off ramps",
	infrastructure: "infrastructure providers",
	tooling: "tooling partners",
	protocol: "protocols",
	wallet: "wallets",
	"audit-firm": "audit firms",
	legal: "legal partners",
	agency: "agencies",
	other: "partners",
};

export const typeLabel = (t: string) => PARTNER_TYPE_LABELS[t] ?? t;
export const typePlural = (t: string) => PARTNER_TYPE_PLURAL[t] ?? "partners";
export const sectorLabel = (s: string) => SECTOR_LABELS[s] ?? s;
export const regionLabel = (r: string) => REGION_LABELS[r] ?? r;
export const rampLabel = (r: string) => RAMP_LABELS[r] ?? r;
export const sepLabel = (s: string) => SEP_LABELS[s] ?? s;
