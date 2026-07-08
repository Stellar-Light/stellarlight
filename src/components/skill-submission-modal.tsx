"use client";

import { Check, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
	open: boolean;
	onClose: () => void;
}

interface FormState {
	name: string;
	slug: string;
	tagline: string;
	description: string;
	kind: "skill-md" | "mcp-server" | "sdk" | "cli" | "agent-kit" | "tool";
	install: string;
	repository: string;
	homepage: string;
	docs: string;
	compatibility: string; // comma-separated; converted on submit
	targetUser: { dev: boolean; founder: boolean; agent: boolean };
	tags: string; // comma-separated; converted on submit
	submitter: { name: string; email: string; githubHandle: string };
}

const EMPTY: FormState = {
	name: "",
	slug: "",
	tagline: "",
	description: "",
	kind: "skill-md",
	install: "",
	repository: "",
	homepage: "",
	docs: "",
	compatibility: "",
	targetUser: { dev: true, founder: false, agent: false },
	tags: "",
	submitter: { name: "", email: "", githubHandle: "" },
};

function slugify(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 60);
}

export function SkillSubmissionModal({ open, onClose }: Props) {
	const [form, setForm] = useState<FormState>(EMPTY);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [errorDetails, setErrorDetails] = useState<string[]>([]);
	const [success, setSuccess] = useState(false);
	const [autoSlug, setAutoSlug] = useState(true);

	// Close on escape
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	// Reset on close
	useEffect(() => {
		if (!open) {
			// brief delay so the close animation can finish before clearing
			const t = setTimeout(() => {
				setForm(EMPTY);
				setSubmitting(false);
				setError(null);
				setErrorDetails([]);
				setSuccess(false);
				setAutoSlug(true);
			}, 250);
			return () => clearTimeout(t);
		}
	}, [open]);

	if (!open) return null;

	const handleNameChange = (name: string) => {
		setForm((f) => ({
			...f,
			name,
			slug: autoSlug ? slugify(name) : f.slug,
		}));
	};

	const handleSubmit = async () => {
		setError(null);
		setErrorDetails([]);

		const targetUser = (
			["dev", "founder", "agent"] as Array<keyof FormState["targetUser"]>
		).filter((k) => form.targetUser[k]);

		const body = {
			name: form.name.trim(),
			slug: form.slug.trim(),
			tagline: form.tagline.trim(),
			description: form.description.trim(),
			kind: form.kind,
			install: form.install.trim(),
			repository: form.repository.trim() || undefined,
			homepage: form.homepage.trim() || undefined,
			docs: form.docs.trim() || undefined,
			compatibility: form.compatibility
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean),
			targetUser,
			tags: form.tags
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean),
			submittedBy: {
				name: form.submitter.name.trim(),
				email: form.submitter.email.trim() || undefined,
				githubHandle: form.submitter.githubHandle.trim() || undefined,
			},
		};

		setSubmitting(true);
		try {
			const res = await fetch("/api/community-skills", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			const data = await res.json();
			if (res.ok) {
				setSuccess(true);
			} else {
				setError(data.error ?? "Submission failed");
				if (Array.isArray(data.details)) setErrorDetails(data.details);
				else if (data.hint) setErrorDetails([data.hint]);
			}
		} catch (err) {
			setError(`Network error: ${(err as Error).message}`);
		} finally {
			setSubmitting(false);
		}
	};

	return (
		// Backdrop click-to-dismiss is a progressive enhancement on top of the
		// explicit Close button + Esc handler — keyboard users hit Esc or Tab to
		// Close. Marking the backdrop role="button" would mislead screen readers
		// since the inner panel is the actual dialog.
		// biome-ignore lint/a11y/useKeyWithClickEvents: see above
		// biome-ignore lint/a11y/noStaticElementInteractions: see above
		<div
			className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm"
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-[#171717] border border-border rounded-t-2xl sm:rounded-2xl shadow-2xl">
				{/* Header */}
				<div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-6 py-4 border-b border-border bg-[#171717]">
					<h2 className="text-base font-semibold text-foreground">
						Submit your skill
					</h2>
					<button
						type="button"
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground transition-colors p-1 -mr-1"
						aria-label="Close"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{/* Body */}
				<div className="px-6 py-5">
					{success ? (
						<SuccessBlock onClose={onClose} />
					) : (
						<>
							<p className="text-xs text-muted-foreground mb-5 leading-relaxed">
								Your submission lands in our review queue. Approved skills
								appear in the marketplace within a few days. Required fields are
								marked.
							</p>

							{error && (
								<div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/5 text-xs text-red-300">
									<div className="font-medium mb-1">{error}</div>
									{errorDetails.length > 0 && (
										<ul className="list-disc list-inside text-red-300/80 space-y-0.5">
											{errorDetails.map((d) => (
												<li key={d}>{d}</li>
											))}
										</ul>
									)}
								</div>
							)}

							<div className="space-y-4">
								<Field label="Name" required>
									<input
										type="text"
										value={form.name}
										onChange={(e) => handleNameChange(e.target.value)}
										placeholder="Soroban Audit Helper"
										maxLength={80}
										className="input"
									/>
								</Field>

								<Field label="Slug" required hint="Kebab-case, used in URLs">
									<input
										type="text"
										value={form.slug}
										onChange={(e) => {
											setAutoSlug(false);
											setForm((f) => ({ ...f, slug: e.target.value }));
										}}
										placeholder="soroban-audit-helper"
										maxLength={60}
										className="input font-mono"
									/>
								</Field>

								<Field
									label="Tagline"
									required
									hint={`${form.tagline.length}/160`}
								>
									<input
										type="text"
										value={form.tagline}
										onChange={(e) =>
											setForm((f) => ({ ...f, tagline: e.target.value }))
										}
										placeholder="One-line summary of what your skill does."
										maxLength={160}
										className="input"
									/>
								</Field>

								<Field
									label="Description"
									required
									hint={`${form.description.length}/2000`}
								>
									<textarea
										value={form.description}
										onChange={(e) =>
											setForm((f) => ({ ...f, description: e.target.value }))
										}
										placeholder="What does it do? Who is it for? When should someone install it?"
										maxLength={2000}
										rows={4}
										className="input resize-none"
									/>
								</Field>

								<Field label="Kind" required>
									<div className="flex flex-wrap gap-2">
										{(
											[
												["skill-md", "SKILL.md"],
												["mcp-server", "MCP server"],
												["sdk", "SDK"],
												["cli", "CLI"],
												["agent-kit", "Agent kit"],
												["tool", "Other"],
											] as const
										).map(([k, label]) => (
											<button
												type="button"
												key={k}
												onClick={() => setForm((f) => ({ ...f, kind: k }))}
												className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
													form.kind === k
														? "bg-white text-[#171717] border-white"
														: "bg-card text-muted-foreground border-border hover:border-white/20"
												}`}
											>
												{label}
											</button>
										))}
									</div>
								</Field>

								<Field
									label="Install command"
									required
									hint="Exact command shown on the card"
								>
									<input
										type="text"
										value={form.install}
										onChange={(e) =>
											setForm((f) => ({ ...f, install: e.target.value }))
										}
										placeholder="npx skills add your-org/skill"
										className="input font-mono"
									/>
								</Field>

								<Field label="Repository" hint="GitHub URL">
									<input
										type="url"
										value={form.repository}
										onChange={(e) =>
											setForm((f) => ({ ...f, repository: e.target.value }))
										}
										placeholder="https://github.com/your-org/your-skill"
										className="input"
									/>
								</Field>

								<Field label="Homepage / docs URLs">
									<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
										<input
											type="url"
											value={form.homepage}
											onChange={(e) =>
												setForm((f) => ({ ...f, homepage: e.target.value }))
											}
											placeholder="https://homepage…"
											className="input"
										/>
										<input
											type="url"
											value={form.docs}
											onChange={(e) =>
												setForm((f) => ({ ...f, docs: e.target.value }))
											}
											placeholder="https://docs…"
											className="input"
										/>
									</div>
								</Field>

								<Field
									label="Compatibility"
									hint="Comma-separated list (Claude Code, Cursor, ChatGPT, …)"
								>
									<input
										type="text"
										value={form.compatibility}
										onChange={(e) =>
											setForm((f) => ({ ...f, compatibility: e.target.value }))
										}
										placeholder="Claude Code, Cursor, ChatGPT"
										className="input"
									/>
								</Field>

								<Field label="Target user">
									<div className="flex flex-wrap gap-3">
										{(
											[
												["dev", "Developers"],
												["founder", "Founders / non-devs"],
												["agent", "AI agents"],
											] as const
										).map(([k, label]) => (
											<label
												key={k}
												className="inline-flex items-center gap-2 text-xs text-foreground cursor-pointer"
											>
												<input
													type="checkbox"
													checked={form.targetUser[k]}
													onChange={(e) =>
														setForm((f) => ({
															...f,
															targetUser: {
																...f.targetUser,
																[k]: e.target.checked,
															},
														}))
													}
													className="rounded border-border"
												/>
												{label}
											</label>
										))}
									</div>
								</Field>

								<Field label="Tags" hint="Comma-separated">
									<input
										type="text"
										value={form.tags}
										onChange={(e) =>
											setForm((f) => ({ ...f, tags: e.target.value }))
										}
										placeholder="audit, soroban, security"
										className="input"
									/>
								</Field>

								<div className="pt-4 border-t border-border">
									<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-3">
										About you
									</div>
									<div className="space-y-3">
										<Field label="Your name" required>
											<input
												type="text"
												value={form.submitter.name}
												onChange={(e) =>
													setForm((f) => ({
														...f,
														submitter: {
															...f.submitter,
															name: e.target.value,
														},
													}))
												}
												placeholder="Jane Builder"
												className="input"
											/>
										</Field>
										<Field label="Email (so we can ping you on approval)">
											<input
												type="email"
												value={form.submitter.email}
												onChange={(e) =>
													setForm((f) => ({
														...f,
														submitter: {
															...f.submitter,
															email: e.target.value,
														},
													}))
												}
												placeholder="jane@example.com"
												className="input"
											/>
										</Field>
										<Field label="GitHub handle">
											<input
												type="text"
												value={form.submitter.githubHandle}
												onChange={(e) =>
													setForm((f) => ({
														...f,
														submitter: {
															...f.submitter,
															githubHandle: e.target.value,
														},
													}))
												}
												placeholder="janebuilder"
												className="input"
											/>
										</Field>
									</div>
								</div>
							</div>
						</>
					)}
				</div>

				{/* Footer */}
				{!success && (
					<div className="sticky bottom-0 px-6 py-4 border-t border-border bg-[#171717] flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={onClose}
							className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleSubmit}
							disabled={submitting}
							className="px-5 py-2 rounded-lg bg-white text-[#171717] text-sm font-semibold hover:bg-[#F5F5F5] active:bg-[#E5E5E5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
						>
							{submitting && <Loader2 className="w-4 h-4 animate-spin" />}
							{submitting ? "Submitting…" : "Submit"}
						</button>
					</div>
				)}
			</div>

			{/* Shared input styles via a tiny tailwind class string. */}
			<style jsx>{`
				:global(.input) {
					width: 100%;
					background-color: rgba(255, 255, 255, 0.03);
					border: 1px solid rgba(255, 255, 255, 0.1);
					border-radius: 0.5rem;
					padding: 0.5rem 0.75rem;
					font-size: 0.875rem;
					color: var(--foreground);
				}
				:global(.input:focus) {
					outline: none;
					border-color: rgba(255, 255, 255, 0.25);
				}
				:global(.input::placeholder) {
					color: var(--muted-foreground);
				}
			`}</style>
		</div>
	);
}

function Field({
	label,
	required,
	hint,
	children,
}: {
	label: string;
	required?: boolean;
	hint?: string;
	children: React.ReactNode;
}) {
	return (
		<div>
			<div className="flex items-baseline justify-between mb-1.5">
				{/* span (not label) — the input lives as a sibling via the
				    children prop, not inside the label element. Using <label>
				    here without htmlFor would fail the a11y linter and
				    misrepresent semantics to screen readers. */}
				<span className="text-xs font-medium text-foreground">
					{label}
					{required && <span className="text-[#FDDA24] ml-0.5">*</span>}
				</span>
				{hint && (
					<span className="text-[10px] text-muted-foreground">{hint}</span>
				)}
			</div>
			{children}
		</div>
	);
}

function SuccessBlock({ onClose }: { onClose: () => void }) {
	return (
		<div className="py-8 text-center">
			<div className="w-12 h-12 mx-auto mb-4 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
				<Check className="w-6 h-6 text-emerald-400" />
			</div>
			<h3 className="text-base font-semibold text-foreground mb-2">
				Submission received
			</h3>
			<p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed mb-6">
				Stellarlight curators review the queue weekly. Approved skills appear in
				the marketplace + show up in <code>/api/skills</code> for any AI agent
				to discover. Thanks for building on Stellar.
			</p>
			<button
				type="button"
				onClick={onClose}
				className="px-5 py-2 rounded-lg border border-border bg-white/5 text-sm font-medium text-foreground hover:bg-white/10 transition-colors"
			>
				Close
			</button>
		</div>
	);
}
