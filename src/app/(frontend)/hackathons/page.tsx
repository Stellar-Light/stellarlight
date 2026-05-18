import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  fetchAllDoraHacksHackathons,
  formatShortDate,
  formatPrize,
  getHackathonUrl,
  isHackathonActive,
  getDaysRemaining,
  parseTags,
} from "@/lib/integrations/dorahacks";
import { getPayloadSafe } from "@/lib/payload-client";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Calendar,
  ExternalLink,
  Building2,
  Code2,
  Trophy,
  Users,
  Clock,
  DollarSign,
} from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Hackathons | Stellar Light",
  description: "Active and past hackathons in the Stellar ecosystem",
};

/**
 * Normalize a hackathon name to a comparable key so we can match a DoraHacks
 * entry to a curated Payload Hackathon (which has its own slug + tracks
 * post-hackathon project status).
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface CuratedHackathon {
  id: string;
  name: string;
  slug: string;
  trackedProjectCount: number;
}

interface CuratedData {
  byName: Map<string, CuratedHackathon>;
  trackedProjectsTotal: number;
  builtCount: number;
  inProgressCount: number;
  abandonedCount: number;
}

async function fetchCuratedHackathons(): Promise<CuratedData> {
  const byName = new Map<string, CuratedHackathon>();
  const data: CuratedData = {
    byName,
    trackedProjectsTotal: 0,
    builtCount: 0,
    inProgressCount: 0,
    abandonedCount: 0,
  };

  const payload = await getPayloadSafe();
  if (!payload) return data;

  try {
    const result = await payload.find({
      collection: "hackathons",
      limit: 200,
      depth: 0,
    });

    for (const h of result.docs as any[]) {
      let count = 0;
      try {
        const projRes = await payload.find({
          collection: "projects",
          where: { hackathon: { equals: h.id } },
          limit: 0,
          depth: 0,
        });
        count = projRes.totalDocs ?? 0;
      } catch {
        // ignore
      }
      byName.set(normalizeForMatch(h.name), {
        id: String(h.id),
        name: h.name,
        slug: h.slug,
        trackedProjectCount: count,
      });
    }

    // Cross-hackathon status counts for the global funnel.
    const all = await payload.find({
      collection: "projects",
      where: {
        hackathon: { exists: true },
      },
      limit: 0,
      depth: 0,
    });
    data.trackedProjectsTotal = all.totalDocs ?? 0;

    for (const status of ["Built", "In Progress", "Abandoned"] as const) {
      try {
        const res = await payload.find({
          collection: "projects",
          where: {
            and: [
              { hackathon: { exists: true } },
              { hackathonStatus: { equals: status } },
            ],
          },
          limit: 0,
          depth: 0,
        });
        const n = res.totalDocs ?? 0;
        if (status === "Built") data.builtCount = n;
        else if (status === "In Progress") data.inProgressCount = n;
        else if (status === "Abandoned") data.abandonedCount = n;
      } catch {
        // ignore
      }
    }
  } catch (err) {
    console.error("fetchCuratedHackathons error:", err);
  }
  return data;
}

interface HackathonsPageProps {
  searchParams: Promise<{ year?: string; org?: string }>;
}

export default async function HackathonsPage({ searchParams }: HackathonsPageProps) {
  const params = await searchParams;
  const filterYear = params.year && params.year !== "all" ? params.year : null;
  const filterOrg = params.org && params.org !== "all" ? params.org : null;

  const [hackathons, curatedData] = await Promise.all([
    fetchAllDoraHacksHackathons(),
    fetchCuratedHackathons(),
  ]);
  const curatedMap = curatedData.byName;
  const activeHackathons = hackathons.filter((h) => isHackathonActive(h));
  let pastHackathons = hackathons.filter((h) => !isHackathonActive(h));

  // Build the set of distinct years and organizers from past hackathons (for filter UI).
  const years = Array.from(
    new Set(
      pastHackathons.map((h) => new Date(h.end_time * 1000).getFullYear()),
    ),
  ).sort((a, b) => b - a);
  const organizers = Array.from(
    new Set(
      pastHackathons
        .map((h) => h.organization?.name)
        .filter((n): n is string => Boolean(n)),
    ),
  ).sort();

  if (filterYear) {
    pastHackathons = pastHackathons.filter(
      (h) => String(new Date(h.end_time * 1000).getFullYear()) === filterYear,
    );
  }
  if (filterOrg) {
    pastHackathons = pastHackathons.filter(
      (h) => h.organization?.name === filterOrg,
    );
  }

  const findCurated = (title: string) => curatedMap.get(normalizeForMatch(title));

  // Cross-hackathon aggregate stats.
  const totalHackathons = hackathons.length;
  const totalPrizePool = hackathons.reduce(
    (sum, h) => sum + (typeof h.bonus_price === "number" ? h.bonus_price : 0),
    0,
  );
  const totalParticipants = hackathons.reduce(
    (sum, h) => sum + (typeof h.hackers_count === "number" ? h.hackers_count : 0),
    0,
  );
  const trackedStatusTotal =
    curatedData.builtCount +
    curatedData.inProgressCount +
    curatedData.abandonedCount;
  const shippedPct =
    trackedStatusTotal > 0
      ? Math.round(
          ((curatedData.builtCount + curatedData.inProgressCount) /
            trackedStatusTotal) *
            100,
        )
      : null;

  return (
    <div className="min-h-screen relative">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
          <span className="text-sm font-medium">Back to Home</span>
        </Link>

        <div className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <Code2 className="w-8 h-8 text-[#FDDA24]" />
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
              Stellar Hackathons
            </h1>
          </div>
          <p className="text-muted-foreground">
            Build the future of finance on Stellar — every hackathon tracked
            through to whether the projects actually shipped.
          </p>
        </div>

        {/* Cross-hackathon stats banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <StatBlock
            label="Hackathons tracked"
            value={totalHackathons.toString()}
          />
          <StatBlock
            label="Total prize pool"
            value={
              totalPrizePool >= 1_000_000
                ? `$${(totalPrizePool / 1_000_000).toFixed(1)}M`
                : `$${Math.round(totalPrizePool / 1000)}K`
            }
          />
          <StatBlock
            label="Hackers participated"
            value={
              totalParticipants >= 1000
                ? `${(totalParticipants / 1000).toFixed(1)}K`
                : totalParticipants.toString()
            }
          />
          <StatBlock
            label="Projects tracked"
            value={curatedData.trackedProjectsTotal.toString()}
            sub={
              shippedPct !== null
                ? `${shippedPct}% still building`
                : "post-hackathon outcomes"
            }
          />
        </div>

        {/* Active Hackathons */}
        {activeHackathons.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <h2 className="text-2xl font-bold">Open for Submissions</h2>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                {activeHackathons.length} Active
              </Badge>
            </div>

            <div className="space-y-6">
              {activeHackathons.map((hackathon) => {
                const daysRemaining = getDaysRemaining(hackathon.end_time);
                const tags = parseTags(hackathon.field);

                return (
                  <a
                    key={hackathon.id}
                    href={getHackathonUrl(hackathon.uname)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <div className="rounded-xl border border-primary/30 bg-card overflow-hidden hover:border-primary/60 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300">
                      {/* Banner — full width, aspect-ratio for consistency */}
                      {hackathon.image_url && (
                        <div className="relative w-full aspect-[3/1] sm:aspect-[4/1] overflow-hidden">
                          <Image
                            src={hackathon.image_url}
                            alt={hackathon.title}
                            fill
                            className="object-cover group-hover:scale-[1.02] transition-transform duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                          <Badge className="absolute top-3 right-3 bg-green-500 text-white border-0 shadow-md">
                            OPEN
                          </Badge>
                        </div>
                      )}

                      <div className="p-5 sm:p-6">
                        {/* Title + Org */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-4">
                          <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors">
                            {hackathon.title}
                          </h3>
                          {hackathon.organization && (
                            <div className="flex items-center gap-1.5 text-sm text-muted-foreground flex-shrink-0">
                              {hackathon.organization.logo && (
                                <Image
                                  src={hackathon.organization.logo}
                                  alt={hackathon.organization.name}
                                  width={16}
                                  height={16}
                                  className="rounded-full"
                                />
                              )}
                              <span>{hackathon.organization.name}</span>
                            </div>
                          )}
                        </div>

                        {/* Stats row — wraps naturally on mobile */}
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm mb-4">
                          <span className="flex items-center gap-1.5">
                            <DollarSign className="w-4 h-4 text-[#FDDA24]" />
                            <span className="font-semibold text-foreground">
                              {formatPrize(hackathon.bonus_price)}
                            </span>
                          </span>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Clock className="w-4 h-4" />
                            {daysRemaining > 0
                              ? `${daysRemaining} days left`
                              : "Ending soon"}
                          </span>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Users className="w-4 h-4" />
                            {hackathon.hackers_count} participants
                          </span>
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="w-4 h-4" />
                            Ends {formatShortDate(hackathon.end_time)}
                          </span>
                        </div>

                        {/* Tags */}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {tags.slice(0, 6).map((tag, i) => (
                              <span
                                key={i}
                                className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-white/10 text-foreground border border-border"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {/* Empty active state */}
        {activeHackathons.length === 0 && (
          <div className="mb-16 py-16 text-center rounded-xl border border-border/50 bg-card">
            <Code2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">
              No active hackathons right now — check back soon
            </p>
          </div>
        )}

        {/* Past Hackathons */}
        <section>
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="text-2xl font-bold text-foreground">
              Past Hackathons
            </h2>
            <span className="text-sm text-muted-foreground">
              {pastHackathons.length}{" "}
              {pastHackathons.length === 1 ? "result" : "results"}
            </span>
          </div>

          {/* Filters */}
          {(years.length > 0 || organizers.length > 0) && (
            <div className="mb-6 flex flex-wrap items-center gap-3">
              {years.length > 1 && (
                <FilterDropdown
                  paramKey="year"
                  current={filterYear}
                  options={[
                    { value: "all", label: "All years" },
                    ...years.map((y) => ({ value: String(y), label: String(y) })),
                  ]}
                  buttonLabel={filterYear ?? "All years"}
                  preserve={{ org: filterOrg ?? undefined }}
                />
              )}
              {organizers.length > 1 && (
                <FilterDropdown
                  paramKey="org"
                  current={filterOrg}
                  options={[
                    { value: "all", label: "All organizers" },
                    ...organizers.map((o) => ({ value: o, label: o })),
                  ]}
                  buttonLabel={filterOrg ?? "All organizers"}
                  preserve={{ year: filterYear ?? undefined }}
                />
              )}
              {(filterYear || filterOrg) && (
                <Link
                  href="/hackathons"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                >
                  Clear all
                </Link>
              )}
            </div>
          )}

          {pastHackathons.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-card p-8 text-center text-muted-foreground">
              No past hackathons match these filters.
            </div>
          ) : (
            <>
            {/* Table header — hidden on mobile */}
            <div className="hidden sm:grid grid-cols-[1fr_160px_100px_120px_40px] gap-4 px-4 pb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50 mb-1">
              <span>Hackathon</span>
              <span>Organizer</span>
              <span className="text-right">Prize</span>
              <span className="text-right">Ended</span>
              <span />
            </div>

            <div className="divide-y divide-border/50">
              {pastHackathons.map((hackathon) => {
                const curated = findCurated(hackathon.title);
                const innerRow = (
                  <>
                    {/* Title + badges */}
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate">
                        {hackathon.title}
                      </span>
                      {hackathon.winner_announced && (
                        <Badge className="bg-[#FDDA24]/20 text-[#FDDA24] border-[#FDDA24]/30 text-[10px] px-1.5 flex-shrink-0">
                          <Trophy className="w-3 h-3 mr-0.5" />
                          Winners
                        </Badge>
                      )}
                      {curated && curated.trackedProjectCount > 0 && (
                        <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] px-1.5 flex-shrink-0">
                          {curated.trackedProjectCount} tracked
                        </Badge>
                      )}
                    </div>

                    {/* Org */}
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Building2 className="w-3 h-3 sm:hidden" />
                      {hackathon.organization?.name ?? "—"}
                    </span>

                    {/* Prize */}
                    <span className="text-sm text-muted-foreground sm:text-right">
                      <span className="sm:hidden text-xs mr-1">Prize:</span>
                      {formatPrize(hackathon.bonus_price)}
                    </span>

                    {/* End date */}
                    <span className="text-sm text-muted-foreground sm:text-right">
                      <span className="sm:hidden text-xs mr-1">Ended:</span>
                      {formatShortDate(hackathon.end_time)}
                    </span>

                    {/* Arrow */}
                    <ExternalLink className="hidden sm:block w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors ml-auto" />
                  </>
                );

                const className =
                  "group grid grid-cols-1 sm:grid-cols-[1fr_160px_100px_120px_40px] gap-2 sm:gap-4 items-center px-4 py-3 hover:bg-white/[0.02] transition-colors";

                // If we have a curated Payload hackathon for this entry, link internally.
                return curated ? (
                  <Link key={hackathon.id} href={`/hackathons/${curated.slug}`} className={className}>
                    {innerRow}
                  </Link>
                ) : (
                  <a
                    key={hackathon.id}
                    href={getHackathonUrl(hackathon.uname)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                  >
                    {innerRow}
                  </a>
                );
              })}
            </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

// ─── tiny inline components ──────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5">
      <div className="text-xs uppercase tracking-wide text-muted-foreground/80 mb-2">
        {label}
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
        {value}
      </div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

/**
 * Server-rendered filter dropdown using <details>/<summary>. No client JS
 * needed. Each option is a Link that preserves the other query params.
 */
function FilterDropdown({
  paramKey,
  current,
  options,
  buttonLabel,
  preserve,
}: {
  paramKey: string;
  current: string | null;
  options: FilterOption[];
  buttonLabel: string;
  preserve: Record<string, string | undefined>;
}) {
  const buildHref = (value: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(preserve)) {
      if (v) sp.set(k, v);
    }
    if (value !== "all") sp.set(paramKey, value);
    const qs = sp.toString();
    return qs ? `/hackathons?${qs}` : "/hackathons";
  };

  return (
    <details className="relative group">
      <summary className="list-none cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border/50 bg-card hover:bg-white/[0.04] text-sm text-foreground transition-colors">
        {buttonLabel}
        <span className="text-muted-foreground text-xs">▾</span>
      </summary>
      <div className="absolute z-10 mt-1 min-w-[160px] rounded-lg border border-border bg-card shadow-lg overflow-hidden">
        {options.map((opt) => {
          const isCurrent =
            (opt.value === "all" && !current) || opt.value === current;
          return (
            <Link
              key={opt.value}
              href={buildHref(opt.value)}
              className={`block px-3 py-2 text-sm transition-colors ${
                isCurrent
                  ? "bg-white/10 text-foreground"
                  : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
              }`}
            >
              {opt.label}
            </Link>
          );
        })}
      </div>
    </details>
  );
}