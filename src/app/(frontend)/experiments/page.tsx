import { ArrowLeft, FlaskConical } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EXPERIMENTS, type ExperimentStatus } from "@/lib/experiments";

/**
 * Experiments Lab board — engine #2 of the self-improvement system.
 *
 *   /experiments
 *
 * Lists in-flight experiments: what we're trying, the hypothesis, the metric,
 * and how to opt a request into the variant. Variants default OFF, so nothing
 * here changes what agents/prod see until it graduates. Reads src/lib/experiments.ts.
 */

export const metadata: Metadata = {
	title: "Experiments · Stellar Light",
	description:
		"In-flight experiments on the Stellar Light data layer — try a variant, measure it against baseline, graduate the winners.",
};

const STATUS_STYLE: Record<ExperimentStatus, string> = {
	proposed: "text-muted-foreground border-border bg-white/[0.03]",
	running: "text-yellow-400 border-yellow-500/30 bg-yellow-500/10",
	won: "text-green-400 border-green-500/30 bg-green-500/10",
	lost: "text-red-400 border-red-500/30 bg-red-500/10",
	graduated: "text-[#FDDA24] border-[#FDDA24]/30 bg-[#FDDA24]/10",
};

export default function ExperimentsPage() {
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

				<div className="mb-8">
					<div className="flex items-center gap-3 flex-wrap">
						<h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground inline-flex items-center gap-3">
							<FlaskConical className="w-8 h-8 text-[#FDDA24]" />
							Experiments
						</h1>
					</div>
					<p className="text-sm text-muted-foreground mt-3 max-w-2xl">
						Where we try new things safely. Each experiment runs behind a flag
						that&apos;s <span className="text-foreground">off by default</span>{" "}
						— the variant is testable per-request (append{" "}
						<code className="text-foreground">?exp=&lt;id&gt;</code> or send an{" "}
						<code className="text-foreground">X-Experiments</code> header)
						without changing what agents or prod see. We score each against a
						ground-truth metric; winners graduate to the contract, the rest get
						killed.
					</p>
				</div>

				<div className="space-y-4">
					{EXPERIMENTS.map((e) => (
						<div
							key={e.id}
							className="rounded-2xl border border-border/50 bg-card p-6"
						>
							<div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
								<div className="min-w-0">
									<h2 className="text-lg font-bold text-foreground">
										{e.title}
									</h2>
									<code className="text-xs text-muted-foreground">{e.id}</code>
								</div>
								<span
									className={`text-xs font-semibold px-3 py-1 rounded-full border capitalize ${STATUS_STYLE[e.status]}`}
								>
									{e.status}
								</span>
							</div>

							<dl className="space-y-3 text-sm">
								<div>
									<dt className="text-xs uppercase tracking-wide text-muted-foreground/70 mb-1">
										Hypothesis
									</dt>
									<dd className="text-foreground/90 leading-relaxed">
										{e.hypothesis}
									</dd>
								</div>
								<div>
									<dt className="text-xs uppercase tracking-wide text-muted-foreground/70 mb-1">
										Metric (ground truth)
									</dt>
									<dd className="text-foreground/90 leading-relaxed">
										{e.metric}
									</dd>
								</div>
								<div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-xs text-muted-foreground">
									<span>
										Default:{" "}
										<span className="text-foreground">
											{e.defaultOn ? "on" : "off (not exposed)"}
										</span>
									</span>
									<span>
										Try it: <code className="text-foreground">?exp={e.id}</code>
									</span>
									<span>since {e.since}</span>
								</div>
							</dl>
						</div>
					))}
				</div>

				<p className="text-[11px] text-muted-foreground/60 mt-8">
					Registry: <code>src/lib/experiments.ts</code> · scored by{" "}
					<code>scripts/experiment-eval.ts</code>. Graduating an experiment
					flips its default on and adds it to the OpenAPI contract.
				</p>
			</main>
		</div>
	);
}
