import type { Project } from "@/payload-types";
import { normalizeUrl } from "./normalize";

/**
 * Map a raw project entry from Lumenloop repo to Payload Projects format
 * This is a pure function that transforms data structures
 */
export function mapLumenloopEntry(
	rawEntry: Record<string, unknown>,
	sourceId: string,
): Partial<Project> {
	const mapped: Partial<Project> = {
		name: String(rawEntry.name || rawEntry.title || ""),
		shortDescription: String(rawEntry.description || rawEntry.summary || ""),
		category: mapCategory(rawEntry.category || rawEntry.type),
		types: mapTypes(rawEntry.types || rawEntry.tags || []),
		status: mapStatus(rawEntry.status || rawEntry.stage),
		verificationLevel: "Unverified",
		provenance: {
			source: "LumenloopSeed",
			sourceId,
			firstSeenAt: rawEntry.firstSeenAt
				? new Date(String(rawEntry.firstSeenAt)).toISOString()
				: new Date().toISOString(),
		},
	} as any; // Payload types are complex, but data is validated

	// Map links
	if (rawEntry.links || rawEntry.urls) {
		const links = (rawEntry.links || rawEntry.urls) as Record<string, unknown>;
		mapped.links = {
			website:
				links.website || links.homepage
					? String(links.website || links.homepage)
					: undefined,
			github:
				links.github || links.repository
					? String(links.github || links.repository)
					: undefined,
			docs:
				links.docs || links.documentation
					? String(links.docs || links.documentation)
					: undefined,
			twitter: links.twitter ? String(links.twitter) : undefined,
			discord: links.discord ? String(links.discord) : undefined,
		};
	}

	// Map onchain data
	if (rawEntry.onchain || rawEntry.onChain) {
		const onchain = (rawEntry.onchain || rawEntry.onChain) as Record<
			string,
			unknown
		>;
		mapped.onchain = {
			assetCode: onchain.assetCode ? String(onchain.assetCode) : undefined,
			issuer: onchain.issuer ? String(onchain.issuer) : undefined,
			contracts: Array.isArray(onchain.contracts)
				? onchain.contracts.map((c: unknown) => ({ address: String(c) }))
				: undefined,
		};
	}

	return mapped;
}

function mapCategory(category: unknown): Project["category"] {
	const cat = String(category || "").toLowerCase();
	const categories: Project["category"][] = [
		"Infrastructure",
		"Tooling",
		"Partner Integration",
		"User-Facing App",
		"Asset",
		"Protocol/Contract",
		"Anchor",
	];

	// Simple mapping - could be enhanced
	if (cat.includes("infrastructure")) return "Infrastructure";
	if (cat.includes("tool")) return "Tooling";
	if (cat.includes("partner")) return "Partner Integration";
	if (cat.includes("app") || cat.includes("application"))
		return "User-Facing App";
	if (cat.includes("asset")) return "Asset";
	if (cat.includes("protocol") || cat.includes("contract"))
		return "Protocol/Contract";
	if (cat.includes("anchor")) return "Anchor";

	return "Infrastructure"; // default
}

function mapTypes(types: unknown): Project["types"] {
	if (!Array.isArray(types)) return undefined;
	const typeMap: Record<string, "Wallet" | "Anchor" | "Bridge" | "SDK" | "Payment Rail" | "DEX" | "Indexer" | "Explorer" | "Other"> = {
		wallet: "Wallet",
		anchor: "Anchor",
		bridge: "Bridge",
		sdk: "SDK",
		"payment rail": "Payment Rail",
		dex: "DEX",
		indexer: "Indexer",
		explorer: "Explorer",
		other: "Other",
	};

	const mapped = types
		.map((t) => {
			const key = String(t).toLowerCase();
			return typeMap[key] || typeMap[key.replace(/\s+/g, "")] || undefined;
		})
		.filter((t): t is "Wallet" | "Anchor" | "Bridge" | "SDK" | "Payment Rail" | "DEX" | "Indexer" | "Explorer" | "Other" => t !== undefined);
	
	return mapped.length > 0 ? mapped : undefined;
}

function mapStatus(status: unknown): Project["status"] {
	const stat = String(status || "").toLowerCase();
	if (stat.includes("development") || stat.includes("dev"))
		return "Development";
	if (stat.includes("pre-release") || stat.includes("beta"))
		return "Pre-Release";
	if (stat.includes("live") || stat.includes("production")) return "Live";
	return "Development"; // default
}

/**
 * Extract a unique identifier from an entry (normalized domain or slug)
 */
export function extractEntryId(
	entry: Record<string, unknown>,
	index: number,
): string {
	// Try to get domain from website URL
	if (entry.links || entry.urls) {
		const links = (entry.links || entry.urls) as Record<string, unknown>;
		const website = links.website || links.homepage;
		if (website) {
			const domain = normalizeUrl(String(website));
			if (domain) return domain;
		}
	}

	// Fallback to slug from name
	const name = String(entry.name || entry.title || `entry-${index}`);
	return name
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}
