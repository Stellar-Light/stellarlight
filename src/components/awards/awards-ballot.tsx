"use client";

/**
 * i³ Awards — the voting experience.
 *
 * Design language: monochrome, editorial, prediction-market layout
 * (Polymarket / godly.website). NO accent color — white is the only active
 * ink; selection reads as a filled white check + hairline-to-solid border,
 * never a glow. Structure:
 *   - a persistent top bar carries "How it works" + the wallet (top-right,
 *     always visible — not a bottom afterthought)
 *   - desktop: two columns — nominee grid (left) + a sticky "Your ballot"
 *     rail (right) that summarizes picks and holds the submit action
 *   - mobile: the grid stacks; a compact sticky bar carries progress + action
 *
 * Interaction model:
 *   - tap a nominee to pick it (one per category; tap again to clear)
 *   - wallets: Freighter / xBull / Albedo via stellar-wallets-kit, loaded
 *     lazily on first connect (SSR-safe)
 *   - non-whitelisted addresses get a polite read-only mode
 *   - unfunded testnet accounts get a one-tap friendbot fund (test mode)
 *   - votes are real TESTNET transactions; success links stellar.expert
 *   - closed rounds swap the ballot for a results reveal
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
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
} from "@/components/ui/drawer";
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
		<div className="sticky top-0 z-40 border-b border-white/10 bg-black/60 backdrop-blur-xl">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					<I3Mark className="h-6 w-6 text-foreground flex-shrink-0" />
					<span className="text-sm font-semibold tracking-tight text-foreground truncate">
						i³ Awards
					</span>
					<span className="hidden sm:inline text-[11px] font-medium uppercase tracking-[0.14em] text-neutral-500 border border-white/10 rounded px-1.5 py-0.5">
						Testnet
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={onHowItWorks}
						className="inline-flex items-center gap-1.5 h-9 rounded-full border border-white/12 px-3.5 text-sm font-medium text-neutral-300 hover:text-foreground hover:border-white/25 transition-colors"
					>
						<Info className="h-4 w-4" />
						<span className="hidden sm:inline">How it works</span>
					</button>
					{wallet &&
						(wallet.address ? (
							<button
								type="button"
								onClick={wallet.onDisconnect}
								className="inline-flex items-center gap-2 h-9 rounded-full border border-white/12 pl-3 pr-3.5 text-sm font-medium text-foreground hover:border-white/25 transition-colors"
							>
								<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
								{shortAddress(wallet.address)}
							</button>
						) : (
							<button
								type="button"
								onClick={wallet.onConnect}
								disabled={wallet.busy}
								className="inline-flex items-center gap-2 h-9 rounded-full bg-white px-4 text-sm font-semibold text-black hover:bg-neutral-200 transition-colors disabled:opacity-60"
							>
								{wallet.busy ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<Wallet className="h-4 w-4" />
								)}
								Connect
							</button>
						))}
				</div>
			</div>
		</div>
	);
}

// ── How-it-works modal ─────────────────────────────────────────────────────

function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open, onClose]);

	if (!open) return null;

	const steps = [
		{
			n: "1",
			t: "Connect a Pilot wallet",
			d: "Freighter, xBull or Albedo. Only whitelisted SCF Pilot addresses can cast a ballot — anyone else can browse read-only.",
		},
		{
			n: "2",
			t: "Pick one per category",
			d: "Choose the project you think best defined the year for Impact, Innovation and Interoperability.",
		},
		{
			n: "3",
			t: "Sign one transaction",
			d: "Your whole ballot is written to your own Stellar testnet account in a single signature. No real funds — ever.",
		},
		{
			n: "4",
			t: "Change your mind anytime",
			d: "Re-pick and re-sign before voting closes; the new ballot overwrites the old. The tally is read straight from chain, publicly verifiable.",
		},
	];

	return (
		<div
			className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
			role="dialog"
			aria-modal="true"
			aria-label="How voting works"
		>
			<button
				type="button"
				aria-label="Close"
				onClick={onClose}
				className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
			/>
			<div className="relative w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-white/12 bg-[#0d0d0d] p-6 sm:p-8 animate-fade-in-up">
				<div className="flex items-start justify-between gap-4 mb-6">
					<div>
						<h2 className="text-xl font-semibold tracking-tight text-foreground">
							How voting works
						</h2>
						<p className="mt-1 text-sm text-neutral-400">
							A community vote, settled on Stellar testnet.
						</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-8 w-8 items-center justify-center rounded-full border border-white/12 text-neutral-400 hover:text-foreground hover:border-white/25 transition-colors flex-shrink-0"
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<ol className="space-y-4">
					{steps.map((s) => (
						<li key={s.n} className="flex gap-3.5">
							<span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-white/15 text-xs font-semibold text-foreground tabular-nums">
								{s.n}
							</span>
							<div className="min-w-0">
								<p className="text-sm font-semibold text-foreground">{s.t}</p>
								<p className="mt-0.5 text-sm text-neutral-400 leading-relaxed">
									{s.d}
								</p>
							</div>
						</li>
					))}
				</ol>
				<p className="mt-6 pt-5 border-t border-white/10 text-xs text-neutral-500 leading-relaxed">
					Every ballot is a public testnet transaction — auditable by anyone,
					tallied directly from the chain. This is a pilot; no mainnet funds are
					involved.
				</p>
			</div>
		</div>
	);
}

// ── Empty / draft state ────────────────────────────────────────────────────

function EmptyState() {
	const [howOpen, setHowOpen] = useState(false);
	return (
		<>
			<TopBar onHowItWorks={() => setHowOpen(true)} />
			<div className="max-w-2xl mx-auto px-4 sm:px-6 pt-28 pb-32 text-center">
				<I3Mark className="mx-auto mb-8 h-16 w-16 text-neutral-600" />
				<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-3">
					The stage is being set
				</h1>
				<p className="text-neutral-400 leading-relaxed">
					The i³ Awards ballot isn't live yet. Check back soon.
				</p>
			</div>
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
			<button
				type="button"
				onClick={primary.onClick}
				disabled={primary.disabled}
				className={`inline-flex items-center justify-center gap-2 h-11 rounded-full bg-white px-6 text-sm font-semibold text-black transition-all duration-150 hover:bg-neutral-200 active:scale-[0.98] disabled:bg-neutral-700 disabled:text-neutral-400 ${
					full ? "w-full" : "flex-shrink-0"
				}`}
			>
				{primary.loading ? (
					<Loader2 className="h-4 w-4 animate-spin" />
				) : (
					!address && <Wallet className="h-4 w-4" />
				)}
				{primary.label}
			</button>
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
			<header className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-10 text-center">
				<h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-foreground leading-[1.05] mb-5">
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
						<span className="text-neutral-400 rounded-full border border-white/10 px-3 py-1">
							Voting is not open right now
							{voting.reason ? ` — ${voting.reason}` : ""}
						</span>
					)}
				</div>
			</header>

			{/* ── Submitted confirmation ── */}
			{phase === "submitted" && txHash && (
				<div className="max-w-2xl mx-auto px-4 sm:px-6 mb-10 animate-fade-in-up">
					<div className="relative overflow-hidden rounded-2xl border border-white/12 bg-[#0f0f0f] p-6 sm:p-7 text-center">
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
										["--sm-c" as string]: i % 2 === 0 ? "#ffffff" : "#a3a3a3",
									}}
								/>
							))}
						</span>
						<span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white">
							<Check className="h-6 w-6 text-black" strokeWidth={3} />
						</span>
						<h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-2">
							Your vote is on-chain
						</h2>
						<p className="text-sm text-neutral-400 leading-relaxed mb-4">
							Recorded as a Stellar testnet transaction.
							{closesLabel && (
								<>
									{" "}
									You can change it until{" "}
									<span className="text-neutral-200">{closesLabel}</span> — pick
									again and resubmit.
								</>
							)}
						</p>
						<a
							href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300 hover:text-foreground transition-colors"
						>
							View transaction {shortAddress(txHash)}
							<ArrowUpRight className="h-4 w-4" />
						</a>
					</div>
				</div>
			)}

			{/* ── Read-only notice ── */}
			{readOnly && (
				<div className="max-w-2xl mx-auto px-4 sm:px-6 mb-8">
					<div className="rounded-xl border border-white/10 bg-[#0f0f0f] p-4 flex items-start gap-3">
						<Eye className="h-5 w-5 mt-0.5 text-neutral-500 flex-shrink-0" />
						<p className="text-sm text-neutral-400 leading-relaxed">
							<span className="text-foreground font-medium">Read-only.</span>{" "}
							{address ? shortAddress(address) : "This address"} isn't on the
							Pilot voter list — the nominees are still worth a look.
						</p>
					</div>
				</div>
			)}

			{/* ── Two-column: grid + ballot rail ── */}
			<div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-8 pb-32 lg:pb-20">
				{/* nominee grid */}
				<div className="lg:col-span-8 space-y-14">
					{categories.map((category, index) => (
						<section key={category.key} aria-label={category.name}>
							<div className="mb-5 flex items-baseline gap-3">
								<span className="font-mono text-xs tabular-nums text-neutral-600">
									{String(index + 1).padStart(2, "0")}
								</span>
								<div>
									<h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground">
										{category.name}
									</h2>
									{category.tagline && (
										<p className="mt-0.5 text-sm text-neutral-500">
											{category.tagline}
										</p>
									)}
								</div>
							</div>
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
								{(nomineesByCategory.get(category.key) ?? []).map((nominee) => (
									<NomineeCard
										key={nominee.slug}
										nominee={nominee}
										selected={selections[category.key] === nominee.slug}
										disabled={readOnly || !voting.open}
										onToggle={() => toggleNominee(category.key, nominee.slug)}
									/>
								))}
							</div>
						</section>
					))}
				</div>

				{/* ballot rail (desktop) */}
				<aside className="hidden lg:block lg:col-span-4">
					<div className="sticky top-20 rounded-2xl border border-white/12 bg-[#0d0d0d] p-5">
						<div className="flex items-center justify-between mb-4">
							<h3 className="text-sm font-semibold text-foreground">
								Your ballot
							</h3>
							<span className="text-xs tabular-nums text-neutral-500">
								{selectedCount}/{categories.length}
							</span>
						</div>
						<ul className="space-y-2.5 mb-5">
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
										<span
											className={`text-sm font-medium truncate text-right ${
												picked ? "text-foreground" : "text-neutral-600"
											}`}
										>
											{picked ?? "—"}
										</span>
									</li>
								);
							})}
						</ul>
						{error && (
							<p className="mb-3 text-xs text-red-400 flex items-start gap-1.5">
								<X className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
								{error}
							</p>
						)}
						{voting.open && !readOnly && <PrimaryButton full />}
						{closesLabel && voting.open && (
							<p className="mt-3 text-[11px] text-neutral-600 text-center leading-relaxed">
								One signature. Change it anytime before {closesLabel}.
							</p>
						)}
					</div>
				</aside>
			</div>

			{/* ── Mobile sticky bar ── */}
			{voting.open && !readOnly && (
				<div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/85 backdrop-blur-xl">
					<div
						className="max-w-6xl mx-auto px-4 py-3"
						style={{
							paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
						}}
					>
						{error && (
							<p className="mb-2 text-xs text-red-400 flex items-center gap-1.5">
								<X className="h-3.5 w-3.5 flex-shrink-0" />
								{error}
							</p>
						)}
						<div className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2 min-w-0">
								<div className="flex items-center gap-1">
									{categories.map((c) => (
										<span
											key={c.key}
											title={c.name}
											className="h-2 w-2 rounded-full transition-all"
											style={
												selections[c.key]
													? { background: "#fff" }
													: {
															border: "1px solid rgba(255,255,255,0.25)",
														}
											}
										/>
									))}
								</div>
								<span className="text-sm font-medium text-foreground">
									{selectedCount} of {categories.length}
								</span>
							</div>
							<PrimaryButton />
						</div>
					</div>
				</div>
			)}

			{/* ── Wallet picker ── */}
			<Drawer open={walletOpen} onOpenChange={setWalletOpen}>
				<DrawerContent>
					<DrawerHeader className="text-center sm:text-center">
						<DrawerTitle className="text-xl font-semibold">
							Connect a wallet
						</DrawerTitle>
						<DrawerDescription>
							You'll sign a Stellar <strong>testnet</strong> transaction — no
							real funds are involved.
						</DrawerDescription>
					</DrawerHeader>
					<div className="mx-auto w-full max-w-sm space-y-2 pb-6">
						{error && (
							<p className="text-xs text-red-400 text-center pb-1 flex items-center justify-center gap-1.5">
								<X className="h-3.5 w-3.5 flex-shrink-0" />
								{error}
							</p>
						)}
						{AWARDS_WALLETS.map((wallet) => (
							<button
								key={wallet.id}
								type="button"
								disabled={phase === "connecting"}
								onClick={() => handleConnect(wallet.id)}
								className="w-full rounded-xl border border-white/10 bg-[#111] px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:border-white/25 transition-colors disabled:opacity-60"
							>
								<span>
									<span className="block text-sm font-semibold text-foreground">
										{wallet.name}
									</span>
									<span className="block text-xs text-neutral-500">
										{wallet.hint}
									</span>
								</span>
								{phase === "connecting" ? (
									<Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
								) : (
									<ChevronRight className="h-4 w-4 text-neutral-500" />
								)}
							</button>
						))}
					</div>
				</DrawerContent>
			</Drawer>

			<HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
		</>
	);
}

