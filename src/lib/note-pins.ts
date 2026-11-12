/**
 * Pinned knowledge-note values checked against the code scan (sls-115).
 *
 * A curated note that states a value the source can change pins it to the
 * commit, file and symbol it was read at (repo-knowledge.ts KnowledgeNote.pin,
 * stamped onto the stored notes beside their text). Every code scan re-reads
 * each pinned symbol at its scannedRef and stores the reading as the row's
 * pinnedValues, in the same update as scannedRef. Serving compares the two
 * here, with no GitHub call. Kept apart from the note registry, so the routes
 * and the spec that check notes do not load the registry.
 */

/** How a note's pinned value compares with the scan's reading at scannedRef.
 * ONE list, for the served `sourceCheck.state` and its OpenAPI projection
 * (spec-enum-parity.test.ts pins both). */
export const SOURCE_CHECK_STATES = [
	"verified",
	"conflict",
	"missing",
	"unknown",
] as const;

// A type, not an interface: it is stored as a json subfield, and only a
// type alias is assignable to Payload's json type.
export type NotePin = {
	/** Full commit SHA the value was verified at. */
	commit: string;
	/** Repo-relative path of the file that declares the symbol. */
	path: string;
	/** The declared name, e.g. a constant. */
	symbol: string;
	/** The value as the source writes it after `=`, quotes removed. The
	 * note's text must state it as `symbol = value`. */
	value: string;
};

/** One pin as a code scan read it at its scannedRef. `noteRef` is the pin's
 * own commit: the scan first reads the symbol there, and its reading is used
 * only when it finds the note's value at the note's commit, so a declaration
 * the reader misreads is never served as a change. Trinary: `read` (one
 * value), `missing` (checked: the file is not at scannedRef, or no line
 * declares the symbol there) and `unread` (could not check: a file did not
 * arrive, the symbol has more than one value, or the reader does not find the
 * note's value at the note's commit). */
export type PinRead =
	| {
			path: string;
			symbol: string;
			noteRef: string;
			state: "read";
			value: string;
	  }
	| {
			path: string;
			symbol: string;
			noteRef: string;
			state: "missing" | "unread";
			why: string;
	  };

/** A scan's readings of one repo's pinned symbols, all at one commit. Stored
 * on the repo row as `pinnedValues` in the same update as `scannedRef`. */
export interface PinnedValues {
	ref: string;
	reads: PinRead[];
}

/** A pin as stored JSON, or undefined when it is not one. */
export function pinOf(x: unknown): NotePin | undefined {
	const p = x as Partial<NotePin> | null | undefined;
	return p &&
		typeof p.commit === "string" &&
		typeof p.path === "string" &&
		typeof p.symbol === "string" &&
		typeof p.value === "string"
		? { commit: p.commit, path: p.path, symbol: p.symbol, value: p.value }
		: undefined;
}

/** The stored reading of one pin, taken at `ref` for that very pin; undefined
 * when there is none. A reading taken at another commit is never returned. */
export function readingFor(
	pin: NotePin,
	ref: string | null,
	pinnedValues: unknown,
): PinRead | undefined {
	const stored = pinnedValues as Partial<PinnedValues> | null | undefined;
	if (!ref || stored?.ref !== ref || !Array.isArray(stored.reads))
		return undefined;
	return stored.reads.find(
		(r) =>
			r?.path === pin.path &&
			r?.symbol === pin.symbol &&
			r?.noteRef === pin.commit,
	);
}

/** A masked string or regex character: it can never form a name, so a
 * name inside a string or a regex literal never reads as a declaration. */
const IN_STRING = "\u0001";
/** A slash after one of these, or after these words, starts a regex literal;
 * after a name, a number or a closing bracket it divides. */
const REGEX_AFTER_CHAR = "(,=:[!&|?{};+-*%<>~^";
const REGEX_AFTER_WORD =
	/\b(?:return|typeof|instanceof|case|in|of|void|delete|throw|new|else|do|yield|await)$/;

/** The unescaped slash that closes a regex literal opened at `at`, outside a
 * character class, on the same line; -1 when there is none. */
function regexEnd(line: string, at: number): number {
	let inClass = false;
	for (let i = at + 1; i < line.length; i++) {
		const c = line[i];
		if (c === "\\") i++;
		else if (c === "[") inClass = true;
		else if (c === "]") inClass = false;
		else if (c === "/" && !inClass) return i;
	}
	return -1;
}

/**
 * Each line's code, and the same line masked: comments cut (a block comment
 * followed across lines), string and regex-literal contents kept in `code`
 * and masked in `masked`, CRLF and LF alike. A backtick string (a Go raw
 * string, a JS template) is followed across lines; a single or double quote
 * closes with its line, and a single quote with no closing one on its line is
 * an apostrophe or a Rust lifetime, not a quote. `uncertain` names why the
 * comments' extent cannot be trusted: a block comment opened after a slash
 * that may be a regex literal and left open past its line, or a comment or a
 * string still open at the end of the file.
 */
