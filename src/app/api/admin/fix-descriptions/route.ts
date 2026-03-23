import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

const MAX_DESC_LENGTH = 180;

/**
 * Truncate a description to ~MAX_DESC_LENGTH chars at the nearest sentence/phrase boundary.
 */
function truncateDescription(desc: string): string {
	if (!desc || desc.length <= MAX_DESC_LENGTH) return desc;

	// Clean up whitespace, newlines, HTML entities
	let clean = desc
		.replace(/\s+/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&nbsp;/g, " ")
		.trim();

	if (clean.length <= MAX_DESC_LENGTH) return clean;

	// Try to cut at a sentence boundary (period followed by space)
	const periodIdx = clean.lastIndexOf(". ", MAX_DESC_LENGTH);
	if (periodIdx > 60) {
		return clean.slice(0, periodIdx + 1);
	}

	// Try comma
	const commaIdx = clean.lastIndexOf(", ", MAX_DESC_LENGTH);
	if (commaIdx > 60) {
		return clean.slice(0, commaIdx) + ".";
	}

	// Try dash/semicolon
	const dashIdx = clean.lastIndexOf(" — ", MAX_DESC_LENGTH);
	const semiIdx = clean.lastIndexOf("; ", MAX_DESC_LENGTH);
	const cutIdx = Math.max(dashIdx, semiIdx);
	if (cutIdx > 60) {
		return clean.slice(0, cutIdx) + ".";
	}

	// Last resort: cut at word boundary
	const spaceIdx = clean.lastIndexOf(" ", MAX_DESC_LENGTH);
	if (spaceIdx > 60) {
		return clean.slice(0, spaceIdx) + "...";
	}

	return clean.slice(0, MAX_DESC_LENGTH) + "...";
}

// Override descriptions for projects with wrong/misleading ones
const DESCRIPTION_OVERRIDES: Record<string, string> = {
	"Stellar Light":
		"A directory and explorer for discovering dApps, tools, and projects across the Stellar ecosystem.",
	"PayZoll":
		"Crypto-native payouts infrastructure on Stellar. A modular payments stack unifying crypto and fiat transactions.",
	ChimpDAO:
		"A community-driven merch platform combining physical products with blockchain features on Stellar.",
	AIDA: "AI-powered multi-chain trading platform with token creation, analysis, and trading across blockchains.",
	Juntta:
		"A transparent crowdfunding platform built in Peru, addressing the trust gap in digital fundraising across Latin America.",
	"Sushi Swap":
		"SushiSwap is a leading multi-chain decentralized exchange (DEX) and AMM enabling token swaps with deep liquidity.",
	Benji:
		"Benji Investments is a platform by Franklin Templeton enabling investors to access tokenized securities and digital assets, including the Franklin OnChain U.S. Government Money Fund (FOBXX) on Stellar.",
};

// Status overrides for projects with wrong status
const STATUS_OVERRIDES: Record<string, string> = {
	"Sushi Swap": "Live",
};

