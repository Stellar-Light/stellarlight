/**
 * sls-115: a dated knowledge note said MaxSupportedProtocolVersion = 29 while
 * the source at the response's own codeVerified.scannedRef defined 30. A note
 * that pins its value to a commit, file and symbol is re-read by the code scan
 * at every scannedRef and checked against that reading, so the next change to
 * any pinned value is served as a conflict, not as the dated value.
 */
import { describe, expect, it } from "vitest";
import { readPinnedValues } from "../../../scripts/scan/fetch-repo-code";
import {
	PIN_DUE_CAP,
	pinDueWave,
	pinScanDue,
} from "../../../scripts/scan/scan-repo-code-pool";
import { noteSourceCheck, readDeclaredValue } from "../note-pins";
import {
	type KnowledgeNote,
	notePinsFor,
	pinnedRepos,
	REPO_KNOWLEDGE_NOTES,
	storedNoteShape,
} from "../repo-knowledge";

const SCANNED = "6a13f41808586884c9a7b1beecd92088b7284070";
const NOTED = "430a28e79b3b43c213840e45523519ca11251c0a";
const PATH = "internal/ingest/main.go";
const SYMBOL = "MaxSupportedProtocolVersion";

/** internal/ingest/main.go at 6a13f418 (lines 34-38, 175-178, 413-419): the
 * declaration, a struct field of the same name, a field assignment and a use. */
const horizonMainGo = (value: string) => `const (
	// MaxSupportedProtocolVersion defines the maximum supported version of
	// the Stellar protocol.
	MaxSupportedProtocolVersion uint32 = ${value}

type Metrics struct {
	// MaxSupportedProtocolVersion exposes the maximum protocol version
	// supported by this version.
	MaxSupportedProtocolVersion prometheus.Gauge

func (s *system) initMetrics() {
	s.metrics.MaxSupportedProtocolVersion = prometheus.NewGauge(prometheus.GaugeOpts{
	s.metrics.MaxSupportedProtocolVersion.Set(float64(MaxSupportedProtocolVersion))
`;

const horizonNote = (): KnowledgeNote => {
	const note = REPO_KNOWLEDGE_NOTES["stellar/stellar-horizon"]?.find(
		(n) => n.pin?.symbol === SYMBOL,
	);
	if (!note) throw new Error("the Horizon ceiling note carries no pin");
	return note;
};

/** A stored reading of the Horizon pin, taken for the note's own commit. */
const horizonRead = (fields: Record<string, string>) => ({
	path: PATH,
	symbol: SYMBOL,
	noteRef: NOTED,
	...fields,
});

const scanAt = (
	ref: string,
	reads: unknown[] | null,
	readRef: string = ref,
) => ({
	scannedRef: ref,
	scannedAt: "2026-11-07T02:46:33.460Z",
	pinnedValues: reads ? { ref: readRef, reads } : null,
});

describe("readDeclaredValue: the value a file declares for a symbol", () => {
	it("reads Horizon's ceiling from the real declaration shape, past the field, the assignment and the use", () => {
		expect(readDeclaredValue(horizonMainGo("30"), SYMBOL)).toEqual({
			state: "read",
			value: "30",
		});
		expect(readDeclaredValue(horizonMainGo("29"), SYMBOL)).toEqual({
			state: "read",
			value: "29",
		});
	});

	it("reads a constant in other languages", () => {
		const cases: Array<[string, string, string]> = [
			["pub const MAX_ENTRIES: u32 = 64;", "MAX_ENTRIES", "64"],
			['pub const NETWORK: &str = "testnet";', "NETWORK", "testnet"],
			['export const API_VERSION = "1.9.128";', "API_VERSION", "1.9.128"],
			["DEFAULT_TIMEOUT = 30  # seconds", "DEFAULT_TIMEOUT", "30"],
			['version = "0.4.2"', "version", "0.4.2"],
			["\tledgerCap := 1000 // per batch", "ledgerCap", "1000"],
		];
		for (const [text, symbol, value] of cases)
			expect(readDeclaredValue(text, symbol), text).toEqual({
				state: "read",
				value,
			});
	});

	it("a comparison, a field, a comment, a use or a longer name declares nothing", () => {
		const text = [
			"if v > MAX_ENTRIES {",
			"ok := MAX_ENTRIES == 64",
			"cfg.MAX_ENTRIES = 9",
			"MAX_ENTRIES *= 2",
			'log.Printf("MAX_ENTRIES = %d", n)',
			"// MAX_ENTRIES = 7 was the old cap",
			"MAX_ENTRIES_V2 = 128",
			"OLD_MAX_ENTRIES = 32",
		].join("\n");
		expect(readDeclaredValue(text, "MAX_ENTRIES").state).toBe("missing");
	});

	it("two different values cannot be checked; the same value twice is one read", () => {
		expect(readDeclaredValue("const A = 1\nvar A = 2", "A").state).toBe(
			"unread",
		);
		expect(readDeclaredValue("const A = 1\nconst A = 1", "A")).toEqual({
			state: "read",
			value: "1",
		});
	});
});

