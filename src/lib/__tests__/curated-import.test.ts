import { describe, expect, it } from "vitest";
import { CURATED_BUILDS, HACKPROOF_BUILDS } from "@/data/curated-builds";
import { CURATED_HACKATHONS } from "@/data/curated-hackathons";
import {
	badCuratedRows,
	curatedFacts,
	curatedLinkInput,
	curatedSyncRow,
	derivedOnly,
	planCuratedImport,
	SYNC_DERIVED_FIELDS,
} from "@/lib/curated-import";
import { linkBuild } from "@/lib/hackathon-build-links";

const events = new Map(CURATED_HACKATHONS.map((h) => [h.uname, h]));
const ROWS = [...CURATED_BUILDS, ...HACKPROOF_BUILDS];
const AWARDS =
	"https://github.com/devodii/hackproof/blob/ea7e1982c9beea491048e668fa6dfb62a4f9a8e5/data/hackmeridian-2026.yaml";
const ev = (slug: string) => {
	const e = events.get(slug);
	if (!e) throw new Error(slug);
	return e;
};
/** A hand-curated winner as the import stored it before rows carried a
 * basis (no repoFullName, entry fields, contracts or winnerSource). */
const NEW_FIELDS = [
	"repoFullName",
	"winnerSource",
	"entryBasis",
	"entryEvidence",
	"contracts",
	"contractsCheckedAt",
];
const storedBefore = (b: (typeof CURATED_BUILDS)[number]) => ({
	...Object.fromEntries(
		Object.entries(curatedFacts(b, ev(b.hackathonSlug))).filter(
			([k]) => !NEW_FIELDS.includes(k),
		),
	),
	id: `db-${b.id}`,
});

describe("import-curated-builds' dry run, over fixtures", () => {
	it("first run: creates the 97 HackMeridian 2026 rows and leaves the stored winners as they are", () => {
		expect(badCuratedRows(ROWS, events)).toEqual([]);
		const stored = new Map(
			CURATED_BUILDS.map((b) => [
				`${b.id}@${b.hackathonSlug}`,
				storedBefore(b),
			]),
		);
		const plan = planCuratedImport(ROWS, events, stored);
		// Every stored curated winner unchanged, however many the file holds.
		expect([plan.created, plan.updated, plan.unchanged]).toEqual([
			97,
			0,
			CURATED_BUILDS.length,
		]);
		expect(plan.writes.every((w) => w.id === null)).toBe(true);
		expect(plan.lines.filter((l) => l.startsWith("  create "))).toHaveLength(
			97,
		);
		expect(plan.lines.some((l) => /^ {2}(update|hide) /.test(l))).toBe(false);
		// The listed placement whose repo is silent, field by field.
		const nest = HACKPROOF_BUILDS.find(
			(b) => b.entryBasis === "placement-listed",
		);
		if (!nest) throw new Error("no placement-listed row");
		const at = plan.lines.indexOf(`  create ${nest.id}@hackmeridian-2026`);
		const fields = plan.lines
			.slice(at + 1)
			.filter((_, i, all) =>
				all.slice(0, i + 1).every((l) => l.startsWith("      ")),
			)
			.map((l) => l.trim().split(":")[0]);
		expect(fields).toEqual([
			"buildId",
			"entryKey",
			"name",
			"hackathonSlug",
			"hackathonTitle",
			"endedAt",
			"url",
			"isWinner",
			"placement",
			...(nest.description ? ["vision"] : []),
			"githubUrl",
			"repoFullName",
			...(nest.demoUrl ? ["demoUrl"] : []),
			"winnerSource",
			"entryBasis",
			"entryEvidence",
			"contracts",
			"contractsCheckedAt",
		]);
		expect(plan.lines).toContain(`      winnerSource: null -> "${AWARDS}"`);
		expect(plan.lines).toContain(
			'      entryBasis: null -> "placement-listed"',
		);
	});

	it("a later run writes only what changed, and hides a row no file holds any more", () => {
		const b = HACKPROOF_BUILDS[0];
		const facts = curatedFacts(b, ev("hackmeridian-2026"));
		const stored = new Map(
			ROWS.map((r) => [
				`${r.id}@${r.hackathonSlug}`,
				{ ...curatedFacts(r, ev(r.hackathonSlug)), id: `db-${r.id}` } as Record<
					string,
					unknown
				>,
			]),
		);
		// A refresh moved a placement.
		stored.set(String(facts.entryKey), {
			...facts,
			id: "db-moved",
			placement: "First place",
		});
		const plan = planCuratedImport(ROWS, events, stored, [
			{ entryKey: "curated-hackmeridian-2026-dropped@hackmeridian-2026" },
		]);
		// One HackMeridian 2026 row changed; the other 96 and every curated
		// winner unchanged.
		expect([plan.created, plan.updated, plan.unchanged]).toEqual([
			0,
			1,
			CURATED_BUILDS.length + 96,
		]);
		expect(plan.writes).toEqual([
			{ entryKey: facts.entryKey, id: "db-moved", facts },
		]);
		expect(plan.lines).toEqual([
			`  update ${facts.entryKey}`,
			`      placement: "First place" -> ${JSON.stringify(b.placement)}`,
			"  hide curated-hackmeridian-2026-dropped@hackmeridian-2026: no longer in the curated files",
		]);
	});

	it("refuses a duplicate or non-curated id, or a row naming no curated event", () => {
		const [a] = HACKPROOF_BUILDS;
		expect(
			badCuratedRows(
				[
					a,
					a,
					{ ...a, id: "dorahacks-buidl-1" },
					{ ...a, id: "curated-x", hackathonSlug: "nope" },
				],
				events,
			).map((b) => b.id),
		).toEqual([a.id, "dorahacks-buidl-1", "curated-x"]);
	});
});

