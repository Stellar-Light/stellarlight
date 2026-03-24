import type { Project } from "@/payload-types";
import { generateSlug } from "./normalize";

/**
 * Raw entry shape from Lumenloop YAML files
 */
export interface LumenloopEntry {
	title?: string;
	other_names?: string[] | null;
	parent?: string | null;
	description?: string | null;
	links?: {
		website?: string[];
		blog?: string[];
		x?: string[];
		linkedin?: string[];
		discord?: string[];
		telegram?: string[];
		youtube?: string[];
		instagram?: string[];
		reddit?: string[];
		tiktok?: string[];
		linktree?: string[];
		github?: string[];
	};
	attributes?: {
		category?: string | null;
		tags?: string[];
		operating_region?: string[];
		based_in?: string | null;
	};
	mainnet?: {
		tokens?: unknown[];
		contracts?: unknown[];
		audits?: unknown[];
	};
	scf?: {
		awarded_total?: number;
		awarded_round?: unknown[];
		submission_urls?: string[];
	};
}

/**
 * Mapped project data ready for Payload CMS
 */
export interface MappedProject {
	project: Partial<Project>;
	parentEntity: string | null;
	githubRepos: Array<{ owner: string; name: string }>;
}

/**
 * Map a raw Lumenloop YAML entry to Payload Projects format
 */
export function mapLumenloopEntry(
	rawEntry: LumenloopEntry,
	sourceId: string,
): MappedProject {
	const name = rawEntry.title || "";

	const mapped: Partial<Project> = {
		name,
		shortDescription: rawEntry.description?.trim() || "",
		category: mapCategory(rawEntry.attributes?.category),
		types: mapTypes(rawEntry.attributes?.tags || []),
		status: "Live", // Lumenloop entries are established projects
		verificationLevel: "Unverified",
		provenance: {
			source: "LumenloopSeed",
			sourceId,
			firstSeenAt: new Date().toISOString(),
		},
	} as any;

	// Map links - YAML has arrays of bare domains/handles
	mapped.links = {
		website: pickFirst(rawEntry.links?.website, "https://"),
		github: pickFirst(rawEntry.links?.github, "https://"),
		docs: undefined,
		twitter: mapTwitterHandle(rawEntry.links?.x),
		discord: pickFirst(rawEntry.links?.discord, "https://"),
	};

	// Extract GitHub repos from links.github URLs
	const githubRepos = extractGithubRepos(rawEntry.links?.github || []);

	// Set github.orgLogin if we can infer it
	if (githubRepos.length > 0) {
		const owners = [...new Set(githubRepos.map((r) => r.owner.toLowerCase()))];
		mapped.github = {
			orgLogin: owners.length === 1 ? owners[0] : undefined,
			repos: githubRepos,
		};
	}

	// Map onchain data (tokens/contracts are currently empty in the dataset)
	if (rawEntry.mainnet?.contracts && rawEntry.mainnet.contracts.length > 0) {
		mapped.onchain = {
			contracts: rawEntry.mainnet.contracts.map((c: unknown) => ({
				address: String(c),
			})),
		};
	}

	return {
		project: mapped,
		parentEntity: rawEntry.parent || null,
		githubRepos,
	};
}

/**
 * Pick first item from a URL array, optionally prefixing protocol
 */
function pickFirst(
	arr: string[] | undefined,
	prefix: string,
): string | undefined {
	if (!arr || arr.length === 0) return undefined;
	const val = arr[0].trim();
	if (!val) return undefined;
	// If already has protocol, return as-is
	if (val.startsWith("http://") || val.startsWith("https://")) return val;
	return `${prefix}${val}`;
}

/**
 * Map X/Twitter handles to full URLs
 */
function mapTwitterHandle(handles: string[] | undefined): string | undefined {
	if (!handles || handles.length === 0) return undefined;
	const handle = handles[0].trim();
	if (!handle) return undefined;
	// If it's already a URL
	if (handle.startsWith("http")) return handle;
	// If it includes domain already
	if (handle.includes("x.com") || handle.includes("twitter.com")) {
		return `https://${handle}`;
	}
	// It's just a handle
	return `https://x.com/${handle}`;
}

