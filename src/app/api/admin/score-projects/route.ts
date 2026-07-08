import config from "@payload-config";
import { type NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";

/**
 * Relevance scoring algorithm for projects.
 *
 * Score breakdown (0-100):
 *   - GitHub activity (0-30): recent commits, open issues
 *   - DeFi Llama TVL (0-25): current TVL for DeFi projects
 *   - Profile completeness (0-20): logo, description, links, types
 *   - Status & verification (0-15): Live > Pre-Release > Dev, verified > unverified
 *   - Featured bonus (0-10): manual curation signal
 */

interface ScoringContext {
	stellarProtocols: Map<string, { tvl: number; slug: string }>;
}

// Fetch Stellar protocols from DeFi Llama for TVL scoring
async function fetchStellarProtocols(): Promise<
	Map<string, { tvl: number; slug: string }>
> {
	const map = new Map<string, { tvl: number; slug: string }>();
	try {
		const res = await fetch("https://api.llama.fi/protocols");
		if (!res.ok) return map;
		const protocols = await res.json();
		for (const p of protocols) {
			if ((p.chains || []).includes("Stellar")) {
				const tvl = p.chainTvls?.Stellar || 0;
				map.set(p.name.toLowerCase(), { tvl, slug: p.slug });
				map.set(p.slug.toLowerCase(), { tvl, slug: p.slug });
			}
		}
	} catch {
		// DeFi Llama down — score without TVL
	}
	return map;
}

function scoreProject(
	project: any,
	signal: any | null,
	ctx: ScoringContext,
): number {
	let score = 0;

	// --- DeFi Llama TVL (0-35) — most important signal ---
	const projectNameLower = (project.name || "").toLowerCase();

	// Manual TVL overrides for projects not tracked by DeFi Llama
	const MANUAL_TVL: Record<string, number> = {
		benji: 625_861_896, // Franklin Templeton FOBXX on Stellar (rwa.xyz)
		wisdomtree: 20_000_000, // WisdomTree tokenized funds
	};

	let tvlMatch = MANUAL_TVL[projectNameLower]
		? { tvl: MANUAL_TVL[projectNameLower], slug: projectNameLower }
		: ctx.stellarProtocols.get(projectNameLower) ||
			ctx.stellarProtocols.get(
				projectNameLower.replace(/\s+/g, "-").toLowerCase(),
			);

	if (!tvlMatch) {
		let bestTvl = 0;
		for (const [key, value] of ctx.stellarProtocols.entries()) {
			if (
				(key.startsWith(projectNameLower) || key.includes(projectNameLower)) &&
				value.tvl > bestTvl
			) {
				tvlMatch = value;
				bestTvl = value.tvl;
			}
		}
	}

	if (tvlMatch && tvlMatch.tvl > 0) {
		if (tvlMatch.tvl >= 100_000_000) score += 35;
		else if (tvlMatch.tvl >= 50_000_000) score += 30;
		else if (tvlMatch.tvl >= 10_000_000) score += 25;
		else if (tvlMatch.tvl >= 5_000_000) score += 22;
		else if (tvlMatch.tvl >= 1_000_000) score += 18;
		else if (tvlMatch.tvl >= 100_000) score += 12;
		else if (tvlMatch.tvl >= 10_000) score += 6;
		else score += 3;
	}

	// --- GitHub activity (0-25) ---
	if (signal?.github) {
		const gh = signal.github;
		const lastActivity = gh.lastActivityAt ? new Date(gh.lastActivityAt) : null;

		if (lastActivity) {
			const daysSince =
				(Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);
			if (daysSince < 7) score += 25;
			else if (daysSince < 30) score += 20;
			else if (daysSince < 90) score += 15;
			else if (daysSince < 180) score += 10;
			else if (daysSince < 365) score += 5;
			else score += 0; // dead project, no bonus
		}

		const openIssues = gh.openIssuesTotal || 0;
		if (openIssues > 10) score += 3;
		else if (openIssues > 0) score += 1;
	}

	// --- On-chain presence (0-8) ---
	const contracts = project.onchain?.contracts || [];
	const hasAssetCode = !!project.onchain?.assetCode;
	if (contracts.length > 0) score += 5;
	if (hasAssetCode) score += 3;

	// --- Profile completeness (0-15) ---
	let completeness = 0;
	if (project.logo) completeness += 3;
	if (project.shortDescription && project.shortDescription.length > 20)
		completeness += 3;
	if (project.links?.website) completeness += 2;
	if (project.links?.github) completeness += 2;
	if (project.links?.twitter) completeness += 2;
	if (project.links?.discord) completeness += 1;
	if (project.links?.docs) completeness += 1;
	if ((project.types || []).length > 0) completeness += 1;
	score += Math.min(completeness, 15);

	// --- Status & verification (0-12) ---
	switch (project.status) {
		case "Live":
			score += 7;
			break;
		case "Pre-Release":
			score += 4;
			break;
		case "Development":
			score += 2;
			break;
	}

	if (project.verificationLevel === "Verified (SDF)") score += 5;
	else if (project.verificationLevel === "Verified (Community)") score += 3;

	// --- Featured bonus (0-5) — reduced, algorithm should do the work ---
	if (project.featured) score += 5;

	// --- Core wallet boost — primary user-facing Stellar wallets ---
	const TOP_WALLETS = new Set([
		"freighter",
		"lobstr",
		"xbull",
		"xbull wallet",
		"albedo",
	]);
	const CORE_WALLETS = new Set([
		"hana",
		"hana wallet",
		"ledger",
		"trezor",
		"onekey",
		"bitget",
		"klever",
	]);
	if (TOP_WALLETS.has(projectNameLower)) score += 18;
	else if (CORE_WALLETS.has(projectNameLower)) score += 15;

	// --- Payments boost — major payment rails on Stellar ---
	const TOP_PAYMENTS = new Set([
		"moneygram",
		"circle",
		"flutterwave",
		"yellow card",
		"wave",
		"clickpesa",
		"cowrie",
		"beans",
		"vesseo",
	]);
	const CORE_PAYMENTS = new Set([
		"fonbnk",
		"nala",
		"afriex",
		"decaf",
		"chippercash",
		"ripio",
		"lemon",
		"tala",
		"coins.ph",
		"boss revolution",
		"felix pago",
		"wirex pay",
		"zebec",
		"transfermole",
	]);
	const types: string[] = project.types || [];
	const isPayment = types.includes("Payments");
	if (isPayment) {
		if (TOP_PAYMENTS.has(projectNameLower)) score += 18;
		else if (CORE_PAYMENTS.has(projectNameLower)) score += 12;
	}

	// Cap at 100
	return Math.min(score, 100);
}

export async function GET(request: NextRequest) {
	const secret = request.nextUrl.searchParams.get("secret");
	if (secret !== "tag123") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const dryRun =
		request.nextUrl.searchParams.get("dry") === "true" ||
		request.nextUrl.searchParams.get("dry") === "1";

	const payload = await getPayload({ config });

	// Fetch all projects
	const allProjects: any[] = [];
	let page = 1;
	let hasNext = true;
	while (hasNext) {
		const result = await payload.find({
			collection: "projects",
			limit: 100,
			page,
			depth: 1,
		});
		allProjects.push(...result.docs);
		hasNext = result.hasNextPage;
		page++;
	}

	// Fetch all signals for GitHub data
	const allSignals: any[] = [];
	page = 1;
	hasNext = true;
	while (hasNext) {
		const result = await payload.find({
			collection: "signals",
			limit: 100,
			page,
			depth: 0,
		});
		allSignals.push(...result.docs);
		hasNext = result.hasNextPage;
		page++;
	}

	// Map signals by project ID
	const signalsByProject = new Map<string, any>();
	for (const s of allSignals) {
		const projectId = typeof s.project === "string" ? s.project : s.project?.id;
		if (projectId) signalsByProject.set(projectId, s);
	}

	// Fetch DeFi Llama data
	const stellarProtocols = await fetchStellarProtocols();

	const ctx: ScoringContext = { stellarProtocols };
	const results: any[] = [];
	let updated = 0;

	for (const project of allProjects) {
		const signal = signalsByProject.get(project.id) || null;
		const newScore = scoreProject(project, signal, ctx);
		const currentScore = project.relevanceScore || 0;

		if (currentScore === newScore) continue;

		if (!dryRun) {
			await payload.update({
				collection: "projects",
				id: project.id,
				data: { relevanceScore: newScore },
			});
		}

		results.push({
			name: project.name,
			from: currentScore,
			to: newScore,
		});
		updated++;
	}

	// Sort results by new score descending for readability
	results.sort((a, b) => b.to - a.to);

	return NextResponse.json({
		dryRun,
		total: allProjects.length,
		signalsCount: allSignals.length,
		stellarProtocolsCount: stellarProtocols.size,
		updated,
		scores: results,
	});
}
