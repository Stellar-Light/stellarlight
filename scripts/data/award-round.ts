/**
 * i³ Awards — set a round's status, safely.
 *
 *   pnpm exec tsx scripts/data/award-round.ts --list
 *   pnpm exec tsx scripts/data/award-round.ts --slug=i3-2026-test --status=draft
 *   pnpm exec tsx scripts/data/award-round.ts --slug=i3-2026 --status=open --execute
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
const SLUG = arg("slug");
const STATUS = arg("status");
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

	if (!SLUG || !STATUS) {
		console.error(
			"\nusage: --slug=<round> --status=draft|open|closed [--execute]   (or --list)",
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
	if (target.status === STATUS) {
		console.log(`\n${SLUG} is already ${STATUS} — nothing to do.`);
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

	console.log(`\n${SLUG}: ${target.status} → ${STATUS}`);
	if (!EXECUTE) {
		console.log("\nDRY RUN — nothing written. Re-run with --execute.");
		return 0;
	}
	await payload.update({
		collection: "award-rounds",
		id: target.id,
		data: { status: STATUS as RoundStatus },
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
	const now = (back.docs[0] as any)?.status;
	if (now !== STATUS) {
		console.error(`READ-BACK FAILED: ${SLUG} is ${now}, expected ${STATUS}`);
		return 1;
	}
	console.log(`✓ read back: ${SLUG} is ${now}`);
	return 0;
}

main()
	.then((c) => process.exit(c))
	.catch((e) => {
		console.error("FATAL:", e);
		process.exit(1);
	});
