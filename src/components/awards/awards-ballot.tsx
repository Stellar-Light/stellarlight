"use client";

/**
 * i³ Awards — the voting experience. Mobile-first, award-show feel, built
 * from the site's own tokens (Inter headings, #171717 surfaces, idea-card
 * borders, the #FDDA24 stellar-gold accent) — the Apple Design Awards vibe
 * implemented with OUR design system, not a foreign look. (No font-serif:
 * that token is broken site-wide — globals.css shadows the next/font var.)
 *
 * Interaction model:
 *   - tap a nominee card to pick it (radio per category; tap again to clear)
 *   - a sticky bottom ballot bar tracks "x of N selected" and walks the
 *     voter through connect → sign → submitted
 *   - wallets: Freighter / xBull / Albedo via stellar-wallets-kit, loaded
 *     lazily on first connect (SSR-safe, zero kit JS until needed)
 *   - non-whitelisted addresses get a polite read-only mode
 *   - unfunded testnet accounts get a one-tap friendbot fund (test mode)
 *   - votes are real TESTNET transactions; success links stellar.expert
 *   - closed rounds swap the ballot for a celebratory results reveal
 */

import { format, formatDistanceToNow } from "date-fns";
import {
	ArrowUpRight,
	Check,
	CheckCircle2,
	ChevronRight,
	Eye,
	Loader2,
	Sparkles,
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

const GOLD = "#FDDA24";

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

// ── Empty / draft state ────────────────────────────────────────────────────

function EmptyState() {
	return (
		<div className="max-w-2xl mx-auto px-4 sm:px-6 pt-24 pb-32 text-center">
			<I3Mark className="mx-auto mb-8" />
			<h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
				The stage is being set
			</h1>
			<p className="text-muted-foreground leading-relaxed">
				The i³ Awards ballot isn't live yet. Check back soon.
			</p>
		</div>
	);
}

// ── The i³ mark ────────────────────────────────────────────────────────────
// Inline SVG (not gradient-clipped text — that clips glyphs) so the mark
// renders identically everywhere. Gold ring + "i³" echoes an award medal.

function I3Mark({ className = "" }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 96 96"
			className={`inline-block h-20 w-20 sm:h-24 sm:w-24 select-none ${className}`}
			aria-hidden="true"
			role="img"
		>
			<defs>
				<linearGradient id="i3gold" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0%" stopColor="#FFF3B0" />
					<stop offset="45%" stopColor={GOLD} />
					<stop offset="100%" stopColor="#B8930A" />
				</linearGradient>
			</defs>
			<circle
				cx="48"
				cy="48"
				r="45"
				fill="none"
				stroke="url(#i3gold)"
				strokeWidth="2"
				opacity="0.9"
			/>
			<circle
				cx="48"
				cy="48"
				r="38"
				fill="none"
				stroke="#2F2F2F"
				strokeWidth="1"
			/>
			<text
				x="44"
				y="66"
				textAnchor="middle"
				fontFamily="var(--font-sans), Inter, sans-serif"
				fontWeight="700"
				fontSize="52"
				fill="url(#i3gold)"
			>
				i
			</text>
			<text
				x="60"
				y="46"
				textAnchor="middle"
				fontFamily="var(--font-sans), Inter, sans-serif"
				fontWeight="700"
				fontSize="26"
				fill="url(#i3gold)"
			>
				3
			</text>
		</svg>
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

	return (
		<div className="pb-40">
			{/* ── Hero ── */}
			<header className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-12 text-center">
				<I3Mark className="mb-6" />
				<p className="mb-4">
					<span
						className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em]"
						style={{
							background: `${GOLD}14`,
							color: GOLD,
							border: `1px solid ${GOLD}33`,
						}}
					>
						Stellar Community Awards · Testnet vote
					</span>
				</p>
				<h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-tight mb-5">
					{round.title}
				</h1>
				<p className="text-muted-foreground text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
					Three categories. One pick in each. SCF Pilots choose the projects
					that defined the year — for their{" "}
					<em className="not-italic font-medium text-foreground">impact</em>,{" "}
					<em className="not-italic font-medium text-foreground">innovation</em>{" "}
					and{" "}
					<em className="not-italic font-medium text-foreground">
						interoperability
					</em>
					.
				</p>
				{round.closesAt && voting.open && (
					<p className="mt-5 text-sm text-muted-foreground">
						Voting closes{" "}
						<span className="text-foreground font-medium">
							{formatDistanceToNow(new Date(round.closesAt), {
								addSuffix: true,
							})}
						</span>
					</p>
				)}
				{!voting.open && (
					<p className="mt-5 inline-block text-sm rounded-full border border-border bg-card px-4 py-1.5 text-muted-foreground">
						Voting is not open right now
						{voting.reason ? ` — ${voting.reason}` : ""}.
					</p>
				)}
			</header>

			{/* ── Submitted confirmation ── */}
			{phase === "submitted" && txHash && (
				<div className="max-w-2xl mx-auto px-4 sm:px-6 mb-10 animate-fade-in-up">
					<div
						className="relative rounded-[18px] border p-6 sm:p-8 text-center overflow-hidden"
						style={{
							borderColor: `${GOLD}66`,
							background: `linear-gradient(180deg, ${GOLD}14, #171717)`,
							boxShadow: `0 8px 32px ${GOLD}1A`,
						}}
					>
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
										["--sm-c" as string]:
											i % 3 === 0 ? "#FFF3B0" : i % 3 === 1 ? GOLD : "#B8930A",
									}}
								/>
							))}
						</span>
						<span
							className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
							style={{ background: GOLD }}
						>
							<Check className="h-7 w-7 text-[#171717]" strokeWidth={3} />
						</span>
						<h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground mb-2">
							Your vote is on-chain
						</h2>
						<p className="text-sm text-muted-foreground leading-relaxed mb-4">
							Recorded as a Stellar testnet transaction.
							{closesLabel && (
								<>
									{" "}
									You can change your vote until{" "}
									<span className="text-foreground">{closesLabel}</span> — just
									pick again and resubmit.
								</>
							)}
						</p>
						<a
							href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-sm font-medium text-stellar-gold hover:underline"
						>
							View transaction {shortAddress(txHash)}
							<ArrowUpRight className="h-4 w-4" />
						</a>
					</div>
				</div>
			)}

			{/* ── Read-only notice ── */}
			{readOnly && (
				<div className="max-w-2xl mx-auto px-4 sm:px-6 mb-10">
					<div className="idea-card rounded-2xl p-5 flex items-start gap-3">
						<Eye className="h-5 w-5 mt-0.5 text-muted-foreground flex-shrink-0" />
						<div>
							<p className="text-sm font-medium text-foreground mb-1">
								You're browsing in read-only mode
							</p>
							<p className="text-sm text-muted-foreground leading-relaxed">
								The connected address {address ? shortAddress(address) : ""}{" "}
								isn't on this round's voter list. Voting is open to SCF Pilot
								addresses — but the nominees below are worth a look either way.
							</p>
						</div>
					</div>
				</div>
			)}

			{/* ── Categories ── */}
			<div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-16">
				{categories.map((category, index) => (
					<section key={category.key} aria-label={category.name}>
						<div className="mb-6 flex items-center gap-3.5">
							<span
								className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold tabular-nums flex-shrink-0"
								style={{ background: `${GOLD}1F`, color: GOLD }}
							>
								{String(index + 1).padStart(2, "0")}
							</span>
							<div>
								<h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground">
									{category.name}
								</h2>
								{category.tagline && (
									<p className="mt-1 text-sm sm:text-base text-muted-foreground">
										{category.tagline}
									</p>
								)}
							</div>
						</div>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
							{(nomineesByCategory.get(category.key) ?? []).map((nominee) => (
								<NomineeCard
									key={nominee.slug}
									nominee={nominee}
									selected={selections[category.key] === nominee.slug}
									dimmed={
										Boolean(selections[category.key]) &&
										selections[category.key] !== nominee.slug
									}
									disabled={readOnly || !voting.open}
									onToggle={() => toggleNominee(category.key, nominee.slug)}
								/>
							))}
						</div>
					</section>
				))}
			</div>

			{/* ── Sticky ballot bar ── */}
			{voting.open && !readOnly && (
				<div className="fixed inset-x-0 bottom-0 z-40">
					<div
						className="rounded-t-[20px] border-t border-x border-white/10 bg-[#171717]/92 backdrop-blur-xl shadow-[0_-8px_32px_rgba(0,0,0,0.5)] sm:mx-4"
						style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
					>
						<div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4">
							{error && (
								<p className="mb-2 text-xs sm:text-sm text-red-400 flex items-center gap-1.5">
									<X className="h-3.5 w-3.5 flex-shrink-0" />
									{error}
								</p>
							)}
							<div className="flex items-center justify-between gap-3">
								{/* progress */}
								<div className="flex items-center gap-3 min-w-0">
									<div className="flex items-center gap-1.5">
										{categories.map((c) => (
											<span
												key={c.key}
												title={c.name}
												className="h-2.5 w-2.5 rounded-full border transition-all duration-200"
												style={
													selections[c.key]
														? {
																background: GOLD,
																borderColor: GOLD,
																boxShadow: `0 0 8px ${GOLD}80`,
															}
														: { borderColor: "#525252" }
												}
											/>
										))}
									</div>
									<div className="min-w-0">
										<p className="text-sm font-medium text-foreground truncate">
											{selectedCount} of {categories.length} selected
										</p>
										{address && (
											<button
												type="button"
												onClick={handleDisconnect}
												className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate"
											>
												{shortAddress(address)} · disconnect
											</button>
										)}
									</div>
								</div>

								{/* action */}
								{!address ? (
									<button
										type="button"
										onClick={() => setWalletOpen(true)}
										className="btn-primary inline-flex items-center gap-2 rounded-full px-5 sm:px-6 h-11 text-sm font-semibold flex-shrink-0"
									>
										<Wallet className="h-4 w-4" />
										Connect wallet
									</button>
								) : eligibility?.funded === false ? (
									<button
										type="button"
										onClick={handleFund}
										disabled={funding}
										className="btn-secondary inline-flex items-center gap-2 rounded-full px-5 sm:px-6 h-11 text-sm font-semibold flex-shrink-0 disabled:opacity-60"
									>
										{funding ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<Sparkles className="h-4 w-4" />
										)}
										{funding ? "Funding…" : "Fund on testnet"}
									</button>
								) : (
									<button
										type="button"
										onClick={handleSubmit}
										disabled={selectedCount === 0 || busy}
										className="inline-flex items-center gap-2 rounded-full px-6 sm:px-7 h-12 text-sm font-extrabold flex-shrink-0 transition-all duration-200 disabled:opacity-40 active:scale-[0.97]"
										style={{
											background: selectedCount > 0 && !busy ? GOLD : "#404040",
											color: selectedCount > 0 && !busy ? "#171717" : "#A3A3A3",
											boxShadow:
												selectedCount > 0 && !busy
													? `0 2px 16px ${GOLD}40`
													: "none",
										}}
									>
										{busy ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<ChevronRight className="h-4 w-4" />
										)}
										{phase === "requesting"
											? "Preparing ballot…"
											: phase === "signing"
												? "Waiting for wallet…"
												: phase === "submitting"
													? "Submitting…"
													: votedBefore || phase === "submitted"
														? "Update vote"
														: "Sign & submit"}
									</button>
								)}
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ── Wallet picker ── */}
			<Drawer open={walletOpen} onOpenChange={setWalletOpen}>
				<DrawerContent>
					<DrawerHeader className="text-center sm:text-center">
						<DrawerTitle className="text-2xl font-semibold">
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
								className="idea-card w-full rounded-xl px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:border-white/25 transition-all disabled:opacity-60"
							>
								<span>
									<span className="block text-sm font-semibold text-foreground">
										{wallet.name}
									</span>
									<span className="block text-xs text-muted-foreground">
										{wallet.hint}
									</span>
								</span>
								{phase === "connecting" ? (
									<Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
								) : (
									<ChevronRight className="h-4 w-4 text-muted-foreground" />
								)}
							</button>
						))}
					</div>
				</DrawerContent>
			</Drawer>
		</div>
	);
}

