"use client";

/**
 * Tabbed install picker for the /scout hero — opencode.ai-style.
 *
 * Three install methods, each prominent:
 *   1. Skill          — `npx skills add Stellar-Light/stellar-scout` (CLI)
 *   2. MCP server     — `npx @stellar-light/scout-mcp` + Claude Desktop JSON
 *   3. Manual paste   — clone the raw SKILL.md
 *
 * The tab switching is the only stateful bit, hence the 'use client' marker.
 * Everything else stays server-renderable on the parent page.
 */

import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { CopyCommand } from "@/components/copy-command";

type TabKey = "skill" | "mcp" | "manual";

const TABS: Array<{ key: TabKey; label: string }> = [
	{ key: "skill", label: "Skill" },
	{ key: "mcp", label: "MCP server" },
	{ key: "manual", label: "Manual paste" },
];

/** Per-tab compatibility line shown under the install command. */
const COMPAT: Record<TabKey, string[]> = {
	skill: [
		"Claude Code",
		"Codex",
		"Cursor",
		"OpenClaw",
		"Amp",
		"Antigravity",
		"Cline",
	],
	mcp: [
		"Claude Desktop",
		"Claude.ai",
		"ChatGPT",
		"Cursor (MCP mode)",
		"Gemini",
		"Cline",
		"Continue",
		"Zed",
	],
	manual: ["Any client that loads SKILL.md / accepts a system prompt"],
};

export function ScoutInstallPicker() {
	const [active, setActive] = useState<TabKey>("skill");

	return (
		<div className="rounded-xl border border-border/50 bg-card overflow-hidden">
			{/* Tab strip */}
			<div className="flex border-b border-border/40 bg-black/20">
				{TABS.map((t) => {
					const isActive = t.key === active;
					return (
						<button
							type="button"
							key={t.key}
							onClick={() => setActive(t.key)}
							className={`flex-1 px-4 py-3 text-xs font-medium transition-colors border-b-2 ${
								isActive
									? "border-foreground text-foreground bg-card"
									: "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
							}`}
						>
							{t.label}
						</button>
					);
				})}
			</div>

			{/* Body */}
			<div className="p-6">
				{active === "skill" && <SkillTab />}
				{active === "mcp" && <McpTab />}
				{active === "manual" && <ManualTab />}

				{/* Compatibility chips — shared layout, per-tab data */}
				<div className="mt-5 pt-5 border-t border-border/30">
					<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2.5">
						Works with
					</div>
					<div className="flex flex-wrap gap-1.5">
						{COMPAT[active].map((c) => (
							<span
								key={c}
								className="inline-flex items-center px-2 py-0.5 rounded-full border border-border/60 bg-white/[0.03] text-[11px] text-muted-foreground"
							>
								{c}
							</span>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}

/* ─── tab bodies ────────────────────────────────────────────────────────── */

function SkillTab() {
	return (
		<>
			<CopyCommand
				command="npx skills add Stellar-Light/stellar-scout"
				className="flex items-center gap-3 rounded-lg bg-black/40 border border-border/30 p-4 font-mono text-sm text-foreground overflow-hidden"
			/>
			<p className="text-xs text-muted-foreground mt-3 leading-relaxed">
				For Codex append{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					-a codex
				</code>
				; for OpenClaw,{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					-a openclaw
				</code>
				. Installs the SKILL.md into your agent's skills directory. Powered
				by{" "}
				<a
					href="https://github.com/vercel-labs/skills"
					target="_blank"
					rel="noopener noreferrer"
					className="underline hover:text-foreground"
				>
					vercel-labs/skills
				</a>
				.
			</p>
		</>
	);
}

function McpTab() {
	return (
		<>
			<CopyCommand
				command="npx @stellar-light/scout-mcp"
				className="flex items-center gap-3 rounded-lg bg-black/40 border border-border/30 p-4 font-mono text-sm text-foreground overflow-hidden"
			/>
			<p className="text-xs text-muted-foreground mt-3 mb-4 leading-relaxed">
				Same 14 Scout tools, exposed as a Model Context Protocol server.
				For clients that don't load{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					SKILL.md
				</code>
				. Drop the config below into your client's MCP settings — restart →
				14 tools appear in the slash menu.
			</p>

			<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
				Claude Desktop / Cursor / etc.
			</div>
			<pre className="text-xs text-foreground font-mono rounded-lg bg-black/40 border border-border/30 p-4 overflow-x-auto leading-relaxed">{`{
  "mcpServers": {
    "stellar-scout": {
      "command": "npx",
      "args": ["-y", "@stellar-light/scout-mcp"]
    }
  }
}`}</pre>
			<p className="text-xs text-muted-foreground mt-2.5">
				macOS config path:{" "}
				<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
					~/Library/Application Support/Claude/claude_desktop_config.json
				</code>
			</p>
		</>
	);
}

function ManualTab() {
	return (
		<>
			<ol className="space-y-3 text-sm text-foreground">
				<li className="flex gap-3">
					<span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-border/50 text-xs text-muted-foreground inline-flex items-center justify-center font-mono">
						1
					</span>
					<div className="leading-relaxed">
						<strong>Open the raw SKILL.md</strong> in a new tab.
						<a
							href="/skills/stellar-scout.md"
							target="_blank"
							rel="noopener noreferrer"
							className="ml-2 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground underline"
						>
							View raw <ExternalLink className="w-3 h-3" />
						</a>
					</div>
				</li>
				<li className="flex gap-3">
					<span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-border/50 text-xs text-muted-foreground inline-flex items-center justify-center font-mono">
						2
					</span>
					<div className="leading-relaxed">
						<strong>Paste it into your AI client.</strong> For Claude Code,
						save the file to{" "}
						<code className="text-xs px-1 py-0.5 rounded bg-white/[0.04] border border-border/30">
							.claude/skills/stellar-scout/SKILL.md
						</code>
						. For Claude.ai, paste into the conversation. For others, drop
						into the skills/system-prompt slot.
					</div>
				</li>
				<li className="flex gap-3">
					<span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/5 border border-border/50 text-xs text-muted-foreground inline-flex items-center justify-center font-mono">
						3
					</span>
					<div className="leading-relaxed">
						<strong>Ask Scout anything.</strong> Try *"vet my idea: a stablecoin
						off-ramp for Lagos"* or *"what audit findings exist for Blend's
						oracle?"* — Scout cites primary sources.
					</div>
				</li>
			</ol>
		</>
	);
}