describe("noteSourceCheck: a pinned note against the scan a response serves", () => {
	it("the Horizon note is pinned to the commit, file and symbol it was verified at", () => {
		expect(horizonNote().pin).toEqual({
			commit: NOTED,
			path: PATH,
			symbol: SYMBOL,
			value: "29",
		});
		expect(notePinsFor("stellar/stellar-horizon")).toEqual([
			{ commit: NOTED, path: PATH, symbol: SYMBOL, value: "29" },
		]);
		expect(notePinsFor("nobody/not-a-real-repo")).toEqual([]);
	});

	it("Horizon 29 vs 30: the scan's 30 at scannedRef is a conflict, never a match", () => {
		const c = noteSourceCheck(
			horizonNote(),
			scanAt(SCANNED, [horizonRead({ state: "read", value: "30" })]),
		);
		expect(c).toMatchObject({
			state: "conflict",
			symbol: SYMBOL,
			path: PATH,
			notedValue: "29",
			notedRef: NOTED,
			notedAsOf: "2026-10-08",
			scannedValue: "30",
			scannedRef: SCANNED,
			scannedAt: "2026-11-07T02:46:33.460Z",
		});
	});

	it("the same value read at a newer commit verifies the note; the note's own commit needs no read", () => {
		expect(
			noteSourceCheck(
				horizonNote(),
				scanAt(SCANNED, [horizonRead({ state: "read", value: "29" })]),
			)?.state,
		).toBe("verified");
		expect(noteSourceCheck(horizonNote(), scanAt(NOTED, null))?.state).toBe(
			"verified",
		);
	});

	it("no usable reading at scannedRef is unknown: none stored, one taken at another commit or for another pin, or one that could not be read", () => {
		const read30 = horizonRead({ state: "read", value: "30" });
		for (const scan of [
			scanAt(SCANNED, null),
			scanAt(SCANNED, []),
			scanAt(SCANNED, [read30], "597544b60c20f8536d532d32abca8462394874f3"),
			scanAt(SCANNED, [{ ...read30, noteRef: "c".repeat(40) }]),
			scanAt(SCANNED, [
				horizonRead({
					state: "unread",
					why: "raw.githubusercontent.com answered 503",
				}),
			]),
			scanAt(SCANNED, [
				horizonRead({
					state: "unread",
					why: "at the note's own commit the scan reads 28 where the note states 29, so the two readings cannot be compared",
				}),
			]),
		]) {
			const c = noteSourceCheck(horizonNote(), scan);
			expect(c?.state, JSON.stringify(scan.pinnedValues)).toBe("unknown");
			expect(c?.scannedValue).toBeNull();
		}
		expect(noteSourceCheck(horizonNote(), null)?.state).toBe("unknown");
	});

	it("a file or symbol gone at scannedRef is missing, with no value", () => {
		const c = noteSourceCheck(
			horizonNote(),
			scanAt(SCANNED, [
				horizonRead({
					state: "missing",
					why: "the file is not at that commit",
				}),
			]),
		);
		expect(c?.state).toBe("missing");
		expect(c?.scannedValue).toBeNull();
	});

	it("generic: any repo's pinned constant is checked the same way; a note without a pin is not checked", () => {
		const note: KnowledgeNote = {
			note: "MAX_ENTRIES = 64 in src/lib.rs (verified at commit aaaa).",
			source: "curated",
			asOf: "2026-09-01",
			pin: {
				commit: "a".repeat(40),
				path: "src/lib.rs",
				symbol: "MAX_ENTRIES",
				value: "64",
			},
		};
		const at = (value: string) =>
			noteSourceCheck(
				note,
				scanAt("b".repeat(40), [
					{
						path: "src/lib.rs",
						symbol: "MAX_ENTRIES",
						noteRef: "a".repeat(40),
						state: "read",
						value,
					},
				]),
			);
		expect(at("64")?.state).toBe("verified");
		expect(at("128")).toMatchObject({
			state: "conflict",
			notedValue: "64",
			scannedValue: "128",
		});
		const unpinned: KnowledgeNote = {
			note: "No pin.",
			source: "curated",
			asOf: "2026-09-01",
		};
		expect(noteSourceCheck(unpinned, scanAt(SCANNED, null))).toBeNull();
	});

	it("every pinned public note states its pinned value and cites its commit", () => {
		let pinned = 0;
		for (const [repo, notes] of Object.entries(REPO_KNOWLEDGE_NOTES))
			for (const n of notes) {
				if (!n.pin) continue;
				pinned += 1;
				expect(n.pin.commit, repo).toMatch(/^[0-9a-f]{40}$/);
				expect(n.pin.path, repo).not.toMatch(/^\/|^https?:/);
				expect(n.note, repo).toContain(`${n.pin.symbol} = ${n.pin.value}`);
				expect(n.note, repo).toContain(n.pin.commit);
			}
		expect(pinned).toBeGreaterThan(0);
	});
});

