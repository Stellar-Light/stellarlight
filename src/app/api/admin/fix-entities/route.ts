import { NextRequest, NextResponse } from "next/server";
import { getPayload } from "payload";
import config from "@payload-config";

const ENTITY_DESCRIPTIONS: Record<string, string> = {
	"Stellar Development Foundation":
		"Non-profit organization that supports the development and growth of the Stellar network.",
	"Script3":
		"DeFi development team building lending, stablecoin, and yield protocols on Stellar's Soroban.",
	"57blocks":
		"Software engineering firm contributing infrastructure and tooling to the Stellar ecosystem.",
	"Ultra Stellar":
		"Software engineering company behind Lobstr, StellarX, and StellarTerm — core Stellar wallet and DEX products.",
	"Paltalabs":
		"Development team building Soroswap DEX, DeFindex, and other DeFi primitives on Soroban.",
	"Creit Tech":
		"Blockchain development studio building financial infrastructure and smart contract tools on Stellar.",
	"Eiger":
		"Software development company contributing open-source tooling and infrastructure for Stellar.",
	"Stellar Expert":
		"Team behind the StellarExpert block explorer and analytics tools for the Stellar network.",
	"Tellus Cooperative":
		"Cooperative building community-driven financial tools and stablecoin infrastructure on Stellar.",
	"Xycloo":
		"Development team building indexing, data, and smart contract tools for Stellar and Soroban.",
	"Xycloo Labs":
		"Blockchain development lab focused on Soroban smart contract tooling and infrastructure.",
	"Zebec":
		"Decentralized infrastructure network enabling real-time, continuous payment streaming.",
	"Hacken":
		"Blockchain security company providing smart contract auditing and vulnerability assessment services.",
	"Certik":
		"Leading blockchain security firm offering smart contract audits, penetration testing, and compliance tools.",
	"Runtime Verification":
		"Formal verification and security company auditing smart contracts and blockchain protocols.",
	"Block Science":
		"Engineering and analytics firm specializing in complex systems design and token engineering.",
	"Pendulum":
		"Blockchain project bridging fiat and DeFi through compliant on/off-ramp infrastructure.",
	"BP Ventures":
		"Stellar integration partner and validator providing anchor services and liquidity solutions.",
	"Borderless":
		"API platform enabling financial institutions to build cross-border payment products on Stellar.",
	"Boss Revolution":
		"Digital communications and fintech company offering mobile top-up, payments, and wallet services.",
	"ClickPesa":
		"East African fintech providing payment processing and financial infrastructure powered by Stellar.",
	"Ternio":
		"Fintech company providing blockchain-powered advertising transparency and payment card solutions.",
	"Intellecteu":
		"Enterprise software company building financial services integration and blockchain solutions.",
	"IDT":
		"Telecommunications company operating Boss Revolution and other fintech payment platforms.",
	"EQ Lab":
		"Research and development lab building DeFi protocols and tooling for the Stellar ecosystem.",
	"Galois":
		"Research-driven company specializing in formal methods, cryptography, and software correctness.",
	"Jet Protocol":
		"DeFi protocol team building lending and borrowing infrastructure on blockchain networks.",
	"Solo Labs":
		"Development studio contributing tools and applications to the Stellar ecosystem.",
	"Lydia Labs":
		"Software development team building consumer-facing applications on Stellar.",
	"CodeLn":
		"Development team building developer tools and infrastructure for Stellar and Soroban.",
	"Cryptix":
		"Blockchain development company building exchange and trading infrastructure.",
	"accred":
		"Compliance and accreditation platform for digital asset verification.",
	"Amber":
		"Digital asset management platform providing trading and portfolio tools for institutions.",
	"luanlabs":
		"Independent development lab contributing open-source tools to the Stellar ecosystem.",
	"Sunship Inc.":
		"Technology company building applications and services on the Stellar network.",
	"The Brookes Project":
		"Social impact initiative leveraging Stellar for community development and financial inclusion.",
	"Ayadee":
		"Fintech company building payment and financial access solutions in emerging markets.",
	"techFiesta":
		"Developer education and hackathon organization focused on Stellar and blockchain technology.",
	"TagoBits":
		"Technology company behind TagoCash digital wallet and payment platform.",
	"Pakana":
		"Development team building financial tools and services on the Stellar network.",
	"Tenk DAO":
		"Decentralized autonomous organization supporting NFT and creative projects on blockchain.",
	"Bigger":
		"Education and community platform promoting blockchain adoption and developer training.",
	"Wallet Guru":
		"Digital wallet and payment services provider on the Stellar network.",
	"Building Block Framework":
		"Open-source framework for building financial applications on the Stellar network.",
	"addirktive":
		"Creative technology studio building blockchain-powered applications and experiences.",
};

export async function GET(request: NextRequest) {
	const secret = request.nextUrl.searchParams.get("secret");
	if (secret !== "entity123") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const dryRun =
		request.nextUrl.searchParams.get("dry") === "true" ||
		request.nextUrl.searchParams.get("dry") === "1";

	const payload = await getPayload({ config });

	const results: any[] = [];
	let updated = 0;
	const errors: string[] = [];

	// Fetch all entities
	const allEntities: any[] = [];
	let page = 1;
	let hasNext = true;
	while (hasNext) {
		const result = await payload.find({
			collection: "entities",
			limit: 100,
			page,
			depth: 0,
		});
		allEntities.push(...result.docs);
		hasNext = result.hasNextPage;
		page++;
	}

	for (const entity of allEntities) {
		const existingDesc = (entity.description || "").trim();
		const newDesc = ENTITY_DESCRIPTIONS[entity.name];

		if (!newDesc) continue;
		if (existingDesc && existingDesc.length > 10) continue; // Don't overwrite existing descriptions

		try {
			if (!dryRun) {
				await payload.update({
					collection: "entities",
					id: entity.id,
					data: { description: newDesc },
				});
			}
			results.push({
				name: entity.name,
				description: newDesc,
			});
			updated++;
		} catch (e: any) {
			errors.push(`${entity.name}: ${e.message}`);
		}
	}

	return NextResponse.json({
		dryRun,
		total: allEntities.length,
		updated,
		skipped: allEntities.length - updated,
		errors: errors.length,
		errorDetails: errors,
		changes: results,
	});
}
