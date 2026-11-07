/**
 * Enrich projects with data from the Stellar Community Fund (SCF).
 *
 * Fetches the public SCF projects API and matches against our DB by name/slug.
 * Pulls in: thumbnail images, category mapping, award status.
 *
 * For matched projects with detail pages, scrapes additional data:
 * description, links (website, X, github), team info, funding amounts.
 *
 * Usage:
 *   npx tsx scripts/enrich-from-scf.ts                  # Dry run
 *   npx tsx scripts/enrich-from-scf.ts --execute        # Write to DB
 */
import "./load-env";
import { getPayload } from "payload";
import configPromise from "../src/payload.config";
import { curatedFieldsFor } from "./data/curation-maps";
import {
	foldLinkNote,
	matchListingRow,
	SCF_SLUG_OVERRIDES,
} from "./data/scf-joins";
import {
	readScfPage,
	type ScfPage,
	scfHold,
	showsAward,
	uniqueNames,
} from "./eval/scf-official";

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");

const stats = {
	scfProjects: 0,
	matched: 0,
	unmatched: 0,
	enriched: 0,
	scfDataUpdated: 0,
	thumbnailsFetched: 0,
	descriptionsAdded: 0,
	linksAdded: 0,
	skipped: 0,
	held: 0,
	errors: 0,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Download image buffer */
async function downloadImage(
	url: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const res = await fetch(url, {
			headers: {
				"User-Agent":
					"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
			},
			redirect: "follow",
		});
		if (!res.ok) return null;
		const ct = res.headers.get("content-type") || "image/jpeg";
		const buf = Buffer.from(await res.arrayBuffer());
		if (buf.length < 500) return null;
		return { buffer: buf, contentType: ct };
	} catch {
		return null;
	}
}

function getExtension(ct: string): string {
	const map: Record<string, string> = {
		"image/png": ".png",
		"image/jpeg": ".jpg",
		"image/jpg": ".jpg",
		"image/gif": ".gif",
		"image/webp": ".webp",
	};
	return map[ct.split(";")[0]] || ".jpg";
}

/** Scrape project detail page for additional data */
async function scrapeDetailPage(slug: string): Promise<ScfPage | null> {
	try {
		const res = await fetch(
			`https://communityfund.stellar.org/project/${slug}`,
			{
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
					Accept: "text/html",
				},
			},
		);
		if (!res.ok) return null;
		return readScfPage(await res.text(), slug);
	} catch {
		return null;
	}
}

/**
 * SCF encodes an award it does not number (Public Goods, Liquidity, RFP) as a
 * NEGATIVE lastAwardedRound code on the page — the award-detection below reads
 * those codes deliberately. They are not round numbers, so they must never
 * reach the stored field: six rows served `lastAwardedRound: -326` (and one
 * page carries -226), which reads as a real round to every consumer. Awards
 * without a number carry their own `awardName` in roundAwards instead.
 */
const storedRound = (v: unknown): number | null =>
	typeof v === "number" && v > 0 ? v : null;

