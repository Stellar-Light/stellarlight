/**
 * DoraHacks API Integration
 *
 * Fetches hackathon data from DoraHacks for Stellar ecosystem organizations
 */

export interface DoraHacksOrganization {
	id: number;
	name: string;
	logo?: string;
}

export interface DoraHacksHackathon {
	id: number;
	title: string;
	uname: string;
	description?: string;
	image_url?: string;
	start_time: number; // Unix timestamp
	end_time: number; // Unix timestamp
	bonus_price: number; // Prize pool in USD
	hackers_count: number;
	winner_announced: boolean;
	status: number; // 1 = active, 2 = ended
	field?: string; // Comma-separated tags
	ecosystem?: string;
	organization?: DoraHacksOrganization;
}

export interface DoraHacksResponse {
	count: number;
	results: DoraHacksHackathon[];
}

// 2026-08: DoraHacks retired the legacy /api/hackathon/ + /api/hackathon-buidls/
// endpoints (404) in favor of /api/v1/hub/*, renaming organization_id→owner_id,
// start_time/end_time→timeline_start/timeline_end, field→tags, organization→
// owner, and dropping the status + vote_count fields entirely. Everything below
// maps the v1 hub shapes back onto the legacy interfaces so downstream
// consumers keep working unchanged.
const DORAHACKS_API_BASE = "https://dorahacks.io/api/v1/hub";
const STELLAR_ORG_IDS = [3096, 3853]; // SDF and Tellus

/**
 * Fetches hackathons from a specific DoraHacks organization, mapped to the
 * legacy `DoraHacksHackathon` shape. `status` no longer exists upstream and is
 * derived from `timeline_end` (past end = 2/ended, else 1/active).
 */
async function fetchOrgHackathons(
	orgId: number,
): Promise<DoraHacksHackathon[]> {
	try {
		const url = `${DORAHACKS_API_BASE}/hackathons?page=1&page_size=50&sort_by=-timeline_end&owner_id=${orgId}`;

		const response = await fetch(url, {
			headers: DORA_BROWSER_HEADERS,
			next: { revalidate: 3600 }, // Cache for 1 hour
		});

		if (!response.ok) {
			console.error(
				`Failed to fetch hackathons for org ${orgId}: ${response.status}`,
			);
			return [];
		}

		// biome-ignore lint/suspicious/noExplicitAny: external DoraHacks API shape
		const data: any = await response.json();
		// biome-ignore lint/suspicious/noExplicitAny: external DoraHacks API shape
		const rows: any[] = Array.isArray(data?.results) ? data.results : [];
		const now = Date.now() / 1000;
		return rows
			.filter((r) => typeof r?.id === "number")
			.map((r) => ({
				id: r.id,
				title: typeof r.title === "string" ? r.title : "Untitled",
				uname: typeof r.uname === "string" ? r.uname : String(r.id),
				image_url: typeof r.image_url === "string" ? r.image_url : undefined,
				start_time: typeof r.timeline_start === "number" ? r.timeline_start : 0,
				end_time: typeof r.timeline_end === "number" ? r.timeline_end : 0,
				bonus_price: typeof r.bonus_price === "number" ? r.bonus_price : 0,
				hackers_count:
					typeof r.hackers_count === "number" ? r.hackers_count : 0,
				winner_announced: !!r.winner_announced,
				status:
					typeof r.timeline_end === "number" && r.timeline_end <= now ? 2 : 1,
				field: typeof r.tags === "string" ? r.tags : undefined,
				ecosystem: typeof r.ecosystem === "string" ? r.ecosystem : undefined,
				organization:
					r.owner && typeof r.owner === "object"
						? { id: r.owner.id, name: r.owner.name, logo: r.owner.logo }
						: undefined,
			}));
	} catch (error) {
		console.error(`Error fetching hackathons for org ${orgId}:`, error);
		return [];
	}
}

/**
 * Fetches all Stellar hackathons from DoraHacks
 */
export async function fetchAllDoraHacksHackathons(): Promise<
	DoraHacksHackathon[]
