/**
 * i³ Awards — nominee "2026 in review" highlights.
 *
 * These are DEMO / mock highlights for the hidden test round: qualitative and
 * playful on purpose — no fabricated figures (that's also why the modal reads
 * as moments, not a stats wall). SDF replaces them with verified, per-project
 * accomplishments before any public round; the shape is stable so a later
 * `highlights` field on the AwardNominees collection can drop straight in.
 */

export type HighlightKind = "growth" | "launch" | "reach" | "milestone";

/**
 * An optional metric renders as a rolling-digit odometer that counts up when
 * the sheet opens. `grounded` marks values taken straight from the project's
 * blurb (e.g. "nearly 200 countries"); anything else is illustrative demo
 * momentum and must be replaced with real on-chain data before a public round.
 */
export interface HighlightMetric {
	value: number;
	prefix?: string;
	/** number-sized affix, e.g. "+" or "×". */
	suffix?: string;
	/** small unit/label rendered under the rolled number, e.g. "chains". */
	caption?: string;
}

export interface Highlight {
	kind: HighlightKind;
	headline: string;
	detail: string;
	metric?: HighlightMetric;
}

export const NOMINEE_HIGHLIGHTS: Record<string, Highlight[]> = {
	// ── Impact ──
	decaf: [
		{
			kind: "reach",
			headline: "Cash-out reached further",
			detail: "Remittances landed in more corridors than ever before.",
			metric: { value: 200, caption: "countries" },
		},
		{
			kind: "launch",
			headline: "New off-ramps went live",
			detail: "More ways to turn USDC into money in a hand.",
		},
		{
			kind: "growth",
			headline: "Volume kept climbing",
			detail: "Everyday people moved more value home, month over month.",
		},
	],
	beans: [
		{
			kind: "growth",
			headline: "More families onboarded",
			detail: "Payments simple enough that nobody had to explain them.",
		},
		{
			kind: "launch",
			headline: "The app got simpler still",
			detail: "New flows that tuck the crypto completely out of sight.",
		},
		{
			kind: "milestone",
			headline: "Stellar rails, made invisible",
			detail: "Money that just moves — no jargon, no friction.",
		},
	],
	elsa: [
		{
			kind: "reach",
			headline: "Dollars reached more wallets",
			detail: "Savings that quietly outrun local inflation.",
		},
		{
			kind: "growth",
			headline: "Balances held their value",
			detail: "More paychecks kept their worth through the year.",
		},
		{
			kind: "launch",
			headline: "New saving tools shipped",
			detail: "Everyday dollar accounts, a few taps away.",
		},
	],
	meru: [
		{
			kind: "reach",
			headline: "More freelancers got paid",
			detail: "A dollar account in every LatAm pocket.",
		},
		{
			kind: "growth",
			headline: "Cross-border payouts climbed",
			detail: "Getting paid stopped meaning waiting on a bank.",
		},
		{
			kind: "launch",
			headline: "New payout rails opened",
			detail: "More ways for the region to receive and spend.",
		},
	],
	// ── Innovation ──
	etherfuse: [
		{
			kind: "launch",
			headline: "Real-world yield, on-chain",
			detail: "Tokenized government bonds became a Stellar primitive.",
		},
		{
			kind: "growth",
			headline: "More yield flowed on-chain",
			detail: "TradFi returns, now composable with everything else.",
		},
		{
			kind: "milestone",
			headline: "Bridged TradFi and Stellar",
			detail: "The kind of asset a whole ecosystem can build on.",
		},
	],
	blend: [
		{
			kind: "growth",
			headline: "Liquidity kept compounding",
			detail: "Isolated pools drew deposits all year long.",
		},
		{
			kind: "launch",
			headline: "New pool primitives shipped",
			detail: "More ways to lend, borrow and wall off risk.",
		},
		{
			kind: "reach",
			headline: "Builders kept plugging in",
			detail: "Became a default money-market layer on Soroban.",
		},
	],
	sorobanhooks: [
		{
			kind: "launch",
			headline: "Contracts learned to react",
			detail: "Event-driven automation for Soroban went live.",
		},
		{
			kind: "growth",
			headline: "More hooks firing every week",
			detail: "Automations that let contracts answer the world.",
		},
		{
			kind: "milestone",
			headline: "Made Soroban feel alive",
			detail: "Reactive infrastructure the ecosystem was missing.",
		},
	],
	reflector: [
		{
			kind: "reach",
			headline: "Feeds turned up everywhere",
			detail: "The oracle nearly every Soroban protocol leaned on.",
		},
		{
			kind: "growth",
			headline: "More feeds, more consumers",
			detail: "Decentralized prices, wired into more of the stack.",
		},
		{
			kind: "milestone",
			headline: "Became the canonical oracle",
			detail: "The reference point the ecosystem trusts.",
		},
	],
	// ── Interoperability ──
	defindex: [
		{
			kind: "launch",
			headline: "Strategies became one-click",
			detail: "Whole DeFi indexes any wallet can embed.",
		},
		{
			kind: "reach",
			headline: "Plugged into more wallets",
			detail: "One integration, a shelf of strategies.",
		},
		{
			kind: "growth",
			headline: "More strategies indexed",
			detail: "A widening menu of ways to put capital to work.",
		},
	],
	allbridge: [
		{
			kind: "reach",
			headline: "Connected more chains",
			detail: "Stellar liquidity flowed further out into the world.",
			metric: { value: 12, caption: "chains" },
		},
		{
			kind: "growth",
			headline: "Bridged volume climbed",
			detail: "Value came in, value went out — all year.",
		},
		{
			kind: "milestone",
			headline: "Stellar, on the bridge map",
			detail: "A dozen networks, one liquidity path.",
		},
	],
	"usdc-swap": [
		{
			kind: "reach",
			headline: "Five networks, one feel",
			detail: "Cross-chain USDC without the five-step headache.",
			metric: { value: 5, caption: "networks" },
		},
		{
			kind: "growth",
			headline: "More USDC moved cross-chain",
			detail: "Stablecoin that treats chains like one network.",
		},
		{
			kind: "launch",
			headline: "New routes went live",
			detail: "Shorter hops between where dollars live.",
		},
	],
	rubic: [
		{
			kind: "reach",
			headline: "Chains on the map",
			detail: "And this year, Stellar joined the route.",
			metric: { value: 70, suffix: "+", caption: "chains" },
		},
		{
			kind: "growth",
			headline: "More routes aggregated",
			detail: "The best path found, wherever value needed to go.",
		},
		{
			kind: "launch",
			headline: "Stellar routing shipped",
			detail: "A new lane into the ecosystem, opened up.",
		},
	],
};

export function highlightsFor(slug: string): Highlight[] {
	return NOMINEE_HIGHLIGHTS[slug] ?? [];
}
