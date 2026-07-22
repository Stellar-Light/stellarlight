"use client";

/**
 * Nominee "2026 in review" — a Family.co-style highlights sheet.
 *
 * Opens in place of navigating to the project page: tap a nominee's Highlights
 * chip and their year springs up as a stack of playful moments. Motion is the
 * point — spring physics (haptics.lochie.me / family.co), staggered reveals,
 * a self-drawing sparkline for growth. Bottom sheet on mobile, centered on
 * desktop. Content is qualitative by design (see highlights.ts).
 */

import {
	ArrowUpRight,
	Check,
	Globe,
	Rocket,
	TrendingUp,
	Trophy,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { type HighlightKind, highlightsFor } from "./highlights";

// stellar-markets ease + two springs: a settling one for the panel, a snappier
// one with a touch of overshoot for the logo pop and taps.
const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const PANEL_SPRING = { type: "spring", stiffness: 320, damping: 30 } as const;
const POP_SPRING = { type: "spring", stiffness: 440, damping: 22 } as const;

export interface HighlightNominee {
	slug: string;
	name: string;
	blurb: string | null;
	logoUrl: string | null;
	projectUrl: string;
	tvl: { usd: number; source: string | null; asOf: string | null } | null;
}

/** What the metric row renders: a rolled number with affixes + a caption. */
interface MetricSpec {
	prefix?: string;
	display: string; // already formatted; digits roll, separators stay put
	suffix?: string;
	caption?: string;
}

function compactUsd(n: number): { display: string; suffix: string } {
	if (n >= 1e9) return { display: (n / 1e9).toFixed(1), suffix: "B" };
	if (n >= 1e8) return { display: String(Math.round(n / 1e6)), suffix: "M" };
	if (n >= 1e6) return { display: (n / 1e6).toFixed(1), suffix: "M" };
	if (n >= 1e3) return { display: String(Math.round(n / 1e3)), suffix: "K" };
	return { display: String(Math.round(n)), suffix: "" };
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

function tvlCaption(tvl: NonNullable<HighlightNominee["tvl"]>): string {
	const src =
		tvl.source?.toLowerCase() === "defillama" ? "DeFiLlama" : tvl.source;
	let when = "";
	if (tvl.asOf) {
		const d = new Date(tvl.asOf);
		if (!Number.isNaN(d.getTime()))
			when = ` · ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
	}
	return `TVL${src ? ` · ${src}` : ""}${when}`;
}

const KIND_META: Record<
	HighlightKind,
	{ Icon: typeof TrendingUp; tint: string }
> = {
	growth: { Icon: TrendingUp, tint: "text-emerald-300/90" },
	launch: { Icon: Rocket, tint: "text-sky-300/90" },
	reach: { Icon: Globe, tint: "text-violet-300/90" },
	milestone: { Icon: Trophy, tint: "text-amber-300/90" },
};

// A small self-drawing rising line — decorative momentum, not a plotted value.
function Sparkline() {
	return (
		<svg
			viewBox="0 0 48 20"
			className="h-5 w-12 overflow-visible"
			fill="none"
			aria-hidden="true"
		>
			<motion.path
				d="M1 18 L11 13 L20 15 L30 7 L38 9 L47 2"
				stroke="currentColor"
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
				initial={{ pathLength: 0, opacity: 0 }}
				animate={{ pathLength: 1, opacity: 1 }}
				transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
			/>
			<motion.circle
				cx="47"
				cy="2"
				r="2"
				fill="currentColor"
				initial={{ scale: 0 }}
				animate={{ scale: 1 }}
				transition={{ ...POP_SPRING, delay: 0.7 }}
			/>
		</svg>
	);
}

// Rolling-digit odometer — each digit column rolls up from 0 to its final
// digit (torph.lochie / family.co). Takes an already-formatted string so
// separators like "." and "," stay put while the digits scroll. em-sized.
function Odometer({ display, delay = 0 }: { display: string; delay?: number }) {
	const chars = display.split("");
	let digitIndex = -1;
	return (
		<span className="inline-flex items-end leading-none tabular-nums">
			{chars.map((ch, i) => {
				if (!/\d/.test(ch)) {
					return (
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed string
						<span key={i}>{ch}</span>
					);
				}
				digitIndex += 1;
				return (
					<OdometerDigit
						// biome-ignore lint/suspicious/noArrayIndexKey: fixed string
						key={i}
						digit={Number(ch)}
						delay={delay + digitIndex * 0.11}
					/>
				);
			})}
		</span>
	);
}

function OdometerDigit({ digit, delay }: { digit: number; delay: number }) {
	return (
		<span
			className="relative inline-block overflow-hidden align-baseline"
			style={{ height: "1em", width: "0.62em" }}
		>
			<motion.span
				className="absolute inset-x-0 top-0 flex flex-col items-center"
				initial={{ y: "0%" }}
				animate={{ y: `-${digit * 10}%` }}
				transition={{ type: "spring", stiffness: 90, damping: 17, delay }}
			>
				{Array.from({ length: 10 }, (_, n) => (
					<span
						// biome-ignore lint/suspicious/noArrayIndexKey: 0-9 ladder
						key={n}
						style={{ height: "1em", lineHeight: "1em" }}
					>
						{n}
					</span>
				))}
			</motion.span>
		</span>
	);
}

function firstSentence(text: string | null): string | null {
	if (!text) return null;
	const match = text.match(/^.*?[.!?](\s|$)/);
	return (match ? match[0] : text).trim();
}

export function NomineeHighlightsModal({
	nominee,
	isSelected,
	onClose,
	onVote,
}: {
	nominee: HighlightNominee | null;
	isSelected: boolean;
	onClose: () => void;
	onVote: (slug: string) => void;
}) {
	// Keep the last nominee around through the exit animation so content
	// doesn't blank out as the sheet springs away.
	const [shown, setShown] = useState<HighlightNominee | null>(nominee);
	useEffect(() => {
		if (nominee) setShown(nominee);
	}, [nominee]);

	useEffect(() => {
		if (!nominee) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [nominee, onClose]);

	const open = nominee !== null;
	const data = shown;
	const highlights = data ? highlightsFor(data.slug) : [];
	const tagline = firstSentence(data?.blurb ?? null);

	return (
		<AnimatePresence>
			{open && data && (
				<div
					className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-4"
					role="dialog"
					aria-modal="true"
					aria-label={`${data.name} — 2026 highlights`}
				>
					<motion.button
						type="button"
						aria-label="Close"
						onClick={onClose}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="absolute inset-0 bg-black/75 backdrop-blur-md"
					/>

					<motion.div
						initial={{ opacity: 0, y: 40, scale: 0.96 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 32, scale: 0.97 }}
						transition={PANEL_SPRING}
						className="relative flex w-full flex-col overflow-hidden rounded-t-[28px] border border-[#333] bg-[#191919] shadow-[0_-8px_60px_rgba(0,0,0,0.6)] sm:max-w-[420px] sm:rounded-[28px] sm:shadow-[0_24px_80px_rgba(0,0,0,0.6)]"
					>
						{/* grab handle (mobile) */}
						<div className="flex justify-center pt-3 sm:hidden">
							<span className="h-1 w-9 rounded-full bg-neutral-700" />
						</div>

						<button
							type="button"
							onClick={onClose}
							className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[#333] bg-[#191919]/70 text-neutral-400 backdrop-blur transition-colors hover:border-[#4d4d4d] hover:text-neutral-100"
							aria-label="Close"
						>
							<X className="h-4 w-4" />
						</button>

						<div className="px-6 pb-6 pt-6 sm:pt-7">
							{/* header */}
							<div className="mb-6 flex items-center gap-3.5">
								<motion.span
									initial={{ scale: 0.4, opacity: 0 }}
									animate={{ scale: 1, opacity: 1 }}
									transition={{ ...POP_SPRING, delay: 0.05 }}
									className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-[#333] bg-[#111]"
								>
									<Image
										src={data.logoUrl || "/logo.png"}
										alt=""
										width={56}
										height={56}
										className="h-14 w-14 object-cover"
									/>
								</motion.span>
								<div className="min-w-0">
									<motion.p
										initial={{ opacity: 0, y: 6 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.3, ease: EASE, delay: 0.08 }}
										className="mb-0.5 text-[13px] font-medium text-neutral-400"
									>
										Year in review
									</motion.p>
									<motion.h2
										initial={{ opacity: 0, y: 8 }}
										animate={{ opacity: 1, y: 0 }}
										transition={{ duration: 0.34, ease: EASE, delay: 0.1 }}
										className="truncate text-2xl font-semibold tracking-tight text-neutral-50"
									>
										{data.name}
									</motion.h2>
								</div>
							</div>

							{tagline && (
								<motion.p
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.34, ease: EASE, delay: 0.14 }}
									className="mb-5 text-sm leading-relaxed text-neutral-400"
								>
									{tagline}
								</motion.p>
							)}

							{/* highlight moments — staggered spring-in */}
							<motion.ul
								initial="hidden"
								animate="visible"
								variants={{
									hidden: {},
									visible: {
										transition: { staggerChildren: 0.07, delayChildren: 0.18 },
									},
								}}
								className="space-y-2.5"
							>
								{highlights.map((h) => {
									const { Icon, tint } = KIND_META[h.kind];
									// Real, dated TVL wins for a growth moment; else the authored
									// count; else the little sparkline.
									const metric: MetricSpec | null =
										h.kind === "growth" && data.tvl
											? {
													prefix: "$",
													...compactUsd(data.tvl.usd),
													caption: tvlCaption(data.tvl),
												}
											: h.metric
												? {
														prefix: h.metric.prefix,
														display: String(h.metric.value),
														suffix: h.metric.suffix,
														caption: h.metric.caption,
													}
												: null;
									return (
										<motion.li
											key={h.headline}
											variants={{
												hidden: { opacity: 0, y: 14, scale: 0.98 },
												visible: {
													opacity: 1,
													y: 0,
													scale: 1,
													transition: POP_SPRING,
												},
											}}
											className="rounded-2xl border border-[#2c2c2c] bg-[#202020] p-4"
										>
											{/* One structure for every moment: icon in the left
											    column, all content indented in the right — so a stat's
											    number lines up with a narrative's text. */}
											<div className="flex items-start gap-3.5">
												<span
													className={`mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-[#333] bg-[#171717] ${tint}`}
												>
													<Icon className="h-[18px] w-[18px]" strokeWidth={2} />
												</span>
												<div className="min-w-0 flex-1">
													<p className="text-[15px] font-semibold leading-snug text-neutral-100">
														{h.headline}
													</p>
													{metric ? (
														<>
															<div className="mt-3 flex items-end gap-[0.02em] text-[38px] font-semibold leading-none tracking-tight text-neutral-50">
																{metric.prefix && (
																	<span className="leading-none">
																		{metric.prefix}
																	</span>
																)}
																<Odometer
																	display={metric.display}
																	delay={0.4}
																/>
																{metric.suffix && (
																	<span className="leading-none">
																		{metric.suffix}
																	</span>
																)}
															</div>
															{metric.caption && (
																<div className="mt-2 text-xs text-neutral-400">
																	{metric.caption}
																</div>
															)}
														</>
													) : (
														<>
															{h.kind === "growth" && (
																<div className="mt-2.5 text-emerald-300/90">
																	<Sparkline />
																</div>
															)}
															<p className="mt-2 text-[13px] leading-relaxed text-neutral-400">
																{h.detail}
															</p>
														</>
													)}
												</div>
											</div>
										</motion.li>
									);
								})}
							</motion.ul>

							{/* footer: vote CTA + full profile */}
							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.34,
									ease: EASE,
									delay: 0.18 + highlights.length * 0.07,
								}}
								className="mt-6 flex items-center gap-3"
							>
								<motion.button
									type="button"
									whileTap={{ scale: 0.97 }}
									onClick={() => onVote(data.slug)}
									className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors ${
										isSelected
											? "border border-[#3f3f3f] bg-[#242424] text-neutral-100"
											: "bg-neutral-100 text-black hover:bg-white"
									}`}
								>
									{isSelected ? (
										<>
											<Check className="h-4 w-4" strokeWidth={3} />
											Your pick
										</>
									) : (
										`Vote for ${data.name}`
									)}
								</motion.button>
								<a
									href={data.projectUrl}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex h-11 flex-shrink-0 items-center gap-1 rounded-full border border-[#333] px-4 text-sm font-medium text-neutral-300 transition-colors hover:border-[#4d4d4d] hover:text-neutral-100"
								>
									Profile
									<ArrowUpRight className="h-4 w-4" />
								</a>
							</motion.div>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}
