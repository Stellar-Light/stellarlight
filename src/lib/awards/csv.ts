/**
 * CSV reading for the i³ awards import (nominee and voter rosters).
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
