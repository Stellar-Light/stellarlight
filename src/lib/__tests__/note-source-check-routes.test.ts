/**
 * sls-115 beyond explainRepo: searchRepos rows and verifyClaim's curated-note
 * evidence serve the same stored note beside the repo's scannedRef, so each
 * checks it the same way. The stored note carries its pin as the backfill
 * stamps it from the registry. Rows are read through each route's own
 * `select` (the mock applies it as the database does), so a scan field a
 * route forgets to select reads as missing here too.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REPO_KNOWLEDGE_NOTES } from "../repo-knowledge";

const SCANNED = "6a13f41808586884c9a7b1beecd92088b7284070";
const NOTED = "430a28e79b3b43c213840e45523519ca11251c0a";
const SCANNED_AT = "2026-11-07T02:46:33.460Z";

/** The Horizon note as the backfill stores it: text, source, date, pin. */
const stored = () => {
	const n = REPO_KNOWLEDGE_NOTES["stellar/stellar-horizon"][0];
	return {
		note: n.note,
		source: n.source,
		asOf: n.asOf,
		visibility: "public",
		pin: n.pin,
	};
};
const horizonRow = (pinnedValues: unknown): Record<string, unknown> => ({
	id: "h1",
	fullName: "stellar/stellar-horizon",
	owner: "stellar",
	name: "stellar-horizon",
	description: "Horizon, the Stellar API server",
	topics: ["horizon"],
	projectSlug: "horizon",
	repoScore: 80,
	stars: 10,
	lastCommitAt: "2026-11-03T07:22:08.000Z",
	codeScanState: "scanned",
	stellarProof: "cargo-sdk",
	codeScannedAt: SCANNED_AT,
	scannedRef: SCANNED,
	pinnedValues,
	knowledgeNotes: [
		stored(),
		{ note: "Unpinned fact.", source: "curated", asOf: "2026-09-01" },
	],
});
const read30 = {
	ref: SCANNED,
	reads: [
		{
			path: "internal/ingest/main.go",
			symbol: "MaxSupportedProtocolVersion",
			noteRef: NOTED,
			state: "read",
			value: "30",
		},
	],
};

let REPOS: Array<Record<string, unknown>> = [];
/** Payload's select: true keys include only those; false keys exclude. */
const applySelect = (
	row: Record<string, unknown>,
	select?: Record<string, boolean>,
) => {
	if (!select) return row;
	const only = Object.entries(select).some(([, v]) => v);
	return Object.fromEntries(
		Object.entries(row).filter(([k]) =>
			only ? select[k] || k === "id" : select[k] !== false,
		),
	);
};
const find = async (args: {
	collection: string;
	select?: Record<string, boolean>;
}) => {
	const docs =
		args.collection === "repos"
			? REPOS
			: args.collection === "projects"
				? [{ slug: "horizon", name: "Horizon", status: "Live" }]
				: [];
	return {
		docs: docs.map((d) => applySelect(d, args.select)),
		totalDocs: docs.length,
	};
};

vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));
vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({ find })),
}));
vi.mock("payload", () => ({ getPayload: vi.fn(async () => ({ find })) }));
vi.mock("@payload-config", () => ({ default: {} }));

const search = (await import("../../app/api/repos/search/route")).GET;
const verify = (await import("../../app/api/verify/route")).GET;
const json = async (res: Response) => res.json();

beforeEach(() => {
	REPOS = [horizonRow(read30)];
});

describe("searchRepos rows check each pinned note against the row's own scannedRef", () => {
	const horizon = async () => {
		const body = await json(
			await search(
				new NextRequest("https://x.test/api/repos/search?q=stellar-horizon"),
			),
		);
		return body.repos.find(
			(r: { fullName: string }) => r.fullName === "stellar/stellar-horizon",
		);
	};

	it("Horizon 29 vs 30: the stored note's sourceCheck is a conflict at codeVerified.scannedRef", async () => {
		const row = await horizon();
		expect(row.codeVerified.scannedRef).toBe(SCANNED);
		const [pinned, unpinned] = row.knowledgeNotes;
		expect(pinned.note).toContain("MaxSupportedProtocolVersion = 29");
		expect(pinned.sourceCheck).toMatchObject({
			state: "conflict",
			notedValue: "29",
			notedRef: NOTED,
			scannedValue: "30",
			scannedRef: row.codeVerified.scannedRef,
		});
		expect(unpinned.sourceCheck).toBeNull();
	});

	it("no reading at scannedRef is unknown, never a match", async () => {
		REPOS = [horizonRow(null)];
		const row = await horizon();
		expect(row.knowledgeNotes[0].sourceCheck).toMatchObject({
			state: "unknown",
			scannedValue: null,
		});
	});
});

describe("verifyClaim's curated-note evidence checks the stored note the same way", () => {
	const evidence = async () => {
		const body = await json(
			await verify(
				new NextRequest(
					"https://x.test/api/verify?type=maintained&subject=horizon",
				),
			),
		);
		return (body.evidence as Array<Record<string, unknown>>).filter(
			(e) => e.kind === "curated-note",
		);
	};

	it("Horizon 29 vs 30: the note names its repo and carries a conflict", async () => {
		const [pinned, unpinned] = await evidence();
		expect(pinned.repo).toBe("stellar/stellar-horizon");
		expect(pinned.sourceCheck).toMatchObject({
			state: "conflict",
			notedValue: "29",
			scannedValue: "30",
			scannedRef: SCANNED,
			scannedAt: SCANNED_AT,
		});
		expect(unpinned.sourceCheck).toBeNull();
	});

	it("a repo the scan never read serves unknown", async () => {
		REPOS = [{ ...horizonRow(read30), codeScanState: "pending" }];
		const [pinned] = await evidence();
		expect(pinned.sourceCheck).toMatchObject({
			state: "unknown",
			scannedRef: null,
		});
	});
});
