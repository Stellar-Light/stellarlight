import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

// IDs to DELETE (duplicates — keep the one with more data, delete the empty one)
// Also delete test/junk projects
// Near-dupe names to delete (the script will find and delete by name)
const DELETE_NAMES: string[] = [
	"Band Protocol",
	"BlockEden",
	"Blue Marble",
	"COCA Wallet",
	"Elroy App",
	"Expand Network",
	"Freedom Pay",
	"Gateway",
	"Huma Finance",
	"Mica Rent",
	"Ortege AI",
	"Pakana",
	"Reclaim Protocol",
	"Ripe Money",
	"Trace Finance",
	"Alfred Pay",
	"Blox Global",
	"Dune",
	"Orbit Finance", // duplicate of OrbitCDP
	"Stroopy AI", // duplicate of Stroopy.AI
	"USDC", // stablecoin asset, not a project — covered on stablecoins page
	"USDx", // stablecoin asset
	"xUSD", // stablecoin asset
	"zUSD", // stablecoin asset
	"GLOUSD", // stablecoin asset (Glo Dollar already listed as project)
	// All Asset-category entries — stablecoin/token listings, not projects
	"ARS",
	"ARST",
	"AUDD",
	"BRL",
	"BRZ",
	"EURS",
	"EURx",
	"GBPx",
	"KES",
	"MBRL",
	"MXNe",
	"NGNC",
	"PEN",
	"QCAD",
	"RWF",
	"TZS",
	"VCHF",
	"VEUR",
	"gYEN",
	"Arka.fund", // removed per user request
	// Duplicates — keep the one with more data
	"Aura Pay", // duplicate of AuraPay
	"Boss Pay", // duplicate/related to Boss Revolution
	"Cash Abroad", // duplicate of CashAbroad
	"Clickspesa", // duplicate of ClickPesa/Clixpesa
	"Coins PH", // duplicate of Coins.ph
	"Local Coin", // duplicate of LocalCoin
	"Peer", // duplicate of Honeycoin (Peer by Honeycoin)
	"Ping", // duplicate of involt (Ping neo-bank)
	"Soroban Hub", // duplicate of SorobanHub
	"Soroban Pulse", // duplicate of SorobanPulse
	"Honey Coin", // duplicate of Honeycoin
	"Stellar Carbon", // duplicate of Stellarcarbon
	"DEXTools", // duplicate of Dex Tools
	"BAF Network", // duplicate of BAF
	"Wallet Guru", // no description, defunct
	"Sendit", // no description, defunct
	"Free Voting Platform", // no description, defunct
	"Interstellar", // defunct DEX
	"Ultra Stellar", // entity, not a project
	"LIVETESTWITHBOXY",
	"TESTING DRAFTS",
	"Test",
];

// Fix tags for wrongly-tagged projects
const TAG_FIXES: Record<string, string[]> = {
	// Lending fixes
	"Arka.fund": ["DEX"],
	"Peridot Finance": ["Lending", "Bridge"],

	// "Other" tagged projects that need real types
	Band: ["SDK"], // oracle infra
	"Alterscope": ["Security"],
	"Arcturus": ["AI"],
	"Benji": ["RWA"],
	"Bigger": ["Education"],
	"Block by Block": ["Education"],
	"Blockdaemon": ["SDK"],
	"Bondhive": ["Lending"],
	"Chartui": ["DEX"],
	"DEXTools": ["Analytics"],
	"DFS Labs": ["Education"],
	"Dapplooker": ["Analytics"],
	"DeRisk": ["Analytics", "Security"],
	"Diadata": ["SDK"], // oracle
	"Digicus": ["SDK"],
	"Dogstar": ["Education", "Gaming"],
	"EasyA": ["Education"],
	"Etherfuse": ["RWA"],
	"Excellar": ["RWA"],
	"FxDAO": ["Lending"],
	"Give Credit": ["Lending"],
	"Giveth": ["Payments"],
	"Hoops Finance": ["DEX", "Analytics"],
	"InfStones": ["SDK"],
	"Kale": ["Gaming"],
	"Keizai": ["SDK"],
	"Kwickbit": ["Analytics"],
	"Lightecho": ["SDK"], // oracle
	"Lumen Loop": ["Explorer"],
	"Lumos DAO": ["SDK"],
	"NearX": ["Education"],
	"Nebula": ["SDK"],
	"Nirvana Labs": ["SDK"],
	"Okashi": ["SDK"],
	"OnBoarding Club": ["Education"],
	"Orbit Finance": ["Lending"],
	"PipeOps": ["SDK"],
	"Public Node": ["SDK"],
	"Reflector": ["SDK"], // oracle
	"Rise In": ["Education"],
	"Slender": ["Lending"],
	"Soroban Academy": ["Education"],
	"Soroban Domains": ["SDK"],
	"Soroban Governor": ["SDK"],
	"Stellar Carbon": ["RWA"],
	"Stellar Global": ["Education"],
	"Stellar Laboratory": ["SDK"],
	"Stellar Quest": ["Education", "Gaming"],
	"StellarFolio": ["Analytics"],
	"Stellarbeat": ["Explorer"],
	"Taurus": ["Wallet", "RWA"],
	"Tauvlo": ["RWA"],
	"Token Tails": ["Gaming"],
	"XycLoans": ["Lending"],
	"Yieldblox": ["Lending"],
	"ZettaBlock": ["SDK", "Analytics"],
	"Ziriz": ["Payments"],
	"Soroban Hub": ["SDK"],
	"Soroban Pulse": ["Analytics"],
	"SorobanIDE": ["SDK"],
	"Stellar Dashboard": ["Analytics"],
	"Stellar Pulse": ["Analytics"],
	"ChainAtlas": ["Explorer"],
	"Stroopy AI": ["AI"],
	"BAF Network": ["Education"],
	"Roberto Sanz": ["Education"],
	"Hi Fifo": ["Payments"],
	"Posted App": ["Payments"],

	// Assets tagged "Other" — these are stablecoins/tokens, tag as RWA or Payments
	"USDC": ["Payments"],
	"EURC": ["Payments"],
	"ARST": ["Payments"],
	"ARS": ["Payments"],
	"AUDD": ["Payments"],
	"BRL": ["Payments"],
	"BRZ": ["Payments"],
	"GBPx": ["Payments"],
	"GLOUSD": ["Payments"],
	"KES": ["Payments"],
	"MBRL": ["Payments"],
	"MXNe": ["Payments"],
	"NGNC": ["Payments"],
	"PEN": ["Payments"],
	"QCAD": ["Payments"],
	"RWF": ["Payments"],
	"TZS": ["Payments"],
	"USDx": ["Payments"],
	"VCHF": ["Payments"],
	"VEUR": ["Payments"],
	"gYEN": ["Payments"],
	"xUSD": ["Payments"],
	"zUSD": ["Payments"],
	"5x Crypto": ["Education"],

	// Elroy needs types (was empty)
	"Elroy": ["Payments"],
	// Blox needs types
	"Blox": ["Payments", "Anchor"],
	// Gateway.fm needs types
	"Gateway.fm": ["SDK"],
	// Sora
	"Sora": ["SDK"],
};