describe("readPinnedValues: the scan's raw read at scannedRef", () => {
	const pin = { commit: NOTED, path: PATH, symbol: SYMBOL, value: "29" };
	/** raw.githubusercontent.com: each commit answers its own status and body. */
	const raw = (
		byCommit: Record<string, [number, string]>,
		urls: string[] = [],
	) =>
		(async (url: string) => {
			urls.push(url);
			const commit = Object.keys(byCommit).find((c) => url.includes(`/${c}/`));
			if (!commit) throw new Error(`unexpected ${url}`);
			const [status, body] = byCommit[commit];
			return new Response(body, { status });
		}) as unknown as typeof fetch;
	const read = async (get: typeof fetch) =>
		(await readPinnedValues("stellar/stellar-horizon", SCANNED, [pin], get))[0];

	it("reads each pin at the note's commit and at the scanned commit, one fetch per file and commit", async () => {
		const urls: string[] = [];
		const get = raw(
			{
				[NOTED]: [200, `${horizonMainGo("29")}\n\tCurrentVersion = 20\n`],
				[SCANNED]: [200, `${horizonMainGo("30")}\n\tCurrentVersion = 20\n`],
			},
			urls,
		);
		const reads = await readPinnedValues(
			"stellar/stellar-horizon",
			SCANNED,
			[
				pin,
				{ commit: NOTED, path: PATH, symbol: "CurrentVersion", value: "20" },
			],
			get,
		);
		expect(urls).toEqual([
			`https://raw.githubusercontent.com/stellar/stellar-horizon/${NOTED}/${PATH}`,
			`https://raw.githubusercontent.com/stellar/stellar-horizon/${SCANNED}/${PATH}`,
		]);
		expect(reads).toEqual([
			{
				path: PATH,
				symbol: SYMBOL,
				noteRef: NOTED,
				state: "read",
				value: "30",
			},
			{
				path: PATH,
				symbol: "CurrentVersion",
				noteRef: NOTED,
				state: "read",
				value: "20",
			},
		]);
	});

	it("a reader that does not find the note's value at the note's commit is unread, never a change", async () => {
		const r = await read(
			raw({
				[NOTED]: [200, horizonMainGo("28")],
				[SCANNED]: [200, horizonMainGo("30")],
			}),
		);
		expect(r.state).toBe("unread");
		expect(r.state === "unread" && r.why).toContain(
			"at the note's own commit the scan reads 28 where the note states 29",
		);
	});

	it("at the scanned commit a 404 is missing; any other failure is unread, never a value", async () => {
		const at = async (status: number, body = "") =>
			(
				await read(
					raw({
						[NOTED]: [200, horizonMainGo("29")],
						[SCANNED]: [status, body],
					}),
				)
			).state;
		expect(await at(404)).toBe("missing");
		expect(await at(200, "package ingest\n")).toBe("missing");
		expect(await at(503)).toBe("unread");
		expect(
			(
				await read((async () => {
					throw new Error("network down");
				}) as unknown as typeof fetch)
			).state,
		).toBe("unread");
	});
});

