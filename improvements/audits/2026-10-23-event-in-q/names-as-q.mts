// Every stored build's own name used as q, read by eventInQuery with the
// events the builds route reads (the capture's index plus the curated
// events): how often a name-lookup q would infer an event, warn of a
// partial name, or name several. Prints each such name.
// Usage, from the repository root:
//   pnpm exec tsx improvements/audits/2026-10-23-event-in-q/names-as-q.mts <live.json>
import { readFileSync } from "node:fs";
import { CURATED_HACKATHONS } from "../../../src/data/curated-hackathons";
import { eventInQuery } from "../../../src/lib/event-in-query";

const live = JSON.parse(readFileSync(process.argv[2], "utf8"));
const titles = new Map<string, string>();
for (const r of live.corpus) titles.set(r.hackathonSlug, r.hackathon);
for (const h of CURATED_HACKATHONS)
	if (!titles.has(h.uname)) titles.set(h.uname, h.title);
const events = [...titles].map(([slug, title]) => ({ slug, title }));
const names = [
	...new Map(
		(live.corpus as Array<{ name: string; hackathonSlug: string }>).map((r) => [
			r.name,
			r,
		]),
	).values(),
];
const tally: Record<string, number> = {};
const hits: string[] = [];
for (const r of names) {
	const found = eventInQuery(r.name, events);
	tally[found.kind] = (tally[found.kind] ?? 0) + 1;
	if (found.kind !== "none")
		hits.push(
			`${JSON.stringify(r.name)} (entered ${r.hackathonSlug}) -> ${found.kind} ${
				found.kind === "event"
					? `${found.slug}, rest ${JSON.stringify(found.rest)}`
					: found.slugs.join(", ")
			}`,
		);
}
console.log(
	`${names.length} distinct build names as q, ${events.length} events: ${JSON.stringify(tally)}`,
);
for (const h of hits) console.log(`- ${h}`);
