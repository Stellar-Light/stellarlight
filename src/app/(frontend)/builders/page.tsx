import { Metadata } from 'next';
import { getPayload } from 'payload';
import config from '@/payload.config';
import { BuilderCard } from '@/components/builder-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchIcon, Users } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Builders | Stellar Light',
  description: 'Discover talented builders and developers in the Stellar ecosystem',
};

async function getBuilders() {
  const payload = await getPayload({ config });
  
  const builders = await payload.find({
    collection: 'builders',
    limit: 100,
    sort: '-stats.totalCommits30d',
    where: {
      visibility: {
        equals: 'public',
      },
    },
  });

  return builders.docs;
}

export default async function BuildersPage() {
  const builders = await getBuilders();

  // Separate featured and regular builders
  const featuredBuilders = builders.filter(b => b.is_featured);
  const regularBuilders = builders.filter(b => !b.is_featured);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center space-x-3 mb-4">
          <Users className="w-8 h-8 text-primary" />
          <h1 className="text-4xl font-bold">Stellar Builders</h1>
        </div>
        <p className="text-lg text-muted-foreground">
          Meet the talented developers and innovators building on Stellar
        </p>
      </div>

      {/* Search Bar */}
      <div className="relative mb-8">
        <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
        <Input
          type="search"
          placeholder="Search builders by name, skill, or project..."
          className="pl-10 pr-4 py-2 w-full md:w-96"
        />
      </div>

      {/* Featured Builders */}
      {featuredBuilders.length > 0 && (
        <section className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Featured Builders</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {featuredBuilders.map((builder) => (
              <BuilderCard key={builder.id} builder={builder} />
            ))}
          </div>
        </section>
      )}

      {/* All Builders */}
      <section>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-semibold">
            All Builders ({regularBuilders.length})
          </h2>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              Most Active
            </Button>
            <Button variant="outline" size="sm">
              Recently Joined
            </Button>
            <Button variant="outline" size="sm">
              Most Projects
            </Button>
          </div>
        </div>

        {regularBuilders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {regularBuilders.map((builder) => (
              <BuilderCard key={builder.id} builder={builder} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No builders found</p>
          </div>
        )}
      </section>

      {/* CTA Section */}
      <div className="mt-12 bg-muted/50 rounded-lg p-8 text-center">
        <h3 className="text-xl font-semibold mb-3">Are you building on Stellar?</h3>
        <p className="text-muted-foreground mb-6">
          Join the Stellar Passport to showcase your work and connect with the community
        </p>
        <Button asChild>
          <a
            href="https://demo.stellarpassport.xyz"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create Your Profile
          </a>
        </Button>
      </div>
    </div>
  );
}