> {
	// Fetch from both organizations in parallel
	const results = await Promise.allSettled(
		STELLAR_ORG_IDS.map((orgId) => fetchOrgHackathons(orgId)),
	);

	// Combine results from successful fetches
	const allHackathons = results
		.filter(
			(result): result is PromiseFulfilledResult<DoraHacksHackathon[]> =>
				result.status === "fulfilled",
		)
		.flatMap((result) => result.value);

	// Deduplicate by ID (in case same hackathon appears in both orgs)
	const uniqueHackathons = Array.from(
		new Map(allHackathons.map((h) => [h.id, h])).values(),
	);

	// Sort: active first (status === 1), then by end_time descending
	return uniqueHackathons.sort((a, b) => {
		if (a.status !== b.status) {
			return a.status === 1 ? -1 : 1; // Active hackathons first
		}
		return b.end_time - a.end_time; // Most recent first
	});
}

// Browser-like headers — the whole /api/v1/hub surface rejects short bot-style
// UAs with a 405 "Human Verification" page, so every DoraHacks call uses these.
const DORA_BROWSER_HEADERS = {
	Accept: "application/json",
	"Accept-Language": "en-US,en;q=0.9",
	Referer: "https://dorahacks.io/",
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

export interface DoraHacksSubmission {
	id: string;
	name: string;
	description: string | null;
	githubUrl: string | null;
	demoUrl: string | null;
	videoUrl: string | null;
	track: string | null;
	hackathonPlacement: string | null; // e.g. "1st Place" / "Winners" — null if not a winner
	award: string | null; // e.g. "Blend Composability Award"
	isWinner: boolean;
	voteCount: number;
	url: string;
	source: "dorahacks";
}

// Strip markdown noise (images, links, headings) from a DoraHacks project
// description and truncate to a usable snippet.
function cleanDescription(raw: unknown): string | null {
	if (typeof raw !== "string" || !raw) return null;
	const cleaned = raw
		.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/[#>*_`~]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	return cleaned ? cleaned.slice(0, 280) : null;
}

/**
 * Winner lookup for one hackathon: buidl id → prize name + award title, from
 * the /hackathon-winner-assignments announcement. The v1 hub API no longer puts
 * `winner_prizes` on buidl rows — this endpoint's `award_list[].prizes[]`
 * ("1st Place - $5,000 in XLM" → buidl ids) is where winners live now. Empty
 * map on any error or before winners are announced.
 */
async function fetchWinnerPrizeMap(
	uname: string,
): Promise<Map<number, { placement: string; award: string | null }>> {
	const map = new Map<number, { placement: string; award: string | null }>();
	try {
		const res = await fetch(
			`${DORAHACKS_API_BASE}/hackathon-winner-assignments?hackathon=${encodeURIComponent(uname)}`,
			{ headers: DORA_BROWSER_HEADERS, next: { revalidate: 3600 } },
		);
		if (!res.ok) return map;
		// biome-ignore lint/suspicious/noExplicitAny: external DoraHacks API shape
		const data: any = await res.json();
		// biome-ignore lint/suspicious/noExplicitAny: external DoraHacks API shape
		const awards: any[] = Array.isArray(data?.award_list) ? data.award_list : [];
		for (const a of awards) {
			for (const p of Array.isArray(a?.prizes) ? a.prizes : []) {
				for (const bid of Array.isArray(p?.buidls) ? p.buidls : []) {
					if (typeof bid === "number" && !map.has(bid)) {
						map.set(bid, {
							placement: typeof p?.name === "string" ? p.name : "Winner",
							award: typeof a?.title === "string" ? a.title : null,
						});
					}
				}
			}
		}
	} catch (err) {
		console.error(`Error fetching DoraHacks winners for ${uname}:`, err);
	}
	return map;
}

/**
 * Fetches the live submission ("buidl") roster for one DoraHacks hackathon.
 * The v1 hub buidls endpoint is keyed by numeric hackathon id (uname is still
 * needed for the winner-assignments join), and each row nests the project
 * under `buidl`. Read-through: returns [] on any error (feed down / WAF /
 * unknown id) so callers degrade gracefully.
 */
export async function fetchHackathonSubmissions(
	hackathon: Pick<DoraHacksHackathon, "id" | "uname">,
): Promise<DoraHacksSubmission[]> {
	const out: DoraHacksSubmission[] = [];
	try {
		const winners = await fetchWinnerPrizeMap(hackathon.uname);
		let page = 1;
		// Hard page cap — DoraHacks events are at most a few hundred submissions.
		for (let i = 0; i < 6; i++) {
			const url = `${DORAHACKS_API_BASE}/hackathons/${hackathon.id}/buidls?page=${page}&page_size=100`;
			const res = await fetch(url, {
				headers: DORA_BROWSER_HEADERS,
				next: { revalidate: 3600 },
			});
			if (!res.ok) break;
			// biome-ignore lint/suspicious/noExplicitAny: external DoraHacks API shape
			const data: any = await res.json();
			// biome-ignore lint/suspicious/noExplicitAny: external DoraHacks API shape
			const results: any[] = Array.isArray(data?.results) ? data.results : [];
			for (const s of results) {
				const b = s?.buidl;
				if (!b || typeof b.id !== "number") continue;
				const prize = winners.get(b.id) ?? null;
				const trackName = Array.isArray(s?.tracks)
					? (s.tracks.find(
							// biome-ignore lint/suspicious/noExplicitAny: external DoraHacks API shape
							(t: any) =>
								typeof t?.name === "string" && t.name !== "[DEFAULT_TRACK]",
						)?.name ?? null)
					: null;
				out.push({
					id: `dorahacks-buidl-${b.id}`,
					name: typeof b.name === "string" ? b.name : "Untitled",
					description: cleanDescription(b.vision),
					githubUrl:
						typeof b.github_url === "string" && b.github_url
							? b.github_url
							: null,
					demoUrl:
						typeof b.demo_url === "string" && b.demo_url ? b.demo_url : null,
					videoUrl:
						typeof b.demo_video_url === "string" && b.demo_video_url
							? b.demo_video_url
							: null,
					track: trackName,
					hackathonPlacement: prize ? prize.placement : null,
					award: prize?.award ?? null,
					isWinner: !!prize,
					// vote counts are no longer exposed by the v1 hub API
					voteCount: 0,
					url: `https://dorahacks.io/buidl/${b.id}`,
					source: "dorahacks",
				});
			}
			if (!data?.next) break;
			page += 1;
		}
	} catch (err) {
		console.error(
			`Error fetching DoraHacks submissions for ${hackathon.uname}:`,
			err,
		);
	}
	return out;
}

/** Parse a DoraHacks placement label ("1st Place - $5,000 in XLM") into a
 * sortable rank, a clean label, and the prize in USD. Non-ordinal placements
 * ("Track Winner", "Winner") sort after the numbered ones. */
export function parsePlacement(raw: string | null): {
	rank: number;
	label: string;
	prizeUsd: number;
} {
	if (!raw) return { rank: 99, label: "Winner", prizeUsd: 0 };
	const ord = raw.match(/^\s*(\d+)\s*(?:st|nd|rd|th)/i);
	const rank = ord ? Number(ord[1]) : 99;
	const label = raw.split(/\s+[-–]\s+/)[0].trim() || "Winner";
	const money = raw.match(/\$\s*([\d,]+)/);
	const prizeUsd = money ? Number(money[1].replace(/,/g, "")) : 0;
	return { rank, label, prizeUsd };
}

/** Shape the /hackathons "Recent Winners" highlight consumes. Kept structurally
 * identical to the curated fallback (src/data/recent-hackathon-winners.ts). */
export interface LiveRecentWinners {
	hackathonName: string;
	hackathonUname: string;
	endedAt: string; // YYYY-MM-DD
	totalPrizePool: number;
	winners: Array<{
		rank: number;
		placementLabel: string;
		projectName: string;
		description: string;
		prizeUsd: number;
		dorahacksBuidlUrl?: string;
	}>;
}

/**
 * Build the "Recent Winners" highlight LIVE from DoraHacks: the most-recent
 * ended hackathon whose winners are announced, with its ranked winners derived
 * from the winner-assignments prizes. This is what makes the highlight
 * auto-update the moment DoraHacks marks winners — no manual data edit. Returns
 * null if none resolve (the caller falls back to the curated constant), and
 * tries the two most-recent ended events in case the very newest hasn't
 * propagated its per-buidl prizes yet.
 */
export async function fetchLatestHackathonWinners(
	hackathons: DoraHacksHackathon[],
): Promise<LiveRecentWinners | null> {
	const ended = hackathons
		.filter((h) => h.status === 2 && h.winner_announced)
		.sort((a, b) => b.end_time - a.end_time);
	for (const h of ended.slice(0, 2)) {
		const subs = await fetchHackathonSubmissions(h);
		const winners = subs
			.filter((s) => s.isWinner)
			.map((s) => {
				const { rank, label, prizeUsd } = parsePlacement(s.hackathonPlacement);
				return {
					rank,
					placementLabel: label,
					projectName: s.name,
					description: s.description ?? "",
					prizeUsd,
					dorahacksBuidlUrl: s.url,
				};
			})
			.sort((a, b) => a.rank - b.rank);
		if (winners.length) {
			return {
				hackathonName: h.title,
				hackathonUname: h.uname,
				endedAt: new Date(h.end_time * 1000).toISOString().slice(0, 10),
				totalPrizePool:
					typeof h.bonus_price === "number" && h.bonus_price > 0
						? h.bonus_price
						: winners.reduce((sum, w) => sum + w.prizeUsd, 0),
				winners,
			};
		}
	}
	return null;
}

/**
 * Formats a Unix timestamp to a human-readable date
 */
export function formatDate(timestamp: number): string {
	const date = new Date(timestamp * 1000);
	return date.toLocaleDateString("en-US", {
		month: "long",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * Formats a Unix timestamp to a short date
 */
export function formatShortDate(timestamp: number): string {
	const date = new Date(timestamp * 1000);
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

/**
 * Formats prize amount to USD
 */
export function formatPrize(amount: number): string {
	return new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 0,
		maximumFractionDigits: 0,
	}).format(amount);
}

/**
 * Gets the DoraHacks hackathon URL
 */
export function getHackathonUrl(uname: string): string {
	return `https://dorahacks.io/hackathon/${uname}/detail`;
}

/**
 * Checks if a hackathon is currently active
 */
export function isHackathonActive(hackathon: DoraHacksHackathon): boolean {
	return hackathon.status === 1;
}

/**
 * Checks if a hackathon has ended
 */
export function isHackathonEnded(hackathon: DoraHacksHackathon): boolean {
	return hackathon.status === 2;
}

/**
 * Gets days remaining for active hackathon
 */
export function getDaysRemaining(endTime: number): number {
	const now = Date.now() / 1000; // Current time in seconds
	const remaining = endTime - now;
	return Math.ceil(remaining / (24 * 60 * 60));
}

/**
 * Parses field tags into an array (raw, no normalization).
 */
export function parseTags(field?: string): string[] {
	if (!field) return [];
	return field
		.split(",")
		.map((tag) => tag.trim())
		.filter(Boolean);
}

/**
 * Map of raw tag (lowercased) → canonical theme name.
 * Anything not in this map is dropped — keeps the theme list curated and
 * meaningful. Update this when new themes emerge.
 */
const THEME_ALIASES: Record<string, string> = {
	// AI cluster
	ai: "AI",
	claude: "AI",
	agents: "AI",
	openclaw: "AI",
	x402: "AI",
	llm: "AI",
	// DeFi cluster
	defi: "DeFi",
	"borrowing and lending": "DeFi",
	amms: "DeFi",
	amm: "DeFi",
	swaps: "DeFi",
	vaults: "DeFi",
	finance: "DeFi",
	// Wallets
	wallets: "Wallets",
	wallet: "Wallets",
	// ZK
	zk: "ZK",
	"zero knowledge": "ZK",
	noir: "ZK",
	"risc zero": "ZK",
	// Categories
	gaming: "Gaming",
	oracle: "Oracles",
	oracles: "Oracles",
	memes: "Memes",
	sustainability: "Sustainability",
	"ui/ux": "UI/UX",
	composability: "Composability",
	rwa: "RWA",
	// Languages worth keeping
	rust: "Rust",
};

/**
 * Tags we explicitly drop because they're noise or too generic to be useful
 * as themes (every Stellar hackathon involves Stellar / Soroban / blockchain).
 */
const DROP_TAGS = new Set([
	"stellar",
	"soroban",
	"blockchain",
	"crypto",
	"web3",
	"smart contracts",
	"smart contract",
	"tooling",
	"ideathon",
	"students",
	"universities",
	"latam",
	"pitch",
	"ideas",
	"content",
	"javascript",
	"python",
]);

/**
 * Parse + normalize a hackathon's tags into a deduplicated list of canonical
 * theme names. Filters out noise (Stellar, Soroban, Blockchain, etc.) and
 * consolidates synonyms (Claude/AI/Agents → AI, Defi/Defi → DeFi, etc.).
 */
export function parseThemes(field?: string): string[] {
	const raw = parseTags(field);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const tag of raw) {
		const key = tag.toLowerCase().trim();
		if (DROP_TAGS.has(key)) continue;
		const canonical = THEME_ALIASES[key];
		if (!canonical) continue; // unknown tag → drop
		if (seen.has(canonical)) continue;
		seen.add(canonical);
		out.push(canonical);
	}
	return out;
}