/**
 * Extract owner/name pairs from GitHub URLs like "github.com/org/repo"
 */
function extractGithubRepos(
	urls: string[],
): Array<{ owner: string; name: string }> {
	const repos: Array<{ owner: string; name: string }> = [];
	for (const url of urls) {
		const cleaned = url
			.replace(/^https?:\/\//, "")
			.replace(/^github\.com\//, "")
			.replace(/\/$/, "");
		const parts = cleaned.split("/").filter(Boolean);
		if (parts.length >= 2) {
			// Has specific repo: owner/repo
			repos.push({ owner: parts[0], name: parts[1] });
		}
		// If only org (e.g., "github.com/stellar"), we set orgLogin but no specific repo
	}
	return repos;
}

/**
 * Map Lumenloop categories to our schema categories
 */
function mapCategory(category: string | null | undefined): Project["category"] {
	if (!category) return "Infrastructure"; // default for null

	const cat = category.toLowerCase();

	if (cat.includes("application") || cat === "applications")
		return "User-Facing App";
	if (cat.includes("end-user")) return "User-Facing App";
	if (cat.includes("developer tool") || cat.includes("tooling"))
		return "Tooling";
	if (
		cat.includes("infrastructure") ||
		cat.includes("services") ||
		cat === "infrastructure & services"
	)
		return "Infrastructure";
	if (
		cat.includes("financial") ||
		cat.includes("protocol") ||
		cat.includes("defi")
	)
		return "Protocol/Contract";
	if (cat.includes("education") || cat.includes("community"))
		return "Infrastructure"; // closest match
	if (cat.includes("anchor")) return "Anchor";
	if (cat.includes("asset")) return "Asset";
	if (cat.includes("partner")) return "Partner Integration";

	return "Infrastructure"; // fallback
}

/**
 * Map Lumenloop tags to our types
 */
function mapTypes(
	tags: string[],
): Project["types"] {
	if (!tags || tags.length === 0) return undefined;

	const typeMap: Record<
		string,
		| "Wallet"
		| "DEX"
		| "Lending"
		| "Bridge"
		| "Payments"
		| "Anchor"
		| "SDK"
		| "Indexer"
		| "Explorer"
		| "Analytics"
		| "AI"
		| "Gaming"
		| "Education"
		| "Security"
		| "NFT"
		| "RWA"
	> = {
		wallet: "Wallet",
		"software wallet": "Wallet",
		"hardware wallet": "Wallet",
		dex: "DEX",
		amm: "DEX",
		lending: "Lending",
		"lending protocol": "Lending",
		borrowing: "Lending",
		bridge: "Bridge",
		"cross-chain": "Bridge",
		"payment rail": "Payments",
		payments: "Payments",
		"cross-border payments": "Payments",
		p2p: "Payments",
		anchor: "Anchor",
		sdk: "SDK",
		indexer: "Indexer",
		explorer: "Explorer",
		analytics: "Analytics",
		"data analytics": "Analytics",
		ai: "AI",
		"artificial intelligence": "AI",
		gaming: "Gaming",
		game: "Gaming",
		education: "Education",
		learn: "Education",
		security: "Security",
		audit: "Security",
		nft: "NFT",
		rwa: "RWA",
		"real world assets": "RWA",
		tokenization: "RWA",
	};

	type ValidType = typeof typeMap[keyof typeof typeMap];

	const mapped = tags
		.map((t) => typeMap[t.toLowerCase()])
		.filter(
			(t): t is ValidType => t !== undefined,
		);

	// Deduplicate
	const unique = [...new Set(mapped)];
	return unique.length > 0 ? unique : undefined;
}

/**
 * Extract a unique identifier from an entry (slug from title)
 */
export function extractEntryId(entry: LumenloopEntry): string {
	return generateSlug(entry.title || "unknown");
}
