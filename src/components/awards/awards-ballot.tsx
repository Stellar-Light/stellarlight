"use client";

/**
 * i³ Awards — the voting experience.
 *
 * Design: monochrome + prediction-market layout (Polymarket / godly.website),
 * built on Stellar Light's WARM layered dark (bg #171717, raised cards, solid
 * #2f2f2f borders — never flat black or white hairlines) and animated with
 * framer-motion for the stellar-markets fluidity (scroll fade-up + stagger,
 * spring tap/hover, crossfading ballot values, spring selection checks).
 *
 *   - persistent top bar: "How it works" + wallet (top-right, always visible)
 *   - desktop: nominee grid (left) + a sticky "Your ballot" rail (right)
 *   - mobile: grid stacks; a compact sticky bar carries progress + action
 *   - wallets: Freighter / xBull / Albedo via stellar-wallets-kit (lazy)
 *   - votes are real TESTNET transactions; success links stellar.expert
 */

import { format, formatDistanceToNow } from "date-fns";
import {
	ArrowUpRight,
	Check,
	ChevronRight,
	Eye,
	Info,
	Loader2,
	Trophy,
	Wallet,
	X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { NomineeHighlightsModal } from "./nominee-highlights-modal";
import {
	AWARDS_WALLETS,
	type AwardsWalletId,
	connectAwardsWallet,
	disconnectAwardsWallet,
	signAwardsBallot,
	walletErrorMessage,
} from "./wallet";

// ── Types mirrored from GET /api/awards/round ──────────────────────────────

interface Category {
	key: string;
	name: string;
	tagline: string | null;
}

interface Nominee {
	category: string;
	slug: string;
	name: string;
	blurb: string | null;
	logoUrl: string | null;
	projectUrl: string;
	projectCategory: string | null;
	tvl: { usd: number; source: string | null; asOf: string | null } | null;
}

export interface AwardsRoundData {
	round: {
		slug: string;
		title: string;
		status: "draft" | "open" | "closed";
		ballotMode: string;
		categories: Category[];
		opensAt: string | null;
		closesAt: string | null;
	};
	nominees: Nominee[];
	voting: { open: boolean; reason: string | null };
}

interface Eligibility {
	whitelisted: boolean;
	funded: boolean | null;
	votes: Record<string, string> | null;
	friendbot?: string;
}

interface ResultsData {
	categories: Array<{
		key: string;
		name: string;
		tagline: string | null;
		totalVotes: number;
		results: Array<{ slug: string; name: string; votes: number }>;
	}>;
	turnout: { voted: number; whitelisted: number };
}

type Phase =
	| "idle"
	| "connecting"
	| "requesting"
	| "signing"
	| "submitting"
	| "submitted";

// stellar-markets' signature ease.
const EASE = [0.25, 0.46, 0.45, 0.94] as const;
const SPRING = { type: "spring", stiffness: 380, damping: 30 } as const;

function shortAddress(address: string): string {
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// ── Root component ─────────────────────────────────────────────────────────

export function AwardsBallot({ data }: { data: AwardsRoundData | null }) {
	if (!data || data.round.status === "draft") {
		return <EmptyState />;
	}
	if (data.round.status === "closed") {
		return <ClosedRound data={data} />;
	}
	return <OpenBallot data={data} />;
}

// ── The i³ mark (monochrome medallion) ─────────────────────────────────────

function I3Mark({ className = "" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 96 96"
			className={`inline-block select-none ${className}`}
			aria-hidden="true"
			role="img"
		>
			<circle
				cx="48"
				cy="48"
				r="45"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.5"
				opacity="0.35"
			/>
			<circle
				cx="48"
				cy="48"
				r="37"
				fill="none"
				stroke="currentColor"
				strokeWidth="1"
				opacity="0.15"
			/>
			<text
				x="44"
				y="66"
				textAnchor="middle"
				fontFamily="var(--font-sans), Inter, sans-serif"
				fontWeight="600"
				fontSize="52"
				fill="currentColor"
			>
				i
			</text>
			<text
				x="60"
				y="46"
				textAnchor="middle"
				fontFamily="var(--font-sans), Inter, sans-serif"
				fontWeight="600"
				fontSize="26"
				fill="currentColor"
			>
				3
			</text>
		</svg>
	);
}

// ── Top bar (persistent) ───────────────────────────────────────────────────

function TopBar({
	onHowItWorks,
	wallet,
}: {
	onHowItWorks: () => void;
	wallet?: {
		address: string | null;
		busy: boolean;
		onConnect: () => void;
		onDisconnect: () => void;
	};
}) {
	return (
		<div className="sticky top-0 z-40 border-b border-[#2a2a2a] bg-[#171717]/80 backdrop-blur-xl">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					<I3Mark className="h-6 w-6 text-neutral-200 flex-shrink-0" />
					<span className="text-sm font-semibold tracking-tight text-neutral-100 truncate">
						i³ Awards
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onHowItWorks}
						className="inline-flex items-center gap-1.5 h-9 rounded-full border border-[#2f2f2f] px-3.5 text-sm font-medium text-neutral-300 hover:text-neutral-100 hover:border-[#454545] transition-colors"
					>
						<Info className="h-4 w-4" />
						<span className="hidden sm:inline">How it works</span>
					</button>
					{wallet &&
						(wallet.address ? (
							<button
								type="button"
								onClick={wallet.onDisconnect}
								className="inline-flex items-center gap-2 h-9 rounded-full border border-[#2f2f2f] pl-3 pr-3.5 text-sm font-medium text-neutral-100 hover:border-[#454545] transition-colors"
							>
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
								{shortAddress(wallet.address)}
							</button>
						) : (
							<motion.button
								type="button"
								onClick={wallet.onConnect}
								disabled={wallet.busy}
								whileTap={{ scale: 0.96 }}
								className="inline-flex items-center gap-2 h-9 rounded-full bg-neutral-100 px-4 text-sm font-semibold text-black hover:bg-white transition-colors disabled:opacity-60"
							>
								{wallet.busy ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Wallet className="h-4 w-4" />
								)}
								Connect
							</motion.button>
						))}
				</div>
			</div>
		</div>
	);
}

