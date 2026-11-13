import { readFileSync } from "node:fs";
import {
	gradeStoredRow,
	projectAuthority,
} from "../../../src/lib/repo-regrade";

const dir = process.argv[2];
const rows: any[] = JSON.parse(readFileSync(`${dir}/repos-all.json`, "utf8"));
const projects = new Map(
	JSON.parse(readFileSync(`${dir}/projects-all.json`, "utf8")).docs.map(
		(p: any) => [String(p.slug), projectAuthority(p)],
	),
);
const T0 = Date.parse("2026-09-15T02:02:27Z");
const real = Date.now;
const g = (r: any) => gradeStoredRow(r, projects).score;
const at = (t: number, r: any) => {
	Date.now = () => t;
	try {
		return g(r);
	} finally {
		Date.now = real;
	}
};
const drops = rows
	.map((r) => ({ r, from: Number(r.repoScore ?? -1), to: g(r) }))
	.filter((x) => x.to - x.from <= -10)
	.sort((a, b) => a.to - a.from - (b.to - b.from));
console.log(`drops of 10+ points: ${drops.length}`);
const why = new Map<string, number>();
for (const { r, from, to } of drops) {
	const lifts: string[] = [];
	const tryIt = (label: string, patch: any) => {
		const s = g({ ...r, ...patch });
		if (s - to >= 5) lifts.push(`${label} +${s - to}`);
	};
	if (r.isArchived) tryIt("archived", { isArchived: false });
	if (r.stellarProof === "none")
		tryIt("no Stellar code found", { stellarProof: null });
	if (r.versionStatus === "deprecated")
		tryIt("deprecated SDK", { versionStatus: null });
	if (r.codeScanState === "scanned")
		tryIt("scan facts", {
			codeScanState: "pending",
			stellarProof: null,
			codeDepth: null,
		});
	tryIt("commit age", { lastCommitAt: new Date().toISOString() });
	const t0 = r.createdAt < "2026-09-15" ? at(T0, r) : null;
	const key = lifts.map((l) => l.split(" +")[0]).join(" + ") || "none single";
	why.set(key, (why.get(key) ?? 0) + 1);
	if (drops.indexOf(drops.find((d) => d.r === r)!) < 25)
		console.log(
			`${r.fullName.padEnd(44)} ${from}->${to} src=${r.source} arch=${!!r.isArchived} proof=${r.stellarProof ?? "-"} ver=${r.versionStatus ?? "-"} stars=${r.stars} last=${String(r.lastCommitAt).slice(0, 10)} scanned=${String(r.codeScannedAt ?? "").slice(0, 10)} actAsOf=${String(r.activitySignals?.asOf ?? "").slice(0, 10)} gradeAtT0=${t0} | ${lifts.join(", ")}`,
		);
}
console.log(
	"driver tally:",
	[...why].sort((a, b) => b[1] - a[1]),
);