export async function GET(request: NextRequest) {
	const secret = request.nextUrl.searchParams.get("secret");
	if (secret !== "cleanup123") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const dryRun =
		request.nextUrl.searchParams.get("dry") === "true" ||
		request.nextUrl.searchParams.get("dry") === "1";

	const payload = await getPayload({ config });

	const results: any[] = [];
	let deleted = 0;
	let tagged = 0;
	const errors: string[] = [];

	// Fetch all projects first
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

	// 1. Delete duplicates and junk by name
	for (const name of DELETE_NAMES) {
		const match = allProjects.find((p) => p.name?.trim() === name);
		if (!match) continue;
		try {
			if (!dryRun) {
				await payload.delete({ collection: "projects", id: match.id });
			}
			results.push({ action: "delete", name, id: match.id });
			deleted++;
		} catch (e: any) {
			errors.push(`Delete ${name} (${match.id}): ${e.message}`);
		}
	}

	// 2. Also add remaining "Other" tag fixes
	const REMAINING_OTHER_FIXES: Record<string, string[]> = {
		EURS: ["Payments"],
		NOWNodes: ["SDK"],
		"Luminary's Archive": ["Education"],
		EURx: ["Payments"],
	};

	// Merge remaining fixes into TAG_FIXES
	const allFixes = { ...TAG_FIXES, ...REMAINING_OTHER_FIXES };

	for (const project of allProjects) {
		const fix = allFixes[project.name];
		if (!fix) continue;

		const currentTypes = project.types || [];
		const sortedCurrent = [...currentTypes].sort().join(",");
		const sortedNew = [...fix].sort().join(",");
		if (sortedCurrent === sortedNew) continue;

		try {
			if (!dryRun) {
				await payload.update({
					collection: "projects",
					id: project.id,
					data: { types: fix as any },
				});
			}
			results.push({
				action: "retag",
				name: project.name,
				from: currentTypes,
				to: fix,
			});
			tagged++;
		} catch (e: any) {
			errors.push(`Tag ${project.name}: ${e.message}`);
		}
	}

	// 3. Renames
	const RENAMES: Record<string, { name: string; slug: string; website?: string; twitter?: string }> = {
		Vibrant: {
			name: "Vesseo",
			slug: "vesseo",
			website: "https://vesseoapp.com",
			twitter: "https://x.com/vesseo_latam",
		},
	};
	let renamed = 0;
	for (const project of allProjects) {
		const rename = RENAMES[project.name];
		if (!rename) continue;
		try {
			if (!dryRun) {
				const updateData: any = { name: rename.name, slug: rename.slug };
				if (rename.website || rename.twitter) {
					updateData.links = { ...project.links };
					if (rename.website) updateData.links.website = rename.website;
					if (rename.twitter) updateData.links.twitter = rename.twitter;
				}
				await payload.update({
					collection: "projects",
					id: project.id,
					data: updateData,
				});
			}
			results.push({ action: "rename", from: project.name, to: rename.name });
			renamed++;
		} catch (e: any) {
			errors.push(`Rename ${project.name}: ${e.message}`);
		}
	}

	return NextResponse.json({
		dryRun,
		deleted,
		tagged,
		renamed,
		errors: errors.length,
		errorDetails: errors,
		changes: results,
	});
}
