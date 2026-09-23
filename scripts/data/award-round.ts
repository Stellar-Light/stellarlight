/**
 * i³ Awards — set a round's status, safely.
 *
 *   pnpm exec tsx scripts/data/award-round.ts --list
 *   pnpm exec tsx scripts/data/award-round.ts --create --slug=i3-2026-nominations --title="i³ Awards 2026 — Nominations" --picks=3 [--closes=2026-10-01T00:00:00Z] [--execute]
 *   pnpm exec tsx scripts/data/award-round.ts --create --slug=i3-2026 --title="i³ Awards 2026" [--execute]
 *   pnpm exec tsx scripts/data/award-round.ts --slug=i3-2026-test --status=draft
 *   pnpm exec tsx scripts/data/award-round.ts --slug=i3-2026 --status=open [--closes=…] --execute
 *   pnpm exec tsx scripts/data/award-round.ts --slug=i3-2026-nominations --status=draft --picks=4 --execute
 *
 * The real round is TWO rounds: a NOMINATIONS round (Pilots pick up to N
 * projects per category) and then the VOTE (one pick per category). Both are
 * ordinary award-rounds records; --create makes one as a DRAFT with the three
 * canonical categories, testMode off, no dates. Nominees come from
 * award-import.yml, the flip to open from --status here.
 *
 * WHY THIS EXISTS. Every other step of the awards pipeline has a script and a
 * workflow — importing nominees, importing voters, whitelisting a tester — but
 * the round LIFECYCLE was a hand edit in /admin. That is the one step with a
 * documented foot-gun: `/api/awards/round` picks THE open round with no slug,
 * so two open rounds collide and which ballot the public sees is arbitrary.
 * Leaving that to a manual click on the day the real nominees land is how it
 * goes wrong.
 *
 * The guard is the point: opening a round REFUSES while another is already
 * open, and names the one to draft first. Closing and drafting are always
 * allowed — you can always make the collision smaller, never bigger.
 *
 * Dry-run by default. Every write is read back and a mismatch exits non-zero.
 */
import "../load-env";
import { getPayload } from "payload";
import configPromise from "../../src/payload.config";

const args = process.argv.slice(2);
const arg = (k: string) => {
	const hit = args.find((a) => a.startsWith(`--${k}=`));
	return hit ? hit.slice(k.length + 3) : null;
};
const EXECUTE = args.includes("--execute");
const LIST = args.includes("--list");
const CREATE = args.includes("--create");
const SLUG = arg("slug");
const STATUS = arg("status");
const TITLE = arg("title");
const PICKS = Math.max(1, Math.floor(Number(arg("picks") ?? "1") || 1));
const OPENS = arg("opens");
const CLOSES = arg("closes");

/** The i³ categories, verbatim from the round SDF reviewed. */
const CATEGORIES = [
	{
		key: "impact",
		name: "Impact",
		tagline: "Real-world outcomes for real people",
	},
	{
		key: "innovation",
		name: "Innovation",
		tagline: "Pushing what's possible on Stellar",
	},
	{
		key: "interoperability",
		name: "Interoperability",
		tagline: "Bridging Stellar to the wider world",
	},
];

const iso = (v: string | null): string | null => {
	if (!v) return null;
	const d = new Date(v);
	if (Number.isNaN(d.getTime())) throw new Error(`not a date: ${v}`);
	return d.toISOString();
};
type RoundStatus = "draft" | "open" | "closed";
const VALID = new Set<RoundStatus>(["draft", "open", "closed"]);