// ── Nominee card ───────────────────────────────────────────────────────────

function NomineeCard({
	nominee,
	selected,
	dimmed,
	disabled,
	onToggle,
}: {
	nominee: Nominee;
	selected: boolean;
	dimmed: boolean;
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
			className={`group relative rounded-[18px] border p-5 text-left flex flex-col min-h-[184px] transition-all duration-300 disabled:cursor-default ${
				dimmed ? "opacity-55" : ""
			} ${selected ? "scale-[1.015]" : disabled ? "" : "active:scale-[0.985] hover:border-white/20"}`}
			style={
				selected
					? {
							borderColor: GOLD,
							boxShadow: `0 0 0 1px ${GOLD}, 0 8px 32px ${GOLD}26`,
							background: `linear-gradient(180deg, ${GOLD}0F, #1c1c1c)`,
						}
					: {
							background: "#171717",
							borderColor: "rgba(255,255,255,0.08)",
							boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
						}
			}
		>
			{/* selection badge */}
			<span
				className={`absolute top-3.5 right-3.5 flex h-6 w-6 items-center justify-center rounded-full border transition-all duration-200 ${
					selected ? "" : "border-[#525252] group-hover:border-white/40"
				}`}
				style={selected ? { background: GOLD, borderColor: GOLD } : undefined}
				aria-hidden="true"
			>
				{selected && (
					<Check className="h-3.5 w-3.5 text-[#171717]" strokeWidth={3.5} />
				)}
			</span>

			<div className="flex items-center gap-3 mb-3 pr-8">
				<Image
					src={logoSrc}
					alt=""
					width={44}
					height={44}
					className="rounded-full object-cover w-11 h-11 flex-shrink-0 border"
					style={{
						background: "#0f0f0f",
						borderColor: "rgba(255,255,255,0.1)",
					}}
					onError={() => setLogoError(true)}
				/>
				<span className="text-[15px] font-bold text-foreground leading-tight tracking-tight">
					{nominee.name}
				</span>
			</div>

			<span className="text-sm text-muted-foreground leading-relaxed line-clamp-3 flex-1">
				{nominee.blurb ?? "Shortlisted by the community."}
			</span>

			<span className="mt-4 pt-3 border-t border-white/[0.07] flex items-center justify-between">
				<span
					className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold transition-all duration-150"
					style={
						selected
							? { background: `${GOLD}1F`, color: GOLD }
							: {
									border: "1px solid rgba(255,255,255,0.12)",
									color: "var(--muted-foreground, #8e8e97)",
								}
					}
				>
					{selected ? "Your pick" : "Select"}
				</span>
				<a
					href={nominee.projectUrl}
					target="_blank"
					rel="noopener noreferrer"
					onClick={(e) => e.stopPropagation()}
					className="inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
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
		<div className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-32">
			<header className="text-center mb-14">
				<I3Mark className="mb-6" />
				<p className="mb-4">
					<span
						className="inline-flex items-center rounded-full px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.18em]"
						style={{
							background: `${GOLD}14`,
							color: GOLD,
							border: `1px solid ${GOLD}33`,
						}}
					>
						Voting closed
					</span>
				</p>
				<h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground leading-tight">
					{round.title}
				</h1>
				{results && (
					<p className="mt-4 text-sm text-muted-foreground">
						{results.turnout.voted} of {results.turnout.whitelisted} Pilots
						voted
					</p>
				)}
			</header>

			{!results && !failed && (
				<p className="text-center text-muted-foreground">
					<Loader2 className="inline h-4 w-4 animate-spin mr-2" />
					Reading the tally from chain…
				</p>
			)}
			{failed && (
				<p className="text-center text-muted-foreground">
					The tally isn't available right now — try again shortly.
				</p>
			)}

			{results && (
				<div className="space-y-10">
					{results.categories.map((category) => {
						const [winner, ...rest] = category.results;
						const total = Math.max(1, category.totalVotes);
						const pct = (votes: number) => Math.round((votes / total) * 100);
						return (
							<section key={category.key}>
								<h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground mb-4 flex items-center gap-2.5">
									<Trophy className="h-5 w-5" style={{ color: GOLD }} />
									{category.name}
								</h2>
								{winner && (
									<div
										className="sm-row rounded-[18px] border p-5 mb-3"
										style={{
											borderColor: `${GOLD}66`,
											background: `linear-gradient(180deg, ${GOLD}12, #171717)`,
											boxShadow: `0 8px 32px ${GOLD}1A`,
										}}
									>
										<div className="flex items-center justify-between gap-4 mb-3">
											<div className="flex items-center gap-2.5 min-w-0">
												<span
													className="inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold flex-shrink-0"
													style={{ background: `${GOLD}1F`, color: GOLD }}
												>
													Winner
												</span>
												<p className="text-lg font-bold text-foreground tracking-tight truncate">
													{winner.name}
												</p>
											</div>
											<span
												className="rounded-md px-2 py-0.5 text-sm font-extrabold tabular-nums flex-shrink-0"
												style={{ background: `${GOLD}1F`, color: GOLD }}
											>
												{winner.votes} · {pct(winner.votes)}%
											</span>
										</div>
										<div className="sm-bar-track">
											<div
												className="sm-bar-fill"
												style={{
													width: `${pct(winner.votes)}%`,
													background: GOLD,
												}}
											/>
										</div>
									</div>
								)}
								<ul className="space-y-2">
									{rest.map((r, i) => (
										<li
											key={r.slug}
											className="sm-row rounded-[14px] border px-4 py-3"
											style={{
												background: "#171717",
												borderColor: "rgba(255,255,255,0.08)",
												["--sm-i" as string]: i + 1,
											}}
										>
											<div className="flex items-center justify-between gap-3 mb-2">
												<span className="text-sm font-semibold text-foreground truncate">
													{r.name}
												</span>
												<span
													className="rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-muted-foreground flex-shrink-0"
													style={{ background: "rgba(255,255,255,0.07)" }}
												>
													{r.votes} · {pct(r.votes)}%
												</span>
											</div>
											<div className="sm-bar-track" style={{ height: 6 }}>
												<div
													className="sm-bar-fill"
													style={{
														width: `${pct(r.votes)}%`,
														background: "rgba(255,255,255,0.28)",
													}}
												/>
											</div>
										</li>
									))}
								</ul>
							</section>
						);
					})}
					<p className="text-center text-xs text-muted-foreground pt-4">
						<CheckCircle2 className="inline h-3.5 w-3.5 mr-1" />
						Tallied directly from Stellar testnet — every vote is a public,
						verifiable transaction.
					</p>
				</div>
			)}
		</div>
	);
}