function codeLines(text: string): {
	lines: Array<{ code: string; masked: string }>;
	uncertain: string | null;
} {
	const lines: Array<{ code: string; masked: string }> = [];
	let inBlock = false;
	let tick = false;
	let uncertain: string | null = null;
	for (const line of text.split(/\r\n?|\n/)) {
		let code = "";
		let masked = "";
		const put = (c: string, inString: boolean) => {
			code += c;
			masked += inString ? IN_STRING : c;
		};
		let quote: string | null = tick ? "`" : null;
		let dividedBefore = false;
		let openedAfterDivision = false;
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (inBlock) {
				if (c === "*" && line[i + 1] === "/") {
					inBlock = false;
					openedAfterDivision = false;
					i++;
					put(" ", false);
				}
			} else if (quote) {
				if (c === quote) {
					quote = null;
					put(c, false);
				} else {
					put(c, true);
					if (c === "\\" && i + 1 < line.length) put(line[++i], true);
				}
			} else if (c === "/" && line[i + 1] === "/") break;
			else if (c === "/" && line[i + 1] === "*") {
				inBlock = true;
				openedAfterDivision = dividedBefore;
				i++;
			} else if (c === "/") {
				const before = code.trimEnd();
				const end =
					before === "" ||
					REGEX_AFTER_CHAR.includes(before.at(-1) ?? "") ||
					REGEX_AFTER_WORD.test(before)
						? regexEnd(line, i)
						: -1;
				if (end < 0) {
					dividedBefore = true;
					put(c, false);
				} else {
					put("/", false);
					for (let j = i + 1; j < end; j++) put(line[j], true);
					put("/", false);
					i = end;
				}
			} else {
				if (
					c === '"' ||
					c === "`" ||
					(c === "'" && line.indexOf("'", i + 1) > i)
				)
					quote = c;
				put(c, false);
			}
		}
		if (inBlock && openedAfterDivision)
			uncertain ??=
				"a block comment opens after a slash that may be a regex literal and runs past its line";
		tick = quote === "`";
		lines.push({ code, masked });
	}
	if (inBlock) uncertain ??= "a block comment never closes";
	if (tick) uncertain ??= "a backtick string never closes";
	return { lines, uncertain };
}

/**
 * The value `text` declares for `symbol`: `NAME = v`, `NAME: T = v`,
 * `NAME T = v` (Go) or `NAME := v`, in code outside comments, strings and
 * regex literals (codeLines; a line starting with `#` is a comment or an
 * attribute, one starting with `*` a dereference or a doc-comment line). A
 * field access (`x.NAME = v`), a dereference (`*NAME = v`), a comparison
 * (`NAME == v`), a compound assignment (`NAME *= v`), a name inside a string
 * and a plain use declare nothing. One distinct value is a read; none is
 * missing; more than one is unread, since the file alone cannot say which
 * is meant, and so is a file whose comments' extent codeLines cannot trust. A same-named local (`NAME := v`
 * in a function) is a declaration too: beside the constant with another
 * value it makes the reading unread; alone it is read as the value.
 * ponytail: `=` declarations only; give NotePin a pattern when a note pins a
 * JSON key or an object-literal field.
 */
