/**
 * Enrich builder profiles with public GitHub profile data so get_builders is
 * actually filterable. The Stellar Passport sync only populated github_username
 * + display_name, leaving bio/location/website/twitter empty — which means the
 * /api/builders skill= filter (searches bio) and location= filter return
 * nothing. This backfills those from each builder's GitHub profile.
 *
 * PRECISION: only fills fields that are currently EMPTY — never overwrites
 * curated/Passport data.
 *
 *   pnpm exec tsx scripts/enrich-builders.ts            # dry run
 *   pnpm exec tsx scripts/enrich-builders.ts --execute  # write
 */
import "dotenv/config";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const TOKEN = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? "";

interface GhUser {
	bio?: string | null;
	location?: string | null;
	blog?: string | null;
	twitter_username?: string | null;
}

async function fetchGhUser(username: string): Promise<GhUser | null | "rate"> {
	try {
		const res = await fetch(
			`https://api.github.com/users/${encodeURIComponent(username)}`,
			{
				headers: {
					"User-Agent": "stellarlight-enrich-builders",
					Accept: "application/vnd.github+json",
					...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
				},
			},
		);
		if (res.status === 404) return null;
		if (res.status === 403 || res.status === 429) return "rate";
		if (!res.ok) return null;
		return (await res.json()) as GhUser;
	} catch {
		return null;
	}
}

function cleanUrl(raw?: string | null): string {
	const b = (raw ?? "").trim();
	if (!b) return "";
	return /^https?:\/\//i.test(b) ? b : `https://${b}`;
}

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`Mode: ${EXECUTE ? "EXECUTE" : "DRY RUN"} | github token: ${TOKEN ? "yes" : "NO (60/hr limit)"}\n`,
	);

	// biome-ignore lint/suspicious/noExplicitAny: payload doc
	const builders = (
		await payload.find({ collection: "builders", pagination: false, depth: 0 })
	).docs as any[];
	console.log(`${builders.length} builders.\n`);

	let enriched = 0, noChange = 0, noUser = 0, skipped = 0, rateHit = 0;
	for (const b of builders) {
		const username = (b.github_username ?? "").trim();
		if (!username) {
			skipped++;
			continue;
		}
		const gh = await fetchGhUser(username);
		if (gh === "rate") {
			rateHit++;
			console.warn(`  ! rate-limited at ${username} — stopping early`);
			break;
		}
		if (!gh) {
			noUser++;
			continue;
		}

		// Only fill fields that are currently empty — never clobber curated data.
		const patch: Record<string, string> = {};
		if (!b.bio?.trim() && gh.bio?.trim()) patch.bio = gh.bio.trim();
		if (!b.location?.trim() && gh.location?.trim())
			patch.location = gh.location.trim();
		if (!b.website_url?.trim()) {
			const w = cleanUrl(gh.blog);
			if (w) patch.website_url = w;
		}
		if (!b.twitter_handle?.trim() && gh.twitter_username?.trim())
			patch.twitter_handle = gh.twitter_username.trim();

		if (Object.keys(patch).length === 0) {
			noChange++;
			continue;
		}
		console.log(`  ${username.padEnd(24)} +{ ${Object.keys(patch).join(", ")} }`);
		if (EXECUTE) {
			await payload.update({ collection: "builders", id: b.id, data: patch });
		}
		enriched++;
	}

	console.log(
		`\n${EXECUTE ? "DONE" : "DRY RUN"}: ${enriched} ${EXECUTE ? "enriched" : "fillable"}; ${noChange} already complete; ${noUser} GH profile missing/failed; ${skipped} had no github_username${rateHit ? `; STOPPED on rate limit (set GITHUB_TOKEN)` : ""}.`,
	);
	process.exit(0);
}
main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
