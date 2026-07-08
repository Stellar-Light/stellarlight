import { NextResponse } from "next/server";

const COINGECKO_URL =
	"https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd&include_24hr_vol=true&include_market_cap=true";
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

let cachedData: {
	price: number;
	volume24h: number;
	marketCap: number;
	timestamp: number;
} | null = null;

export async function GET() {
	if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
		return NextResponse.json(cachedData);
	}

	try {
		const res = await fetch(COINGECKO_URL, {
			headers: { Accept: "application/json" },
			next: { revalidate: 300 },
		});

		if (!res.ok) throw new Error(`CoinGecko returned ${res.status}`);

		const data = await res.json();
		const stellar = data?.stellar;

		if (!stellar?.usd) throw new Error("No stellar data");

		cachedData = {
			price: stellar.usd,
			volume24h: stellar.usd_24h_vol || 0,
			marketCap: stellar.usd_market_cap || 0,
			timestamp: Date.now(),
		};

		return NextResponse.json(cachedData);
	} catch {
		if (cachedData) {
			return NextResponse.json(cachedData);
		}
		return NextResponse.json(
			{ price: 0, volume24h: 0, marketCap: 0 },
			{ status: 500 },
		);
	}
}
