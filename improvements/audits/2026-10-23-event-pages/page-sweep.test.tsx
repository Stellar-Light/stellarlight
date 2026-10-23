// @vitest-environment node

/**
 * Event pages sweep (lane EP): renders /hackathons/<slug> for every event of
 * a capture.mjs capture, from the body production served for it, and checks
 * criterion (b) on each: no stat block prints 0 (no captured event has a
 * classified outcome, so every 0 would stand for a null or an unknown), the
 * Submitted block and the Projects count say only what totalSubmissions
 * says, a winners-only event lists no submissions and says nothing is not
 * known, no placement badge holds an em or en dash, and every served
 * winner and submission has its card. Writes one line per event to
 * SWEEP_OUT,
 * with the length of the description the hero shows and of the markup.
 *
 *   REPLAY_LIVE=<capture.json> SWEEP_OUT=<out.txt> pnpm exec vitest run \
 *     --config improvements/audits/2026-10-23-event-pages/vitest.sweep.config.mts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import HackathonDetailPage from "@/app/(frontend)/hackathons/[slug]/page";

type Body = {
	hackathon: {
		coverage?: string;
		stats: {
			totalSubmissions: number | null;
			outcomes: { built: number; inProgress: number; abandoned: number } | null;
		};
	};
	winners: Array<{ name: string }>;
	submissions: Array<{ name: string }>;
};

const live = JSON.parse(readFileSync(process.env.REPLAY_LIVE ?? "", "utf8"));
const bodies = Object.entries(
	live.details as Record<string, { status: number; body: Body }>,
);
let current: Body | null = null;

vi.mock("@/lib/payload-client", () => ({
	getPayloadSafe: vi.fn(async () => ({})),
}));
vi.mock("@/lib/hackathon-detail", () => ({
	getHackathonDetail: vi.fn(async () => ({
		found: true,
		source: "dorahacks",
		body: current,
	})),
}));

/** A placement badge's text. */
const BADGE = /font-bold rounded-full border [^"]*">([^<]*)</g;
const STAT =
	/text-2xl sm:text-3xl font-bold text-foreground tracking-tight">([^<]*)</g;
const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, " ")
		.replace(/&#x27;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ");

describe("event pages sweep", () => {
	it(`renders every captured event (${bodies.length})`, async () => {
		const lines: string[] = [];
		for (const [slug, r] of bodies) {
			current = r.body;
			const html = renderToStaticMarkup(
				await HackathonDetailPage({ params: Promise.resolve({ slug }) }),
			);
			const { stats, coverage } = r.body.hackathon;
			const [top, projects = ""] = html.split("Projects</h2>");
			const stat = [...html.matchAll(STAT)].map((m) => m[1]);
			const submittedLabel = /(\d+) submitted</.exec(html)?.[1] ?? null;
			const projectCards = projects.split("</h3>").length - 1;
			const winnerCards = top.split("</h3>").length - 1;
			const lead = /max-w-3xl">([^<]*)</.exec(html)?.[1] ?? "";

			// (b) on every event.
			expect(stat).not.toContain("0");
			expect(winnerCards).toBe(r.body.winners.length);
			if (stats.totalSubmissions === null) {
				expect(submittedLabel).toBeNull();
				if (stat.length) expect(stat[0]).toBe("not known");
			} else {
				expect(stat[0]).toBe(String(stats.totalSubmissions));
				expect(submittedLabel).toBe(String(stats.totalSubmissions));
			}
			if (coverage === "winners-only") {
				expect(projectCards).toBe(0);
				expect(html).not.toContain("not known");
			} else expect(projectCards).toBe(r.body.submissions.length);
			const badges = [...html.matchAll(BADGE)].map((m) => m[1]);
			expect(badges.filter((b) => /[\u2013\u2014]/.test(b))).toEqual([]);

			lines.push(
				[
					slug,
					`winners ${winnerCards}`,
					`badges ${badges.length}`,
					`projects ${projectCards}`,
					`submitted ${submittedLabel ?? "-"}`,
					`stats [${stat.join(" | ")}]`,
					// Its length only: the text is the organizer's, not committed.
					`description ${text(lead).trim().length} chars`,
					`markup ${html.length} chars, ${gzipSync(html).length} bytes gzipped`,
				].join("; "),
			);
		}
		writeFileSync(process.env.SWEEP_OUT ?? "", `${lines.join("\n")}\n`);
		expect(lines).toHaveLength(bodies.length);
	});
});
