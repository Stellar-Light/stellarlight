import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyCommand } from "@/components/copy-command";

export const metadata: Metadata = {
	title: "Scout at HackMeridian 2026",
	description:
		"How to use Stellar Scout at HackMeridian 2026 in Lisbon: the event in brief, five questions Scout answers while you build, setup for Claude and Cursor, and its limits.",
	alternates: { canonical: "/hackmeridian" },
};

// Every fact and number on this page was read from the live API on
// 2026-10-23. improvements/rounds/2026-10-23-hackmeridian-kit.md lists each
// call, its time and the value served; re-check there before changing one.

const BRIEF = [
	{
		label: "When and where",
		text: "09:00 Sunday 25 October to 12:00 Monday 26 October, Lisbon time, at Warehouse ONE16, Marvila. The 12:00 deadline is final: no late submissions.",
	},
	{
		label: "Categories",
		text: "Genesis takes a new idea or early prototype to a working MVP, judged on problem clarity, MVP quality, Stellar integration and continued development potential. Scale moves an existing product or advanced prototype toward production, judged on milestones against goals set at pre-event intake, SCF eligibility, production readiness and ecosystem impact.",
	},
	{
		label: "Tracks",
		text: "Stellar Unlocked: new uses of Stellar's core protocol features. Stellar Composed: two or more ecosystem tools or projects combined.",
	},
	{
		label: "This year's priorities",
		text: "Smart contracts, smart accounts and cross-chain transfers.",
	},
	{
		label: "Judging and prizes",
		text: "An async review of your demo video, pitch deck, GitHub repo and submission answers. Up to $30,000 across six winners, set in USD and paid in XLM. Finalists pitch live at the Meridian conference on 28 October.",
	},
	{
		label: "AI tools",
		text: "AI-assisted development is allowed.",
	},
];

const QUESTIONS = [
	{
		title: "Check an idea for prior art",
		prompt:
			'"I want to build cross-chain USDC transfers between Stellar and EVM chains. Has it been built at a Stellar hackathon?"',
		tool: "vet_idea",
		returned:
			"five past builds, best first, with event, placement and repo, all from Stellar Hacks: Real-World ZK; one placed (Tukar, 5th). It also named live competitors, among them Circle CCTP, Allbridge and Axelar.",
	},
	{
		title: "Last year's winners",
		prompt: '"Who won HackMeridian 2025, by track?"',
		tool: "get_hackathon",
		returned:
			"the winners, first to third per track, with a link to SDF's recap. Open Innovation: The Simple Fund, 4Bridge, Stellar Forge. Composability: Lance, Star Lends, Panorama Block. Scout holds only these six, not the 110+ entries.",
	},
	{
		title: "Find where something is defined",
		prompt: '"Where is require_auth defined in Stellar\'s code?"',
		tool: "locate_source",
		returned:
			"pointers, best first: file, line and a GitHub link pinned to a commit. The top hit was the host implementation in rs-soroban-env. Open the link to read the code.",
	},
	{
		title: "Find ramps and anchors",
		prompt:
			'"Which on and off ramps can my app use, and where do they operate?"',
		tool: "get_partners",
		returned:
			"eight ramp partners, all anchors: four in Latin America, two global, one in Africa, one in Africa and Europe. All eight listings are flagged as aging, so confirm details with the anchor. Anchors with no recorded ramp are left out.",
	},
	{
		title: "Prepare an SCF pitch",
		prompt:
			'"What would an SCF pitch for a passkey smart wallet with social recovery look like?"',
		tool: "scf_pitch",
		returned:
			"the live round (SCF Round 46, deadline 8 November 2026), the 45 active wallet projects with SCF awards ($5,553,425 in all, the eight largest named), vet_idea's competitors and prior art, and four pitch angles, each tied to a fact. It writes no pitch: your agent drafts one from these facts.",
	},
];

const LIMITS = [
	{
		label: "Past hackathons only",
		text: "Prior art covers 1,356 submissions to 23 past Stellar hackathons, mostly from DoraHacks. No match does not mean nobody built it.",
	},
	{
		label: "Not this year's entries",
		text: "HackMeridian 2026 submissions are not in the index during the event.",
	},
	{
		label: "Code lookup",
		text: "Eight repos: stellar-core, rs-soroban-sdk, rs-soroban-env, js-stellar-sdk, stellar-rpc, quickstart, stellar-cli and soroban-examples. Code and Markdown headings only, not JSON configs.",
	},
	{
		label: "Evidence, not a verdict",
		text: "Results show what is on record and where it came from. Which idea to build is your call.",
	},
];

const MCP_JSON = `{
  "mcpServers": {
    "stellar-scout": {
      "command": "npx",
      "args": ["-y", "@stellar-light/scout-mcp@latest"]
    }
  }
}`;

const CODE =
	"text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30";
const PRE =
	"mt-3 text-xs text-foreground font-mono rounded-lg bg-black/40 border border-border/30 p-4 overflow-x-auto leading-relaxed";