// Tags for the remaining ~100 untagged projects
const REMAINING_TAGS: Record<string, string[]> = {
	"xlm.sh": ["SDK"],
	"Stellar Razor and Blazor Suite": ["SDK"],
	"Stellar Development Foundation": ["Education"],
	"Stellar Battle": ["Gaming"],
	Steepx: ["Payments"],
	StarLoom: ["SDK"],
	"Space and Time": ["SDK", "Analytics"],
	"Source of Tales": ["Gaming"],
	SoroStarter: ["DEX"],
	Sorosorcerer: ["SDK"],
	SoroBuild: ["SDK"],
	SoroBuilder: ["SDK"],
	"Soroban Optimistic Oracle": ["SDK"],
	SmartDeploy: ["SDK"],
	Scopuly: ["Wallet", "DEX"],
	"Runtime Verification": ["Security"],
	RendBit: ["Payments"],
	"RealToken Inc.": ["RWA"],
	Refract: ["SDK"],
	Ralph: ["SDK"],
	"Proof of Paint": ["NFT"],
	PressKeys: ["SDK"],
	Peer: ["Payments"],
	Pendulum: ["Bridge"],
	Orbiton: ["DEX"],
	NuSource: ["Payments"],
	"Nidium Protocol": ["Lending"],
	Neptunian: ["SDK"],
	"Navigator Bank": ["Payments", "Anchor"],
	Monokera: ["SDK"],
	MoneyPlex: ["Payments"],
	MiniPay: ["Wallet", "Payments"],
	"MEVShield Labs": ["Security"],
	Lumenswap: ["DEX"],
	"LunarCrush Agent Studio": ["AI", "Analytics"],
	LINK: ["Payments"],
	Ledger: ["Wallet"],
	LedgersTax: ["Analytics"],
	"Kwil Network": ["SDK"],
	"JSON-RPC Relay": ["SDK"],
	"IBM World Wire": ["Payments"],
	Hystopia: ["Gaming"],
	"Horizon-as-a-Service": ["SDK"],
	HaloFi: ["Lending"],
	GroupOS: ["SDK"],
	Glo: ["Payments"],
	Gitopia: ["SDK"],
	"Gateway.fm": ["SDK"],
	Futurenet: ["SDK"],
	Flux: ["SDK"],
	Fluxity: ["Payments"],
	FiatFi: ["Payments", "Anchor"],
	Fazzaco: ["Payments"],
	"EVM Emulator": ["SDK"],
	"Coinbase Pay": ["Payments"],
	"Cosmic.link": ["SDK"],
	Conduit: ["SDK"],
	Claimable: ["SDK"],
	CIBEx: ["DEX"],
	Centauri: ["Bridge"],
	"BP Ventures": ["Anchor", "Payments"],
	Blocto: ["Wallet"],
	"BlockEden.xyz": ["Indexer"],
	Bitgo: ["Wallet", "Security"],
	"Big Dipper": ["Explorer"],
	Beans: ["Wallet", "Payments"],
	atocha: ["SDK"],
	attest: ["Security"],
	Armur: ["Security"],
	"API3 QRNG": ["SDK"],
	"AngelHack / Dev.to": ["Education"],
	"Alchemy Pay": ["Payments"],
	Abroad: ["Payments"],
	"Cash Abroad": ["Payments"],
	CashAbroad: ["Payments"],
	"Wagelink": ["Payments"],
	"Interlinked": ["Bridge"],
	Elroy: ["Payments"],
	Blox: ["Payments", "Anchor"],
	Sora: ["SDK"],
	"Mercuryo": ["Payments"],
	NebulaVRF: ["SDK"],
	Mercury: ["Indexer"],
	Wave: ["Payments"],
	Ripe: ["Payments", "Anchor"],
	"StellarGuard": ["Wallet", "Security"],
	"Stellar Router SDK": ["SDK"],
};

export async function GET(request: NextRequest) {
	const secret = request.nextUrl.searchParams.get("secret");
	if (secret !== "fixdesc123") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const dryRun =
		request.nextUrl.searchParams.get("dry") === "true" ||
		request.nextUrl.searchParams.get("dry") === "1";

	const payload = await getPayload({ config });

	const allProjects: any[] = [];
	let page = 1;
	let hasNext = true;
	while (hasNext) {
		const result = await payload.find({
			collection: "projects",
			limit: 100,
			page,
			depth: 0,
		});
		allProjects.push(...result.docs);
		hasNext = result.hasNextPage;
		page++;
	}

	const results: any[] = [];
	let descFixed = 0;
	let tagged = 0;
	const errors: string[] = [];

	for (const project of allProjects) {
		const updateData: any = {};
		const name = project.name || "";

		// 1. Fix descriptions
		const currentDesc = project.shortDescription || "";
		const override = DESCRIPTION_OVERRIDES[name];
		if (override) {
			updateData.shortDescription = override;
		} else if (currentDesc.length > MAX_DESC_LENGTH) {
			updateData.shortDescription = truncateDescription(currentDesc);
		}

		// 2. Fix status
		const statusOverride = STATUS_OVERRIDES[name];
		if (statusOverride && project.status !== statusOverride) {
			updateData.status = statusOverride;
		}

		// 3. Tag remaining untagged
		const currentTypes = project.types || [];
		if (currentTypes.length === 0) {
			const newTypes = REMAINING_TAGS[name];
			if (newTypes) {
				updateData.types = newTypes;
			}
		}

		if (Object.keys(updateData).length === 0) continue;

		try {
			if (!dryRun) {
				await payload.update({
					collection: "projects",
					id: project.id,
					data: updateData,
				});
			}

			if (updateData.shortDescription) {
				results.push({
					action: "desc",
					name,
					from: currentDesc.length,
					to: updateData.shortDescription.length,
					preview: updateData.shortDescription.slice(0, 100),
				});
				descFixed++;
			}
			if (updateData.status) {
				results.push({
					action: "status",
					name,
					from: project.status,
					to: updateData.status,
				});
			}
			if (updateData.types) {
				results.push({
					action: "tag",
					name,
					types: updateData.types,
				});
				tagged++;
			}
		} catch (e: any) {
			errors.push(`${name}: ${e.message}`);
		}
	}

	return NextResponse.json({
		dryRun,
		total: allProjects.length,
		descriptionsFixed: descFixed,
		tagged,
		errors: errors.length,
		errorDetails: errors.slice(0, 20),
		changes: results,
	});
}
