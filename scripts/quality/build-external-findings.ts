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
 * Their folder is an active queue: a record they retire is DELETED from it,
 * with a receipt appended to their improvements/resolved.json (their README:
 * "Resolution appends a compact receipt to resolved.json"). Listing only the
 * folder made every retired record vanish from /quality instead of counting
 * as retired by them (2026-11-12: 4 records shown, 110 retired). Retired
 * records come from that receipt ledger, never from our side; the commit that
 * deleted each record is read from their git history (a blob-less clone, no
 * API calls) and is null when that history could not be read. They are kept
 * compact (id, date, commit or PR), because /api/quality serves this file.
 *
 *   pnpm exec tsx scripts/quality/build-external-findings.ts
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const REPO = "stellar-experimental/stellar-raven";
const DIR = "improvements/stellar-light-scout";
const SERVICE = "stellar-light-scout";

/** One receipt in their improvements/resolved.json. */
export interface Receipt {
	id: string;
	title?: string;
	service?: string;
	discovered?: string;
	resolved?: string;
	sourceUrl?: string;
}
/** A record file their history deleted, newest first. */
export interface Deletion {
	path: string;
	commit: string;
	date: string;
	subject: string;
}
export interface ExternalRecord {
	id: string;
	title: string;
	status: string;
	discovered: string | null;
	disposition: string | null;
	sourceUrl: string;
	ourIssue: number | null;
	ourResponse?: {
		issue: number;
		state: string;
		closedAt: string | null;
		url: string;
	};
}

/** A record their ledger retired, kept compact: about 110 of these ride in
 *  /api/quality, and a token-sensitive consumer pays for every byte. The
 *  record's title and text stay in their resolved.json. */
export interface RetiredRecord {
	id: string;
	/** The resolved date on their receipt. */
	retired: string | null;
	/** The commit that deleted the record from their folder, or its PR when
	 *  the commit subject names one. null = their history could not be read,
	 *  or holds no deletion of this record. */
	retiredBy: string | null;
}

/**
 * The records their resolution ledger retired. Status comes only from a
 * receipt in THEIR resolved.json; a record still in their folder is active
 * whatever its receipt says, and nothing here reads our side.
 */
