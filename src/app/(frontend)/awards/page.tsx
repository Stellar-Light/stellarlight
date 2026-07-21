import type { Metadata } from "next";
import {
	AwardsBallot,
	type AwardsRoundData,
} from "@/components/awards/awards-ballot";
import "@/components/awards/awards.css";
import { roundOpenState } from "@/lib/awards/ballot";
import { loadRound, toPublicRound } from "@/lib/awards/round";

/**
 * /awards — the i³ Awards voting experience (HIDDEN page).
 *
 * SDF's Pilot shortlisting vote: ~98 SCF Pilots pick one nominee per
 * category (Impact / Innovation / Interoperability) with whitelisted
 * Stellar addresses; each ballot is a real TESTNET transaction (manageData
 * entries on the voter's own account — see src/lib/awards/ballot.ts).
 *
 * Hidden by design until SDF says go:
 *   - no nav/footer links point here
 *   - robots noindex (below) and absent from sitemap.ts
 *   - the /api/awards/* backend is absent from the OpenAPI spec,
 *     /api/status.endpoints and next.config publicApi[]
 */

export const metadata: Metadata = {
	title: "i³ Awards",
	description:
		"The Stellar i³ Awards — Pilots vote for the year's most impactful, innovative and interoperable projects.",
	robots: {
		index: false,
		follow: false,
		googleBot: { index: false, follow: false },
	},
};

export const dynamic = "force-dynamic";

async function getRoundData(): Promise<AwardsRoundData | null> {
	const loaded = await loadRound();
	if (!loaded) return null;
	const openState = roundOpenState(loaded.round);
	const pub = toPublicRound(loaded);
	return {
		round: pub.round,
		nominees: pub.nominees,
		voting: { open: openState.open, reason: openState.reason },
	};
}

export default async function AwardsPage() {
	const data = await getRoundData();
	return (
		<div className="awards-sm min-h-screen relative">
			<AwardsBallot data={data} />
		</div>
	);
}
