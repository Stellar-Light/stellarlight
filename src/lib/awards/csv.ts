/**
 * CSV reading and writing for the i³ awards (roster import, ballot export).
 *
 * Pure and dependency-free so the parser can be tested without a database —
 * it lives here rather than in the script because importing the script pulls
 * in Payload and a live connection.
 */

/**
 * Minimal RFC-4180 reader: quoted fields, embedded commas, doubled quotes,
 * CRLF. A dependency would be a bigger surface than the parser.
 *
 * Returns one record per data row, keyed by the lower-cased header, so a
 * spreadsheet export with "Project Name" and "project name" reads the same.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (quoted) {
			if (c === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else quoted = false;
			} else field += c;
			continue;
		}
		if (c === '"') quoted = true;
		else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && text[i + 1] === "\n") i++;
			row.push(field);
			field = "";
			if (row.some((v) => v.trim() !== "")) rows.push(row);
			row = [];
		} else field += c;
	}
	row.push(field);
	if (row.some((v) => v.trim() !== "")) rows.push(row);
	if (rows.length === 0) return [];

	const header = rows[0].map((h) => h.trim().toLowerCase());
	return rows.slice(1).map((r) => {
		const rec: Record<string, string> = {};
		header.forEach((h, i) => {
			rec[h] = (r[i] ?? "").trim();
		});
		return rec;
	});
}

/** Pull a slug out of a pasted stellarlight project URL, else pass through. */
export function slugFromCell(cell: string): string {
	const m = cell.match(/\/project\/([a-z0-9-]+)/i);
	return (m ? m[1] : cell).trim();
}

/** Loose key for name matching: case, punctuation and spacing insensitive. */
export function normalizeName(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

/**
 * RFC-4180 writer, the mirror of parseCsv above.
 *
 * Quotes a field only when it needs it (comma, quote, CR or LF), doubling
 * embedded quotes. A leading `=`, `+`, `-` or `@` is prefixed with a single
 * quote: spreadsheets treat those as formulas, and a ballot export is read in
 * Airtable and Excel. Nothing in a Stellar address or a project slug starts
 * that way today, which is exactly why it would go unnoticed if it ever did.
 */
export function toCsv(
	rows: Array<Record<string, string | number | null | undefined>>,
	columns?: string[],
): string {
	const cols =
		columns ?? [...new Set(rows.flatMap((r) => Object.keys(r)))].sort();
	const cell = (v: unknown): string => {
		let s = v === null || v === undefined ? "" : String(v);
		if (/^[=+\-@]/.test(s)) s = `'${s}`;
		return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
	};
	const lines = [cols.join(",")];
	for (const row of rows) lines.push(cols.map((c) => cell(row[c])).join(","));
	return `${lines.join("\r\n")}\r\n`;
}
