/**
 * External findings artifact: what our biggest consumer files against us.
 *
 * stellar-raven runs its own evaluation battery against this service and
 * files defects as `sls-*` records. Those are the highest-signal findings we
 * get, because they come from a real consumer with its own answer key rather
 * than from our detectors grading themselves. Showing only our internal
 * ledger would flatter us.
 *
 * Reads their public improvements directory and commits the result, so the
 * dashboard never depends on a live third-party fetch.
 *
 *   pnpm exec tsx scripts/quality/build-external-findings.ts
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "stellar-experimental/stellar-raven";
const DIR = "improvements/stellar-light-scout";

const gh = (path: string): string =>
	execFileSync("gh", ["api", path, "--jq", ".content"], { encoding: "utf8" });

const list = JSON.parse(
	execFileSync("gh", ["api", `repos/${REPO}/contents/${DIR}`], {
		encoding: "utf8",
	}),
) as Array<{ name: string; path: string }>;

const field = (body: string, key: string): string | null => {
	const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(body);
	return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};

const records = list
	.filter((f) => f.name.endsWith(".md"))
	.map((f) => {
		const body = Buffer.from(
			gh(`repos/${REPO}/contents/${f.path}`),
			"base64",
		).toString("utf8");
		const fm = body.slice(0, body.indexOf("\n---", 4) + 4);
		const issue =
			/https:\/\/github\.com\/Stellar-Light\/stellarlight\/issues\/(\d+)/.exec(
				fm,
			);
		// the finding title, minus the id prefix in the filename
		const title =
			field(fm, "upstreamTitle") ??
			f.name
				.replace(/^sls-\d+-/, "")
				.replace(/\.md$/, "")
				.replace(/-/g, " ");
		return {
			id: field(fm, "id") ?? f.name.replace(/\.md$/, ""),
			title,
			status: field(fm, "status") ?? "unknown",
			discovered: field(fm, "discovered") ?? null,
			disposition: field(fm, "disposition"),
			sourceUrl: `https://github.com/${REPO}/blob/main/${f.path}`,
			ourIssue: issue ? Number(issue[1]) : null,
		};
	})
	.sort((a, b) => a.id.localeCompare(b.id));

// Our side of each record: if we shipped a fix, the linked issue is closed.
// Showing only THEIR status would read as 8 open defects when several are
// fixed and awaiting their re-verification; showing only ours would claim a
// closure that is not ours to declare. Both are shown.
for (const r of records) {
	if (!r.ourIssue) continue;
	try {
		const issue = JSON.parse(
			execFileSync(
				"gh",
				[
					"api",
					`repos/Stellar-Light/stellarlight/issues/${r.ourIssue}`,
					"--jq",
					"{state: .state, closedAt: .closed_at, title: .title}",
				],
				{ encoding: "utf8" },
			),
		) as { state: string; closedAt: string | null; title: string };
		(r as Record<string, unknown>).ourResponse = {
			issue: r.ourIssue,
			state: issue.state,
			closedAt: issue.closedAt ? issue.closedAt.slice(0, 10) : null,
			url: `https://github.com/Stellar-Light/stellarlight/issues/${r.ourIssue}`,
		};
	} catch {}
}

const byStatus = records.reduce<Record<string, number>>((acc, r) => {
	acc[r.status] = (acc[r.status] ?? 0) + 1;
	return acc;
}, {});

writeFileSync(
	join(process.cwd(), "improvements/quality/external-findings.json"),
	`${JSON.stringify(
		{
			generatedAt: new Date().toISOString(),
			consumer: REPO,
			definition:
				"Defects filed against this service by stellar-raven, its largest agent consumer, from that project's own evaluation battery. These carry more signal than our internal detectors because the answer key is not ours. Status is whatever THEIR record says, never our opinion of it.",
			counts: byStatus,
			ourResponse: {
				fixShipped: records.filter(
					(r) =>
						(r as Record<string, unknown>).ourResponse &&
						((r as Record<string, unknown>).ourResponse as { state: string })
							.state === "closed",
				).length,
				note: "A record can read reported-upstream on their side while our linked issue is closed: we shipped the fix and their re-verification has not run yet. Neither status is allowed to speak for the other.",
			},
			total: records.length,
			records,
		},
		null,
		1,
	)}\n`,
);
console.log(
	`external-findings.json: ${records.length} records, ${Object.entries(byStatus)
		.map(([k, v]) => `${k} ${v}`)
		.join(" · ")}`,
);