// ── Nominee card ───────────────────────────────────────────────────────────

function NomineeCard({
	nominee,
	selected,
	disabled,
	onToggle,
}: {
	nominee: Nominee;
	selected: boolean;
	disabled: boolean;
	onToggle: () => void;
}) {
	const [logoError, setLogoError] = useState(false);
	const logoSrc = !logoError && nominee.logoUrl ? nominee.logoUrl : "/logo.png";

	return (
		<button
			type="button"
			aria-pressed={selected}
			disabled={disabled}
			onClick={onToggle}
			className={`group relative rounded-xl border p-4 text-left flex flex-col min-h-[150px] transition-colors duration-150 disabled:cursor-default ${
				selected
					? "border-white bg-white/[0.05]"
					: "border-white/10 bg-[#111] hover:border-white/25"
			}`}
		>
			{/* selection badge */}
			<span
				className={`absolute top-3.5 right-3.5 flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
					selected
						? "bg-white border-white"
						: "border-white/20 group-hover:border-white/40"
				}`}
				aria-hidden="true"
			>
				{selected && <Check className="h-3 w-3 text-black" strokeWidth={3.5} />}
			</span>

			<div className="flex items-center gap-3 mb-2.5 pr-7">
				<Image
					src={logoSrc}
					alt=""
					width={36}
					height={36}
					className="rounded-lg object-cover w-9 h-9 flex-shrink-0 border border-white/10 bg-black"
					onError={() => setLogoError(true)}
				/>
				<span className="text-sm font-semibold text-foreground leading-tight">
					{nominee.name}
				</span>
			</div>

			<span className="text-[13px] text-neutral-400 leading-relaxed line-clamp-3 flex-1">
				{nominee.blurb ?? "Shortlisted by the community."}
			</span>

			<span className="mt-3 pt-2.5 border-t border-white/[0.07] flex items-center justify-between">
				<span
					className={`text-xs font-medium ${
						selected ? "text-foreground" : "text-neutral-500"
					}`}
				>
					{selected ? "Selected" : "Tap to select"}
				</span>
				<a
					href={nominee.projectUrl}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="inline-flex items-center gap-0.5 text-xs text-neutral-500 hover:text-foreground transition-colors"
				>
					About
					<ArrowUpRight className="h-3 w-3" />
				</a>
			</span>
		</button>
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
				<header className="text-center mb-14">
					<p className="text-[11px] font-medium uppercase tracking-[0.2em] text-neutral-500 mb-3">
						Voting closed
					</p>
					<h1 className="text-4xl sm:text-6xl font-semibold tracking-tight text-foreground leading-[1.05]">
						{round.title}
					</h1>
					{results && (
						<p className="mt-4 text-sm text-neutral-500">
							{results.turnout.voted} of {results.turnout.whitelisted} Pilots
							voted
						</p>
					)}
				</header>

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
									<h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mb-4 flex items-center gap-2.5">
										<Trophy className="h-5 w-5 text-neutral-300" />
										{category.name}
									</h2>
									{winner && (
										<div className="sm-row rounded-xl border border-white/25 bg-white/[0.04] p-4 mb-2.5">
											<div className="flex items-center justify-between gap-4 mb-3">
												<div className="flex items-center gap-2.5 min-w-0">
													<span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-black flex-shrink-0">
														Winner
													</span>
													<p className="text-base font-semibold text-foreground tracking-tight truncate">
														{winner.name}
													</p>
												</div>
												<span className="text-sm font-semibold tabular-nums text-neutral-300 flex-shrink-0">
													{winner.votes} · {pct(winner.votes)}%
												</span>
											</div>
											<div className="sm-bar-track">
												<div
													className="sm-bar-fill"
													style={{
														width: `${pct(winner.votes)}%`,
														background: "#fff",
													}}
												/>
											</div>
										</div>
									)}
									<ul className="space-y-2">
										{rest.map((r, i) => (
											<li
												key={r.slug}
												className="sm-row rounded-xl border border-white/10 bg-[#111] px-4 py-3"
												style={{ ["--sm-i" as string]: i + 1 }}
											>
												<div className="flex items-center justify-between gap-3 mb-2">
													<span className="text-sm font-medium text-foreground truncate">
														{r.name}
													</span>
													<span className="text-[11px] font-medium tabular-nums text-neutral-500 flex-shrink-0">
														{r.votes} · {pct(r.votes)}%
													</span>
												</div>
												<div className="sm-bar-track" style={{ height: 6 }}>
													<div
														className="sm-bar-fill"
														style={{
															width: `${pct(r.votes)}%`,
															background: "rgba(255,255,255,0.3)",
														}}
													/>
												</div>
											</li>
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
