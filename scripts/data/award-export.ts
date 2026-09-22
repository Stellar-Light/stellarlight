/**
 * i³ Awards — export a round's ballots as CSV, for a spreadsheet or Airtable.
 *
 *   pnpm exec tsx scripts/data/award-export.ts --round=i3-2026            # summary only
 *   pnpm exec tsx scripts/data/award-export.ts --round=i3-2026 --out=x.csv
 *
 * One row per whitelisted voter — including those who have NOT voted, because
 * "who is still missing" is the question this gets asked for during a round,
 * and a file that silently omits them answers it wrong.
 *
 * THE PICKS ARE THE FIRST BALLOT, not the latest. The round counts the first
 * one cast; the chain only ever holds the most recent. Exporting what the chain
 * shows would hand someone a spreadsheet that disagrees with the published
 * result for every voter who changed their mind. `revoted` flags those rows so
 * the difference is visible rather than hidden.
 *
 * PRIVACY. Every row is an address→choice mapping, which the public surfaces
 * deliberately never serve. So this writes a FILE and prints only counts — it
 * never logs a row, and the workflow that runs it uploads the file as a
 * private run artifact and must never commit it to the repo.
 */

import "../load-env";
import { writeFileSync } from "node:fs";
import { getPayload } from "payload";
import { toCsv } from "../../src/lib/awards/csv";
import { normalizeSelections } from "../../src/lib/awards/mirror";

const { default: configPromise } = await import("../../src/payload.config");

const arg = (k: string) =>
	process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ??
	null;

const ROUND = arg("round");
const OUT = arg("out");

type Trail = Array<{
	txHash?: string | null;
	selections?: unknown;
	at?: string | null;
} | null>;

async function main(): Promise<number> {
	if (!ROUND) {
		console.error("usage: --round=<slug> [--out=<path.csv>]");
		return 2;
	}
	const payload = await getPayload({ config: await configPromise });

	const rounds = await payload.find({
		collection: "award-rounds",
		where: { slug: { equals: ROUND } },
		limit: 1,
		depth: 0,
		overrideAccess: true,
	});
	const round = rounds.docs[0] as
		| {
				id: string | number;
				slug: string;
				status: string;
				categories?: unknown;
		  }
		| undefined;
	if (!round) {
		console.error(`no round with slug "${ROUND}"`);
		return 1;
	}
	const roundId = round.id;
	const categories = (
		(round.categories ?? []) as Array<{ key?: string; name?: string }>
	)
		.map((c) => String(c.key ?? ""))
		.filter(Boolean);

	// Paged, because a hard limit silently truncates and an export that drops
	// voters is worse than one that fails.
	async function all<T>(collection: "award-voters" | "award-ballots") {
		const out: T[] = [];
		for (let page = 1; ; page++) {
			const res = await payload.find({
				collection,
				where: { round: { equals: roundId } },
				limit: 500,
				page,
				depth: 0,
				overrideAccess: true,
			});
			out.push(...(res.docs as T[]));
			if (!res.hasNextPage) return out;
		}
	}

	const voters = await all<{ address?: string; label?: string }>(
		"award-voters",
	);
	const ballots = await all<{
		address?: string;
		selections?: unknown;
		txHash?: string | null;
		submissions?: number | null;
		firstSubmittedAt?: string | null;
		lastSubmittedAt?: string | null;
		history?: Trail;
	}>("award-ballots");

	const byAddress = new Map<string, (typeof ballots)[number]>();
	for (const b of ballots) {
		const a = String(b.address ?? "")
			.trim()
			.toUpperCase();
		if (!a) continue;
		// Oldest wins if a race ever produced two rows for one address.
		const prior = byAddress.get(a);
		const at = (x: (typeof ballots)[number]) => x.firstSubmittedAt ?? "";
		if (!prior || at(b) < at(prior)) byAddress.set(a, b);
	}

	const rows = voters
		.map((v) => {
			const address = String(v.address ?? "")
				.trim()
				.toUpperCase();
			const b = byAddress.get(address);
			const trail = (b?.history ?? []) as Trail;
			const first = trail.find((e) =>
				Object.values(normalizeSelections(e?.selections)).some(
					(s) => s.length > 0,
				),
			);
			const picks = normalizeSelections(
				first ? first.selections : b?.selections,
			);
			const row: Record<string, string | number> = {
				address,
				label: v.label ?? "",
				voted: b ? "yes" : "no",
			};
			for (const c of categories) row[c] = (picks[c] ?? []).join(";");
			row.submittedAt = (first?.at ?? b?.firstSubmittedAt ?? "") as string;
			row.txHash = (first?.txHash ?? b?.txHash ?? "") as string;
			row.submissions = b?.submissions ?? 0;
			// The round counts the FIRST ballot, so a later one changes nothing —
			// but whoever reads this should be able to see that it happened.
			row.revoted = (b?.submissions ?? 0) > 1 ? "yes" : "no";
			return row;
		})
		.sort((a, b) => String(a.address).localeCompare(String(b.address)));

	const csv = toCsv(rows, [
		"address",
		"label",
		"voted",
		...categories,
		"submittedAt",
		"txHash",
		"submissions",
		"revoted",
	]);

	const votedCount = rows.filter((r) => r.voted === "yes").length;
	const revotedCount = rows.filter((r) => r.revoted === "yes").length;
	// Counts only. A row here is an address→choice pair and must not be logged.
	console.log(
		`${round.slug} (${round.status}) · ${rows.length} whitelisted · ${votedCount} voted · ${revotedCount} revoted (first ballot is the one exported)`,
	);
	if (ballots.length > byAddress.size) {
		console.log(
			`note: ${ballots.length - byAddress.size} duplicate ballot row(s) collapsed — oldest kept`,
		);
	}

	if (!OUT) {
		console.log("\nNo --out given, so nothing was written.");
		return 0;
	}
	writeFileSync(OUT, csv, "utf8");
	console.log(`\nwrote ${OUT} (${csv.length} bytes, ${rows.length} rows)`);
	return 0;
}

main()
	.then((c) => process.exit(c))
	.catch((err) => {
		console.error(err);
		process.exit(1);
	});