// ── How-it-works modal ─────────────────────────────────────────────────────

const HIW_STEPS = [
	{
		t: "Connect a Pilot wallet",
		d: "Freighter, xBull or Albedo. Only whitelisted SCF Pilot addresses can cast a ballot — anyone else can browse read-only.",
	},
	{
		t: "Pick one per category",
		d: "Choose the project you think best defined the year for Impact, Innovation and Interoperability.",
	},
	{
		t: "Sign one transaction",
		d: "Your whole ballot is written to your own Stellar testnet account in a single signature. No real funds — ever.",
	},
	{
		t: "Change your mind anytime",
		d: "Re-pick and re-sign before voting closes; the new ballot overwrites the old. The tally is read straight from chain, publicly verifiable.",
	},
];

// Step-through modal: one step at a time, ‹ dots › navigation, "Got it" on
// the last. Centered on desktop, bottom sheet on mobile.
function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
	const [i, setI] = useState(0);
	const [dir, setDir] = useState(1);
	const last = HIW_STEPS.length - 1;

	// Reset to step 1 each time it opens.
	useEffect(() => {
		if (open) {
			setI(0);
			setDir(1);
		}
	}, [open]);

	const go = useCallback(
		(next: number) => {
			setDir(next > i ? 1 : -1);
			setI(Math.max(0, Math.min(last, next)));
		},
		[i, last],
	);

	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
			else if (e.key === "ArrowRight" && i < last) go(i + 1);
			else if (e.key === "ArrowLeft" && i > 0) go(i - 1);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose, i, last, go]);

	const step = HIW_STEPS[i];

	return (
		<AnimatePresence>
			{open && (
				<div
					className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
					role="dialog"
					aria-modal="true"
					aria-label="How voting works"
				>
					<motion.button
						type="button"
						aria-label="Close"
						onClick={onClose}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="absolute inset-0 bg-black/70 backdrop-blur-sm"
					/>
					<motion.div
						initial={{ opacity: 0, y: 16, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 16, scale: 0.98 }}
						transition={{ duration: 0.28, ease: EASE }}
						className="relative w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl border border-[#2f2f2f] bg-[#1c1c1c] p-6 sm:p-7 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
					>
						<div className="flex items-center justify-between gap-4 mb-6">
							<span className="text-sm font-medium text-neutral-300">
								How voting works
							</span>
							<button
								type="button"
								onClick={onClose}
								className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2f2f2f] text-neutral-400 hover:text-neutral-100 hover:border-[#454545] transition-colors flex-shrink-0"
							>
								<X className="h-4 w-4" />
							</button>
						</div>

						{/* one step, slide-swapped */}
						<div className="relative min-h-[132px] overflow-hidden">
							<AnimatePresence mode="wait" initial={false}>
								<motion.div
									key={i}
									initial={{ opacity: 0, x: dir * 28 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: dir * -28 }}
									transition={{ duration: 0.26, ease: EASE }}
								>
									<h2 className="text-2xl font-semibold tracking-tight text-neutral-50 mb-2.5">
										{step.t}
									</h2>
									<p className="text-sm text-neutral-400 leading-relaxed">
										{step.d}
									</p>
								</motion.div>
							</AnimatePresence>
						</div>

						{/* footer: dots + back / next */}
						<div className="mt-7 flex items-center justify-between gap-3">
							<div className="flex items-center gap-1.5">
								{HIW_STEPS.map((s, idx) => (
									<button
										key={s.t}
										type="button"
										aria-label={`Step ${idx + 1}`}
										onClick={() => go(idx)}
										className="h-1.5 rounded-full transition-all duration-200"
										style={{
											width: idx === i ? 20 : 6,
											background:
												idx === i ? "#fafafa" : "rgba(255,255,255,0.25)",
										}}
									/>
								))}
							</div>
							<div className="flex items-center gap-2">
								{i > 0 && (
									<button
										type="button"
										onClick={() => go(i - 1)}
										className="inline-flex items-center h-9 rounded-full border border-[#2f2f2f] px-4 text-sm font-medium text-neutral-300 hover:text-neutral-100 hover:border-[#454545] transition-colors"
									>
										Back
									</button>
								)}
								<motion.button
									type="button"
									whileTap={{ scale: 0.97 }}
									onClick={() => (i < last ? go(i + 1) : onClose())}
									className="inline-flex items-center gap-1.5 h-9 rounded-full bg-neutral-100 px-4 text-sm font-semibold text-black hover:bg-white transition-colors"
								>
									{i < last ? "Next" : "Got it"}
									{i < last && <ChevronRight className="h-4 w-4" />}
								</motion.button>
							</div>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}

// ── Empty / draft state ────────────────────────────────────────────────────

function EmptyState() {
	const [howOpen, setHowOpen] = useState(false);
	return (
		<>
			<TopBar onHowItWorks={() => setHowOpen(true)} />
			<motion.div
				initial={{ opacity: 0, y: 16 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.5, ease: EASE }}
				className="max-w-2xl mx-auto px-4 sm:px-6 pt-28 pb-32 text-center"
			>
				<I3Mark className="mx-auto mb-8 h-16 w-16 text-neutral-600" />
				<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-100 mb-3">
					The stage is being set
				</h1>
				<p className="text-neutral-400 leading-relaxed">
					The i³ Awards ballot isn't live yet. Check back soon.
				</p>
			</motion.div>
			<HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
		</>
	);
}

// ── Open round: the ballot ─────────────────────────────────────────────────

function OpenBallot({ data }: { data: AwardsRoundData }) {
	const { round, nominees, voting } = data;
	const categories = round.categories;

	const [selections, setSelections] = useState<Record<string, string>>({});
	const [address, setAddress] = useState<string | null>(null);
	const [eligibility, setEligibility] = useState<Eligibility | null>(null);
	const [phase, setPhase] = useState<Phase>("idle");
	const [walletOpen, setWalletOpen] = useState(false);
	const [howOpen, setHowOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [txHash, setTxHash] = useState<string | null>(null);
	const [funding, setFunding] = useState(false);
	const prefilled = useRef(false);
	const [ballotPage, setBallotPage] = useState(0);
	const [highlightNominee, setHighlightNominee] = useState<Nominee | null>(
		null,
	);
	const isMobile = useIsMobile();

	const nomineesByCategory = useMemo(() => {
		const map = new Map<string, Nominee[]>();
		for (const n of nominees) {
			map.set(n.category, [...(map.get(n.category) ?? []), n]);
		}
		return map;
	}, [nominees]);

	const nomineeName = useCallback(
		(categoryKey: string, slug: string | undefined) => {
			if (!slug) return null;
			return (
				(nomineesByCategory.get(categoryKey) ?? []).find((n) => n.slug === slug)
					?.name ?? slug
			);
		},
		[nomineesByCategory],
	);

	const selectedCount = Object.keys(selections).length;
	const readOnly = eligibility !== null && !eligibility.whitelisted;
	const votedBefore = Boolean(eligibility?.votes);
	const busy =
		phase === "connecting" ||
		phase === "requesting" ||
		phase === "signing" ||
		phase === "submitting";

	// ── selection ──
	const toggleNominee = useCallback(
		(category: string, slug: string) => {
			if (readOnly || busy) return;
			setError(null);
			setSelections((prev) => {
				const next = { ...prev };
				if (next[category] === slug) delete next[category];
				else next[category] = slug;
				return next;
			});
		},
		[readOnly, busy],
	);

	// ── eligibility ──
	const refreshEligibility = useCallback(
		async (addr: string) => {
			const res = await fetch(
				`/api/awards/eligibility?address=${encodeURIComponent(addr)}&round=${encodeURIComponent(round.slug)}`,
			);
			if (!res.ok) throw new Error("could not check eligibility");
			const body = (await res.json()) as Eligibility;
			setEligibility(body);
			// Returning voter: surface their current on-chain ballot, once, and
			// only if they haven't started picking already.
			if (body.votes && !prefilled.current) {
				prefilled.current = true;
				setSelections((prev) =>
					Object.keys(prev).length > 0 ? prev : { ...body.votes },
				);
			}
			return body;
		},
		[round.slug],
	);

	// ── connect ──
	const handleConnect = useCallback(
		async (walletId: AwardsWalletId) => {
			setError(null);
			setPhase("connecting");
			try {
				const addr = await connectAwardsWallet(walletId);
				setAddress(addr);
				setWalletOpen(false);
				await refreshEligibility(addr);
			} catch (err) {
				setError(walletErrorMessage(err));
			} finally {
				setPhase("idle");
			}
		},
		[refreshEligibility],
	);

	const handleDisconnect = useCallback(async () => {
		await disconnectAwardsWallet();
		setAddress(null);
		setEligibility(null);
		setTxHash(null);
		setPhase("idle");
		prefilled.current = false;
	}, []);

	// ── friendbot (test mode only — the whole feature is testnet) ──
	const handleFund = useCallback(async () => {
		if (!address || !eligibility?.friendbot) return;
		setFunding(true);
		setError(null);
		try {
			const res = await fetch(eligibility.friendbot);
			if (!res.ok) throw new Error(`friendbot responded ${res.status}`);
			await refreshEligibility(address);
		} catch {
			// CORS or friendbot hiccup — hand the voter the link instead.
			window.open(eligibility.friendbot, "_blank", "noopener");
			setError(
				"Opened friendbot in a new tab — fund the account there, then retry.",
			);
		} finally {
			setFunding(false);
		}
	}, [address, eligibility, refreshEligibility]);

	// ── sign & submit ──
	const handleSubmit = useCallback(async () => {
		if (!address || selectedCount === 0) return;
		setError(null);
		try {
			setPhase("requesting");
			const xdrRes = await fetch("/api/awards/ballot-xdr", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ address, selections, round: round.slug }),
			});
			const xdrBody = await xdrRes.json();
			if (xdrRes.status === 409 && xdrBody?.error === "account_unfunded") {
				setEligibility((prev) =>
					prev
						? { ...prev, funded: false, friendbot: xdrBody.friendbot }
						: prev,
				);
				setPhase("idle");
				return;
			}
			if (!xdrRes.ok) {
				throw new Error(
					typeof xdrBody?.error === "string"
						? xdrBody.error
						: "could not prepare the ballot",
				);
			}

			setPhase("signing");
			const signedXdr = await signAwardsBallot(xdrBody.xdr, address);

			setPhase("submitting");
			const submitRes = await fetch("/api/awards/submit", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ signedXdr, round: round.slug }),
			});
			const submitBody = await submitRes.json();
			if (!submitRes.ok) {
				throw new Error(
					typeof submitBody?.error === "string"
						? submitBody.error
						: "the vote could not be submitted",
				);
			}
			setTxHash(submitBody.hash);
			setEligibility((prev) =>
				prev ? { ...prev, votes: { ...selections } } : prev,
			);
			setPhase("submitted");
			window.scrollTo({ top: 0, behavior: "smooth" });
		} catch (err) {
			setError(walletErrorMessage(err));
			setPhase("idle");
		}
	}, [address, selections, selectedCount, round.slug]);

	const closesLabel = round.closesAt
		? format(new Date(round.closesAt), "MMMM d, yyyy 'at' h:mm a")
		: null;

	// ── primary action (shared by rail + mobile bar) ──
	type Primary = {
		label: string;
		onClick: () => void;
		disabled: boolean;
		loading: boolean;
	};
	const primary: Primary = !address
		? {
				label: "Connect wallet to vote",
				onClick: () => setWalletOpen(true),
				disabled: false,
				loading: phase === "connecting",
			}
		: eligibility?.funded === false
			? {
					label: funding ? "Funding…" : "Fund on testnet",
					onClick: handleFund,
					disabled: funding,
					loading: funding,
				}
			: {
					label:
						phase === "requesting"
							? "Preparing…"
							: phase === "signing"
								? "Waiting for wallet…"
								: phase === "submitting"
									? "Submitting…"
									: votedBefore
										? "Update vote"
										: "Sign & submit",
					onClick: handleSubmit,
					disabled: selectedCount === 0 || busy,
					loading: busy,
				};

	function PrimaryButton({ full = false }: { full?: boolean }) {
		return (
			<motion.button
				type="button"
				onClick={primary.onClick}
				disabled={primary.disabled}
				whileTap={{ scale: primary.disabled ? 1 : 0.97 }}
				className={`inline-flex items-center justify-center gap-2 h-11 rounded-full bg-neutral-100 px-6 text-sm font-semibold text-black transition-colors hover:bg-white disabled:bg-[#333] disabled:text-neutral-500 ${
					full ? "w-full" : "flex-shrink-0"
				}`}
			>
				{primary.loading ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					!address && <Wallet className="h-4 w-4" />
				)}
				{primary.label}
			</motion.button>
		);
	}

	return (
		<>
			<TopBar
				onHowItWorks={() => setHowOpen(true)}
				wallet={{
					address,
					busy: phase === "connecting",
					onConnect: () => setWalletOpen(true),
					onDisconnect: handleDisconnect,
				}}
			/>

			{/* ── Hero ── */}
			<motion.header
				initial={{ opacity: 0, y: 18 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.55, ease: EASE }}
				className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-10 text-center"
			>
				<h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-neutral-50 leading-[1.05] mb-5">
					{round.title}
				</h1>
				<p className="text-neutral-400 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
					Three categories. One pick in each. SCF Pilots choose the projects
					that defined the year — for their impact, innovation and
					interoperability.
				</p>
				<div className="mt-6 flex items-center justify-center gap-3 text-sm">
					{round.closesAt && voting.open ? (
						<span className="text-neutral-500">
							Closes{" "}
							<span className="text-neutral-300">
								{formatDistanceToNow(new Date(round.closesAt), {
									addSuffix: true,
								})}
							</span>
						</span>
					) : null}
					{!voting.open && (
						<span className="text-neutral-400 rounded-full border border-[#2f2f2f] px-3 py-1">
							Voting is not open right now
							{voting.reason ? ` — ${voting.reason}` : ""}
						</span>
					)}
				</div>
			</motion.header>

			{/* ── Submitted confirmation ── */}
			<AnimatePresence>
				{phase === "submitted" && txHash && (
					<motion.div
						initial={{ opacity: 0, y: 16 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.45, ease: EASE }}
						className="max-w-2xl mx-auto px-4 sm:px-6 mb-10"
					>
						<div className="relative overflow-hidden rounded-2xl border border-[#2f2f2f] bg-[#1c1c1c] p-6 sm:p-7 text-center shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
							<span className="sm-confetti" aria-hidden="true">
								{Array.from({ length: 14 }, (_, i) => (
									<i
										// biome-ignore lint/suspicious/noArrayIndexKey: static burst
										key={i}
										style={{
											["--sm-i" as string]: i,
											["--sm-x" as string]: `${(i % 2 ? 1 : -1) * (14 + ((i * 37) % 110))}px`,
											["--sm-y" as string]: `${-(70 + ((i * 53) % 120))}px`,
											["--sm-r" as string]: `${140 + ((i * 97) % 320)}deg`,
											["--sm-c" as string]: i % 2 === 0 ? "#ffffff" : "#8a8a8a",
										}}
									/>
								))}
							</span>
							<motion.span
								initial={{ scale: 0 }}
								animate={{ scale: 1 }}
								transition={{ ...SPRING, delay: 0.1 }}
								className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100"
							>
								<Check className="h-6 w-6 text-black" strokeWidth={3} />
							</motion.span>
							<h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-100 mb-2">
								Your vote is on-chain
							</h2>
							<p className="text-sm text-neutral-400 leading-relaxed mb-4">
								Recorded as a Stellar testnet transaction.
								{closesLabel && (
									<>
										{" "}
										You can change it until{" "}
										<span className="text-neutral-200">{closesLabel}</span> —
										pick again and resubmit.
									</>
								)}
							</p>
							<a
								href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
								target="_blank"
								rel="noopener noreferrer"
								className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300 hover:text-neutral-100 transition-colors"
							>
								View transaction {shortAddress(txHash)}
								<ArrowUpRight className="h-4 w-4" />
							</a>
						</div>
					</motion.div>
				)}
			</AnimatePresence>

			{/* ── Read-only notice ── */}
			{readOnly && (
				<div className="max-w-2xl mx-auto px-4 sm:px-6 mb-8">
					<div className="rounded-xl border border-[#2f2f2f] bg-[#1c1c1c] p-4 flex items-start gap-3">
						<Eye className="h-5 w-5 mt-0.5 text-neutral-500 flex-shrink-0" />
						<p className="text-sm text-neutral-400 leading-relaxed">
							<span className="text-neutral-100 font-medium">Read-only.</span>{" "}
							{address ? shortAddress(address) : "This address"} isn't on the
							Pilot voter list — the nominees are still worth a look.
						</p>
					</div>
				</div>
			)}

			{/* ── Two-column: grid + ballot rail ── */}
			{/* When the mobile ballot deck is shown it's `fixed` (~230px tall) and
			    would overlap the last nominees (the Interoperability tail —
			    rubic/usdc-swap). Reserve room below the grid so they clear it;
			    fall back to normal padding when the deck is absent (read-only /
			    voting closed) so there's no dead space. */}
			<div
				className={`max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-8 lg:pb-20 ${
					voting.open && !readOnly ? "pb-[17rem]" : "pb-32"
				}`}
			>
				{/* nominee grid */}
				<div className="lg:col-span-8 space-y-14">
					{categories.map((category) => (
						<section key={category.key} aria-label={category.name}>
							<div className="mb-5">
								<h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-50">
									{category.name}
								</h2>
								{category.tagline && (
									<p className="mt-0.5 text-sm text-neutral-500">
										{category.tagline}
									</p>
								)}
							</div>
							<motion.div
								initial="hidden"
								whileInView="visible"
								viewport={{ once: true, margin: "-60px" }}
								variants={{
									hidden: {},
									visible: { transition: { staggerChildren: 0.05 } },
								}}
								className="grid grid-cols-1 sm:grid-cols-2 gap-3"
							>
								{(nomineesByCategory.get(category.key) ?? []).map((nominee) => (
									<NomineeCard
										key={nominee.slug}
										nominee={nominee}
										selected={selections[category.key] === nominee.slug}
										disabled={readOnly || !voting.open}
										onToggle={() => toggleNominee(category.key, nominee.slug)}
										onHighlights={() => setHighlightNominee(nominee)}
									/>
								))}
							</motion.div>
						</section>
					))}
				</div>

				{/* ballot rail (desktop) */}
				<aside className="hidden lg:block lg:col-span-4">
					<div className="sticky top-20 rounded-2xl border border-[#2f2f2f] bg-[#1c1c1c] p-5 shadow-[0_1px_0_rgba(255,255,255,0.03)_inset]">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-sm font-semibold text-neutral-100">
								Your ballot
							</h3>
							<span className="text-xs tabular-nums text-neutral-500">
								{selectedCount}/{categories.length}
							</span>
						</div>
						<ul className="space-y-3 mb-5">
							{categories.map((c) => {
								const picked = nomineeName(c.key, selections[c.key]);
								return (
									<li
										key={c.key}
										className="flex items-center justify-between gap-3"
									>
										<span className="text-xs text-neutral-500 truncate">
											{c.name}
										</span>
										<div className="min-w-0 flex-shrink-0 text-right overflow-hidden">
											<AnimatePresence mode="popLayout" initial={false}>
												<motion.span
													key={picked ?? "empty"}
													initial={{ opacity: 0, y: 6 }}
													animate={{ opacity: 1, y: 0 }}
													exit={{ opacity: 0, y: -6 }}
													transition={{ duration: 0.22, ease: EASE }}
													className={`block text-sm font-medium truncate ${
														picked ? "text-neutral-100" : "text-neutral-600"
													}`}
												>
													{picked ?? "—"}
												</motion.span>
											</AnimatePresence>
										</div>
									</li>
								);
							})}
						</ul>
						{voting.open && !readOnly && <PrimaryButton full />}
						{closesLabel && voting.open && (
							<p className="mt-3 text-[11px] text-neutral-600 text-center leading-relaxed">
								One signature. Change it anytime before {closesLabel}.
							</p>
						)}
					</div>
				</aside>
			</div>

			{/* ── Mobile ballot deck (whole-card swipe, stacked like a deck) ── */}
			{voting.open && !readOnly && (
				<motion.div
					initial={{ y: 24, opacity: 0 }}
					animate={{ y: 0, opacity: 1 }}
					transition={{ duration: 0.4, ease: EASE }}
					className="lg:hidden fixed left-3 right-3 z-40 rounded-2xl border border-[#2f2f2f] bg-[#161616]/95 backdrop-blur-xl shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
					style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
				>
					<div className="p-3.5">
						<div className="flex items-center justify-between mb-3">
							<span className="text-xs font-semibold text-neutral-200">
								Your ballot
							</span>
							<span className="text-xs tabular-nums text-neutral-500">
								{selectedCount}/{categories.length}
							</span>
						</div>

						{/* the deck: swipe the whole top card; the rest peek behind it */}
						<div className="relative mb-3" style={{ height: 104 }}>
							{categories.map((category, idx) => {
								const depth =
									(idx - ballotPage + categories.length) % categories.length;
								const isTop = depth === 0;
								const pickedSlug = selections[category.key];
								const pickedNominee = pickedSlug
									? ((nomineesByCategory.get(category.key) ?? []).find(
											(n) => n.slug === pickedSlug,
										) ?? null)
									: null;
								return (
									<motion.div
										key={category.key}
										drag={isTop ? "x" : false}
										dragConstraints={{ left: 0, right: 0 }}
										dragElastic={0.7}
										onDragEnd={(_, info) => {
											if (!isTop) return;
											if (info.offset.x < -70 || info.velocity.x < -450)
												setBallotPage((p) => (p + 1) % categories.length);
											else if (info.offset.x > 70 || info.velocity.x > 450)
												setBallotPage(
													(p) =>
														(p - 1 + categories.length) % categories.length,
												);
										}}
										animate={{
											scale: 1 - depth * 0.05,
											y: depth * 7,
											opacity: depth >= 3 ? 0 : 1 - depth * 0.08,
										}}
										transition={SPRING}
										style={{
											zIndex: categories.length - depth,
											touchAction: "pan-y",
										}}
										className={`absolute inset-x-0 top-0 flex min-h-[92px] flex-col justify-center rounded-xl border p-3.5 ${
											isTop ? "cursor-grab active:cursor-grabbing" : ""
										} ${
											pickedNominee
												? "border-neutral-300 bg-[#242424] shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]"
												: "border-[#2f2f2f] bg-[#1e1e1e]"
										}`}
									>
										<div className="mb-2 flex items-center gap-2">
											<span className="text-xs font-medium text-neutral-400">
												{category.name}
											</span>
											{pickedNominee && (
												<Check
													className="ml-auto h-3.5 w-3.5 text-neutral-300"
													strokeWidth={3}
												/>
											)}
										</div>
										{pickedNominee ? (
											<div className="flex items-center gap-2.5">
												<Image
													src={pickedNominee.logoUrl || "/logo.png"}
													alt=""
													width={30}
													height={30}
													className="h-[30px] w-[30px] flex-shrink-0 rounded-md border border-[#2f2f2f] bg-[#111] object-cover"
												/>
												<span className="truncate text-sm font-semibold text-neutral-100">
													{pickedNominee.name}
												</span>
											</div>
										) : (
											<span className="text-sm text-neutral-500">
												Not picked yet — tap a nominee above
											</span>
										)}
									</motion.div>
								);
							})}
						</div>

						{/* dots: tappable, reflect pick state per category */}
						<div className="flex items-center justify-center gap-1.5 mb-3">
							{categories.map((category, idx) => (
								<button
									key={category.key}
									type="button"
									aria-label={category.name}
									onClick={() => setBallotPage(idx)}
									className="h-1.5 rounded-full transition-all duration-200"
									style={{
										width: idx === ballotPage ? 16 : 6,
										background: selections[category.key]
											? "#fafafa"
											: idx === ballotPage
												? "#6a6a6a"
												: "rgba(255,255,255,0.2)",
									}}
								/>
							))}
						</div>
						<PrimaryButton full />
					</div>
				</motion.div>
			)}

			{/* ── Wallet picker (modal on desktop, drawer on mobile) ── */}
			<WalletPicker
				open={walletOpen}
				onOpenChange={setWalletOpen}
				isMobile={isMobile}
				connecting={phase === "connecting"}
				onPick={handleConnect}
			/>

			<HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />

			<NomineeHighlightsModal
				nominee={highlightNominee}
				isSelected={
					highlightNominee
						? selections[highlightNominee.category] === highlightNominee.slug
						: false
				}
				onClose={() => setHighlightNominee(null)}
				onVote={(slug) => {
					if (highlightNominee && !readOnly && voting.open) {
						const cat = highlightNominee.category;
						setError(null);
						setSelections((prev) => ({ ...prev, [cat]: slug }));
					}
					setHighlightNominee(null);
				}}
			/>

			<AwardsToast
				message={error}
				onDismiss={() => setError(null)}
				raised={voting.open && !readOnly}
			/>
		</>
	);
}