async function main() {
	const payload = await getPayload({ config: configPromise });
	const all = await payload.find({
		collection: "award-rounds",
		limit: 200,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	const rounds = all.docs as any[];

	console.log(`\nRounds (${rounds.length}):`);
	for (const r of rounds) {
		const marker = r.status === "open" ? " ← OPEN" : "";
		console.log(
			`  ${String(r.slug).padEnd(22)} ${String(r.status).padEnd(7)} ${r.title ?? ""}${marker}`,
		);
	}
	if (LIST) return 0;

	if (CREATE) {
		if (!SLUG || !TITLE) {
			console.error(
				'\nusage: --create --slug=<round> --title="…" [--picks=N] [--opens=<iso>] [--closes=<iso>] [--execute]',
			);
			return 2;
		}
		if (rounds.find((r) => r.slug === SLUG)) {
			console.log(`\n${SLUG} already exists — nothing to do.`);
			return 0;
		}
		const data = {
			slug: SLUG,
			title: TITLE,
			status: "draft" as const,
			ballotMode: "one-per-category" as const,
			picksPerCategory: PICKS,
			categories: CATEGORIES,
			testMode: false,
			opensAt: iso(OPENS),
			closesAt: iso(CLOSES),
		};
		console.log(
			`\ncreate ${SLUG} "${TITLE}" · draft · ${PICKS === 1 ? "one pick" : `up to ${PICKS} picks`} per category · opens ${data.opensAt ?? "—"} · closes ${data.closesAt ?? "—"}`,
		);
		if (!EXECUTE) {
			console.log("\nDRY RUN — nothing written. Re-run with --execute.");
			return 0;
		}
		await payload.create({
			collection: "award-rounds",
			data,
			overrideAccess: true,
		});
		const created = await payload.find({
			collection: "award-rounds",
			where: { slug: { equals: SLUG } },
			limit: 1,
			depth: 0,
			overrideAccess: true,
		});
		// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
		const doc = created.docs[0] as any;
		if (
			!doc ||
			doc.status !== "draft" ||
			Number(doc.picksPerCategory) !== PICKS
		) {
			console.error(
				`READ-BACK FAILED: ${SLUG} → ${JSON.stringify(doc ?? null)}`,
			);
			return 1;
		}
		console.log(
			`✓ read back: ${SLUG} is draft · ${doc.picksPerCategory} pick(s) per category · ${doc.categories?.length ?? 0} categories`,
		);
		return 0;
	}

	if (!SLUG || !STATUS) {
		console.error(
			"\nusage: --slug=<round> --status=draft|open|closed [--opens=<iso>] [--closes=<iso>] [--execute]   (or --list, or --create)",
		);
		return 2;
	}
	if (!VALID.has(STATUS as RoundStatus)) {
		console.error(`\nstatus must be one of: ${[...VALID].join(", ")}`);
		return 2;
	}
	const target = rounds.find((r) => r.slug === SLUG);
	if (!target) {
		console.error(`\nno round with slug "${SLUG}"`);
		return 1;
	}
	// --picks on an existing round. Only while it is a DRAFT: changing the slot
	// count under an open round changes the manageData key shape
	// (`.<slot>` suffixes appear above 1), so ballots already cast would stop
	// decoding — a silent loss, not an error.
	const picksArg = arg("picks");
	const picks =
		picksArg === null ? null : Math.max(1, Math.floor(Number(picksArg) || 1));
	if (picks !== null && (target.status !== "draft" || STATUS !== "draft")) {
		console.error(
			`REFUSED: --picks only applies to a round that is and stays draft (${SLUG} is ${target.status} → ${STATUS}). Ballots cast under one slot count do not decode under another.`,
		);
		return 1;
	}

	if (
		target.status === STATUS &&
		(picks === null || picks === Number(target.picksPerCategory ?? 1)) &&
		!CLOSES &&
		!OPENS
	) {
		console.log(
			`\n${SLUG} is already ${STATUS} — nothing to do (pass --picks=N to change the slot count of a draft).`,
		);
		return 0;
	}

	// The whole reason this script exists.
	if (STATUS === "open") {
		const othersOpen = rounds.filter(
			(r) => r.status === "open" && r.slug !== SLUG,
		);
		if (othersOpen.length) {
			console.error(
				`\nREFUSED: ${othersOpen.map((r) => r.slug).join(", ")} ${othersOpen.length === 1 ? "is" : "are"} already open.`,
			);
			console.error(
				"  /api/awards/round picks THE open round, so two would collide and the",
			);
			console.error(
				"  public ballot becomes arbitrary. Draft the other one first:",
			);
			for (const r of othersOpen)
				console.error(
					`    pnpm exec tsx scripts/data/award-round.ts --slug=${r.slug} --status=draft --execute`,
				);
			return 1;
		}
	}

	const dates = {
		...(OPENS ? { opensAt: iso(OPENS) } : {}),
		...(CLOSES ? { closesAt: iso(CLOSES) } : {}),
	};
	console.log(
		`\n${SLUG}: ${target.status} → ${STATUS}${dates.opensAt ? ` · opens ${dates.opensAt}` : ""}${dates.closesAt ? ` · closes ${dates.closesAt}` : ""}${picks !== null ? ` · picks ${target.picksPerCategory ?? 1} → ${picks}` : ""}`,
	);
	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
		return 0;
	}
	await payload.update({
		collection: "award-rounds",
		id: target.id,
		data: {
			status: STATUS as RoundStatus,
			...dates,
			...(picks !== null ? { picksPerCategory: picks } : {}),
		},
		overrideAccess: true,
	});
	const back = await payload.find({
		collection: "award-rounds",
		where: { slug: { equals: SLUG } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	const doc = back.docs[0] as any;
	const now = doc?.status;
	if (now !== STATUS) {
		console.error(`READ-BACK FAILED: ${SLUG} is ${now}, expected ${STATUS}`);
		return 1;
	}
	if (picks !== null && Number(doc?.picksPerCategory) !== picks) {
		console.error(
			`READ-BACK FAILED: ${SLUG} picksPerCategory is ${doc?.picksPerCategory}, expected ${picks}`,
		);
		return 1;
	}
	console.log(
		`✓ read back: ${SLUG} is ${now}${picks !== null ? ` · ${picks} pick(s) per category` : ""}`,
	);
	return 0;
}

main()
	.then((c) => process.exit(c))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
