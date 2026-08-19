/**
 * i³ Awards — bulk import nominees and voters from CSV.
 *
 *   pnpm exec tsx scripts/data/award-import.ts --kind=nominees --file=noms.csv
 *   pnpm exec tsx scripts/data/award-import.ts --kind=voters --file=keys.csv --execute
 *
 * Dry-run by default: it resolves everything, prints exactly what it WOULD
 * write, and exits without touching the database.
 *
 * NOMINEES (from Emir's Airtable export). Columns, case-insensitive, in any
 * order — `project` and `category` are required:
 *
 *   project   directory slug, or the project's name, or its stellarlight URL
 *   category  a category KEY of the round (impact / innovation / …)
 *   blurb     optional; shown on the ballot card instead of the project's own
 *
 * A nominee row is a relationship to a REAL directory project — that is what
 * gives the ballot its logo, name and description. So the import's actual job
 * is resolution, and it refuses to guess: a row that matches no project, or
 * matches more than one, is reported and skipped rather than silently
 * dropped or attached to the wrong company. Fix those rows (or add the
 * project to the directory) and re-run; the import is idempotent.
 *
 * A project may be nominated in more than one category — each is its own row,
 * tallied separately. Two rows for the same (project, category) collapse to
 * one nominee.
 *
 * VOTERS (the Pilot + Navigator keys). Columns:
 *
 *   address   Stellar public key, G + 55 base32 chars
 *   label     optional human note, never shown publicly
 *
 * Keys are PUBLIC — no secret is ever handled here. They still never land in
 * the repo: pass the CSV through the workflow input, not a committed file.
 *
 * Never deletes. Existing rows are left alone, so re-running after fixing a
 * few lines only adds what is missing.
 */

import "../load-env";
import { readFileSync } from "node:fs";
import { StrKey } from "@stellar/stellar-sdk";
import { getPayload } from "payload";
import {
	normalizeName,
	parseCsv,
	slugFromCell,
} from "../../src/lib/awards/csv";

const { default: configPromise } = await import("../../src/payload.config");

const arg = (name: string) =>
	process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];

const EXECUTE = process.argv.includes("--execute");
const KIND = (arg("kind") ?? "").trim();
const FILE = arg("file") ?? "";
const ROUND_SLUG = arg("round") ?? null; // null → the open round
const INLINE = process.env.AWARD_IMPORT_CSV ?? "";

async function main() {
	console.log(
		`i³ awards import (${KIND || "?"}) — ${EXECUTE ? "EXECUTE" : "DRY-RUN (pass --execute to write)"}\n`,
	);
	if (KIND !== "nominees" && KIND !== "voters") {
		console.error("✗ --kind must be 'nominees' or 'voters'");
		process.exit(1);
	}
	const text = INLINE || (FILE ? readFileSync(FILE, "utf8") : "");
	if (!text.trim()) {
		console.error("✗ no CSV: pass --file=<path> or set AWARD_IMPORT_CSV");
		process.exit(1);
	}
	const rows = parseCsv(text);
	if (rows.length === 0) {
		console.error("✗ CSV has a header but no data rows");
		process.exit(1);
	}
	console.log(`${rows.length} CSV row(s)\n`);

	const payload = await getPayload({ config: await configPromise });

	// ── the round ──
	const where = ROUND_SLUG
		? { slug: { equals: ROUND_SLUG } }
		: { status: { equals: "open" } };
	const found = await payload.find({
		collection: "award-rounds",
		where,
		limit: 2,
		depth: 0,
	});
	if (found.docs.length === 0) {
		console.error(
			ROUND_SLUG
				? `✗ no round with slug "${ROUND_SLUG}"`
				: "✗ no OPEN round — pass --round=<slug> to target a draft one",
		);
		process.exit(1);
	}
	if (found.docs.length > 1) {
		console.error("✗ more than one round matched — pass --round=<slug>");
		process.exit(1);
	}
	const round = found.docs[0] as {
		id: string;
		slug: string;
		categories?: Array<{ key?: string }>;
	};
	console.log(`round: ${round.slug}\n`);

	if (KIND === "voters") await importVoters(payload, round, rows);
	else await importNominees(payload, round, rows);
}

