import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import { 
  fetchAllDoraHacksHackathons, 
  formatDate, 
  formatShortDate,
  formatPrize, 
  getHackathonUrl, 
  isHackathonActive, 
  getDaysRemaining,
  parseTags
} from '@/lib/integrations/dorahacks';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
export const revalidate = 3600; // Revalidate every hour

export const metadata: Metadata = {
  title: "Hackathons | Stellar Light",
  description: "Active and past hackathons in the Stellar ecosystem",
};

export default async function HackathonsPage() {
  // Fetch hackathons from DoraHacks
  const hackathons = await fetchAllDoraHacksHackathons();
  
  // Separate active and past hackathons
  const activeHackathons = hackathons.filter(h => isHackathonActive(h));
  const pastHackathons = hackathons.filter(h => !isHackathonActive(h));

  return (
    <div className="min-h-screen relative">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-16 pt-28">
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
            Build the future of finance on Stellar
          </p>
        </div>

        {/* Active Hackathons Section */}
        {activeHackathons.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <h2 className="text-2xl font-bold">Open for Submissions</h2>
              </div>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                {activeHackathons.length} Active
              </Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              {activeHackathons.map((hackathon) => {
                const daysRemaining = getDaysRemaining(hackathon.end_time);
                const tags = parseTags(hackathon.field);
                
                return (
                  <Card
                    key={hackathon.id}
                    className="border border-primary/30 bg-card/50 backdrop-blur-sm shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden group"
                  >
                    {/* Banner Image */}
                    {hackathon.image_url && (
                      <div className="relative h-48 overflow-hidden">
                        <Image
                          src={hackathon.image_url}
                          alt={hackathon.title}
                          fill
                          className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                        <Badge className="absolute top-4 right-4 bg-green-500 text-white border-0">
                          OPEN
                        </Badge>
                      </div>
                    )}

                    <CardContent className="p-6">
                      {/* Title and Organizer */}
                      <div className="mb-4">
                        <h3 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                          {hackathon.title}
                        </h3>
                        {hackathon.organization && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {hackathon.organization.logo && (
                              <Image
                                src={hackathon.organization.logo}
                                alt={hackathon.organization.name}
                                width={20}
                                height={20}
                                className="rounded-full"
                              />
                            )}
                            <span>{hackathon.organization.name}</span>
                          </div>
                        )}
                      </div>

                      {/* Key Info Grid */}
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-[#FDDA24]" />
                          <div>
                            <p className="text-xs text-muted-foreground">Prize Pool</p>
                            <p className="font-semibold text-foreground">
                              {formatPrize(hackathon.bonus_price)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-primary" />
                          <div>
                            <p className="text-xs text-muted-foreground">Deadline</p>
                            <p className="font-semibold text-foreground">
                              {daysRemaining > 0 ? `${daysRemaining} days` : 'Ending soon'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Participants</p>
                            <p className="font-semibold text-foreground">
                              {hackathon.hackers_count}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Ends</p>
                            <p className="font-semibold text-foreground text-xs">
                              {formatShortDate(hackathon.end_time)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Tags */}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {tags.slice(0, 5).map((tag, index) => (
                            <Badge
                              key={index}
                              variant="outline"
                              className="text-xs"
                            >
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* CTA Button */}
                      <Button asChild className="w-full group">
                        <a
                          href={getHackathonUrl(hackathon.uname)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2"
                        >
                          View on DoraHacks
                          <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* No Active Hackathons */}
        {activeHackathons.length === 0 && (
          <Card className="mb-16 border border-border/50 bg-card">
            <CardContent className="py-16 text-center">
              <Code2 className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                No active hackathons at the moment
              </p>
              <p className="text-sm text-muted-foreground">
                Check back soon for upcoming events!
              </p>
            </CardContent>
          </Card>
        )}

        {/* Past Hackathons Section */}
        {pastHackathons.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-6 text-foreground">Past Hackathons</h2>
            
            <div className="space-y-3">
              {pastHackathons.map((hackathon) => (
                <Card
                  key={hackathon.id}
                  className="border border-border/50 bg-card hover:bg-card/80 transition-colors"
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-semibold text-foreground truncate">
                            {hackathon.title}
                          </h3>
                          {hackathon.winner_announced && (
                            <Badge className="bg-[#FDDA24]/20 text-[#FDDA24] border-[#FDDA24]/30">
                              <Trophy className="w-3 h-3 mr-1" />
                              Winners Announced
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          {hackathon.organization && (
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3" />
                              {hackathon.organization.name}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <DollarSign className="w-3 h-3" />
                            {formatPrize(hackathon.bonus_price)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            Ended {formatShortDate(hackathon.end_time)}
                          </span>
                        </div>
                      </div>
                      <a
                        href={getHackathonUrl(hackathon.uname)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        View
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* CTA Section */}
        <div className="mt-16 text-center py-12 px-8 rounded-xl bg-gradient-to-r from-primary/10 to-[#FDDA24]/10 border border-primary/20">
          <h3 className="text-2xl font-bold mb-3">Want to organize a hackathon?</h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Join DoraHacks to host your own Stellar hackathon and tap into a global community of builders
          </p>
          <Button asChild size="lg">
            <a
              href="https://dorahacks.io/org/stellar"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              Learn More on DoraHacks
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
}