describe("the daily sync on a curated row: derived fields only", () => {
	const stored = (b: (typeof ROWS)[number]) => ({
		...(curatedFacts(b, ev(b.hackathonSlug)) as {
			buildId: string;
			entryKey: string;
			hackathonSlug: string;
			name: string;
		}),
		id: `db-${b.id}`,
	});

	it("runs on stored curated rows that are served and have a repo, nothing else", () => {
		const b = HACKPROOF_BUILDS[0];
		expect(curatedSyncRow(stored(b))).toEqual({
			buildId: b.id,
			entryKey: `${b.id}@hackmeridian-2026`,
			name: b.name,
			vision: b.description ?? null,
			track: b.track,
			isWinner: b.isWinner,
			githubUrl: b.githubUrl,
			demoUrl: b.demoUrl ?? null,
			repoFullName: b.githubUrl
				?.replace("https://github.com/", "")
				.toLowerCase(),
			endedAt: "2026-10-26T12:00:00.000Z",
		});
		// A winner with no repo, a hidden row and a DoraHacks row are not its.
		expect(curatedSyncRow(stored(CURATED_BUILDS[0]))).toBeNull();
		expect(curatedSyncRow({ ...stored(b), hiddenUpstream: true })).toBeNull();
		expect(
			curatedSyncRow({ ...stored(b), buildId: "dorahacks-buidl-46541" }),
		).toBeNull();
	});

	it("never writes a field the import writes: one field, one writer", () => {
		const own = Object.keys(
			curatedFacts(HACKPROOF_BUILDS[0], ev("hackmeridian-2026")),
		);
		expect(
			own.filter((f) => (SYNC_DERIVED_FIELDS as readonly string[]).includes(f)),
		).toEqual([]);
		const row = {
			...curatedFacts(HACKPROOF_BUILDS[0], ev("hackmeridian-2026")),
			stack: ["soroban-sdk"],
			stackReadAt: "2026-11-05T00:00:00.000Z",
			projectSlug: "acta",
			projectLinkBasis: "owner-and-name",
			linkCheckedAt: "2026-11-05T00:00:00.000Z",
			lastSeenAt: "2026-11-05T00:00:00.000Z",
		};
		expect(derivedOnly(row)).toEqual({
			projectSlug: "acta",
			projectLinkBasis: "owner-and-name",
			linkCheckedAt: "2026-11-05T00:00:00.000Z",
			stack: ["soroban-sdk"],
			stackReadAt: "2026-11-05T00:00:00.000Z",
		});
	});
});

// Owner decision 2026-11-04: no link by a shared owner alone, and a README
// heading that names the project waits for a person.
describe("the link rules on a curated row read its repo's own name", () => {
	const idx = {
		repos: new Map(),
		sites: new Map(),
		owners: new Map([
			["acme-team", [{ slug: "acme", name: "Acme" }]],
			["payco", [{ slug: "payco", name: "PayCo" }]],
		]),
	};
	const row = (name: string, repoFullName: string) => ({
		buildId: "curated-x-y",
		entryKey: "curated-x-y@x",
		name,
		githubUrl: `https://github.com/${repoFullName}`,
		repoFullName,
	});

	it("links a repo whose own name carries the project's, under its owner", () => {
		const r = curatedLinkInput(row("Gate", "acme-team/acme-gate-x"));
		expect(r.name).toBe("acme-gate-x");
		expect(linkBuild(r, idx).project).toMatchObject({
			slug: "acme",
			basis: "owner-and-name",
		});
	});

	it("does not link one whose heading names the project while its repo name does not", () => {
		const heading = row("PayCo Private Yield", "payco/private-yield");
		// Read on the heading, the rule would link it.
		expect(linkBuild(heading, idx).project?.slug).toBe("payco");
		expect(linkBuild(curatedLinkInput(heading), idx).project).toBeNull();
	});
});