// biome-ignore lint/suspicious/noExplicitAny: Payload's client type is awkward to thread
type Payload = any;

async function importVoters(
	payload: Payload,
	round: { id: string; slug: string },
	rows: Array<Record<string, string>>,
) {
	const existing = await payload.find({
		collection: "award-voters",
		where: { round: { equals: round.id } },
		limit: 1000,
		depth: 0,
	});
	const have = new Set(
		(existing.docs as Array<{ address?: string }>).map((d) =>
			String(d.address ?? "").toUpperCase(),
		),
	);

	const add: Array<{ address: string; label: string }> = [];
	const bad: string[] = [];
	const dupe: string[] = [];
	const seen = new Set<string>();

	for (const r of rows) {
		const address = (r.address ?? r.key ?? r["public key"] ?? "")
			.trim()
			.toUpperCase();
		if (!StrKey.isValidEd25519PublicKey(address)) {
			bad.push(address || "(blank)");
			continue;
		}
		if (seen.has(address)) {
			dupe.push(address);
			continue;
		}
		seen.add(address);
		if (have.has(address)) continue; // already whitelisted — leave it alone
		add.push({ address, label: (r.label ?? r.name ?? "").trim() });
	}

	console.log(`already whitelisted : ${have.size}`);
	console.log(`to add              : ${add.length}`);
	if (dupe.length) console.log(`duplicate in CSV    : ${dupe.length}`);
	if (bad.length) {
		console.log(`\n✗ ${bad.length} row(s) are not valid Stellar public keys:`);
		for (const b of bad.slice(0, 10)) console.log(`   ${b.slice(0, 12)}…`);
		if (bad.length > 10) console.log(`   …and ${bad.length - 10} more`);
	}

	if (!EXECUTE) {
		console.log("\nDRY-RUN — nothing written. Re-run with --execute.");
		process.exit(bad.length > 0 ? 1 : 0);
	}
	let wrote = 0;
	for (const v of add) {
		await payload.create({
			collection: "award-voters",
			data: {
				round: round.id,
				address: v.address,
				label: v.label || undefined,
			},
		});
		wrote++;
	}
	// Read back — payload.create can accept and drop unknown keys silently.
	const after = await payload.find({
		collection: "award-voters",
		where: { round: { equals: round.id } },
		limit: 1000,
		depth: 0,
	});
	console.log(`\nwrote ${wrote} — round now has ${after.totalDocs} voter(s)`);
	process.exit(bad.length > 0 ? 1 : 0);
}

