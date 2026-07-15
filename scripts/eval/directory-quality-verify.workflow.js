// Directory-quality VERIFIER — the Scale-AI verify layer of the
// detector → verify → curate flywheel (boxy 2026-07-15).
//
// The deterministic detectors (report-liveness.ts, report-tag-mismatch.ts)
// surface CANDIDATES cheaply but can't tell a moved domain from a dead one, or
// a real mistag from a passing mention. This workflow does the verification:
// one agent per candidate web-checks the project and returns a UNIFIED verdict
// covering BOTH axes in a single visit —
//   liveness:  live | partially-live | dead   (partially-live = entity alive
//              but the Stellar product is announced/testnet/not-yet-deployed —
//              Tyler's sls-023 DTCC case)
//   tagging:   the correct `types` for the record, from what it actually does
// — with concrete evidence + a confidence. High-confidence verdicts become
// STATUS_FIX / TYPES_SET rows in curate-projects.ts (auto-apply high, queue the
// rest); a moved/quiet-but-alive product is NEVER marked dead (class 18).
//
// Run:  Workflow({ scriptPath: "scripts/eval/directory-quality-verify.workflow.js",
//                  args: <candidate array from either detector --json> })
// Each candidate: { slug, name, website, currentTypes, desc, status }.

export const meta = {
	name: 'directory-quality-verify',
	description: 'Web-verify project liveness (live/partial/dead) + correct tags per candidate',
	phases: [{ title: 'Verify', detail: 'one agent per candidate; unified liveness+tag verdict' }],
}

const VALID_TYPES = [
	'Wallet', 'DEX', 'Lending', 'Bridge', 'Infrastructure', 'Payments', 'Anchor',
	'SDK', 'Indexer', 'Explorer', 'Analytics', 'AI', 'Gaming', 'Education',
	'Security', 'NFT', 'RWA', 'Stablecoin', 'Social Impact', 'RPC', 'Faucet',
]

const VERDICT = {
	type: 'object',
	required: ['slug', 'liveness', 'correctTypes', 'confidence', 'evidence'],
	properties: {
		slug: { type: 'string' },
		liveness: { type: 'string', enum: ['live', 'partially-live', 'dead', 'uncertain'] },
		currentUrl: { type: ['string', 'null'], description: 'current/moved official site if it moved' },
		correctTypes: {
			type: 'array',
			items: { type: 'string', enum: VALID_TYPES },
			description: 'the types the record SHOULD carry based on what it actually does (empty [] for an oracle — no Oracle type exists)',
		},
		tagChanged: { type: 'boolean', description: 'true if correctTypes differs from the current types' },
		recommendedStatus: { type: 'string', enum: ['Live', 'Development', 'Inactive', 'keep'] },
		confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
		evidence: { type: 'string', description: 'concrete evidence: URLs + dates + what the product actually is/does' },
	},
}

const candidates = typeof args === 'string' ? JSON.parse(args) : (args || [])
if (!candidates.length) return { error: 'no candidates passed as args' }

const results = await parallel(
	candidates.map((c) => () =>
		agent(
			`Verify one Stellar ecosystem project on TWO axes at once — is it alive, and is it correctly tagged. Use WebFetch + WebSearch (load via ToolSearch: "select:WebFetch,WebSearch"). Be conservative; ground every claim.

Project: ${c.name} (slug: ${c.slug})
Listed website: ${c.website ?? 'none on record'}
Current types: [${(c.currentTypes || []).join(', ')}]   status: ${c.status}
Description on file: ${c.desc}

1. LIVENESS — load the site (try www/http variants + web-search for a moved/rebranded current site). Decide:
   - "live": product reachable + shows activity.
   - "partially-live": the org/entity is alive but its STELLAR product is only announced / testnet / not-yet-deployed (e.g. "coming H1 2027"). This is a real, distinct state — use it.
   - "dead": defunct — dead/parked domain AND no moved site AND no recent activity AND no app/product presence anywhere. Be conservative: a moved domain or a quiet-but-alive product is NOT dead.
   - "uncertain": can't tell.
   recommendedStatus: Live / Development (partially-live) / Inactive (dead) / keep.
2. TAGGING — from what the product ACTUALLY does (per its own site), return correctTypes from this enum only: ${VALID_TYPES.join(', ')}. Pick the PRIMARY function type(s) (e.g. a lending protocol = ["Lending"], a hardware/custody wallet = ["Wallet"], an oracle = [] since there is no Oracle type). Set tagChanged=true if that differs from the current types.

Return the structured verdict with concrete evidence (URLs + dates).`,
			{ label: `verify:${c.slug}`, phase: 'Verify', schema: VERDICT, effort: 'low' },
		),
	),
)

const clean = results.filter(Boolean)
const dead = clean.filter((r) => r.liveness === 'dead')
const partial = clean.filter((r) => r.liveness === 'partially-live')
const retag = clean.filter((r) => r.tagChanged)
log(`verified ${clean.length}/${candidates.length}: ${dead.length} dead, ${partial.length} partially-live, ${retag.length} need re-tag`)

// High-confidence, action-ready rows (auto-apply tier); the rest go to the
// human review queue.
const autoApply = clean.filter(
	(r) => r.confidence === 'high' && (r.liveness === 'dead' || r.tagChanged),
)
const queue = clean.filter((r) => !autoApply.includes(r) && (r.liveness === 'dead' || r.liveness === 'partially-live' || r.tagChanged))
return { autoApply, queue, all: clean }