describe("the stored note carries its pin, so every reader of stored notes can check it", () => {
	it("the collection stores a pin beside each note (an update drops a subfield the schema lacks)", async () => {
		const { Repos } = await import("../../collections/Repos");
		const notes = Repos.fields.find(
			(f) => "name" in f && f.name === "knowledgeNotes",
		) as { fields?: Array<{ name?: string }> } | undefined;
		expect(notes?.fields?.map((f) => f.name)).toContain("pin");
	});

	it("the backfill sees a newly pinned note as a change, and an unchanged pin as none", () => {
		const n = horizonNote();
		const storedBefore = {
			note: n.note,
			source: n.source,
			asOf: n.asOf,
			visibility: "public",
		};
		expect(storedNoteShape(storedBefore)).not.toEqual(storedNoteShape(n));
		expect(storedNoteShape({ ...storedBefore, pin: { ...n.pin } })).toEqual(
			storedNoteShape(n),
		);
	});
});

describe("scan waves pick a repo whose pinned note has no usable reading (bounded)", () => {
	const now = Date.parse("2026-11-11T12:00:00Z");
	// Read inside each test, so a missing export fails that test alone.
	const horizonPins = () => notePinsFor("stellar/stellar-horizon");
	const row = (over: Record<string, unknown>) => ({
		codeScanState: "scanned",
		codeScannedAt: "2026-11-07T02:46:33.460Z",
		lastCommitAt: "2026-11-03T07:22:08.000Z",
		scannedRef: SCANNED,
		pinnedValues: null,
		...over,
	});
	const read30 = horizonRead({ state: "read", value: "30" });

	it("Horizon after deploy: quiet since its scan, no reading stored, so it is due", () => {
		expect(pinnedRepos()).toContain("stellar/stellar-horizon");
		expect(pinScanDue(horizonPins(), row({}), now)).toBe(true);
	});

	it("a usable reading at scannedRef is not due; one at another commit, or unread, is", () => {
		expect(
			pinScanDue(
				horizonPins(),
				row({ pinnedValues: { ref: SCANNED, reads: [read30] } }),
				now,
			),
		).toBe(false);
		expect(
			pinScanDue(
				horizonPins(),
				row({ pinnedValues: { ref: "f".repeat(40), reads: [read30] } }),
				now,
			),
		).toBe(true);
		expect(
			pinScanDue(
				horizonPins(),
				row({
					pinnedValues: {
						ref: SCANNED,
						reads: [horizonRead({ state: "unread", why: "x" })],
					},
				}),
				now,
			),
		).toBe(true);
	});

	it("a push after the scan that took the reading is due", () => {
		expect(
			pinScanDue(
				horizonPins(),
				row({
					lastCommitAt: "2026-11-09T00:00:00Z",
					pinnedValues: { ref: SCANNED, reads: [read30] },
				}),
				now,
			),
		).toBe(true);
	});

	it("bounded: a scan in the last day, a gone repo, a pin at the scanned commit or no pin is never due", () => {
		expect(
			pinScanDue(
				horizonPins(),
				row({ codeScannedAt: "2026-11-11T00:00:00Z" }),
				now,
			),
		).toBe(false);
		expect(pinScanDue(horizonPins(), row({ codeScanState: "gone" }), now)).toBe(
			false,
		);
		expect(pinScanDue(horizonPins(), row({ scannedRef: NOTED }), now)).toBe(
			false,
		);
		expect(pinScanDue([], row({}), now)).toBe(false);
	});

	it("the wave leads with due rows, read with every field the scan loop keeps, and stays within its limit", async () => {
		const queries: Array<{ select: Record<string, boolean> }> = [];
		const store =
			(rows: Array<Record<string, unknown>>) =>
			async (q: { select: Record<string, boolean> }) => {
				queries.push(q);
				return { docs: rows };
			};
		const horizon = {
			fullName: "stellar/stellar-horizon",
			primaryLanguage: "Go",
			...row({}),
		};
		const routine = [
			{ fullName: "a/one" },
			{ fullName: "stellar/stellar-horizon" },
			{ fullName: "b/two" },
		];
		const wave = await pinDueWave(
			store([horizon, { fullName: "stellar/stellar-horizon-fork" }]),
			routine,
			{ lang: "all", limit: 3, now },
		);
		expect(wave.due).toEqual(["stellar/stellar-horizon"]);
		expect(wave.docs.map((d) => d.fullName)).toEqual([
			"stellar/stellar-horizon",
			"a/one",
			"b/two",
		]);
		// keepStoredContract writes the stored contract back from these
		for (const field of [
			"fullName",
			"repoScore",
			"isFork",
			"isArchived",
			"primaryLanguage",
			"mainnetContractId",
			"mainnetContractBasis",
			"scannedRef",
			"pinnedValues",
		])
			expect(queries[0].select[field], field).toBe(true);
		// the wave's language holds; a usable reading is not due
		expect(
			(
				await pinDueWave(store([horizon]), routine, {
					lang: "Rust",
					limit: 3,
					now,
				})
			).due,
		).toEqual([]);
		expect(
			(
				await pinDueWave(
					store([
						{
							...horizon,
							pinnedValues: { ref: SCANNED, reads: [read30] },
						},
					]),
					routine,
					{ lang: "all", limit: 3, now },
				)
			).due,
		).toEqual([]);
	});

	it("at most PIN_DUE_CAP due rows lead a wave", async () => {
		const many = Array.from({ length: PIN_DUE_CAP + 5 }, (_, i) => ({
			fullName: `org/pinned-${i}`,
			primaryLanguage: "Go",
			...row({}),
		}));
		const wave = await pinDueWave(async () => ({ docs: many }), [], {
			lang: "all",
			limit: 500,
			now,
			pinned: many.map((m) => m.fullName),
			pinsFor: () => horizonPins(),
		});
		expect(wave.due).toHaveLength(PIN_DUE_CAP);
		expect(wave.docs).toHaveLength(PIN_DUE_CAP);
	});
});

