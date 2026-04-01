import { headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@/payload.config';
import { 
  fetchAllBuilders, 
  fetchBuilder, 
  transformBuilderForPayload 
} from '@/lib/integrations/stellar-passport';

/**
 * API endpoint to sync builder profiles from Stellar Passport
 * 
 * GET /api/sync/builders - Sync all builders
 * GET /api/sync/builders?username=xyz - Sync specific builder
 */
export async function GET(request: NextRequest) {
  try {
    // Check authorization
    const headersList = await headers();
    const authHeader = headersList.get('authorization');
    const expectedKey = process.env.CRON_SECRET || process.env.SYNC_API_KEY;
    
    // Allow access from admin panel or with correct API key
    if (authHeader !== `Bearer ${expectedKey}` && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const payload = await getPayload({ config });
    const searchParams = request.nextUrl.searchParams;
    const username = searchParams.get('username');

    let buildersToSync = [];
    
    if (username) {
      // Sync specific builder
      const builder = await fetchBuilder(username);
      if (builder) {
        buildersToSync = [builder];
      } else {
        return NextResponse.json(
          { error: `Builder ${username} not found` },
          { status: 404 }
        );
      }
    } else {
      // Sync all builders
      buildersToSync = await fetchAllBuilders();
    }

    const results = {
      synced: 0,
      created: 0,
      updated: 0,
      errors: [],
    };

    // Process each builder
    for (const builder of buildersToSync) {
      try {
        if (!builder.github_username) {
          console.log(`Skipping builder without GitHub username: ${builder.display_name}`);
          continue;
        }

        const transformedBuilder = transformBuilderForPayload(builder);

        // Check if builder already exists
        const existingBuilder = await payload.find({
          collection: 'builders',
          where: {
            github_username: {
              equals: builder.github_username,
            },
          },
          limit: 1,
        });

        if (existingBuilder.docs.length > 0) {
          // Update existing builder
          await payload.update({
            collection: 'builders',
            id: existingBuilder.docs[0].id,
            data: transformedBuilder,
          });
          results.updated++;
        } else {
          // Create new builder
          await payload.create({
            collection: 'builders',
            data: transformedBuilder,
          });
          results.created++;
        }
        
        results.synced++;
      } catch (error) {
        console.error(`Error syncing builder ${builder.github_username}:`, error);
        results.errors.push({
          username: builder.github_username,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${results.synced} builders`,
      results,
    });
  } catch (error) {
    console.error('Builder sync error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync builders' 
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to trigger manual sync from admin panel
 */
export async function POST(request: NextRequest) {
  return GET(request);
}