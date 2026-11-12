/**
 * sls-115, end to end through explainRepo: both of Raven's questions, the
 * original and the explicitly current one, are checked against the response's
 * own codeVerified.scannedRef. The row is read through the route's own
 * `select` (the mock applies it as the database does), so a field the select
 * leaves out reads as undefined here too.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { askDeepWiki } from "@/lib/deepwiki";

const SCANNED = "6a13f41808586884c9a7b1beecd92088b7284070";
const NOTED = "430a28e79b3b43c213840e45523519ca11251c0a";
const SCANNED_AT = "2026-11-07T02:46:33.460Z";
const read = (value: string) => ({
	path: "internal/ingest/main.go",
	symbol: "MaxSupportedProtocolVersion",
	noteRef: NOTED,
	state: "read",
	value,
});

let ROW: Record<string, unknown> = {};
const baseRow = (): Record<string, unknown> => ({
	fullName: "stellar/stellar-horizon",
	codeScanState: "scanned",
	stellarProof: "cargo-sdk",
	codeScannedAt: SCANNED_AT,
	scannedRef: SCANNED,
	pinnedValues: { ref: SCANNED, reads: [read("30")] },
});

vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({
		find: async (args: { select?: Record<string, boolean> }) => ({
			docs: [
				args.select
					? Object.fromEntries(
							Object.entries(ROW).filter(([k]) => args.select?.[k]),
						)
					: ROW,
			],
			totalDocs: 1,
		}),
	})),
}));
vi.mock("@/lib/deepwiki", () => ({ askDeepWiki: vi.fn(async () => null) }));
vi.mock("@/lib/api-usage", () => ({ logApiHit: vi.fn() }));

const { GET } = await import("../../app/api/repos/explain/route");
beforeEach(() => {
	ROW = baseRow();
});
const ask = async (q: string) =>
	(
		await GET(
			new NextRequest(
				`https://x.test/api/repos/explain?${new URLSearchParams({ repo: "stellar/stellar-horizon", q })}`,
			),
		)
	).json();

const ORIGINAL =
	"Which Horizon ingestion constant pins the highest supported protocol version, and what is its value?";
const CURRENT =
	"As of today, which Horizon ingestion constant pins the highest supported protocol version, and what is its value in the source at codeVerified.scannedRef? I am asking about the ingestion software ceiling, not the currently active Mainnet protocol.";

describe("explainRepo checks a pinned note against its own scannedRef (sls-115)", () => {
	it.each([
		["original", ORIGINAL],
		["explicit current", CURRENT],
	])(
		"%s question: the scanned 30 answers, the note's 29 is a stated conflict",
		async (_, q) => {
			const body = await ask(q);
			expect(body.codeVerified.scannedRef).toBe(SCANNED);
			expect(body.answerSource).toBe("stellarlight-code-scan");
			expect(body.answerAsOf).toBe(SCANNED_AT);
			expect(body.answer).toMatch(
				/^At codeVerified\.scannedRef \(6a13f41, scanned 2026-11-07\), internal\/ingest\/main\.go declares MaxSupportedProtocolVersion = 30,/,
			);
			expect(body.sourceCheck).toMatchObject({
				state: "conflict",
				notedValue: "29",
				notedRef: NOTED,
				scannedValue: "30",
				scannedRef: body.codeVerified.scannedRef,
			});
			// the dated note stays, for questions about its own date
			expect(body.knowledgeNotes[0].note).toContain(
				"MaxSupportedProtocolVersion = 29",
			);
			expect(body.knowledgeNotes[0].asOf).toBe("2026-10-08");
			expect(body.knowledgeNotes[0].sourceCheck.state).toBe("conflict");
			expect(body.meta.warnings[0]).toMatch(/stellarlight-code-scan/);
		},
	);

	it("a DeepWiki answer does not displace the scanned value on a conflict", async () => {
		vi.mocked(askDeepWiki).mockResolvedValueOnce({
			repo: "stellar/stellar-horizon",
			answer: "MaxSupportedProtocolVersion is 25.",
			searchUrl: "https://deepwiki.com/search/x",
		});
		const body = await ask(ORIGINAL);
		expect(body.answerSource).toBe("stellarlight-code-scan");
		expect(body.answer).not.toContain("25");
		expect(body.sources.deepWikiSearchUrl).toBe(
			"https://deepwiki.com/search/x",
		);
	});

	it("with no reading at scannedRef the current value is unknown and the note answers only as of its date", async () => {
		for (const pinnedValues of [
			null,
			// a reading taken at another commit is never used
			{
				ref: "597544b60c20f8536d532d32abca8462394874f3",
				reads: [read("29")],
			},
		]) {
			ROW = { ...baseRow(), pinnedValues };
			const body = await ask(ORIGINAL);
			expect(body.answerSource).toBe("knowledge-note");
			expect(body.answerAsOf).toBe("2026-10-08T00:00:00Z");
			expect(body.answer).toMatch(
				/^The current value of MaxSupportedProtocolVersion in internal\/ingest\/main\.go is unknown\./,
			);
			expect(body.sourceCheck).toMatchObject({
				state: "unknown",
				scannedValue: null,
				scannedRef: SCANNED,
			});
			// One warning that says what the note is, never "the dated fact
			// wins" beside a caveat that it is not confirmed.
			expect(body.meta.warnings).toHaveLength(1);
			expect(body.meta.warnings[0]).toMatch(
				/not confirmed at codeVerified\.scannedRef/,
			);
			expect(body.meta.warnings[0]).not.toMatch(/dated fact wins/);
		}
	});

	it("the same value at scannedRef verifies the note, which then leads as before", async () => {
		ROW = { ...baseRow(), pinnedValues: { ref: SCANNED, reads: [read("29")] } };
		const body = await ask(ORIGINAL);
		expect(body.answerSource).toBe("knowledge-note");
		expect(body.answer).toMatch(/^Horizon's protocol ceiling/);
		expect(body.sourceCheck.state).toBe("verified");
	});

	it("a question the note does not answer still carries the note's own check", async () => {
		const body = await ask("how does horizon ingest ledgers");
		expect(body.sourceCheck).toBeNull();
		expect(body.knowledgeNotes[0].sourceCheck.state).toBe("conflict");
	});
});

describe("explainRepo finds registry keys whatever their casing", () => {
	const explain = async (params: Record<string, string>) =>
		(
			await GET(
				new NextRequest(
					`https://x.test/api/repos/explain?${new URLSearchParams(params)}`,
				),
			)
		).json();

	it("a key written in GitHub's casing serves its notes, named in any casing", async () => {
		for (const repo of [
			"AssetDesk/Smart-Contracts",
			"assetdesk/smart-contracts",
		]) {
			const body = await explain({ repo, q: "what does this repo hold" });
			expect(body.knowledgeNotes, repo).toHaveLength(1);
			expect(body.knowledgeNotes[0].note).toContain("AssetDesk");
		}
	});

	it("its trigger routes to it and its note answers", async () => {
		const body = await explain({
			q: "which repo holds the assetdesk contracts",
		});
		expect(body.routedVia).toBe("knowledge-trigger");
		expect(body.answerSource).toBe("knowledge-note");
		expect(body.answer).toContain("AssetDesk");
	});
});
