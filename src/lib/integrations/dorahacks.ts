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

const DORAHACKS_API_BASE = 'https://dorahacks.io/api';
const STELLAR_ORG_IDS = [3096, 3853]; // SDF and Tellus

/**
 * Fetches hackathons from a specific DoraHacks organization
 */
async function fetchOrgHackathons(orgId: number): Promise<DoraHacksHackathon[]> {
  try {
    const url = `${DORAHACKS_API_BASE}/hackathon/?organization_id=${orgId}&page=1&page_size=50&sort_by=-end_time`;
    
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'Referer': 'https://dorahacks.io/org/stellar',
        'User-Agent': 'Mozilla/5.0 (compatible; StellarLight/1.0)',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      console.error(`Failed to fetch hackathons for org ${orgId}: ${response.status}`);
      return [];
    }

    const data: DoraHacksResponse = await response.json();
    return data.results || [];
  } catch (error) {
    console.error(`Error fetching hackathons for org ${orgId}:`, error);
    return [];
  }
}

/**
 * Fetches all Stellar hackathons from DoraHacks
 */
export async function fetchAllDoraHacksHackathons(): Promise<DoraHacksHackathon[]> {
  // Fetch from both organizations in parallel
  const results = await Promise.allSettled(
    STELLAR_ORG_IDS.map(orgId => fetchOrgHackathons(orgId))
  );

  // Combine results from successful fetches
  const allHackathons = results
    .filter((result): result is PromiseFulfilledResult<DoraHacksHackathon[]> => 
      result.status === 'fulfilled'
    )
    .flatMap(result => result.value);

  // Deduplicate by ID (in case same hackathon appears in both orgs)
  const uniqueHackathons = Array.from(
    new Map(allHackathons.map(h => [h.id, h])).values()
  );

  // Sort: active first (status === 1), then by end_time descending
  return uniqueHackathons.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 1 ? -1 : 1; // Active hackathons first
    }
    return b.end_time - a.end_time; // Most recent first
  });
}

/**
 * Formats a Unix timestamp to a human-readable date
 */
export function formatDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats a Unix timestamp to a short date
 */
export function formatShortDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Formats prize amount to USD
 */
export function formatPrize(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
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
  return field.split(',').map(tag => tag.trim()).filter(Boolean);
}

/**
 * Map of raw tag (lowercased) → canonical theme name.
 * Anything not in this map is dropped — keeps the theme list curated and
 * meaningful. Update this when new themes emerge.
 */
const THEME_ALIASES: Record<string, string> = {
  // AI cluster
  ai: 'AI',
  claude: 'AI',
  agents: 'AI',
  openclaw: 'AI',
  x402: 'AI',
  llm: 'AI',
  // DeFi cluster
  defi: 'DeFi',
  'borrowing and lending': 'DeFi',
  amms: 'DeFi',
  amm: 'DeFi',
  swaps: 'DeFi',
  vaults: 'DeFi',
  finance: 'DeFi',
  // Wallets
  wallets: 'Wallets',
  wallet: 'Wallets',
  // ZK
  zk: 'ZK',
  'zero knowledge': 'ZK',
  noir: 'ZK',
  'risc zero': 'ZK',
  // Categories
  gaming: 'Gaming',
  oracle: 'Oracles',
  oracles: 'Oracles',
  memes: 'Memes',
  sustainability: 'Sustainability',
  'ui/ux': 'UI/UX',
  composability: 'Composability',
  rwa: 'RWA',
  // Languages worth keeping
  rust: 'Rust',
};

/**
 * Tags we explicitly drop because they're noise or too generic to be useful
 * as themes (every Stellar hackathon involves Stellar / Soroban / blockchain).
 */
const DROP_TAGS = new Set([
  'stellar',
  'soroban',
  'blockchain',
  'crypto',
  'web3',
  'smart contracts',
  'smart contract',
  'tooling',
  'ideathon',
  'students',
  'universities',
  'latam',
  'pitch',
  'ideas',
  'content',
  'javascript',
  'python',
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