async function importNominees(
	payload: Payload,
	round: { id: string; slug: string; categories?: Array<{ key?: string }> },
	rows: Array<Record<string, string>>,
) {
	const categoryKeys = new Set(
		(round.categories ?? [])
			.map((c) => String(c?.key ?? "").trim())
			.filter(Boolean),
	);
	console.log(`categories: ${[...categoryKeys].join(", ") || "(none!)"}\n`);

	// Whole directory once — resolution is by slug, then by exact name.
	const projects = await payload.find({
		collection: "projects",
		limit: 5000,
		depth: 0,
		select: { slug: true, name: true },
	});
	const bySlug = new Map<string, { id: string; slug: string; name: string }>();
	const byName = new Map<string, Array<{ id: string; slug: string }>>();
	for (const p of projects.docs as Array<{
		id: string;
		slug?: string;
		name?: string;
	}>) {
		const slug = String(p.slug ?? "");
		const name = String(p.name ?? "");
		if (slug) bySlug.set(slug.toLowerCase(), { id: p.id, slug, name });
		if (name) {
			const k = normalizeName(name);
			byName.set(k, [...(byName.get(k) ?? []), { id: p.id, slug }]);
		}
	}

	const existing = await payload.find({
		collection: "award-nominees",
		where: { round: { equals: round.id } },
		limit: 1000,
		depth: 0,
	});
	const have = new Set(
		(
			existing.docs as Array<{
				category?: string;
				project?: string | { id?: string };
			}>
		).map((d) => {
			const pid =
				typeof d.project === "object" && d.project
					? String(d.project.id)
					: String(d.project);
			return `${d.category}::${pid}`;
		}),
	);

	const add: Array<{ category: string; project: string; blurb: string }> = [];
	const unresolved: Array<{ cell: string; why: string }> = [];
	const badCategory: string[] = [];
	const seen = new Set<string>();

	for (const r of rows) {
		const cell = slugFromCell(r.project ?? r["project name"] ?? r.name ?? "");
		const category = (r.category ?? "").trim().toLowerCase();
		if (!categoryKeys.has(category)) {
			badCategory.push(`${cell || "(blank)"} → "${category || "(blank)"}"`);
			continue;
		}
		if (!cell) {
			unresolved.push({ cell: "(blank)", why: "no project cell" });
			continue;
		}
		let hit = bySlug.get(cell.toLowerCase()) ?? null;
		if (!hit) {
			const matches = byName.get(normalizeName(cell)) ?? [];
			if (matches.length === 1) {
				hit = { id: matches[0].id, slug: matches[0].slug, name: cell };
			} else if (matches.length > 1) {
				// Never guess between two real companies.
				unresolved.push({
					cell,
					why: `matches ${matches.length} projects (${matches.map((m) => m.slug).join(", ")})`,
				});
				continue;
			}
		}
		if (!hit) {
			unresolved.push({
				cell,
				why: "no directory project with that slug/name",
			});
			continue;
		}
		const key = `${category}::${hit.id}`;
		if (seen.has(key)) continue; // same pair twice in the CSV
		seen.add(key);
		if (have.has(key)) continue; // already a nominee
		add.push({
			category,
			project: hit.id,
			blurb: (r.blurb ?? r.description ?? r.why ?? "").trim(),
		});
	}

	console.log(`already nominees : ${have.size}`);
	console.log(`to add           : ${add.length}`);
	if (badCategory.length) {
		console.log(`\n✗ ${badCategory.length} row(s) with an unknown category:`);
		for (const b of badCategory.slice(0, 10)) console.log(`   ${b}`);
	}
	if (unresolved.length) {
		console.log(`\n✗ ${unresolved.length} row(s) could not be resolved:`);
		for (const u of unresolved.slice(0, 20)) {
			console.log(`   ${u.cell}  —  ${u.why}`);
		}
		if (unresolved.length > 20) {
			console.log(`   …and ${unresolved.length - 20} more`);
		}
		console.log(
			"\n   Add the project to the directory, or put its slug in the CSV, then re-run.",
		);
	}

	const problems = unresolved.length + badCategory.length;
	if (!EXECUTE) {
		console.log("\nDRY-RUN — nothing written. Re-run with --execute.");
		process.exit(problems > 0 ? 1 : 0);
	}
	let wrote = 0;
	for (const n of add) {
		await payload.create({
			collection: "award-nominees",
			data: {
				round: round.id,
				category: n.category,
				project: n.project,
				customBlurb: n.blurb || undefined,
			},
		});
		wrote++;
	}
	const after = await payload.find({
		collection: "award-nominees",
		where: { round: { equals: round.id } },
		limit: 1000,
		depth: 0,
	});
	console.log(`\nwrote ${wrote} — round now has ${after.totalDocs} nominee(s)`);
	process.exit(problems > 0 ? 1 : 0);
}

main().catch((e) => {
	console.error("Fatal:", e);
	process.exit(1);
});
