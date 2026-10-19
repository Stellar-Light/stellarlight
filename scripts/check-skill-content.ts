/**
 * Keep a reviewed copy of every live-fetched skill, and hold a skill whose
 * live text adds a risky line since its last review.
 *
 *   pnpm exec tsx scripts/check-skill-content.ts                        # dry run, writes nothing
 *   pnpm exec tsx scripts/check-skill-content.ts --execute              # write copies and holds
 *   pnpm exec tsx scripts/check-skill-content.ts --execute --baseline   # first run: accept every live text as it stands
 *   SKILL_ACCEPT=a,b pnpm exec tsx scripts/check-skill-content.ts --execute  # accept these skills' live text, risky lines included
 *
 * Skills: every curated skill read live from GitHub and every
 * skills.stellar.org registry entry, SDF-authored and community-built. Our
 * two inlined skills ship with the deploy and are reviewed in this repo.
 *
 * Per skill, the live text's risky lines (src/lib/skill-scan.ts) against
 * the accepted copy's. None new: the live text becomes the accepted copy, so
 * every honest update reaches the store as it reaches Raven. One new: the
 * skill is held, the accepted copy stays, and the serving guard
 * (src/lib/skill-guard.ts) serves it until a human reviews the upstream
 * change and accepts it. A skill seen for the first time with a risky line
 * is held too, except on --baseline. A skill that could not be read changes
 * nothing.
 *
 * Writes only on a change. Exits 1 while any skill is held, so the lane
 * stays red until someone looks; 2 when the registry or a quarter of the
 * skills could not be read.
 */

import "./load-env";
import { getPayload } from "payload";
import {
	CURATED_SKILLS,
	curatedSkillRawUrl,
} from "../src/lib/integrations/curated-skills";
import {
	fetchSdfSkill,
	fetchSdfSkillNamesLive,
} from "../src/lib/integrations/sdf-skills";
import { newFindings, riskyLines } from "../src/lib/skill-scan";
import configPromise from "../src/payload.config";

const EXECUTE = process.argv.includes("--execute");
const BASELINE = process.argv.includes("--baseline");
// From the environment, so a workflow input never reaches a shell line.
const ACCEPT = new Set(
	(process.env.SKILL_ACCEPT ?? "")
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean),
);

type Live = {
	slug: string;
	source: "curated" | "registry";
	text: string | null;
};

async function liveSkills(): Promise<{
	skills: Live[];
	registryRead: boolean;
}> {
	const skills: Live[] = [];
	for (const c of CURATED_SKILLS) {
		const url = curatedSkillRawUrl(c);
		if (!url) continue;
		const text = await fetch(url, { signal: AbortSignal.timeout(15_000) })
			.then((r) => (r.ok ? r.text() : null))
			.catch(() => null);
		skills.push({
			slug: c.slug,
			source: "curated",
			text: text?.trim() || null,
		});
	}
	// A curated entry answers for the registry copy it names (the route and
	// page serve curated first), so its slug is never read twice.
	const curated = new Set(CURATED_SKILLS.map((c) => c.slug));
	const names = await fetchSdfSkillNamesLive();
	for (const name of names ?? []) {
		if (curated.has(name)) continue;
		const s = await fetchSdfSkill(name);
		skills.push({ slug: name, source: "registry", text: s?.content ?? null });
	}
	return { skills, registryRead: names !== null };
}

type Snapshot = {
	id: string;
	slug: string;
	content?: string | null;
	acceptedRisky?: unknown;
	acceptedAt?: string | null;
	held?: boolean | null;
	heldAt?: string | null;
	heldRules?: unknown;
};

async function main() {
	const payload = await getPayload({ config: await configPromise });
	console.log(
		`check-skill-content: ${EXECUTE ? "EXECUTE, copies and holds are written" : "dry run, writes nothing"}${BASELINE ? ", baseline" : ""}`,
	);
	const { skills, registryRead } = await liveSkills();
	const stored = await payload.find({
		collection: "skill-snapshots",
		pagination: false,
		depth: 0,
	});
	const bySlug = new Map(
		(stored.docs as Snapshot[]).map((d) => [d.slug, d] as const),
	);
	const now = new Date().toISOString();
	const held: string[] = [];
	let unread = 0;
	let writes = 0;
	let failed = 0;
	for (const s of skills) {
		if (s.text === null) {
			unread++;
			console.log(`  could not read ${s.slug}`);
			continue;
		}
		const snap = bySlug.get(s.slug);
		const accepted = Array.isArray(snap?.acceptedRisky)
			? (snap.acceptedRisky as string[])
			: null;
		const fresh = newFindings(s.text, accepted);
		const accept =
			fresh.length === 0 ||
			ACCEPT.has(s.slug) ||
			// Never accepted, even if an earlier run already held it.
			(BASELINE && !snap?.acceptedAt);
		const rules = [...new Set(fresh.map((f) => f.rule))];
		let data: Record<string, unknown> | null = null;
		if (accept) {
			if (fresh.length)
				console.log(
					`  accepted ${s.slug} with ${fresh.length} risky line(s): ${rules.join(", ")}${ACCEPT.has(s.slug) ? " (accepted by hand)" : " (baseline)"}`,
				);
			if (!snap || snap.content !== s.text || snap.held)
				data = {
					slug: s.slug,
					source: s.source,
					content: s.text,
					acceptedRisky: riskyLines(s.text),
					acceptedAt: now,
					checkedAt: now,
					held: false,
					heldAt: null,
					heldRules: null,
				};
		} else {
			held.push(s.slug);
			console.log(
				`  HOLD ${s.slug}: ${fresh.map((f) => `${f.rule} (line ${f.line})`).join(", ")}`,
			);
			if (
				!snap?.held ||
				JSON.stringify(snap.heldRules) !== JSON.stringify(rules)
			)
				data = {
					slug: s.slug,
					source: s.source,
					checkedAt: now,
					held: true,
					heldAt: snap?.held ? (snap.heldAt ?? now) : now,
					heldRules: rules,
					// A first sighting keeps no copy: the guard serves nothing.
					...(snap ? {} : { content: null, acceptedRisky: [] }),
				};
		}
		if (!data || !EXECUTE) continue;
		try {
			if (snap)
				await payload.update({
					collection: "skill-snapshots",
					id: snap.id,
					data,
				});
			else
				await payload.create({
					collection: "skill-snapshots",
					data: data as { slug: string; source: "curated" | "registry" },
				});
			writes++;
		} catch (e) {
			failed++;
			console.error(`  ✗ ${s.slug}: ${(e as Error).message}`);
		}
	}
	for (const a of ACCEPT)
		if (!skills.some((s) => s.slug === a))
			console.error(`  ! ${a} is not a live-fetched skill; nothing accepted`);

	console.log(
		`\nread ${skills.length - unread} of ${skills.length} skills${registryRead ? "" : " (registry unreadable: curated only)"}, ${writes} write(s), ${held.length} held${held.length ? `: ${held.join(", ")}` : ""}`,
	);
	if (held.length)
		console.log(
			`Review each held skill's upstream change; to accept it, dispatch with execute and accept=${held.join(",")}.`,
		);
	if (failed || held.length) process.exitCode = 1;
	if (!registryRead || unread > skills.length / 4) {
		console.error(
			`✗ ${registryRead ? `${unread} of ${skills.length} skills` : "the registry"} could not be read`,
		);
		process.exitCode = 2;
	}
}

main()
	.then(() => process.exit(process.exitCode ?? 0))
	.catch((e) => {
		console.error("Fatal:", e);
		process.exit(1);
	});