export function retiredRecords(
	receipts: readonly Receipt[],
	deletions: readonly Deletion[] | null,
	activeIds: ReadonlySet<string>,
): RetiredRecord[] {
	return receipts
		.filter((r) => r.service === SERVICE && !activeIds.has(r.id))
		.map((r) => {
			// git log lists newest first, so this is the deletion that retired it.
			const d = deletions?.find((x) => {
				const f = basename(x.path);
				return f === `${r.id}.md` || f.startsWith(`${r.id}-`);
			});
			const pr = d ? /\(#(\d+)\)\s*$/.exec(d.subject) : null;
			return {
				id: r.id,
				retired: r.resolved ?? null,
				retiredBy: d
					? pr
						? `https://github.com/${REPO}/pull/${pr[1]}`
						: `https://github.com/${REPO}/commit/${d.commit}`
					: null,
			};
		})
		.sort((a, b) => a.id.localeCompare(b.id));
}

/** Their answer key (counts by THEIR status) and our side, fenced off. */
export function summarize(
	active: readonly ExternalRecord[],
	retired: readonly RetiredRecord[],
) {
	const byStatus = active.reduce<Record<string, number>>((acc, r) => {
		acc[r.status] = (acc[r.status] ?? 0) + 1;
		return acc;
	}, {});
	// Always present once their ledger was read, 0 included, so a reader can
	// tell an artifact that counted retirements from one that predates them.
	byStatus.retired = retired.length;
	// Our side is scored on the active records only. A retired record is
	// closed by their own receipt, and a declined one has no fix to ship, so
	// neither can count toward one.
	const fixApplicable = active.filter((r) => r.status !== "declined-upstream");
	const fixShipped = fixApplicable.filter(
		(r) => r.ourResponse?.state === "closed",
	);
	return {
		counts: byStatus,
		// THEIR answer key is `counts` above. This block is OUR side of each
		// record, and it is deliberately fenced off: a score computed from a
		// variable we control is not an external grade. The old count lied two
		// ways. It counted records the consumer DECLINED, where there is no fix
		// to ship so a closed issue proves nothing. And it counted one closed
		// issue once per record when two records shared the same issue.
		ourResponse: {
			fixShipped: fixShipped.length,
			fixShippedIds: fixShipped.map((r) => r.id),
			/** active records where a fix is even applicable, declined ones are not */
			fixApplicable: fixApplicable.length,
			declined: active.filter((r) => r.status === "declined-upstream").length,
			/** distinct issues behind fixShipped: N records can share one */
			distinctIssuesClosed: new Set(
				fixShipped.map((r) => r.ourIssue).filter(Boolean),
			).size,
			scoredBy:
				"our own linked GitHub issue state, over the records still in their active queue. This is NOT the consumer's verdict and must never be rendered as one.",
			note: "A record can read reported-upstream on their side while our linked issue is closed: we shipped the fix and their re-verification has not run yet. Neither status is allowed to speak for the other. A retired record is closed by their own receipt, so it is not scored here.",
		},
		total: active.length + retired.length,
	};
}

const field = (body: string, key: string): string | null => {
	const m = new RegExp(`^${key}:\\s*(.+)$`, "m").exec(body);
	return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
};

/** Every record file deleted from their folder, newest first, or null when
 *  their history could not be read. A blob-less clone reads commits and trees
 *  only; --no-renames keeps git from fetching blobs to score renames. */
function readDeletions(): Deletion[] | null {
	const dir = mkdtempSync(join(tmpdir(), "raven-history-"));
	try {
		execFileSync(
			"git",
			[
				"clone",
				"--quiet",
				"--bare",
				"--single-branch",
				"--filter=blob:none",
				`https://github.com/${REPO}.git`,
				dir,
			],
			{ stdio: "ignore", timeout: 120_000 },
		);
		const out = execFileSync(
			"git",
			[
				"-C",
				dir,
				"log",
				"--no-renames",
				"--diff-filter=D",
				"--name-only",
				"--format=@@%H%x09%cI%x09%s",
				"HEAD",
				"--",
				DIR,
			],
			{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
		);
		const deletions: Deletion[] = [];
		let head: string[] | null = null;
		for (const line of out.split("\n")) {
			if (line.startsWith("@@")) head = line.slice(2).split("\t");
			else if (line.trim() && head)
				deletions.push({
					path: line.trim(),
					commit: head[0],
					date: head[1],
					subject: head.slice(2).join("\t"),
				});
		}
		return deletions;
	} catch (e) {
		console.error(
			`could not read ${REPO} history; retiring commits are null: ${(e as Error).message}`,
		);
		return null;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

function main() {
	const gh = (path: string): string =>
		execFileSync("gh", ["api", path, "--jq", ".content"], {
			encoding: "utf8",
		});
	const list = JSON.parse(
		execFileSync("gh", ["api", `repos/${REPO}/contents/${DIR}`], {
			encoding: "utf8",
		}),
	) as Array<{ name: string; path: string }>;

	const active: ExternalRecord[] = list
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
		});

	// Our side of each record: if we shipped a fix, the linked issue is closed.
	// Showing only THEIR status would read as 8 open defects when several are
	// fixed and awaiting their re-verification; showing only ours would claim a
	// closure that is not ours to declare. Both are shown.
	for (const r of active) {
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
			r.ourResponse = {
				issue: r.ourIssue,
				state: issue.state,
				closedAt: issue.closedAt ? issue.closedAt.slice(0, 10) : null,
				url: `https://github.com/Stellar-Light/stellarlight/issues/${r.ourIssue}`,
			};
		} catch {}
	}

	// Their resolution ledger. Unreadable means the lifetime count would drop
	// every retired record, so the run fails and the committed artifact stays.
	const ledger = JSON.parse(
		execFileSync(
			"gh",
			[
				"api",
				"-H",
				"Accept: application/vnd.github.raw",
				`repos/${REPO}/contents/improvements/resolved.json`,
			],
			{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
		),
	) as { entries?: Receipt[] };
	if (!Array.isArray(ledger.entries))
		throw new Error("resolved.json has no entries array; not writing");
	const retired = retiredRecords(
		ledger.entries,
		readDeletions(),
		new Set(active.map((r) => r.id)),
	);

	const records = [...active].sort((a, b) => a.id.localeCompare(b.id));
	const summary = summarize(records, retired);

	writeFileSync(
		join(process.cwd(), "improvements/quality/external-findings.json"),
		`${JSON.stringify(
			{
				generatedAt: new Date().toISOString(),
				consumer: REPO,
				definition:
					"Defects filed against this service by stellar-raven, its largest agent consumer, from that project's own evaluation battery. These carry more signal than our internal detectors because the answer key is not ours. Status is whatever THEIR record says, never our opinion of it. records = the records in their active folder. retired = the records that left it with a receipt in their improvements/resolved.json, the ledger their own process appends to when a distinct reviewer re-checks the fix; each gives the receipt date and the commit or PR that deleted it.",
				...summary,
				records,
				retired,
			},
			null,
			1,
		)}\n`,
	);
	console.log(
		`external-findings.json: ${summary.total} records (${records.length} active), ${Object.entries(
			summary.counts,
		)
			.map(([k, v]) => `${k} ${v}`)
			.join(
				" · ",
			)}; retiring commit unknown for ${retired.filter((r) => !r.retiredBy).length}`,
	);
}

if (process.argv[1]?.includes("build-external-findings")) main();