async function main() {
	console.log("=== Enrich Projects from Stellar Community Fund ===");
	console.log(`Mode: ${dryRun ? "DRY RUN" : "EXECUTE"}`);
	console.log("");

	// 1. Fetch SCF projects
	console.log("Fetching SCF projects...");
	const scfRes = await fetch(
		"https://communityfund.stellar.org/backend/projects",
	);
	if (!scfRes.ok) {
		console.error(`Failed to fetch SCF projects: ${scfRes.status}`);
		process.exit(1);
	}
	const scfProjects: any[] = await scfRes.json();
	stats.scfProjects = scfProjects.length;
	console.log(`Fetched ${scfProjects.length} SCF projects\n`);
	// An EMPTY listing is an outage, not a clean sweep (the silent-params /
	// empty-vs-empty class): 200-with-zero-rows must not exit green.
	if (scfProjects.length === 0) {
		console.error(
			"✗ SCF listing returned 0 projects — outage or contract change; exiting 1.",
		);
		process.exit(1);
	}

	// 2. Connect to Payload
	console.log("Connecting to database...");
	const payload = await getPayload({ config: configPromise });
	console.log("Connected.\n");

	// 3. Build lookup of our projects by normalized name and slug
	let page = 1;
	const ourProjects: any[] = [];
	while (true) {
		const r = await payload.find({
			collection: "projects",
			limit: 100,
			page,
			depth: 0,
		});
		ourProjects.push(...r.docs);
		if (!r.hasNextPage) break;
		page++;
	}
	console.log(`Loaded ${ourProjects.length} projects from DB\n`);

	const bySlug = new Map<string, any>();
	for (const p of ourProjects) bySlug.set(p.slug, p);
	// a lineage shadow and its canonical row are one project
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	const identityOf = (p: any) =>
		p.canonicalSlug && bySlug.has(p.canonicalSlug) ? p.canonicalSlug : p.slug;
	// One exact name, one project (sls-111): a name two projects carry joins
	// neither. The map used to keep whichever row loaded last.
	const byNormName = uniqueNames(ourProjects, identityOf, (name, rows) =>
		console.log(
			`  shared name "${name}": ${rows.map((r) => r.slug).join(", ")}; no page joins either by name, a person decides`,
		),
	);

	// 4. Match and enrich (SCF_SLUG_OVERRIDES: scripts/data/scf-joins.ts)

	// Pages BEYOND the 500-row listing cap (2026-09-06). /backend/projects
	// serves the same 500 rows whatever it is asked (search/round/page/offset/
	// limit/sort all ignored), so an SCF project outside that page can never
	// reach the name matcher above — Blend was patched by hand, Mystic
	// Finance's r29 award sat unread. Discovery ran ONCE, offline: the official
	// per-round pages (/awards/<recId>, 46 rounds, 3,195 submissions keyed by
	// project record id; /project/<recId> resolves to the canonical page) for
	// numbered rounds, plus the Wayback CDX index of /project/* for the awards
	// SCF does not number (Liquidity, Public Goods). Every entry: page parsed
	// with parseRoundVerdicts, and the site / GitHub org / X handle on the page
	// matched our row's links — or, where the page carries no links, the name
	// is coined / Stellar-specific and unambiguous (marked "name"). Keyed by
	// OUR slug → SCF page slug: the reverse of SCF_SLUG_OVERRIDES, which only
	// re-keys rows already IN the listing and can never reach these.
	// Left out on purpose: pages whose cards are all negative verdicts,
	// Kickstart-only pages ("SCF Kickstart #N" cards are neutral to the
	// parser), and name collisions (SCF #2's 2018 "StellarPay" ≠ our x402
	// row; Wally / Sendit / Relax / Grip / Amber carry no links to confirm),
	// and pages already attached to another row — one page never joins two
	// rows; a fossil join is cleared by curation first (pen ← opengrants-fdb,
	// SCF_FIX unlink, 2026-09-06) and only then mapped here.
	// Amounts are the page's own budgets; "undisclosed" = award confirmed,
	// no budget on the page (stored as amountUSD null, never 0).
	const SCF_PAGES_BEYOND_CAP: Record<string, string> = {
		accelar: "accelar-2td", // #26 $33,000 · site+github: accelar.io, github.com/accelar-labs
		"art-club": "art-club-ia2", // #26 $40,000 · github: github.com/grmarkkes
		artizen: "artizen-ngf", // #33 $130,000 · site+github: artizen.fund, github.com/artizen-fund
		assetdesk: "assetdesk-kqx", // #19 $70,000 · site: assetdesk.xyz
		astrocore: "astrocore-4xe", // #2 undisclosed · name: astroband's Stellar core port, SCF #2
		astrograph: "astrograph-thf", // #1 undisclosed · name: astroband's Stellar GraphQL, SCF #1
		autify: "autify-network-nxv", // #14 $15,000 · site: autifynetwork.com
		"scaffold-stellar": "scaffold-stellar-ldy", // PG Q2 '26 undisclosed · github: github.com/theahaco — awarded=true was hand-patched with no page
		blend: "blend-mfy", // Liquidity '24 Q1 $50,000 · site+github: blend.capital, github.com/blend-capital — awarded=true was hand-patched with no page; the page is not numbered-round listed (Wayback CDX only)
		blockedenxyz: "blockedenxyz-6du", // #18 $139,999 · site+github: blockeden.xyz, github.com/blockedenhq
		blocknify: "blocknify-5bv", // #6 $4,543.37 · #7 $131,973.75 · name: coined name
		borderless: "borderless-u3x", // #20 $43,000 · #22 $82,500 · site+github: borderlesspayments.xyz, github.com/borderless-payments
		bravepay: "bravepay-tze", // #11 $200,000 · site: bravepay.net
		btq: "btq-jva", // #14 $10,000 · site: btq.com
		cede: "cede-labs-fxy", // #31 $119,800 · site+github: cede.store, github.com/cedelabs
		chaincerts: "chaincerts-u04", // #13 $75,000 · #18 $103,125 · site+github: chaincerts.co, github.com/kommitters
		"chainlink-oracles-relayer": "chainlink-oracles-relayer-c5f", // #15 $38,400 · site+github: docs.relink.services, github.com/relinkservices
		chef: "chef-c8c", // #22 $18,000 · site: github.io/stellar-chef, stellar-chef.github.io
		chronospay: "chronospay-nrb", // #11 $65,000 · site: chronospay.io
		"city-states": "city-states-medieval-70v", // #2 undisclosed · name: our host citystatesm = "City States: Medieval"
		clear: "clear-4rw", // #26 $45,000 · site: borderlesspayments.xyz
		"clickpesa-debt-fund": "clickpesa-debt-fund-ssc", // #26 $30,000 · #28 $95,000 · name: product-named, same company (ClickPesa)
		clob: "clob-qoi", // #29 $72,019 · site: ideasoft.io
		coinsender: "coinsender-f7q", // #24 $23,440 · site+github: coinsender.io, github.com/megadev-ou
		constellation: "constellation-protocol-4uv", // #19 $110,000 · #23 $100,000 · github: github.com/constellation-protocol
		copperx: "copperx-gateway-and-payout-yhf", // #29 $50,000 · site+github: copperx.io, github.com/copperxhq
		dappradar: "dappradar-e06", // #27 $50,000 · #34 $95,000 · site: dappradar.com, x.com/dappradar
		deb: "deb-sj5", // #6 $653.09 · site: demo.drivedeb.com, drivedeb.com
		dropzey: "dropzey-in4", // #23 $38,500 · site+github: dropzey.com, github.com/zainh332
		"elixir-stellar-sdk": "elixir-stellar-sdk-wib", // #10 $12,000 · github: github.com/kommitters
		elsa: "elsa-wallet-banking-filipinos-hcg", // #11 $95,000 · site: elsa.care
		emigro: "emigro-jp6", // #17 $46,400 · #20 $33,920 · #25 $90,000 · site+github: emigro.co, github.com/emigro
		empowch: "empowch-eh9", // #11 $25,000 · site: empowch.com
		fijicoin: "fijicoin-frq", // #8 $50,000 · site: mai.money
		"flutter-stellar-sdk": "flutter-stellar-sdk-ilm", // PG Q2 '26 undisclosed · PG Q3 '25 undisclosed · PG Q4 '25 undisclosed · github: github.com/soneso
		flux: "flux-yu0", // #22 $38,000 · site: iflux.app
		"fx-swap": "fx-swap-by-hedgehog-unu", // #21 $42,450 · site: hedgeeffective.com
		getpaid: "getpaid-z9y", // #9 $192,500 · site: getpaid.africa
		"governance-modules-library": "governance-modules-library-nr4", // #22 $27,000 · #26 $74,000 · github: github.com/blockscience
		handlpay: "handlpay-ah3", // #30 $60,000 · site+github: github.com/handlpay, handlpay.com
		hiyield: "hiyield-0e4", // #18 $150,000 · site: hiyield.xyz
		icanproveit: "icanproveit-proof-of-learning-icn", // #26 $50,000 · github: github.com/tuvalusoftware
		idunu: "idunu-help-kids-thrive-3tm", // #21 $15,000 · #25 $15,000 · name: coined name
		"infinity-wallet": "infinity-wallet-f7m", // #16 $130,000 · site+github: github.com/infinitywallet, infinitywallet.io
		"ios-stellar-sdk": "ios-stellar-sdk-tdq", // PG Q2 '26 undisclosed · PG Q3 '25 undisclosed · PG Q4 '25 undisclosed · github: github.com/soneso
		"java-stellar-sdk": "java-stellar-sdk-btq", // PG Q2 '26 undisclosed · PG Q3 '25 undisclosed · PG Q4 '25 undisclosed · github: github.com/lightsail-network
		"js-worker-sdk": "js-worker-sdk-rjo", // #24 $12,500 · #27 $35,000 · github: github.com/cloudouble
		katagames: "katagames-r2t", // #11 $25,000 · site: kata.games, x.com/createplayearn
		keizai: "keizai-qfe", // #21 $43,000 · #28 $41,000 · github: github.com/keizai-tools
		"kmac-state-machine-template": "kmac-state-machine-template-extension-jqw", // #20 $7,500 · github: github.com/huitemagico
		"kotlin-stellar-sdk": "kotlin-stellar-sdk-fjl", // #9 $11,500 · github: github.com/rahimklaber
		kript: "kript-pva", // #27 $35,000 · #32 $77,000 · site: kriptup.io
		kunst21: "kunst21com-ray", // #9 undisclosed · name: SCF title is our host kunst21.com
		"legacy-suite": "legacy-suite-on-stellar-zpd", // #24 $49,998 · site+github: github.com/avento-labs, legacysuite.com
		lumenscan: "lumenscan-bwl", // #4 undisclosed · name: Lumen-specific name
		mica: "mica-ckw", // #16 $138,700 · site+github: github.com/micatechnology, mica.rent
		mojoflower: "mojoflower-mq4", // #7 $196,415 · #11 $47,500 · #17 $100,000 · github: github.com/mojoflower-garden
		mystic: "mystic-finance-xp7", // #29 $47,000 · site: mysticfinance.xyz
		"net-sdk": "net-sdk-cfe", // PG Q2 '26 undisclosed · PG Q4 '25 undisclosed · github: github.com/beans-bv
		"nirvana-labs": "nirvana-labs-4eh", // #26 $36,000 · site: nirvanalabs.io
		oinc: "oinc-kix", // #17 $105,000 · site: com.br, useoinc.com.br
		okashi: "okashi-oee", // #13 $82,000 · #15 $124,800 · #20 $100,000 · #24 $100,000 · site+github: github.com/okashi-dev, okashi.dev
		omnilumen: "omnilumen-dyk", // #28 $50,000 · github: github.com/omnilumen
		// scf.awarded was true with $48,000 and no page anywhere — an uncited award.
		// The page's own SCF #27 Legacy v5.0 Activation budget is $48,000, equal to
		// the figure already on our row, and its links (orally.net,
		// github.com/orally-network) match the product's name.
		orally: "orally-network-76g", // #27 $48,000 · amount+name
		"open-gamefi-sdk": "open-gamefi-sdk-ibv", // #28 $39,000 · github: github.com/yanis7774
		opengrants: "opengrants-fdb", // PG Q2 '26 undisclosed · PG Q3 '25 undisclosed · PG Q4 '25 undisclosed · site+github: opengrants.net, github.com/metagov/daostar
		ortege: "ortege-ai-tsm", // #18 $11,200 · #22 $40,000 · #26 $100,000 · github: github.com/ortege-xyz
		paysapp: "paysapp-l02", // #3 undisclosed · name: coined name (kuyawa)
		"planet-pay": "planet-pay-lxg", // #14 $49,500 · #21 $96,000 · github: github.com/scalemote
		plutope: "plutope-merchant-app-zmh", // #27 $33,400 · github: github.com/plutopein, x.com/plutopeio
		poma: "poma-protocol-s3f", // #29 $14,000 · github: github.com/poma-protocol, x.com/pomaprotocol
		qolaq: "qolaq-wev", // #13 $150,000 · site: qolaq.org
		qstn: "qstn-3rv", // #20 $2,500 · site: qstn.us
		ramm: "ramm-global-retail-commerce-zbg", // #22 $38,500 · site+github: github.com/jamiels, ramm.ai
		rarible: "rariblecom-stellar-ujd", // #30 $150,000 · site+github: github.com/rarible, rarible.com
		sanctum: "sanctum-cfe", // #23 $50,000 · #25 $85,000 · github: github.com/zkbricks
		securx: "securx-medical-prescriptions-xmt", // #27 $42,400 · site: securxtech.wixsite.com, wixsite.com/securx
		silicore: "silicore-wrz", // #29 $31,000 · github: github.com/ilanklim
		"simple-signer": "simple-signer-ei9", // #9 $10,000 · github: github.com/fsodano
		solarkraft: "solarkraft-jdu", // #24 $50,000 · #29 $67,000 · github: github.com/freespek
		"soroban-explorer": "soroban-explorer-rtb", // #19 $61,000 · #23 $100,000 · site: sorobanexp.com
		"soroban-polygon-interop": "soroban-polygon-interop-3gz", // #27 $42,755 · site: entethalliance.github.io, github.io/crosschain-interoperability
		"soroban-pre-order-contract": "soroban-pre-order-contract-ucp", // #12 $1,000 · github: github.com/aolieman
		"soroban-react": "soroban-react-khv", // #20 $25,000 · github: github.com/paltalabs
		sorobanmath: "sorobanmath-zuo", // #20 $40,000 · github: github.com/rahul-soshte
		sorobuild: "sorobuild-zhc", // #22 $44,800 · name: Soroban-specific coined name
		sorosan: "sorosan-twd", // #20 $29,000 · github: github.com/sorosan
		// scf.slug soropg-zcg was hand-set, but the page is outside the 500-row
		// listing, so no pass ever visited it: the row served awarded=true with an
		// empty roundAwards and the page's -226 sentinel as its round. Its one
		// award is a partial disbursement ("Awarded (50%)"), which only became
		// readable with the status fix in the same batch.
		soropg: "soropg-zcg", // PG Q2 '26 undisclosed · site+github: soropg.com, github.com/jamesbachini
		sorosplits: "sorosplits-9w7", // #19 $59,700 · #23 $94,000 · site+github: github.com/findolor, sorosplits.xyz
		sorostarter: "sorostarter-9b2", // #29 $47,175 · github: github.com/sorostarter, x.com/sorostarter
		spacewalk: "spacewalk-sel", // #11 $100,000 · site+github: github.com/pendulum-chain, pendulumchain.org
		spatium: "spatium-wallet-7ii", // #13 $148,000 · #22 $35,200 · name: coined wallet name, spatium.net on page
		starloom: "starloom-ox2", // #26 $45,900 · site: starloom.io
		"stellar-nest": "stellar-nest-thq", // #25 $14,800 · github: github.com/alkeops
		"stellar-tip": "stellar-tip-pj5", // #4 undisclosed · name: Stellar-specific name
		"stellar-token-launchpad": "stellar-token-launchpad-flp", // #24 $40,000 · site+github: github.com/cryptixag, tokenlaunchpad.eu
		"stellar-tools": "stellar-tools-6qw", // #26 $18,700 · site+github: github.com/joaquinsoza, stellartools.xyz
		stellarguard: "stellarguard-41d", // #1 undisclosed · name: Stellar-specific name
		stellarmint: "stellarmint-ece", // #5 $51,277.94 · site: stellarmint.io
		stellarport: "stellarport-gfe", // #2 undisclosed · name: Stellar-specific name
		stellarprodev: "stellarprodev-z0n", // #17 $39,880 · #29 $26,000 · site+github: github.com/omeganetwork-tech, stellarpro.dev
		stellarscamreport: "stellarscamreport-wir", // #6 $5,445 · site: stellarscam.report
		stellot: "stellot-vp7", // #4 undisclosed · name: Stellar-specific coined name
		"storehouse-gold": "storehouse-gold-to-stellar-nlz", // #26 $50,000 · name: distinctive product name
		stroopyai: "stroopyai-e5a", // #20 $21,370 · site: stroopy.ai
		tap4change: "tap4change-wgd", // #21 $73,280 · site: tap4change.org
		taskio: "taskio-87z", // #7 $283,499 · site: task.io
		teken: "teken-easy-multi-signatures-avi", // #28 $29,500 · github: github.com/moonbite-gmbh
		"timed-transactions-api": "timed-transactions-api-shu", // #1 undisclosed · name: SCF #1 project, name unambiguous
		tracee: "tracee-jnz", // #16 $128,925 · github: github.com/tracee1910
		triiyo: "triiyo-5cf", // #22 $50,303 · site: triiyo.com
		uils: "uils-yl5", // #17 $141,027.50 · name: coined name, uils.la on page, no links on our row
		walletban: "walletban-n32", // #20 $20,000 · site: walletban.xyz
		"web3-antivirus": "web3-antivirus-w3a-a37", // #28 $50,000 · github: github.com/web3-antivirus
		xycloans: "xycloans-qqr", // #13 $31,800 · Liquidity '24 Q1 $50,000 · github: github.com/xycloo
		zentra: "zentra-cxp", // #23 $18,200 · site+github: github.com/tosinshada, tide-soroban-contract-frontend.vercel.app
		ziriz: "ziriz-my0", // #22 $48,000 · github: github.com/zirizapp
	};

	const matched: { scf: any; ours: any }[] = [];
	const unmatched: string[] = [];

	for (const scf of scfProjects) {
		let ours = matchListingRow(
			scf,
			{ rows: ourProjects, bySlug, byNormName, identityOf },
			(proj, why) =>
				console.log(
					`  partial REJECTED (${why}): ours "${proj.name}" vs SCF "${scf.title}"`,
				),
		);

		// A lineage shadow (Draft + canonicalSlug, #1337) is not a record. The
		// name matcher joined "Liqvid" to the parked duplicate `liqvid` and wrote
		// the page there, while the canonical `liqvidxyz` kept a dead slug and no
		// round awards. Re-key to the canonical row — one page, one row.
		if (ours?.canonicalSlug) {
			const canon = bySlug.get(String(ours.canonicalSlug));
			if (canon) {
				console.log(
					`  ${ours.slug}: shadow of ${canon.slug} — page ${scf.slug} re-keyed to the canonical row`,
				);
				ours = canon;
			}
		}
		if (ours) {
			matched.push({ scf, ours });
		} else {
			unmatched.push(scf.title);
		}
	}

	stats.matched = matched.length;
	stats.unmatched = unmatched.length;

	console.log(`Matched: ${matched.length}, Unmatched: ${unmatched.length}\n`);

	if (unmatched.length > 0) {
		console.log("Unmatched SCF projects:");
		for (const name of unmatched) {
			console.log(`  - ${name}`);
		}
		console.log("");
	}

	// 4b. Beyond-cap pages: fetched here, parsed by the SAME scrapeDetailPage,
	// queued as synthetic listing rows for the loop below. Trinary on purpose
	// (awarded / not-awarded-on-page / could-not-parse): a page that cannot be
	// read is reported and exits 2 — never a silent "not awarded".
	const beyondCap = {
		queued: [] as string[],
		notAwarded: [] as string[],
		unparseable: [] as string[],
	};
	const listedSlugs = new Set(scfProjects.map((p) => String(p.slug)));
	const matchedOurSlugs = new Set(matched.map((m) => m.ours.slug));
	for (const [ourSlug, scfSlug] of Object.entries(SCF_PAGES_BEYOND_CAP)) {
		if (listedSlugs.has(scfSlug) || matchedOurSlugs.has(ourSlug)) {
			console.log(
				`  beyond-cap ${scfSlug}: now served by the listing — the normal path owns it`,
			);
			continue;
		}
		const ours = bySlug.get(ourSlug);
		if (!ours) {
			beyondCap.unparseable.push(`${scfSlug} (our row ${ourSlug} missing)`);
			continue;
		}
		const detail = await scrapeDetailPage(scfSlug);
		await sleep(300);
		if (!detail) {
			beyondCap.unparseable.push(
				`${scfSlug} (HTTP error, network failure or no project payload at that slug)`,
			);
			continue;
		}
		if (!showsAward(detail)) {
			if ((detail.verdictSubmissions ?? 0) > 0)
				beyondCap.notAwarded.push(scfSlug);
			else beyondCap.unparseable.push(`${scfSlug} (page verdicts nothing)`);
			continue;
		}
		beyondCap.queued.push(scfSlug);
		matched.push({
			scf: {
				slug: scfSlug,
				title: detail.title ?? ours.name,
				// NOT storedRound() here: this value is the award SIGNAL that
				// isAwarded reads below, and a non-numbered award is encoded as a
				// negative code. Clamping it here flipped every Public Goods row
				// (the four Stellar SDKs, opengrants, scaffold-stellar) to
				// awarded=false in the 2026-09-06 dry run. The clamp belongs only
				// where the value is STORED.
				lastAwardedRound: detail.lastAwardedRound ?? null,
				detail,
			},
			ours,
		});
	}
	console.log(
		`Beyond-cap pages: ${beyondCap.queued.length} awarded (queued) · ${beyondCap.notAwarded.length} not awarded on page (no write) · ${beyondCap.unparseable.length} could not parse\n`,
	);

	// One row, several pages (2026-09-06). A project with a submission-named
	// second page (ctx, untangled, lobster, coala-pay) was written once PER
	// PAGE and the last page won: the exact-replace dropped the other page's
	// award on every execute, curate's promote-only linkage put it back, and
	// the row flipped between runs. Pages mapped to one row are read first and
	// folded into one record: rounds and round awards are the union, the total
	// is the sum of the pages' own totals (undefined when any page withholds
	// it — never derived from round sums), and the citable slug is the page the
	// name matcher joined (the project-named one), else the page with the
	// latest numbered round.
	const byRow = new Map<string, { scf: any; ours: any }[]>();
	for (const m of matched) {
		const list = byRow.get(m.ours.slug) ?? [];
		list.push(m);
		byRow.set(m.ours.slug, list);
	}
	const folded: { scf: any; ours: any }[] = [];
	for (const list of byRow.values()) {
		if (list.length === 1) {
			folded.push(list[0]);
			continue;
		}
		for (const m of list) {
			if (m.scf.detail === undefined) {
				m.scf.detail = await scrapeDetailPage(String(m.scf.slug));
				await sleep(300);
			}
		}
		const ours = list[0].ours;
		const viaOverride = (p: any) =>
			Number(SCF_SLUG_OVERRIDES[String(p.slug)] === ours.slug);
		const top = (p: any) =>
			Math.max(0, ...((p.detail?.awardedRounds ?? []) as number[]));
		const pages = list
			.map((m) => m.scf)
			.sort(
				(a, b) =>
					viaOverride(a) - viaOverride(b) ||
					top(b) - top(a) ||
					String(a.slug).localeCompare(String(b.slug)),
			);
		const primary = pages[0];
		// Two NAME-matched pages on one row are two SCF records titled alike:
		// a second submission of one project (swiftex), a second product of
		// one company (cashabroad's Smart Treasury), or another project's page
		// retitled (wellspring-xuv, RampMeDaddy's page, folded into wellspring
		// until 2026-11-07). A link every page shares with the row (its site,
		// or its exact GitHub repo) confirms the fold; without one a reader
		// must, so the log says WARN.
		const byName = pages.filter((p) => !viaOverride(p));
		if (byName.length > 1) {
			const names = byName.map((p) => p.slug).join(", ");
			const shared = foldLinkNote(
				byName.map((p) => ({
					website: p.detail?.website,
					github: p.detail?.github,
				})),
				ours,
			);
			console.log(
				shared
					? `  ${ours.slug}: ${byName.length} pages joined by name, confirmed by links (${shared}): ${names}`
					: `  WARN ${ours.slug}: ${byName.length} pages joined by NAME alone (${names}), and no link confirms they are one project; confirm before trusting the fold`,
			);
		}
		const details = pages.map((p) => p.detail).filter(Boolean);
		const totals = details.map((d) => d.totalAwarded);
		const seen = new Set<string>();
		const detail = {
			...(primary.detail ?? {}),
			totalAwarded:
				details.length === pages.length &&
				totals.every((t) => typeof t === "number")
					? totals.reduce((a, b) => a + b, 0)
					: undefined,
			awardedRounds: [
				...new Set(details.flatMap((d) => d.awardedRounds ?? [])),
			].sort((a, b) => a - b),
			roundAwards: details
				.flatMap((d) => d.roundAwards ?? [])
				.filter((r) => {
					const k = `${r.round ?? ""}|${r.awardName ?? ""}|${r.amountUSD ?? ""}`;
					if (seen.has(k)) return false;
					seen.add(k);
					return true;
				}),
			verdictSubmissions: details.reduce(
				(n, d) => n + (d.verdictSubmissions ?? 0),
				0,
			),
			verdictAwardedAny: details.reduce(
				(n, d) => n + (d.verdictAwardedAny ?? 0),
				0,
			),
			notAwardedRounds: [
				...new Set(details.flatMap((d) => d.notAwardedRounds ?? [])),
			].sort((a, b) => a - b),
		};
		const lastAwardedRound =
			Math.max(...pages.map((p) => Number(p.lastAwardedRound) || 0)) ||
			primary.lastAwardedRound;
		console.log(
			`  ${ours.slug}: ${pages.length} SCF pages folded → ${primary.slug} (${pages
				.map(
					(p) =>
						`${p.slug} ${p.detail ? `#${(p.detail.awardedRounds ?? []).join(" #") || "—"}` : "unread"}`,
				)
				.join(" + ")})`,
		);
		folded.push({ scf: { ...primary, lastAwardedRound, detail }, ours });
	}

	// 5. Enrich matched projects
	for (const { scf, ours } of folded) {
		console.log(
			`  ${ours.name} ← SCF "${scf.title}" (round ${scf.lastAwardedRound})`,
		);
		const updateData: any = {};

		// --- SCF round data: always update ---
		const currentScf = ours.scf || {};

		// Scrape detail page early so we can include totalAwarded in SCF data
		const detail: Awaited<ReturnType<typeof scrapeDetailPage>> =
			scf.detail ?? (await scrapeDetailPage(scf.slug));

		// The SCF API encodes special award types (Liquidity / Public Goods / RFP)
		// as NEGATIVE lastAwardedRound codes — those ARE awards. The old
		// `lastAwardedRound > 0` check silently dropped Blend, Soroswap, Aquarius,
		// FxDAO, Phoenix, Slender, Scaffold Stellar, SoroPG, the Stellar SDKs, etc.
		// Treat any non-zero round, or a positive totalAwarded / any awarded rounds,
		// as funded.
		const isAwarded =
			(typeof scf.lastAwardedRound === "number" &&
				scf.lastAwardedRound !== 0) ||
			(detail?.totalAwarded ?? 0) > 0 ||
			(detail?.awardedRounds?.length ?? 0) > 0;

		const pageDiffers =
			// provenance first-stamp: a row missing the citation trio IS new data
			// (the trio ships 2026-08-12; without this the stamp only rides award
			// deltas and an already-converged corpus never gets it — the
			// advertised-but-never-persisted class, on the provenance feature
			// itself)
			!currentScf.basis ||
			currentScf.sourceUrl !==
				`https://communityfund.stellar.org/project/${scf.slug}` ||
			currentScf.awarded !== isAwarded ||
			// Compare like with like: the stored field is clamped by storedRound,
			// so testing it against the RAW page signal made every non-numbered
			// award row differ forever — it wrote null, still saw -326, and
			// re-planned on the next run. The Idempotence step caught exactly
			// that: 6 rows (the four Stellar SDKs, opengrants, scaffold-stellar)
			// still planned after the 2026-09-06 execute.
			currentScf.lastAwardedRound !== storedRound(scf.lastAwardedRound) ||
			currentScf.slug !== scf.slug ||
			(detail?.totalAwarded &&
				currentScf.totalAwarded !== detail.totalAwarded) ||
			(detail?.awardedRounds &&
				JSON.stringify(currentScf.awardedRounds) !==
					JSON.stringify(detail.awardedRounds)) ||
			// roundAwards drift: compare on the value tuple only — the stored
			// rows carry Payload array-row ids the scrape doesn't have.
			// awardName is part of the tuple: a non-numbered award has round
			// null, so without the name two different Liquidity Awards compare
			// equal and a real change would read as no drift.
			(detail?.roundAwards &&
				JSON.stringify(
					(currentScf.roundAwards ?? []).map(
						(r: {
							round: number | null;
							awardName?: string | null;
							amountUSD?: number | null;
							awardType?: string | null;
						}) => [
							r.round ?? null,
							r.awardName ?? null,
							r.amountUSD ?? null,
							r.awardType ?? null,
						],
					),
				) !==
					JSON.stringify(
						detail.roundAwards.map((r) => [
							r.round ?? null,
							r.awardName ?? null,
							r.amountUSD,
							r.awardType,
						]),
					));

		// One field, one writer: a human-verified block (curate SCF_FIX) is the
		// writer of record for its values. The page's total can include an
		// ineligible round (aquarius: page $391k, paid $291k), and curate syncs
		// the rounds exactly, so this lane writes nothing to such a row
		// (scfHold below). What the page shows that the block lacks is logged
		// for a human to carry into SCF_FIX (sls-111; until then the lane
		// added it, and curate took it away again).
		const humanOwned = currentScf.basis === "human-verified";
		const storedRounds: number[] = (currentScf.awardedRounds ?? []).map(Number);
		// biome-ignore lint/suspicious/noExplicitAny: Payload array rows
		const storedRA: any[] = currentScf.roundAwards ?? [];
		// biome-ignore lint/suspicious/noExplicitAny: scrape + Payload rows
		const raKey = (r: any) => `${r.round ?? ""}|${r.awardName ?? ""}`;
		const storedRAKeys = new Set(storedRA.map(raKey));
		const addRounds = (detail?.awardedRounds ?? []).filter(
			(r) => !storedRounds.includes(r),
		);
		const addRA = (detail?.roundAwards ?? []).filter(
			(r) => !storedRAKeys.has(raKey(r)),
		);
		const pageUrl = `https://communityfund.stellar.org/project/${scf.slug}`;
		const hasNewData = humanOwned
			? addRounds.length > 0 ||
				addRA.length > 0 ||
				currentScf.slug !== scf.slug ||
				currentScf.sourceUrl !== pageUrl
			: pageDiffers;

		// scfHold (scf-official.ts): curate's rows, a removal an SCF correction
		// made (fix-scf-rounds' poison clears), and an unread false on a page
		// that awards nothing (the coopstable no-resurrect class) all stand. An
		// official-record false (the boolean fix) yields to an award in a round
		// after the rounds the page marks lost. An unread false yields to a
		// page that shows an award in any form: the Awarded-card count alone
		// held enable at false over its page-pinned #45 (2026-10-03).
		const hold = scfHold(currentScf, detail, isAwarded);

		if (hasNewData && hold) {
			console.log(
				`    SCF: HOLD (${hold}); page shows +rounds [${addRounds.join(", ")}] +awards ${addRA.map((r) => `#${r.round ?? r.awardName}:$${r.amountUSD ?? "?"}`).join(" ") || "none"}, slug=${scf.slug}`,
			);
			stats.held++;
		} else if (hasNewData) {
			updateData.scf = {
				awarded: isAwarded,
				lastAwardedRound: storedRound(scf.lastAwardedRound),
				slug: scf.slug,
				// provenance trio: parsed from the official page, dated, citable.
				// human-verified (curate SCF_FIX) outranks the page and must survive
				// enrich passes — the curation-reverted-by-sync class.
				basis:
					currentScf.basis === "human-verified"
						? "human-verified"
						: "official-record",
				asOf: new Date().toISOString().slice(0, 10),
				sourceUrl: `https://communityfund.stellar.org/project/${scf.slug}`,
				...(detail?.totalAwarded ? { totalAwarded: detail.totalAwarded } : {}),
				...(detail?.awardedRounds
					? { awardedRounds: detail.awardedRounds }
					: {}),
				...(detail?.roundAwards?.length
					? { roundAwards: detail.roundAwards }
					: {}),
			};
			console.log(
				`    SCF: awarded=${isAwarded}, round=${scf.lastAwardedRound}, slug=${scf.slug}, totalAwarded=${detail?.totalAwarded ?? "N/A"}, roundAwards=${detail?.roundAwards?.map((r) => `#${r.round}:$${r.amountUSD ?? "?"}`).join(" ") ?? "N/A"}`,
			);
			stats.scfDataUpdated++;
		}

		// --- Thumbnail: use SCF image if project has no logo ---
		if (!ours.logo && scf.thumbnail) {
			const imgUrl =
				scf.thumbnail.url ||
				scf.thumbnail.file?.thumbnails?.large?.url ||
				scf.thumbnail.file?.url;
			if (imgUrl) {
				if (dryRun) {
					console.log(`    WOULD FETCH thumbnail: ${imgUrl.slice(0, 80)}...`);
					stats.thumbnailsFetched++;
				} else {
					const img = await downloadImage(imgUrl);
					if (img) {
						try {
							const ext = getExtension(img.contentType);
							const media = await payload.create({
								collection: "media",
								data: { alt: `${ours.name} logo` },
								file: {
									data: img.buffer,
									name: `${ours.slug}-scf${ext}`,
									mimetype: img.contentType,
									size: img.buffer.length,
								},
							});
							updateData.logo = media.id;
							stats.thumbnailsFetched++;
							console.log(
								`    THUMBNAIL: ${(img.buffer.length / 1024).toFixed(1)}KB`,
							);
						} catch (err) {
							console.log(
								`    THUMBNAIL ERROR: ${err instanceof Error ? err.message : String(err)}`,
							);
						}
					}
				}
			}
		}

		// --- Use scraped detail page for richer data ---
		if (detail) {
			// Add description if we don't have one
			if (detail.description && !ours.shortDescription) {
				updateData.shortDescription = detail.description;
				stats.descriptionsAdded++;
				console.log(`    DESC: "${detail.description.slice(0, 60)}..."`);
			}

			// Add links we're missing. A field a curation registry owns (a
			// removed dead or hijacked link) is never refilled from the page, or
			// this lane and curate would flip it on alternate runs.
			const currentLinks = ours.links || {};
			const newLinks: any = { ...currentLinks };
			let linksChanged = false;
			const owned = curatedFieldsFor(String(ours.slug ?? ""));

			if (
				detail.website &&
				!currentLinks.website &&
				!owned.has("links.website")
			) {
				newLinks.website = detail.website;
				linksChanged = true;
			}
			if (
				detail.twitter &&
				!currentLinks.twitter &&
				!owned.has("links.twitter")
			) {
				newLinks.twitter = detail.twitter;
				linksChanged = true;
			}
			if (detail.github && !currentLinks.github && !owned.has("links.github")) {
				newLinks.github = detail.github;
				linksChanged = true;
			}

			if (linksChanged) {
				updateData.links = newLinks;
				stats.linksAdded++;
				console.log(`    LINKS: ${JSON.stringify(newLinks)}`);
			}
		}

		// --- Apply ---
		if (Object.keys(updateData).length > 0) {
			if (!dryRun) {
				try {
					await payload.update({
						collection: "projects",
						id: ours.id,
						data: updateData,
					});
				} catch (err) {
					console.log(
						`    UPDATE ERROR: ${err instanceof Error ? err.message : String(err)}`,
					);
					stats.errors++;
					continue;
				}
			}
			stats.enriched++;
		} else {
			stats.skipped++;
			console.log(`    SKIP: nothing new to add`);
		}

		await sleep(300); // Be respectful to SCF server
	}

	console.log("\n=== SUMMARY ===");
	console.log(`Mode:               ${dryRun ? "DRY RUN" : "EXECUTED"}`);
	console.log(`SCF projects:       ${stats.scfProjects}`);
	console.log(`Matched to DB:      ${stats.matched}`);
	console.log(`Unmatched:          ${stats.unmatched}`);
	console.log(`Enriched:           ${stats.enriched}`);
	console.log(`  SCF data:         ${stats.scfDataUpdated}`);
	console.log(`  Thumbnails:       ${stats.thumbnailsFetched}`);
	console.log(`  Descriptions:     ${stats.descriptionsAdded}`);
	console.log(`  Links:            ${stats.linksAdded}`);
	console.log(`Skipped (no new):   ${stats.skipped}`);
	console.log(`SCF held (scfHold): ${stats.held}`);
	console.log(`Errors:             ${stats.errors}`);
	console.log(
		`Beyond-cap pages:   ${beyondCap.queued.length} awarded · ${beyondCap.notAwarded.length} not awarded on page · ${beyondCap.unparseable.length} could not parse`,
	);
	for (const s of beyondCap.notAwarded)
		console.log(`  not awarded on page: ${s}`);
	for (const s of beyondCap.unparseable)
		console.log(`  could not parse:     ${s}`);

	if (dryRun) {
		console.log(
			"\n*** DRY RUN — no changes made. Run with --execute to apply. ***",
		);
	}

	// Failed writes must not exit green (2026-08-08 sweep).
	if (stats.errors > 0) {
		console.error(
			`\n✗ ${stats.errors} write error(s) — exiting 1 so the run shows red.`,
		);
		process.exit(1);
	}
	// A curated page that reads not-awarded or cannot be parsed means the map
	// is stale or the page moved — its own exit code, so "could not look"
	// never reads as "checked, absent".
	if (beyondCap.notAwarded.length > 0 || beyondCap.unparseable.length > 0) {
		console.error(
			`\n✗ ${beyondCap.notAwarded.length + beyondCap.unparseable.length} beyond-cap page(s) disagree with the map — exiting 2.`,
		);
		process.exit(2);
	}
	process.exit(0);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
