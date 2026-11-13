/**
 * A lifecycle note is served on the project's row (searchProjects
 * `lifecycle.note`), so it describes that project and nothing of ours. One
 * row served a note naming work of ours from 2026-09-06 until sls-116
 * (2026-11-12). curate-projects writes
 * every curated note from STATUS_FIX and LIFECYCLE_NOTE_SET.
 */
import { describe, expect, it } from "vitest";
import {
	LIFECYCLE_NOTE_SET,
	STATUS_FIX,
} from "../../../scripts/data/curation-maps";

/** Our own work and repositories, as a note could name them. */
const OWN_WORK = [
	/\bour (?:own )?private\b/i,
	/\bour own [\w.-]+ (?:work|repo|repository|project|product)\b/i,
	/\bstellar-light\/[\w.-]+/i,
	/\balexanderkoh\/[\w.-]+/i,
];

describe("served lifecycle notes name no work of ours (sls-116)", () => {
	const notes: Array<[string, string]> = [
		...Object.entries(STATUS_FIX).flatMap(([slug, fix]) =>
			fix.note ? [[`STATUS_FIX ${slug}`, fix.note] as [string, string]] : [],
		),
		...Object.entries(LIFECYCLE_NOTE_SET).map(
			([slug, note]) =>
				[`LIFECYCLE_NOTE_SET ${slug}`, note] as [string, string],
		),
	];

	it("reads every curated note", () => {
		expect(notes.length).toBeGreaterThan(300);
	});

	it("no note names a repository or private work of ours", () => {
		const hits = notes.filter(([, note]) =>
			OWN_WORK.some((re) => re.test(note)),
		);
		expect(hits.map(([where]) => where)).toEqual([]);
	});

	it("the patterns catch a note that names our own work", () => {
		const samples = [
			"Site gone since 2026. Not to be confused with our own private example-tool work.",
			"Unrelated to our own example-app project.",
			"Forked from stellar-light/example-repo.",
		];
		for (const sample of samples)
			expect(
				OWN_WORK.some((re) => re.test(sample)),
				sample,
			).toBe(true);
	});
});