// ── Error toast (Family.co-style) ──────────────────────────────────────────
// One surface for every ballot message — connect, funding, sign, submit all
// route here. A dark pill that springs up, auto-dismisses (~6.5s), and clears
// on tap; on mobile it floats ABOVE the fixed ballot deck so it never covers
// the picks. Replaces the inline red-text that used to sit in three places.
function AwardsToast({
	message,
	onDismiss,
	raised,
}: {
	message: string | null;
	onDismiss: () => void;
	/** true while the mobile ballot deck is on screen — lift clear of it. */
	raised: boolean;
}) {
	useEffect(() => {
		if (!message) return;
		const t = setTimeout(onDismiss, 6500);
		return () => clearTimeout(t);
	}, [message, onDismiss]);

	return (
		<AnimatePresence>
			{message && (
				<motion.div
					className={`pointer-events-none fixed inset-x-0 z-[90] flex justify-center px-4 sm:bottom-8 ${
						raised ? "bottom-[16.5rem]" : "bottom-6"
					}`}
					initial={{ opacity: 0, y: 24, scale: 0.96 }}
					animate={{ opacity: 1, y: 0, scale: 1 }}
					exit={{ opacity: 0, y: 18, scale: 0.97 }}
					transition={{ type: "spring", stiffness: 380, damping: 30 }}
				>
					<button
						type="button"
						onClick={onDismiss}
						aria-live="polite"
						className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-2xl border border-[#3a3320] bg-[#181614]/95 px-4 py-3 text-left shadow-[0_16px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl"
					>
						<span className="mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-amber-300">
							<Info className="h-3.5 w-3.5" />
						</span>
						<span className="text-[13px] leading-snug text-neutral-200">
							{message}
						</span>
						<X className="mt-px h-3.5 w-3.5 flex-shrink-0 text-neutral-600" />
					</button>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

// ── Wallet picker (RainbowKit pattern: modal on desktop, drawer on mobile) ──

function WalletList({
	connecting,
	onPick,
}: {
	connecting: boolean;
	onPick: (id: AwardsWalletId) => void;
}) {
	return (
		<div className="w-full space-y-2">
			{AWARDS_WALLETS.map((wallet) => (
				<button
					key={wallet.id}
					type="button"
					disabled={connecting}
					onClick={() => onPick(wallet.id)}
					className="w-full rounded-xl border border-[#2f2f2f] bg-[#1f1f1f] px-3.5 py-3 flex items-center justify-between gap-3 text-left hover:border-[#454545] transition-colors disabled:opacity-60"
				>
					<span className="flex items-center gap-3 min-w-0">
						<Image
							src={wallet.icon}
							alt=""
							width={36}
							height={36}
							className="h-9 w-9 flex-shrink-0 rounded-lg object-contain bg-[#111] border border-[#2a2a2a] p-0.5"
						/>
						<span className="min-w-0">
							<span className="block text-sm font-semibold text-neutral-100">
								{wallet.name}
							</span>
							<span className="block text-xs text-neutral-500">
								{wallet.hint}
							</span>
						</span>
					</span>
					{connecting ? (
						<Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-neutral-500" />
					) : (
						<ChevronRight className="h-4 w-4 flex-shrink-0 text-neutral-500" />
					)}
				</button>
			))}
		</div>
	);
}

function WalletPicker({
	open,
	onOpenChange,
	isMobile,
	connecting,
	onPick,
}: {
	open: boolean;
	onOpenChange: (v: boolean) => void;
	isMobile: boolean;
	connecting: boolean;
	onPick: (id: AwardsWalletId) => void;
}) {
	// Desktop modal closes on Escape (RainbowKit parity); the mobile Drawer
	// handles Escape / swipe-down itself.
	useEffect(() => {
		if (!open || isMobile) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onOpenChange(false);
		};
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, isMobile, onOpenChange]);

	// Mobile → bottom sheet (thumb-reachable). Desktop → centered modal.
	if (isMobile) {
		return (
			<Drawer open={open} onOpenChange={onOpenChange}>
				<DrawerContent>
					<DrawerHeader className="text-center sm:text-center">
						<DrawerTitle className="text-xl font-semibold">
							Connect a wallet
						</DrawerTitle>
						<DrawerDescription className="text-balance">
							You'll sign a Stellar <strong>testnet</strong> transaction — no
							real funds are involved.
						</DrawerDescription>
					</DrawerHeader>
					{/* mt-5 lets the description breathe above the list — without it
					    the drawer's flex-col butts the copy against the first wallet
					    button (the "clamped" look). No eyebrow label; the buttons
					    speak for themselves. */}
					<div className="mx-auto mt-5 w-full max-w-sm pb-2">
						<WalletList connecting={connecting} onPick={onPick} />
					</div>
				</DrawerContent>
			</Drawer>
		);
	}

	return (
		<AnimatePresence>
			{open && (
				<div
					className="fixed inset-0 z-[60] flex items-center justify-center p-4"
					role="dialog"
					aria-modal="true"
					aria-label="Connect a wallet"
				>
					<motion.button
						type="button"
						aria-label="Close"
						onClick={() => onOpenChange(false)}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.2 }}
						className="absolute inset-0 bg-black/70 backdrop-blur-sm"
					/>
					<motion.div
						initial={{ opacity: 0, y: 16, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 16, scale: 0.98 }}
						transition={{ duration: 0.28, ease: EASE }}
						className="relative w-full max-w-sm rounded-2xl border border-[#2f2f2f] bg-[#1c1c1c] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
					>
						<div className="flex items-start justify-between gap-4 mb-6">
							<div>
								<h2 className="text-lg font-semibold tracking-tight text-neutral-100">
									Connect a wallet
								</h2>
								<p className="mt-1.5 text-sm leading-relaxed text-neutral-400">
									You'll sign a Stellar testnet transaction — no real funds.
								</p>
							</div>
							<button
								type="button"
								onClick={() => onOpenChange(false)}
								className="flex h-8 w-8 items-center justify-center rounded-full border border-[#2f2f2f] text-neutral-400 hover:text-neutral-100 hover:border-[#454545] transition-colors flex-shrink-0"
							>
								<X className="h-4 w-4" />
							</button>
						</div>
						<WalletList connecting={connecting} onPick={onPick} />
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}

// ── Nominee card ───────────────────────────────────────────────────────────

function NomineeCard({
	nominee,
	selected,
	disabled,
	onToggle,
	onHighlights,
}: {
	nominee: Nominee;
	selected: boolean;
	disabled: boolean;
	onToggle: () => void;
	onHighlights: () => void;
}) {
	const [logoError, setLogoError] = useState(false);
	const logoSrc = !logoError && nominee.logoUrl ? nominee.logoUrl : "/logo.png";

	// A div (not a button) so it can hold the real "Highlights" button; keeps
	// keyboard-select via role=button + Enter/Space.
	return (
		<motion.div
			role="button"
			tabIndex={disabled ? -1 : 0}
			aria-pressed={selected}
			aria-disabled={disabled}
			onClick={disabled ? undefined : onToggle}
			onKeyDown={
				disabled
					? undefined
					: (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onToggle();
							}
						}
			}
			variants={{
				hidden: { opacity: 0, y: 16 },
				visible: {
					opacity: 1,
					y: 0,
					transition: { duration: 0.4, ease: EASE },
				},
			}}
			whileHover={disabled ? undefined : { y: -3 }}
			whileTap={disabled ? undefined : { scale: 0.985 }}
			transition={SPRING}
			className={`group relative flex min-h-[150px] flex-col rounded-xl border p-4 text-left ${
				disabled ? "cursor-default" : "cursor-pointer"
			} ${
				selected
					? "border-[#6a6a6a] bg-[#242424] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
					: "border-[#2f2f2f] bg-[#1e1e1e] hover:border-[#4a4a4a] shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
			}`}
			style={{ transition: "border-color .15s, background-color .15s" }}
		>
			{/* selection badge */}
			<span
				className={`absolute top-3.5 right-3.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
					selected
						? "bg-neutral-200 border-neutral-200"
						: "border-[#3f3f3f] group-hover:border-[#5a5a5a]"
				}`}
				aria-hidden="true"
			>
				<AnimatePresence>
					{selected && (
						<motion.span
							initial={{ scale: 0 }}
							animate={{ scale: 1 }}
							exit={{ scale: 0 }}
							transition={SPRING}
						>
							<Check className="h-3 w-3 text-black" strokeWidth={3.5} />
						</motion.span>
					)}
				</AnimatePresence>
			</span>

			<div className="flex items-center gap-3 mb-2.5 pr-7">
				<Image
					src={logoSrc}
					alt=""
					width={36}
					height={36}
					className="rounded-lg object-cover w-9 h-9 flex-shrink-0 border border-[#2f2f2f] bg-[#111]"
					onError={() => setLogoError(true)}
				/>
				<span className="text-sm font-semibold text-neutral-100 leading-tight">
					{nominee.name}
				</span>
			</div>

			<span className="text-[13px] text-neutral-400 leading-relaxed line-clamp-3 flex-1">
				{nominee.blurb ?? "Shortlisted by the community."}
			</span>

			<span className="mt-3 pt-2.5 border-t border-[#2a2a2a] flex items-center justify-between">
				<span
					className={`text-xs font-medium ${
						selected ? "text-neutral-100" : "text-neutral-500"
					}`}
				>
					{selected ? "Selected" : "Tap to select"}
				</span>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onHighlights();
					}}
					className="-mr-1 inline-flex items-center gap-0.5 rounded-full px-2 py-1 text-xs font-medium text-neutral-400 transition-colors hover:bg-[#2a2a2a] hover:text-neutral-100"
				>
					Highlights
					<ChevronRight className="h-3.5 w-3.5" />
				</button>
			</span>
		</motion.div>
	);
}

// ── Closed round: results reveal ───────────────────────────────────────────

function ClosedRound({ data }: { data: AwardsRoundData }) {
	const { round } = data;
	const [howOpen, setHowOpen] = useState(false);
	const [results, setResults] = useState<ResultsData | null>(null);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetch(`/api/awards/results?round=${encodeURIComponent(round.slug)}`)
			.then((res) => (res.ok ? res.json() : Promise.reject()))
			.then((body) => {
				if (!cancelled) setResults(body as ResultsData);
			})
			.catch(() => {
				if (!cancelled) setFailed(true);
			});
		return () => {
			cancelled = true;
		};
	}, [round.slug]);

	return (
		<>
			<TopBar onHowItWorks={() => setHowOpen(true)} />
			<div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-32">
				<motion.header
					initial={{ opacity: 0, y: 18 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.55, ease: EASE }}
					className="text-center mb-14"
				>
					<p className="text-sm font-medium text-neutral-400 mb-3">
						Voting closed
					</p>
					<h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-neutral-50 leading-[1.05]">
						{round.title}
					</h1>
					{results && (
						<p className="mt-4 text-sm text-neutral-500">
							{results.turnout.voted} of {results.turnout.whitelisted} Pilots
							voted
						</p>
					)}
				</motion.header>

				{!results && !failed && (
					<p className="text-center text-neutral-500">
						<Loader2 className="inline h-4 w-4 animate-spin mr-2" />
						Reading the tally from chain…
					</p>
				)}
				{failed && (
					<p className="text-center text-neutral-500">
						The tally isn't available right now — try again shortly.
					</p>
				)}

				{results && (
					<div className="space-y-10">
						{results.categories.map((category) => {
							const [winner, ...rest] = category.results;
							const total = Math.max(1, category.totalVotes);
							const pct = (v: number) => Math.round((v / total) * 100);
							return (
								<section key={category.key}>
									<h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-50 mb-4 flex items-center gap-2.5">
										<Trophy className="h-5 w-5 text-neutral-300" />
										{category.name}
									</h2>
									{winner && (
										<motion.div
											initial={{ opacity: 0, y: 10 }}
											whileInView={{ opacity: 1, y: 0 }}
											viewport={{ once: true }}
											transition={{ duration: 0.4, ease: EASE }}
											className="rounded-xl border border-neutral-500/40 bg-[#242424] p-4 mb-2.5 shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
										>
											<div className="flex items-center justify-between gap-4 mb-3">
												<div className="flex items-center gap-2.5 min-w-0">
													<span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-[11px] font-semibold text-black flex-shrink-0">
														Winner
													</span>
													<p className="text-base font-semibold text-neutral-50 tracking-tight truncate">
														{winner.name}
													</p>
												</div>
												<span className="text-sm font-semibold tabular-nums text-neutral-300 flex-shrink-0">
													{winner.votes} · {pct(winner.votes)}%
												</span>
											</div>
											<div className="sm-bar-track">
												<motion.div
													className="sm-bar-fill"
													initial={{ width: 0 }}
													whileInView={{ width: `${pct(winner.votes)}%` }}
													viewport={{ once: true }}
													transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
													style={{ background: "#fafafa" }}
												/>
											</div>
										</motion.div>
									)}
									<ul className="space-y-2">
										{rest.map((r, i) => (
											<motion.li
												key={r.slug}
												initial={{ opacity: 0, y: 8 }}
												whileInView={{ opacity: 1, y: 0 }}
												viewport={{ once: true }}
												transition={{
													duration: 0.35,
													ease: EASE,
													delay: (i + 1) * 0.05,
												}}
												className="rounded-xl border border-[#2f2f2f] bg-[#1e1e1e] px-4 py-3"
											>
												<div className="flex items-center justify-between gap-3 mb-2">
													<span className="text-sm font-medium text-neutral-100 truncate">
														{r.name}
													</span>
													<span className="text-[11px] font-medium tabular-nums text-neutral-500 flex-shrink-0">
														{r.votes} · {pct(r.votes)}%
													</span>
												</div>
												<div className="sm-bar-track" style={{ height: 6 }}>
													<motion.div
														className="sm-bar-fill"
														initial={{ width: 0 }}
														whileInView={{ width: `${pct(r.votes)}%` }}
														viewport={{ once: true }}
														transition={{ duration: 0.6, ease: EASE }}
														style={{ background: "rgba(255,255,255,0.28)" }}
													/>
												</div>
											</motion.li>
										))}
									</ul>
								</section>
							);
						})}
						<p className="text-center text-xs text-neutral-600 pt-4 leading-relaxed">
							Tallied directly from Stellar testnet — every vote is a public,
							verifiable transaction.
						</p>
					</div>
				)}
			</div>
			<HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
		</>
	);
}
