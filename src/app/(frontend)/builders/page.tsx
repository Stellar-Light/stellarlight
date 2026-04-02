import Link from 'next/link';
import Image from 'next/image';
import { Metadata } from 'next';
import { fetchAllBuilders, type PassportBuilder } from '@/lib/integrations/stellar-passport';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowLeft,
  Users,
  MapPin,
  Briefcase,
  Github,
  Globe,
  Twitter,
  GitBranch,
  Code2,
  ExternalLink,
} from 'lucide-react';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Builders | Stellar Light',
  description: 'Discover talented builders and developers in the Stellar ecosystem',
};

export default async function BuildersPage() {
  let builders: PassportBuilder[] = [];

  try {
    builders = await fetchAllBuilders();
  } catch (error) {
    console.error('Failed to fetch builders:', error);
  }

  // Filter out builders without a github username
  builders = builders.filter(b => b.github_username);

  // Separate featured and regular builders
  const featuredBuilders = builders.filter(b => b.is_featured);
  const activeBuilders = builders
    .filter(b => !b.is_featured && (b.stats?.totalCommits30d ?? 0) > 0)
    .sort((a, b) => (b.stats?.totalCommits30d ?? 0) - (a.stats?.totalCommits30d ?? 0));
  const otherBuilders = builders
    .filter(b => !b.is_featured && (b.stats?.totalCommits30d ?? 0) === 0);

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
              Stellar Builders
            </h1>
          </div>
          <p className="text-muted-foreground">
            {builders.length} developers building on Stellar
          </p>
        </div>

        {/* Featured Builders */}
        {featuredBuilders.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Featured</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {featuredBuilders.map((builder) => (
                <BuilderRow key={builder.github_username} builder={builder} featured />
              ))}
            </div>
          </section>
        )}

        {/* Active Builders */}
        {activeBuilders.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <h2 className="text-2xl font-bold">Most Active</h2>
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                {activeBuilders.length}
              </Badge>
            </div>
            <div className="space-y-3">
              {activeBuilders.map((builder) => (
                <BuilderRow key={builder.github_username} builder={builder} />
              ))}
            </div>
          </section>
        )}

        {/* All Other Builders */}
        <section>
          <h2 className="text-2xl font-bold mb-6">
            All Builders ({otherBuilders.length})
          </h2>

          {otherBuilders.length > 0 ? (
            <div className="space-y-3">
              {otherBuilders.map((builder) => (
                <BuilderRow key={builder.github_username} builder={builder} />
              ))}
            </div>
          ) : builders.length === 0 ? (
            <Card className="border border-border/50 bg-card">
              <CardContent className="py-16 text-center">
                <Users className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground">No builders found</p>
              </CardContent>
            </Card>
          ) : null}
        </section>

        {/* CTA */}
        <div className="mt-16 text-center py-12 px-8 rounded-xl bg-gradient-to-r from-primary/10 to-[#FDDA24]/10 border border-primary/20">
          <h3 className="text-2xl font-bold mb-3">Are you building on Stellar?</h3>
          <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
            Create your Stellar Passport profile to showcase your work and connect with the community
          </p>
          <Button asChild size="lg">
            <a
              href="https://demo.stellarpassport.xyz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2"
            >
              Create Your Profile
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
}

function BuilderRow({ builder, featured = false }: { builder: PassportBuilder; featured?: boolean }) {
  const twitterUrl = builder.twitter_handle
    ? `https://twitter.com/${builder.twitter_handle.replace('@', '').replace('https://x.com/', '').replace('https://twitter.com/', '')}`
    : null;

  return (
    <Card className={`border ${featured ? 'border-primary/30 bg-card/50' : 'border-border/50 bg-card'} hover:bg-card/80 hover:border-primary/30 transition-all duration-150 hover:-translate-y-0.5`}>
      <CardContent className="p-5">
        <div className="flex items-center gap-4">
          {/* Avatar */}
          <div className="flex-shrink-0">
            {builder.avatar_url ? (
              <Image
                src={builder.avatar_url}
                alt={builder.display_name}
                width={48}
                height={48}
                className="rounded-full"
              />
            ) : (
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-lg font-bold">
                {builder.display_name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-foreground truncate">
                {builder.display_name}
              </h3>
              {featured && (
                <Badge className="bg-[#FDDA24]/20 text-[#FDDA24] border-[#FDDA24]/30 text-xs">
                  Featured
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
              {builder.role_title && (
                <span className="flex items-center gap-1 truncate">
                  <Briefcase className="w-3 h-3" />
                  {builder.role_title}
                </span>
              )}
              {builder.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {builder.location}
                </span>
              )}
              {(builder.stats?.totalCommits30d ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <GitBranch className="w-3 h-3" />
                  {builder.stats!.totalCommits30d} commits / 30d
                </span>
              )}
              {builder.projects && builder.projects.length > 0 && (
                <span className="flex items-center gap-1">
                  <Code2 className="w-3 h-3" />
                  {builder.projects.length} project{builder.projects.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {/* Social links */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {builder.github_username && (
              <a
                href={`https://github.com/${builder.github_username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <Github className="w-4 h-4" />
              </a>
            )}
            {builder.website_url && (
              <a
                href={builder.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <Globe className="w-4 h-4" />
              </a>
            )}
            {twitterUrl && (
              <a
                href={twitterUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
              >
                <Twitter className="w-4 h-4" />
              </a>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}