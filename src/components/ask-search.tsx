"use client";

/**
 * Ask Stellar — a natural-language search over the live StellarLight data layer.
 *
 * On submit it queries the same semantic endpoints agents use — /api/research
 * (vector search over the knowledge corpus: SEPs, dev docs, audits, SDF +
 * ecosystem writing) and /api/projects/search (the project directory) — and
 * groups the grounded results. A short answer (POST /api/ask/answer) is
 * synthesized ONLY from those retrieved cards, every sentence cited [n];
 * when unavailable the cards stand alone. Every card links to a primary
 * source so answers stay citable, never free-generated.
 *
 * Fetches on explicit submit only (not per-keystroke) — /api/research costs
 * Voyage credits and is rate-limited.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Search, ArrowUpRight, Loader2, Sparkles } from "lucide-react";
import { partnerQueryFor } from "@/lib/ask-intent";

interface ResearchResult {
	id: string;
	source: string;
	title: string;
	section?: string;
	url?: string;
	content?: string;
	confidence?: { score?: number; label?: string };
}
interface ProjectResult {
	id: string;
	name: string;
	slug: string;
	category?: string;
	status?: string;
	shortDescription?: string | null;
	scfAwarded?: boolean;
	url?: string;
	confidence?: { score?: number; label?: string };
}
interface PartnerResult {
	slug: string;
	name: string;
	partnerType?: string;
	tagline?: string | null;
	description?: string | null;
	websiteUrl?: string;
	acceptingClients?: boolean;
}

// Partner-intent detection lives in src/lib/ask-intent.ts — shared with the
// /api/ask/answer route so the answer's sources line up with these cards.

interface AnswerCitation {
	n: number;
	type: string;
	title: string;
	url: string;
}
interface GroundedAnswer {
	text: string;
	citations: AnswerCitation[];
}

const PARTNER_TYPE_LABEL: Record<string, string> = {
	"audit-firm": "Audit firm",
	anchor: "Anchor",
	"on-off-ramp": "On/off-ramp",
	infrastructure: "Infrastructure",
	tooling: "Tooling",
	protocol: "Protocol",
	wallet: "Wallet",
	legal: "Legal",
	agency: "Agency",
};

const EXAMPLES = [
	"who can audit my soroban smart contract?",
	"find me a stellar anchor for on/off-ramp",
	"which lending protocols on soroban are most active?",
	"how do confidential tokens work on stellar?",
	"what's MPP and how do agents pay with it?",
];

const SOURCE_LABEL: Record<string, string> = {
	audit: "Audit",
	sep: "SEP",
	"dev-docs": "Dev docs",
	"sdf-blog": "SDF blog",
	"scf-handbook": "SCF handbook",
	"lumenloop-research": "Research",
	lumenloop: "Research",
	paper: "Paper",
};

function snippet(text?: string, n = 180): string {
	if (!text) return "";
	const clean = text.replace(/[#*`>_]/g, "").replace(/\s+/g, " ").trim();
	return clean.length > n ? `${clean.slice(0, n)}…` : clean;
}

export function AskSearch() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const q = searchParams.get("q") || "";
	const [input, setInput] = useState(q);
	const [loading, setLoading] = useState(false);
	const [research, setResearch] = useState<ResearchResult[]>([]);
	const [projects, setProjects] = useState<ProjectResult[]>([]);
	const [partners, setPartners] = useState<PartnerResult[]>([]);
	const [answered, setAnswered] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
	const [answerLoading, setAnswerLoading] = useState(false);
	const answerAbort = useRef<AbortController | null>(null);

	const run = useCallback(async (query: string) => {
		if (!query.trim()) return;
		setLoading(true);
		setError(null);
		setAnswer(null);
		try {
			const [rRes, pRes, partRes] = await Promise.all([
				fetch(`/api/research?q=${encodeURIComponent(query)}&limit=6`).then((r) =>
					r.ok ? r.json() : { results: [] },
				),
				fetch(`/api/projects/search?q=${encodeURIComponent(query)}&limit=6`).then((r) =>
					r.ok ? r.json() : { projects: [] },
				),
				// Providers/partners — matched by intent (audit → audit firms, etc.).
				fetch(`/api/partners?${partnerQueryFor(query)}&limit=4`).then((r) =>
					r.ok ? r.json() : { partners: [] },
				),
			]);
			setResearch(rRes.results ?? []);
			setProjects(pRes.projects ?? []);
			setPartners(partRes.partners ?? []);
			setAnswered(true);

			// Grounded answer — non-blocking; the cards never wait on it, and any
			// failure/unavailability just leaves the cards as the whole answer
			// (the pre-answer behavior).
			answerAbort.current?.abort();
			const ac = new AbortController();
			answerAbort.current = ac;
			setAnswerLoading(true);
			fetch("/api/ask/answer", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ query }),
				signal: ac.signal,
			})
				.then((r) => (r.ok ? r.json() : null))
				.then((d) => {
					if (ac.signal.aborted) return;
					setAnswer(
						d?.answer
							? { text: String(d.answer), citations: d.citations ?? [] }
							: null,
					);
				})
				.catch(() => {
					if (!ac.signal.aborted) setAnswer(null);
				})
				.finally(() => {
					if (!ac.signal.aborted) setAnswerLoading(false);
				});
		} catch {
			setError("Something went wrong reaching the index. Try again.");
		} finally {
			setLoading(false);
		}
	}, []);

	// Run whenever the URL query changes (shareable + back/forward friendly).
	useEffect(() => {
		setInput(q);
		if (q) run(q);
		else {
			setAnswered(false);
			setResearch([]);
			setProjects([]);
			setPartners([]);
		}
	}, [q, run]);

	const submit = (e?: React.FormEvent) => {
		e?.preventDefault();
		const query = input.trim();
		if (!query) return;
		router.push(`/ask?q=${encodeURIComponent(query)}`);
	};

	const ask = (query: string) => {
		setInput(query);
		router.push(`/ask?q=${encodeURIComponent(query)}`);
	};

	const noResults =
		answered && !loading && research.length === 0 && projects.length === 0 && partners.length === 0;

	return (
		<div className="w-full">
			<form onSubmit={submit} className="relative">
				<Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
				<input
					type="text"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="ask anything about the stellar ecosystem…"
					className="w-full h-14 pl-14 pr-28 bg-card text-base text-foreground placeholder-muted-foreground rounded-2xl border border-border outline-none transition-[border-color,box-shadow] duration-150 focus:border-white/30 focus:shadow-[0_0_0_3px_rgba(253,218,36,0.10)]"
					aria-label="Ask a question about Stellar"
				/>
				<button
					type="submit"
					disabled={loading || !input.trim()}
					className="absolute right-2.5 top-1/2 -translate-y-1/2 h-10 px-4 inline-flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-medium text-foreground disabled:opacity-40 transition-colors"
				>
					{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
					Ask
				</button>
			</form>

			{/* Example prompts */}
			{!answered && !loading && (
				<div className="mt-5 flex flex-wrap gap-2">
					{EXAMPLES.map((ex) => (
						<button
							key={ex}
							onClick={() => ask(ex)}
							className="text-xs px-3 py-1.5 rounded-full bg-white/[0.03] border border-border text-muted-foreground hover:text-foreground hover:border-white/25 transition-colors"
						>
							{ex}
						</button>
					))}
				</div>
			)}

			{loading && (
				<div className="mt-10 flex items-center gap-3 text-muted-foreground text-sm">
					<Loader2 className="w-4 h-4 animate-spin" />
					searching the index for “{input}”…
				</div>
			)}

			{error && <div className="mt-8 text-sm text-red-400">{error}</div>}

			{noResults && (
				<div className="mt-10 text-center py-12 border border-border rounded-2xl bg-card">
					<p className="text-muted-foreground">
						nothing in the index for “{q}” yet.
					</p>
					<p className="text-xs text-muted-foreground/70 mt-2">
						try a broader phrasing, or{" "}
						<Link href="/directory" className="underline hover:text-foreground">
							browse the directory
						</Link>
						.
					</p>
				</div>
			)}

			{answered && !loading && (partners.length > 0 || projects.length > 0 || research.length > 0) && (
				<div className="mt-10 space-y-10">
					{/* Grounded answer — synthesized ONLY from the cards below; every
					    sentence cites one. Renders nothing when unavailable (cards-only,
					    the pre-answer behavior). */}
					{(answer || answerLoading) && (
						<section>
							<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
								Answer
							</h2>
							{answer ? (
								<div className="rounded-xl bg-card border border-border p-4">
									<p className="text-sm text-foreground/90 leading-relaxed">
										{answer.text.split(/(\[\d+\])/).map((part, i) => {
											const m = part.match(/^\[(\d+)\]$/);
											if (!m) return <span key={`t-${i.toString()}`}>{part}</span>;
											const cite = answer.citations.find(
												(c) => c.n === Number(m[1]),
											);
											if (!cite) return null;
											const external = cite.url.startsWith("http");
											const cls =
												"inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 mx-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-muted-foreground border border-border hover:text-foreground hover:border-white/25 align-text-top transition-colors";
											return external ? (
												<a
													key={`c-${i.toString()}`}
													href={cite.url}
													target="_blank"
													rel="noopener noreferrer"
													title={cite.title}
													className={cls}
												>
													{cite.n}
												</a>
											) : (
												<Link
													key={`c-${i.toString()}`}
													href={cite.url}
													title={cite.title}
													className={cls}
												>
													{cite.n}
												</Link>
											);
										})}
									</p>
									<p className="text-[11px] text-muted-foreground/60 mt-2.5">
										synthesized only from the results below — every sentence
										cites a card
									</p>
								</div>
							) : (
								<div className="rounded-xl bg-card border border-border p-4 animate-pulse">
									<div className="h-3.5 bg-white/[0.05] rounded w-full mb-2" />
									<div className="h-3.5 bg-white/[0.05] rounded w-4/5" />
								</div>
							)}
						</section>
					)}

					{/* Partners / providers — the direct answer to "who can I hire" questions */}
					{partners.length > 0 && (
						<section>
							<div className="flex items-baseline justify-between gap-3 mb-4 flex-wrap">
								<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Providers ({partners.length})
								</h2>
								<Link
									href={q ? `/partners/chat?q=${encodeURIComponent(q)}` : "/partners/chat"}
									className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
								>
									chat with the partner concierge →
								</Link>
							</div>
							<div className="grid sm:grid-cols-2 gap-3">
								{partners.map((p) => {
									const Card = p.websiteUrl ? "a" : "div";
									return (
										<Card
											key={p.slug}
											{...(p.websiteUrl
												? { href: p.websiteUrl, target: "_blank", rel: "noopener noreferrer" }
												: {})}
											className="group block p-4 rounded-xl bg-card border border-border hover:border-white/25 hover:bg-white/[0.02] transition-all"
										>
											<div className="flex items-center gap-2 mb-1.5 flex-wrap">
												<span className="font-medium text-foreground group-hover:text-white transition-colors">
													{p.name}
												</span>
												{p.partnerType && (
													<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border">
														{PARTNER_TYPE_LABEL[p.partnerType] ?? p.partnerType}
													</span>
												)}
												{p.acceptingClients && (
													<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.06] text-foreground/80 border border-border">
														Available
													</span>
												)}
											</div>
											{(p.tagline || p.description) && (
												<p className="text-xs text-muted-foreground/90 leading-snug line-clamp-2">
													{p.tagline || p.description}
												</p>
											)}
										</Card>
									);
								})}
							</div>
						</section>
					)}

					{/* Projects */}
					{projects.length > 0 && (
						<section>
							<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
								Projects ({projects.length})
							</h2>
							<div className="grid sm:grid-cols-2 gap-3">
								{projects.map((p) => (
									<Link
										key={p.id}
										href={`/project/${p.slug}`}
										className="group block p-4 rounded-xl bg-card border border-border hover:border-white/25 hover:bg-white/[0.02] transition-all"
									>
										<div className="flex items-center gap-2 mb-1.5 flex-wrap">
											<span className="font-medium text-foreground group-hover:text-white transition-colors">
												{p.name}
											</span>
											{p.category && (
												<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border">
													{p.category}
												</span>
											)}
											{p.scfAwarded && (
												<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border">
													SCF
												</span>
											)}
											{p.status && (
												<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border">
													{p.status}
												</span>
											)}
										</div>
										{p.shortDescription && (
											<p className="text-xs text-muted-foreground/90 leading-snug line-clamp-2">
												{p.shortDescription}
											</p>
										)}
									</Link>
								))}
							</div>
						</section>
					)}

					{/* Knowledge base */}
					{research.length > 0 && (
						<section>
							<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-4">
								From the knowledge base ({research.length})
							</h2>
							<div className="space-y-3">
								{research.map((r) => {
									const Card = r.url ? "a" : "div";
									return (
										<Card
											key={r.id}
											{...(r.url
												? { href: r.url, target: "_blank", rel: "noopener noreferrer" }
												: {})}
											className="group block p-4 rounded-xl bg-card border border-border hover:border-white/25 hover:bg-white/[0.02] transition-all"
										>
											<div className="flex items-start justify-between gap-3">
												<div className="min-w-0">
													<div className="flex items-center gap-2 mb-1 flex-wrap">
														<span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.04] text-muted-foreground border border-border uppercase tracking-wide">
															{SOURCE_LABEL[r.source] ?? r.source}
														</span>
														<span className="text-sm font-medium text-foreground group-hover:text-white transition-colors truncate">
															{r.title}
														</span>
													</div>
													{r.content && (
														<p className="text-xs text-muted-foreground/90 leading-relaxed">
															{snippet(r.content)}
														</p>
													)}
												</div>
												{r.url && (
													<ArrowUpRight className="w-4 h-4 text-muted-foreground flex-shrink-0 group-hover:text-foreground transition-colors" />
												)}
											</div>
										</Card>
									);
								})}
							</div>
						</section>
					)}

					<p className="text-[11px] text-muted-foreground/60 pt-2">
						grounded results from the live stellarlight index — semantic search over the
						knowledge corpus + project directory. every card links to a primary source.
					</p>
				</div>
			)}
		</div>
	);
}