export function readDeclaredValue(
	text: string,
	symbol: string,
):
	| { state: "read"; value: string }
	| { state: "missing" | "unread"; why: string } {
	const name = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	// An optional type between name and `=`: `: T` (Rust, TS, Python) or
	// ` T` (Go), where T starts with a letter after any `&`, `*` or `[]` and
	// a Rust lifetime (`&'static str`). A `*` before the name dereferences.
	const decl = new RegExp(
		String.raw`(?<![\w.$"'\x60*])${name}(?:\s*:\s*[&*[\]]*(?:'[A-Za-z_]\w*\s+)?[A-Za-z_][\w.[\]<>&*']*|\s+[*[\]]*[A-Za-z_][\w.[\]*]*)?\s*:?=(?!=)\s*(.*)$`,
	);
	const { lines, uncertain } = codeLines(text);
	if (uncertain) return { state: "unread", why: uncertain };
	const values = new Set<string>();
	for (const { code, masked } of lines) {
		// `#`: a comment or an attribute; `*`: a dereference, or a doc-comment
		// continuation the block tracking did not see open.
		if (/^\s*[#*]/.test(code)) continue;
		// Matched on the masked line, so a name inside a string is no
		// declaration; the value is read from the same place in the code.
		const m = decl.exec(masked);
		if (!m) continue;
		const rest = code.slice(m.index + m[0].length - m[1].length);
		const quoted = /^(["'`])(.*?)\1/.exec(rest);
		values.add(
			quoted ? quoted[2] : rest.split(/\s*(?:\/\/|\s#|;|,)/)[0].trim(),
		);
	}
	if (!values.size) return { state: "missing", why: "no line declares it" };
	if (values.has(""))
		return { state: "unread", why: "its value continues past its line" };
	if (values.size > 1)
		return {
			state: "unread",
			why: `it is declared with ${values.size} different values`,
		};
	return { state: "read", value: [...values][0] };
}

/** A pinned note's value checked against the scan a response serves. */
export interface SourceCheck {
	/** verified: the scanned commit holds the note's value. conflict: it holds
	 * another, scannedValue. missing: checked, and the file at that commit is
	 * gone or declares no such symbol. unknown: not checked at that commit. */
	state: (typeof SOURCE_CHECK_STATES)[number];
	symbol: string;
	path: string;
	notedValue: string;
	notedRef: string;
	notedAsOf: string | null;
	scannedValue: string | null;
	scannedRef: string | null;
	scannedAt: string | null;
	reason: string;
}

/** The scan a repo row's codeVerified serves (codeScanState scanned with a
 * proof, as explain and search build it), as noteSourceCheck reads it; null
 * when the row serves no scan. A note is checked only against the scannedRef
 * served beside it. */
export function noteScanOf(row: {
	codeScanState?: unknown;
	stellarProof?: unknown;
	scannedRef?: unknown;
	codeScannedAt?: unknown;
	pinnedValues?: unknown;
}) {
	if (row.codeScanState !== "scanned" || !row.stellarProof) return null;
	return {
		scannedRef: typeof row.scannedRef === "string" ? row.scannedRef : null,
		scannedAt:
			typeof row.codeScannedAt === "string"
				? row.codeScannedAt
				: row.codeScannedAt instanceof Date
					? row.codeScannedAt.toISOString()
					: null,
		pinnedValues: row.pinnedValues,
	};
}

/**
 * Check a note's pinned value against the code scan a response serves
 * (codeVerified.scannedRef). Pure: the scan stored its reading at scan time,
 * so nothing is fetched at answer time. A reading taken at any other commit
 * is not used, and a value that could not be read is unknown, never a match.
 * null when the note pins no value: for a stored note, also while it has not
 * yet been stamped with its pin. `note.pin` may be stored JSON.
 */
export function noteSourceCheck(
	note: { asOf?: string | null; pin?: unknown },
	scan: {
		scannedRef: string | null;
		scannedAt: string | null;
		pinnedValues?: unknown;
	} | null,
): SourceCheck | null {
	const pin = pinOf(note.pin);
	if (!pin) return null;
	const ref = scan?.scannedRef ?? null;
	const check = (
		state: SourceCheck["state"],
		scannedValue: string | null,
		reason: string,
	): SourceCheck => ({
		state,
		symbol: pin.symbol,
		path: pin.path,
		notedValue: pin.value,
		notedRef: pin.commit,
		notedAsOf: note.asOf ?? null,
		scannedValue,
		scannedRef: ref,
		scannedAt: scan?.scannedAt ?? null,
		reason,
	});
	if (!ref)
		return check(
			"unknown",
			null,
			"The response carries no scanned commit (codeVerified or its scannedRef is null), so the value was not checked against current source.",
		);
	const read = readingFor(pin, ref, scan?.pinnedValues);
	if (read?.state === "read" && typeof read.value === "string")
		return read.value === pin.value
			? check(
					"verified",
					read.value,
					"The scan read the same value at the scanned commit.",
				)
			: check(
					"conflict",
					read.value,
					`The scan read ${read.value} at the scanned commit; the note's ${pin.value} was read at the note's own commit, where the scan reads the same ${pin.value}.`,
				);
	if (read?.state === "missing")
		return check(
			"missing",
			null,
			`At the scanned commit, ${pin.path} holds no declaration of ${pin.symbol} (${read.why}).`,
		);
	if (read?.state === "unread")
		return check(
			"unknown",
			null,
			`The scan's reading of ${pin.symbol} in ${pin.path} cannot be used: ${read.why}.`,
		);
	// Only with no reading stored: a stored one, unread included, is what the
	// scan found at this commit and is served as such (audit 2026-11-11).
	if (ref.toLowerCase() === pin.commit.toLowerCase())
		return check(
			"verified",
			pin.value,
			"The note was verified at the scanned commit itself, and the scan holds no reading of it.",
		);
	return check(
		"unknown",
		null,
		`The scan at the scanned commit holds no reading of ${pin.symbol} in ${pin.path} for this note.`,
	);
}