export default function HackMeridianPage() {
	return (
		<div className="min-h-screen relative">
			<main className="max-w-4xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<Link
					href="/scout"
					className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors duration-150 mb-10 group"
				>
					<ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform duration-150" />
					<span className="text-sm font-medium">Back to Scout</span>
				</Link>

				<div className="mb-10">
					<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
						HackMeridian 2026
					</div>
					<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
						Using Scout at HackMeridian
					</h1>
					<p className="text-muted-foreground max-w-2xl">
						For builders in Lisbon, 25 to 26 October 2026: the event in brief,
						five questions Scout answers while you build, setup, and limits.
					</p>
				</div>

				{/* The event in brief */}
				<section className="mb-14">
					<h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
						The event in brief
					</h2>
					<div className="space-y-2">
						{BRIEF.map((b) => (
							<div
								key={b.label}
								className="rounded-xl border border-border/50 bg-card p-4"
							>
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5">
									{b.label}
								</div>
								<div className="text-sm text-foreground leading-relaxed">
									{b.text}
								</div>
							</div>
						))}
					</div>
					<p className="text-xs text-muted-foreground leading-relaxed mt-4 max-w-2xl">
						Official rules and changes:{" "}
						<a
							href="https://meridian.stellar.org/hackmeridian"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground"
						>
							meridian.stellar.org/hackmeridian
						</a>{" "}
						and{" "}
						<a
							href="https://hackmeridian.com"
							target="_blank"
							rel="noopener noreferrer"
							className="underline hover:text-foreground"
						>
							hackmeridian.com
						</a>
						, the organizer's site. If they differ from this page, follow them.
					</p>
				</section>

				{/* What Scout can answer */}
				<section className="mb-14">
					<h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
						What Scout can answer
					</h2>
					<p className="text-sm text-muted-foreground max-w-2xl mb-4">
						Type these into Claude or Cursor once Scout is set up (below). Each
						note is what the tool returned on 23 October 2026.
					</p>
					<div className="space-y-2">
						{QUESTIONS.map((q) => (
							<div
								key={q.tool}
								className="rounded-xl border border-border/50 bg-card p-4"
							>
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5">
									{q.title}
								</div>
								<div className="text-sm text-foreground font-mono">
									{q.prompt}
								</div>
								<p className="text-xs text-muted-foreground leading-relaxed mt-2">
									<span className="font-mono text-foreground">{q.tool}</span>{" "}
									returned {q.returned}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* Set it up */}
				<section className="mb-14">
					<h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
						Set it up
					</h2>
					<p className="text-sm text-muted-foreground max-w-2xl mb-4">
						The Scout MCP server runs on your machine through npx, with Node.js
						20 or later and no API key. <code className={CODE}>@latest</code>{" "}
						fetches the current release;{" "}
						<code className={CODE}>locate_source</code> needs scout-mcp 1.8.0 or
						later.
					</p>
					<div className="space-y-2">
						<div className="rounded-xl border border-border/50 bg-card p-4">
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5">
								Claude Desktop
							</div>
							<div className="text-sm text-foreground leading-relaxed">
								Add this to{" "}
								<code className={CODE}>claude_desktop_config.json</code> (
								<code className={CODE}>
									~/Library/Application Support/Claude/
								</code>{" "}
								on macOS, <code className={CODE}>%APPDATA%\Claude\</code> on
								Windows), then restart Claude Desktop.
							</div>
							<pre className={PRE}>{MCP_JSON}</pre>
						</div>
						<div className="rounded-xl border border-border/50 bg-card p-4">
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5">
								Claude Code
							</div>
							<div className="text-sm text-foreground leading-relaxed">
								Run this once in a terminal:
							</div>
							<div className="mt-3">
								<CopyCommand command="claude mcp add stellar-scout -- npx -y @stellar-light/scout-mcp@latest" />
							</div>
						</div>
						<div className="rounded-xl border border-border/50 bg-card p-4">
							<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5">
								Cursor
							</div>
							<div className="text-sm text-foreground leading-relaxed">
								In Cursor Settings, open MCP and add the same server:
							</div>
							<pre className={PRE}>{MCP_JSON}</pre>
						</div>
					</div>
					<p className="text-xs text-muted-foreground leading-relaxed mt-4 max-w-2xl">
						Without MCP, use the public REST API (see the{" "}
						<Link
							href="/scout/api-reference"
							className="underline hover:text-foreground"
						>
							API reference
						</Link>
						) or, in agents that load SKILL.md files, the{" "}
						<Link
							href="/skills/stellar-scout"
							className="underline hover:text-foreground"
						>
							stellar-scout skill
						</Link>
						.
					</p>
				</section>

				{/* Limits */}
				<section>
					<h2 className="text-sm font-semibold text-foreground uppercase tracking-wide mb-4">
						What it cannot tell you
					</h2>
					<div className="space-y-2">
						{LIMITS.map((l) => (
							<div
								key={l.label}
								className="rounded-xl border border-border/50 bg-card p-4"
							>
								<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-1.5">
									{l.label}
								</div>
								<div className="text-sm text-foreground leading-relaxed">
									{l.text}
								</div>
							</div>
						))}
					</div>
				</section>

				<div className="mt-12 text-center">
					<Link
						href="/scout"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						← Back to Scout overview
					</Link>
				</div>
			</main>
		</div>
	);
}