describe("audit 2026-11-11: a stored reading always wins over the commit shortcut", () => {
	const now = Date.parse("2026-11-11T12:00:00Z");
	const unreadAtNoted = {
		ref: NOTED,
		reads: [
			horizonRead({
				state: "unread",
				why: "at the note's own commit the scan reads 30 where the note states 29, so the two readings cannot be compared",
			}),
		],
	};

	it("a pin at the scanned commit whose reading is unread is unknown, never verified with a value the scan never read", () => {
		const c = noteSourceCheck(horizonNote(), {
			scannedRef: NOTED,
			scannedAt: "2026-11-07T02:46:33.460Z",
			pinnedValues: unreadAtNoted,
		});
		expect(c?.state).toBe("unknown");
		expect(c?.scannedValue).toBeNull();
		// with no reading stored, the note's own commit still verifies it
		expect(noteSourceCheck(horizonNote(), scanAt(NOTED, null))?.state).toBe(
			"verified",
		);
	});

	it("and that repo stays due for a re-read", () => {
		expect(
			pinScanDue(
				notePinsFor("stellar/stellar-horizon"),
				{
					codeScanState: "scanned",
					codeScannedAt: "2026-11-07T02:46:33.460Z",
					lastCommitAt: "2026-11-03T07:22:08.000Z",
					scannedRef: NOTED,
					pinnedValues: unreadAtNoted,
				},
				now,
			),
		).toBe(true);
	});
});

