"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface IdeaSubmissionModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function IdeaSubmissionModal({ isOpen, onClose }: IdeaSubmissionModalProps) {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [ecosystemNeed, setEcosystemNeed] = useState("");
	const [needSize, setNeedSize] = useState("");
	const [approach, setApproach] = useState("");
	const [additionalContext, setAdditionalContext] = useState("");
	const [submitting, setSubmitting] = useState(false);
	const [submitted, setSubmitted] = useState(false);
	const [error, setError] = useState("");

	if (!isOpen) return null;

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError("");
		setSubmitting(true);

		try {
			const res = await fetch("/api/idea-submissions", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					email: email || undefined,
					ecosystemNeed,
					needSize,
					approach,
					additionalContext: additionalContext || undefined,
				}),
			});

			if (!res.ok) {
				throw new Error("Failed to submit");
			}

			setSubmitted(true);
			setTimeout(() => {
				resetForm();
				onClose();
			}, 2000);
		} catch {
			setError("Failed to submit. Please try again.");
		} finally {
			setSubmitting(false);
		}
	};

	const resetForm = () => {
		setName("");
		setEmail("");
		setEcosystemNeed("");
		setNeedSize("");
		setApproach("");
		setAdditionalContext("");
		setSubmitted(false);
		setError("");
	};

	const handleClose = () => {
		resetForm();
		onClose();
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/60 backdrop-blur-sm"
				onClick={handleClose}
			/>

			{/* Modal */}
			<div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4 bg-card border border-border rounded-2xl shadow-2xl">
				{/* Header */}
				<div className="sticky top-0 bg-card border-b border-border rounded-t-2xl px-6 py-5 flex items-start justify-between z-10">
					<div>
						<h2 className="text-2xl font-semibold text-foreground">
							Suggest an Ecosystem Need
						</h2>
						<p className="text-sm text-muted-foreground mt-1">
							Have an idea beyond the listed RFPs? Let reviewers know for the next quarterly cycle.
						</p>
					</div>
					<button
						type="button"
						onClick={handleClose}
						className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
					>
						<X className="w-5 h-5" />
					</button>
				</div>

				{submitted ? (
					<div className="px-6 py-16 text-center">
						<div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
							<svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
							</svg>
						</div>
						<h3 className="text-lg font-semibold text-foreground mb-2">Submitted!</h3>
						<p className="text-sm text-muted-foreground">
							Thanks for your input. Your suggestion will be reviewed for the next quarterly RFP cycle.
						</p>
					</div>
				) : (
					<form onSubmit={handleSubmit} className="px-6 py-6 space-y-6">
						{/* How we evaluate */}
						<div className="p-4 rounded-xl bg-white/5 border border-border/50">
							<p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
								How we evaluate suggestions
							</p>
							<div className="space-y-2 text-sm text-muted-foreground">
								<p>
									<span className="text-foreground font-medium">1) How big is the need?</span>{" "}
									If small and nice-to-have, it may be better suited for bounties or hackathons. If large and critical, it moves to step 2.
								</p>
								<p>
									<span className="text-foreground font-medium">2) How to best fill the gap?</span>{" "}
									Should an existing team add this feature, or do we need a net-new build via RFP?
								</p>
							</div>
						</div>

						{/* About You */}
						<div className="space-y-4">
							<h3 className="text-base font-semibold text-foreground">About You</h3>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
								<div>
									<label className="block text-sm font-medium text-foreground mb-1.5">
										Name <span className="text-muted-foreground">*</span>
									</label>
									<input
										type="text"
										required
										value={name}
										onChange={(e) => setName(e.target.value)}
										placeholder="Your name or handle"
										className="w-full h-11 px-4 bg-background text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border/50 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-foreground mb-1.5">
										Email
									</label>
									<input
										type="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="Optional — for follow-up"
										className="w-full h-11 px-4 bg-background text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border/50 focus:outline-none focus:ring-2 focus:ring-ring transition-all"
									/>
								</div>
							</div>
						</div>

						{/* Ecosystem Need */}
						<div className="space-y-4 pt-4 border-t border-border/50">
							<h3 className="text-base font-semibold text-foreground">Ecosystem Need</h3>

							<div>
								<label className="block text-sm font-medium text-foreground mb-1.5">
									What does the ecosystem need? <span className="text-muted-foreground">*</span>
								</label>
								<textarea
									required
									rows={4}
									value={ecosystemNeed}
									onChange={(e) => setEcosystemNeed(e.target.value)}
									placeholder="Describe the gap or need you see in the Stellar ecosystem..."
									className="w-full px-4 py-3 bg-background text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border/50 focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-none"
								/>
							</div>

							{/* Need Size */}
							<div>
								<label className="block text-sm font-medium text-foreground mb-2">
									How big is this need? <span className="text-muted-foreground">*</span>
								</label>
								<div className="space-y-2">
									{[
										{ value: "critical", label: "Critical", desc: "Essential for ecosystem growth and success" },
										{ value: "important", label: "Important", desc: "Would significantly improve the ecosystem" },
										{ value: "nice-to-have", label: "Nice to have", desc: "May be better suited for bounties or hackathons" },
									].map((option) => (
										<label
											key={option.value}
											className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
												needSize === option.value
													? "border-foreground/30 bg-white/5"
													: "border-border/50 hover:border-border"
											}`}
										>
											<input
												type="radio"
												name="needSize"
												value={option.value}
												checked={needSize === option.value}
												onChange={(e) => setNeedSize(e.target.value)}
												className="w-4 h-4 mt-[3px] accent-foreground shrink-0 cursor-pointer"
												required
											/>
											<div className="flex-1 min-w-0">
												<span className="block text-sm font-medium text-foreground leading-tight">{option.label}</span>
												<p className="text-xs text-muted-foreground mt-1">{option.desc}</p>
											</div>
										</label>
									))}
								</div>
							</div>

							{/* Approach */}
							<div>
								<label className="block text-sm font-medium text-foreground mb-1.5">
									How should this be addressed? <span className="text-muted-foreground">*</span>
								</label>
								<select
									required
									value={approach}
									onChange={(e) => setApproach(e.target.value)}
									className="w-full h-11 px-4 bg-background text-sm text-foreground rounded-xl border border-border/50 focus:outline-none focus:ring-2 focus:ring-ring transition-all appearance-none cursor-pointer"
								>
									<option value="" disabled>Select an approach</option>
									<option value="net-new-rfp">Net-new build via RFP</option>
									<option value="existing-team">Ask an existing team to add the feature</option>
									<option value="unsure">Not sure — reviewers should decide</option>
								</select>
							</div>

							{/* Additional Context */}
							<div>
								<label className="block text-sm font-medium text-foreground mb-1.5">
									Additional context
								</label>
								<textarea
									rows={3}
									value={additionalContext}
									onChange={(e) => setAdditionalContext(e.target.value)}
									placeholder="Any links, references, or extra details that would help reviewers (optional)"
									className="w-full px-4 py-3 bg-background text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border/50 focus:outline-none focus:ring-2 focus:ring-ring transition-all resize-none"
								/>
							</div>
						</div>

						{/* Error */}
						{error && (
							<p className="text-sm text-red-400">{error}</p>
						)}

						{/* Actions */}
						<div className="flex gap-3 pt-2">
							<button
								type="submit"
								disabled={submitting}
								className="flex-1 px-6 py-3 rounded-xl text-sm font-semibold bg-foreground text-background hover:opacity-90 transition-opacity disabled:opacity-50"
							>
								{submitting ? "Submitting..." : "Submit Suggestion"}
							</button>
							<button
								type="button"
								onClick={handleClose}
								className="px-6 py-3 rounded-xl text-sm font-semibold border border-border/50 text-foreground hover:bg-white/5 transition-colors"
							>
								Cancel
							</button>
						</div>
					</form>
				)}
			</div>
		</div>
	);
}
