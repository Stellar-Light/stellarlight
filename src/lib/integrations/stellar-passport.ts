/**
 * Stellar Passport API Integration
 * 
 * This module provides functions to interact with the Stellar Passport API
 * for fetching and syncing builder profiles.
 */

export interface PassportBuilder {
  github_username: string | null;
  avatar_url: string | null;
  display_name: string;
  bio: string | null;
  role_title: string | null;
  location: string | null;
  website_url: string | null;
  twitter_handle: string | null;
  telegram_handle: string | null;
  discord_handle: string | null;
  stellar_address: string | null;
  is_featured: boolean;
  created_at: string;
  github_id?: string;
  discord_username?: string;
  scf_tier?: string;
  visibility?: string;
  projects: PassportProject[];
  stats: PassportStats;
}

export interface PassportProject {
  name: string;
  slug: string;
  short_description: string | null;
  status: 'building' | 'live' | 'deprecated';
  tags: string[];
  website_url: string | null;
  demo_url: string | null;
  docs_url: string | null;
  contract_address: string | null;
  repos: PassportRepo[];
  heatmap: PassportHeatmap[];
}

export interface PassportRepo {
  full_name: string;
  html_url: string;
  primary_language: string | null;
  stars: number;
  forks: number;
  description: string | null;
}

export interface PassportHeatmap {
  date: string;
  commit_count: number;
}

export interface PassportStats {
  totalCommits30d: number;
  activeDays30d: number;
  lastActiveDate: string | null;
}

export interface PassportApiResponse {
  builders: PassportBuilder[];
}

export interface PassportSingleBuilderResponse {
  builder: PassportBuilder;
  projects: PassportProject[];
  stats: PassportStats;
}

const PASSPORT_API_BASE = 'https://demo.stellarpassport.xyz/api/v1';

/**
 * Fetches all builder profiles from the Stellar Passport API
 */
export async function fetchAllBuilders(): Promise<PassportBuilder[]> {
  const apiKey = process.env.STELLAR_PASSPORT;
  
  if (!apiKey) {
    throw new Error('STELLAR_PASSPORT API key not configured');
  }

  try {
    const response = await fetch(`${PASSPORT_API_BASE}/profiles`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch builders: ${response.status} ${response.statusText}`);
    }

    const data: PassportApiResponse = await response.json();
    return data.builders || [];
  } catch (error) {
    console.error('Error fetching builders from Stellar Passport:', error);
    throw error;
  }
}

/**
 * Fetches a single builder profile by username
 */
export async function fetchBuilder(username: string): Promise<PassportBuilder | null> {
  const apiKey = process.env.STELLAR_PASSPORT;
  
  if (!apiKey) {
    throw new Error('STELLAR_PASSPORT API key not configured');
  }

  try {
    const response = await fetch(`${PASSPORT_API_BASE}/profiles/${username}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch builder ${username}: ${response.status} ${response.statusText}`);
    }

    const data: PassportSingleBuilderResponse = await response.json();
    return {
      ...data.builder,
      projects: data.projects || [],
      stats: data.stats || { totalCommits30d: 0, activeDays30d: 0, lastActiveDate: null },
    };
  } catch (error) {
    console.error(`Error fetching builder ${username}:`, error);
    throw error;
  }
}

/**
 * Transforms Passport builder data to Payload CMS format
 */
export function transformBuilderForPayload(builder: PassportBuilder) {
  return {
    github_username: builder.github_username || '',
    display_name: builder.display_name,
    avatar_url: builder.avatar_url || '',
    bio: builder.bio || '',
    role_title: builder.role_title || '',
    location: builder.location || '',
    website_url: builder.website_url || '',
    twitter_handle: builder.twitter_handle || '',
    telegram_handle: builder.telegram_handle || '',
    discord_handle: builder.discord_handle || '',
    stellar_address: builder.stellar_address || '',
    is_featured: builder.is_featured || false,
    github_id: builder.github_id || '',
    discord_username: builder.discord_username || '',
    scf_tier: builder.scf_tier || '',
    visibility: (builder.visibility || 'public') as 'public' | 'private',
    projects: (builder.projects || []).map(project => ({
      name: project.name,
      slug: project.slug,
      short_description: project.short_description || '',
      status: project.status || 'building',
      website_url: project.website_url || '',
      demo_url: project.demo_url || '',
      docs_url: project.docs_url || '',
      contract_address: project.contract_address || '',
      repos: (project.repos || []).map(repo => ({
        full_name: repo.full_name,
        html_url: repo.html_url,
        primary_language: repo.primary_language || '',
        stars: repo.stars || 0,
        forks: repo.forks || 0,
        description: repo.description || '',
      })),
      heatmap: project.heatmap || [],
    })),
    stats: {
      totalCommits30d: builder.stats?.totalCommits30d || 0,
      activeDays30d: builder.stats?.activeDays30d || 0,
      lastActiveDate: builder.stats?.lastActiveDate || '',
    },
    passport_created_at: builder.created_at,
    last_synced: new Date().toISOString(),
  };
}

/**
 * Fetches featured builders (those with is_featured = true)
 */
export async function fetchFeaturedBuilders(): Promise<PassportBuilder[]> {
  const allBuilders = await fetchAllBuilders();
  return allBuilders.filter(builder => builder.is_featured);
}

/**
 * Fetches builders with recent activity
 */
export async function fetchActiveBuilders(limit: number = 10): Promise<PassportBuilder[]> {
  const allBuilders = await fetchAllBuilders();
  
  // Sort by recent activity (commits in last 30 days and active days)
  return allBuilders
    .filter(builder => builder.stats?.totalCommits30d > 0)
    .sort((a, b) => {
      const aScore = (a.stats?.totalCommits30d || 0) + (a.stats?.activeDays30d || 0);
      const bScore = (b.stats?.totalCommits30d || 0) + (b.stats?.activeDays30d || 0);
      return bScore - aScore;
    })
    .slice(0, limit);
}