describe("audit 2026-11-11: line endings and comments do not change what a file declares", () => {
	const crlf = (s: string) => s.replace(/\n/g, "\r\n");

	it("a CRLF file reads like an LF one", () => {
		expect(readDeclaredValue(crlf(horizonMainGo("30")), SYMBOL)).toEqual({
			state: "read",
			value: "30",
		});
	});

	it("a CRLF file at the note's commit and at the scanned commit is read and compared", async () => {
		const get = (async (url: string) =>
			new Response(
				crlf(horizonMainGo(url.includes(`/${NOTED}/`) ? "29" : "30")),
				{ status: 200 },
			)) as unknown as typeof fetch;
		const [r] = await readPinnedValues(
			"stellar/stellar-horizon",
			SCANNED,
			[{ commit: NOTED, path: PATH, symbol: SYMBOL, value: "29" }],
			get,
		);
		expect(r).toMatchObject({ state: "read", value: "30" });
	});

	it("a trailing line comment declares nothing; a block comment, inline or over lines, is not a value", () => {
		expect(readDeclaredValue("foo() // X = 5", "X").state).toBe("missing");
		expect(readDeclaredValue("X = 30 /* was 29 */", "X")).toEqual({
			state: "read",
			value: "30",
		});
		expect(readDeclaredValue("const X = /* the cap */ 30;", "X")).toEqual({
			state: "read",
			value: "30",
		});
		expect(
			readDeclaredValue("/*\nX = 29 was the old value\n*/\nX = 30", "X"),
		).toEqual({ state: "read", value: "30" });
	});

	it("comment markers inside a string are text, not comments", () => {
		expect(readDeclaredValue('X = "https://a/b" // url', "X")).toEqual({
			state: "read",
			value: "https://a/b",
		});
		expect(readDeclaredValue('X = "/* not a comment */"', "X")).toEqual({
			state: "read",
			value: "/* not a comment */",
		});
	});

	it("a same-named local beside the constant makes the reading unread; alone it is read", () => {
		const constant = "const X = 30\n";
		expect(
			readDeclaredValue(`${constant}func f() {\n\tX := 31\n}`, "X").state,
		).toBe("unread");
		expect(readDeclaredValue("func f() {\n\tX := 31\n}", "X")).toEqual({
			state: "read",
			value: "31",
		});
	});
});

describe("re-check 2026-11-11: strings, regex literals and dereferences", () => {
	it("a multi-line raw string (Go backtick, JS template) holding /* opens no comment", () => {
		expect(
			readDeclaredValue(
				"const usage = `run it\nlike /* this\n`\nconst X = 30",
				"X",
			),
		).toEqual({ state: "read", value: "30" });
	});

	it("a regex literal holding /* opens no comment", () => {
		expect(
			readDeclaredValue("const re = /a\\/*b/;\nconst X = 30;", "X"),
		).toEqual({ state: "read", value: "30" });
		expect(
			readDeclaredValue("if (ok) return /a\\/*b/.test(s);\nconst X = 30;", "X"),
		).toEqual({ state: "read", value: "30" });
	});

	it("a slash that may be a regex before a comment left open is unread, never a guess", () => {
		expect(
			readDeclaredValue("const r = a.b /c\\/*d/;\nconst X = 30;", "X").state,
		).toBe("unread");
		expect(readDeclaredValue("/* never closed\nconst X = 30;", "X").state).toBe(
			"unread",
		);
		// a real division before a comment closed on its line is read
		expect(readDeclaredValue("y = a / b /* half */\nX = 30", "X")).toEqual({
			state: "read",
			value: "30",
		});
	});

	it("a name inside a string declares nothing", () => {
		expect(readDeclaredValue('msg := "set X = 5"', "X").state).toBe("missing");
		expect(readDeclaredValue('fmt.Println("X = 5")\nX = 30', "X")).toEqual({
			state: "read",
			value: "30",
		});
	});

	it("a dereference and a doc-comment continuation line declare nothing", () => {
		expect(readDeclaredValue("*X = 3", "X").state).toBe("missing");
		expect(readDeclaredValue("if p {\n\t*X = 3\n}\nconst X = 30", "X")).toEqual(
			{ state: "read", value: "30" },
		);
		expect(readDeclaredValue(" * X = 29\nX = 30", "X")).toEqual({
			state: "read",
			value: "30",
		});
	});

	it("a Rust lifetime is not a quote", () => {
		expect(
			readDeclaredValue('pub const NAME: &\'static str = "horizon";', "NAME"),
		).toEqual({ state: "read", value: "horizon" });
	});
});
