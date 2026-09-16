/**
 * GET /api/awards/anchor?round=<slug> — is this round's published result
 * anchored on MAINNET?
 *
 * The vote is on testnet (reset 2–4×/year). When a round's results file is
 * committed to this public repo, the tansu-anchor lane commits that git SHA
 * to Tansu (tansu.dev) on mainnet and records { commitSha, txHash } on the
 * round. This endpoint reads the round's record, reads the chain
 * (`get_commit(keccak256("stellarlight"))` via Soroban RPC simulation), and
 * says whether they agree — so the claim "anchored on mainnet" is checked,
 * not asserted. Public, aggregate-only information; cached 5 minutes.
 */

import { type NextRequest, NextResponse } from "next/server";
import {
	type AnchorRecord,
	anchorVerdict,
	type ChainState,
	classifyChainError,
	mainnetExplorerContractUrl,
	mainnetExplorerTxUrl,
	TANSU_PROJECT_NAME,
	TANSU_PROJECT_URL,
	type TansuClient,
	tansuClient,
	tansuProjectKey,
	tansuProjectPageUrl,
	unwrapResult,
} from "@/lib/awards/tansu";
import { methodNotAllowed } from "@/lib/method-not-allowed";
import { getPayloadSafe } from "@/lib/payload-client";
import { rateLimit, rateLimitHeaders } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; body: Record<string, unknown> }>();
let client: Promise<TansuClient> | null = null;

async function readChain(): Promise<{
	onChain: string | null;
	state: ChainState;
}> {
	try {
		client ??= tansuClient();
		const tx = await (await client).get_commit({
			project_key: tansuProjectKey(),
		});
		const r = unwrapResult<string>(tx.result);
		if (!r.ok) return { onChain: null, state: "unregistered" };
		return { onChain: r.value || null, state: "ok" };
	} catch (err) {
		client = null; // a stale client is the one thing worth retrying next time
		return { onChain: null, state: classifyChainError(err) };
	}
}

export async function GET(req: NextRequest) {
	const limit = rateLimit(req, {
		endpoint: "/api/awards/anchor",
		limit: 60,
		windowMs: 5 * 60 * 1000,
	});
	if (!limit.allowed) {
		return NextResponse.json(
			{ error: "rate limit exceeded" },
			{ status: 429, headers: rateLimitHeaders(limit) },
		);
	}
	const slug = (req.nextUrl.searchParams.get("round") ?? "").trim();
	if (!slug) {
		return NextResponse.json(
			{ error: "provide ?round=<slug>" },
			{ status: 400, headers: rateLimitHeaders(limit) },
		);
	}

	const cached = cache.get(slug);
	if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
		return NextResponse.json(cached.body, { headers: rateLimitHeaders(limit) });
	}

	const payload = await getPayloadSafe();
	if (!payload) {
		return NextResponse.json(
			{ error: "database unavailable" },
			{ status: 503, headers: rateLimitHeaders(limit) },
		);
	}
	const rounds = await payload.find({
		collection: "award-rounds",
		where: { slug: { equals: slug } },
		limit: 1,
		depth: 0,
	});
	const round = rounds.docs[0];
	if (!round) {
		return NextResponse.json(
			{ error: "no such round" },
			{ status: 404, headers: rateLimitHeaders(limit) },
		);
	}
	const anchor = (round.anchor ?? null) as AnchorRecord | null;
	const { onChain, state } = await readChain();
	const verdict = anchorVerdict(anchor?.commitSha ?? null, onChain, state);

	const at = Date.now();
	const body = {
		round: slug,
		project: TANSU_PROJECT_NAME,
		projectKey: tansuProjectKey().toString("hex"),
		verdict,
		anchor: anchor
			? { commitSha: anchor.commitSha, txHash: anchor.txHash, at: anchor.at }
			: null,
		onChain,
		links: {
			commit: anchor ? `${TANSU_PROJECT_URL}/commit/${anchor.commitSha}` : null,
			tx: anchor?.txHash ? mainnetExplorerTxUrl(anchor.txHash) : null,
			contract: mainnetExplorerContractUrl(),
			tansu: tansuProjectPageUrl(),
		},
		cachedAt: new Date(at).toISOString(),
	};
	cache.set(slug, { at, body });
	return NextResponse.json(body, { headers: rateLimitHeaders(limit) });
}

export const POST = methodNotAllowed(["GET"]);
export const PUT = methodNotAllowed(["GET"]);
export const DELETE = methodNotAllowed(["GET"]);
export const PATCH = methodNotAllowed(["GET"]);
