// Keyword-mode lines for single words on a capture's corpus, with the
// builds rule L held back, as the builds route gives them: the re-check's
// related-form words (ports, mills, forming, ...) on the live corpus.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-nonsense-queries/recheck-words.mts <capture.json> <word>...
import { readFileSync } from "node:fs";
import {
	indexedFromStored,
	searchHackathonBuilds,
	unusedWordsWarning,
} from "../../../src/lib/hackathon-builds";

const live = JSON.parse(readFileSync(process.argv[2], "utf8"));
const AT = "2026-10-23T00:00:00.000Z";
// biome-ignore lint/suspicious/noExplicitAny: scratch
const pool = live.corpus.map((r: any) => ({
	...indexedFromStored({
		id: r.id,
		buildId: r.id,
		name: r.name,
		vision: r.description,
		track: r.track,
		award: r.award,
		placement: r.placement,
		isWinner: r.isWinner,
		hackathonSlug: r.hackathonSlug,
		hackathonTitle: r.hackathon,
		endedAt: r.endedAt,
		url: "",
		firstSeenAt: AT,
		lastSeenAt: AT,
		updatedAt: AT,
		createdAt: AT,
		...(r.stack ? { stack: r.stack, stackReadAt: AT } : {}),
		// biome-ignore lint/suspicious/noExplicitAny: scratch
	} as any),
	voteCount: r.votes,
}));
for (const q of process.argv.slice(3)) {
	// biome-ignore lint/suspicious/noExplicitAny: scratch
	const held: any[] = [];
	const rows = searchHackathonBuilds(pool, q, {
		perSubmission: true,
		packages: true,
		mode: "keyword",
		withheld: held,
	});
	console.log(
		`${q} | ${rows.length} | ${unusedWordsWarning(pool, q, rows, held) ?? "none"}`,
	);
}
