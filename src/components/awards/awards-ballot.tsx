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
	ChevronDown,
	ChevronRight,
	Copy,
	Eye,
	Info,
	Loader2,
	LogOut,
	Trophy,
	Wallet,
	X,
} from "lucide-react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
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
		/** Nominees a voter may pick per category. 1 = pick the winner. */
		picksPerCategory?: number | null;
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
	votes: Record<string, string[]> | null;
	/** chain OR mirror. null = we could not check — treated as "can't vote". */
	hasVoted?: boolean | null;
	friendbot?: string;
}

/**
 * The routes send a machine `error` code AND a human `message`. Show the
 * sentence — a toast reading "already_voted" is the code leaking into the UI.
 */
function apiErrorMessage(body: unknown, fallback: string): string {
	const b = body as { message?: unknown; error?: unknown } | null;
	if (typeof b?.message === "string" && b.message) return b.message;
	if (typeof b?.error === "string" && b.error) return b.error;
	return fallback;
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

// Votes are TESTNET transactions; every proof link points at stellar.expert's
// testnet explorer. Kept in one place so the tx and account links can't drift.
const EXPLORER = "https://stellar.expert/explorer/testnet";
const explorerTxUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
const explorerAccountUrl = (address: string) =>
	`${EXPLORER}/account/${address}`;

function shortAddress(address: string): string {
	return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

// ── Root component ─────────────────────────────────────────────────────────

export function AwardsBallot({ data }: { data: AwardsRoundData | null }) {
	if (!data || data.round.status === "draft") {
		return <EmptyState picks={data?.round.picksPerCategory ?? 1} />;
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
			<title>i³</title>
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
				fontSize="46"
				fontWeight="600"
				fill="currentColor"
			>
				i
			</text>
			<text
				x="62"
				y="44"
				textAnchor="middle"
				fontFamily="var(--font-sans), Inter, sans-serif"
				fontSize="26"
				fontWeight="600"
				fill="currentColor"
			>
				3
			</text>
		</svg>
	);
}

// ── Top bar (persistent) ───────────────────────────────────────────────────

/**
 * Connected-wallet control: the address pill opens a small menu (full address,
 * copy, verify-on-chain, disconnect). Previously a bare click on the pill
 * disconnected instantly with no affordance — easy to trigger by accident and
 * with no way to see or copy the full key. This is the RainbowKit pattern:
 * the pill is a disclosure, the destructive action lives one step in.
 */
function ConnectedWallet({
	address,
	walletId,
	onDisconnect,
}: {
	address: string;
	walletId: AwardsWalletId | null;
	onDisconnect: () => void;
}) {
	const wallet = AWARDS_WALLETS.find((w) => w.id === walletId) ?? null;
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const onDown = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node))
				setOpen(false);
		};
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
		document.addEventListener("mousedown", onDown);
		document.addEventListener("keydown", onKey);
		return () => {
			document.removeEventListener("mousedown", onDown);
			document.removeEventListener("keydown", onKey);
		};
	}, [open]);

	const copy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(address);
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		} catch {
			// clipboard blocked — the address is visible to select by hand.
		}
	}, [address]);

	return (
		<div ref={ref} className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-haspopup="menu"
				aria-expanded={open}
				className="inline-flex items-center gap-2 h-9 rounded-full border border-[#2f2f2f] pl-3 pr-2.5 text-sm font-medium text-neutral-100 hover:border-[#454545] transition-colors"
			>
				{wallet ? (
					<Image
						src={wallet.icon}
						alt=""
						width={20}
						height={20}
						className="h-5 w-5 flex-shrink-0 rounded-full ring-1 ring-[#3a3a3a]"
					/>
				) : (
					<span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
				)}
				{shortAddress(address)}
				<ChevronDown
					className={`h-3.5 w-3.5 text-neutral-400 transition-transform ${
						open ? "rotate-180" : ""
					}`}
				/>
			</button>
			<AnimatePresence>
				{open && (
					<motion.div
						initial={{ opacity: 0, y: -6, scale: 0.97 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{
							opacity: [1, 1, 0],
							y: [0, 0, -6],
							scale: [1, 1, 0.97],
							transition: { duration: 0.3, times: [0, 0.62, 1], ease: EASE },
						}}
						transition={{ duration: 0.16, ease: EASE }}
						role="menu"
						className="absolute right-0 mt-2 w-64 rounded-2xl border border-[#2f2f2f] bg-[#1c1c1c] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.5)] z-50"
					>
						<div className="flex items-center gap-3 px-2.5 pb-2.5 pt-2">
							<Stroopy size={44} badge={wallet?.icon} />
							<div className="min-w-0">
								<p className="text-sm font-medium text-neutral-100">
									{wallet?.name ?? "Connected wallet"}
								</p>
								<p className="truncate font-mono text-xs text-neutral-400">
									{shortAddress(address)}
								</p>
							</div>
						</div>
						<div className="h-px bg-[#2a2a2a] my-1" />
						<button
							type="button"
							role="menuitem"
							onClick={copy}
							className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-200 hover:bg-[#242424] transition-colors"
						>
							{copied ? (
								<Check className="h-4 w-4 text-emerald-400" />
							) : (
								<Copy className="h-4 w-4 text-neutral-400" />
							)}
							{copied ? "Copied" : "Copy address"}
						</button>
						<a
							role="menuitem"
							href={explorerAccountUrl(address)}
							target="_blank"
							rel="noopener noreferrer"
							onClick={() => setOpen(false)}
							className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-200 hover:bg-[#242424] transition-colors"
						>
							<ArrowUpRight className="h-4 w-4 text-neutral-400" />
							View on explorer
						</a>
						<button
							type="button"
							role="menuitem"
							onClick={() => {
								setOpen(false);
								onDisconnect();
							}}
							className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-neutral-300 hover:bg-[#242424] hover:text-neutral-100 transition-colors"
						>
							<LogOut className="h-4 w-4 text-neutral-400" />
							Disconnect
						</button>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function TopBar({
	onHowItWorks,
	wallet,
}: {
	onHowItWorks: () => void;
	wallet?: {
		address: string | null;
		walletId: AwardsWalletId | null;
		busy: boolean;
		onConnect: () => void;
		onDisconnect: () => void;
	};
}) {
	return (
		<div className="sticky top-0 z-40 border-b border-[#2a2a2a] bg-[#171717]/80 backdrop-blur-xl">
			<div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
				<div className="flex items-center gap-2.5 min-w-0">
					{/* The cube, not the flat medallion — the same mark the hero rolls.
					    It takes its size from the font-size, so the wrapper carries one:
					    the cube's edge and its half-depth are both in em off this, and
					    22px lands it on the 24px the medallion occupied. */}
					<span className="flex-shrink-0 text-[22px] leading-none">
						<CubeMark />
					</span>
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
							<ConnectedWallet
								address={wallet.address}
								walletId={wallet.walletId}
								onDisconnect={wallet.onDisconnect}
							/>
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

function hiwSteps(picks: number) {
	return [
		{
			t: "Connect a Pilot wallet",
			d: "Freighter, xBull or Albedo. Only whitelisted SCF Pilot addresses can cast a ballot. Anyone else can browse read-only. Nothing to fund: the testnet account is taken care of for you.",
		},
		picks > 1
			? {
					t: `Nominate ${picks} per category`,
					d: `Put forward ${picks} projects in each of Impact, Innovation and Interoperability. The most-nominated four in each become the shortlist for the final vote.`,
				}
			: {
					t: "Pick one per category",
					d: "Choose the project you think best defined the year for Impact, Innovation and Interoperability.",
				},
		{
			t: "Sign one transaction",
			d: "Your whole ballot is written to your own Stellar testnet account in a single signature. No real funds, ever.",
		},
		{
			t: "Your first ballot is final",
			d: "One ballot per voter. The first one you cast is the one that counts, and it can't be replaced. The tally is published in aggregate and is publicly verifiable.",
		},
	];
}

/**
 * Explainer art. Four steps, four different mechanisms — and each shows a REAL
 * control from this product doing what the step describes: the Connect button
 * changing state, a nominee card being chosen, the wallet sheet confirming,
 * the receipt's Stellar stamp pressing down on the finished ballot.
 * Decorative, so aria-hidden; the copy carries the meaning. Motion lives in
 * awards.css.
 */
function BallotArt({ step }: { step: number }) {
	return (
		<div className="sm-art" key={step} aria-hidden="true">
			{step === 0 && (
				<div className="sm-connect">
					<span className="sm-conn-a">Connect wallet</span>
					<span className="sm-conn-b">
						<i />
						GDNP…HWOE
					</span>
					<span className="sm-clickring" />
					<span className="sm-cursor">
						<i>
							<svg viewBox="-2 -2 19 25" role="presentation">
								<path
									d="M0 0 0 15.96 3.75 12.18 6.75 21 9.9 18.9 7.05 10.5 11.7 10.08Z"
									fill="#fafafa"
									stroke="#171327"
									strokeWidth="2.6"
									strokeLinejoin="round"
									paintOrder="stroke"
								/>
							</svg>
						</i>
					</span>
				</div>
			)}
			{step === 1 && (
				<div className="sm-pickrow">
					<i className="sm-nom" />
					<i className="sm-nom">
						<span className="sm-check" />
					</i>
					<i className="sm-nom" />
				</div>
			)}
			{step === 2 && (
				<div className="sm-sign">
					<div className="sm-sign-sheet">
						<b />
						<b />
						<b />
						<div className="sm-sign-go" />
					</div>
					<div className="sm-sign-hash" />
				</div>
			)}
			{step === 3 && (
				<div className="sm-seal">
					<div className="sm-seal-sheet">
						<b />
						<b />
						<b />
						<b />
						<b />
					</div>
					<div className="sm-seal-stamp" />
				</div>
			)}
		</div>
	);
}

/**
 * The house curtain. Covers the page on load and parts to reveal the round —
 * the one big theatrical moment, and the reason this page reads as an awards
 * show rather than a form. Fixed, pointer-events:none, and it unmounts itself
 * when the animation ends so it can never sit in front of the ballot. Hidden
 * outright under prefers-reduced-motion (see awards.css).
 */
function StageReveal() {
	const [done, setDone] = useState(false);
	useEffect(() => {
		const t = setTimeout(() => setDone(true), 1800);
		return () => clearTimeout(t);
	}, []);
	if (done) return null;
	const panels = [0, 1, 2, 3, 4, 5];
	return (
		<div className="sm-reveal" aria-hidden="true">
			<div className="sm-reveal-half l">
				{panels.map((n) => (
					<i key={n} />
				))}
			</div>
			<div className="sm-reveal-half r">
				{panels.map((n) => (
					<i key={n} />
				))}
			</div>
		</div>
	);
}

/** The same path the stroke draws and the nib rides — one source of truth. */
const SIGNATURE_PATH =
	"M6 44 C 16 14, 28 10, 32 26 C 36 42, 24 54, 20 45 C 16 36, 32 22, 48 27 C 64 32, 58 50, 69 45 C 80 40, 77 19, 90 22 C 103 25, 98 48, 110 43 C 121 38, 122 23, 134 30 C 145 36, 140 46, 152 41 L 184 38";

/**
 * The i³, as a cube. The intro tumbles 3 → i → i³ on two different axes, then
 * hands control to hover: pointing at it sends the cube to a random face, and
 * leaving brings it home to the mark. The intro is a keyframe animation and
 * hover is a transition, so the animation has to be REMOVED once it ends —
 * a filled animation keeps winning over an inline transform forever.
 */
const CUBE_ORIENTATIONS = [
	{ rx: -90, ry: -90 }, // "3"
	{ rx: 0, ry: -90 }, // "i"
	{ rx: 0, ry: 180 }, // back
	{ rx: 0, ry: 90 }, // left
] as const;

function CubeMark() {
	const [live, setLive] = useState(false);
	const [at, setAt] = useState<{ rx: number; ry: number } | null>(null);
	const spin = useCallback(() => {
		const pick =
			CUBE_ORIENTATIONS[Math.floor(Math.random() * CUBE_ORIENTATIONS.length)];
		setAt(pick);
	}, []);
	return (
		<span
			className="sm-cube"
			onMouseEnter={live ? spin : undefined}
			onMouseLeave={live ? () => setAt(null) : undefined}
			aria-hidden="true"
		>
			<span
				className={`sm-cube-box${live ? " is-live" : ""}`}
				onAnimationEnd={() => setLive(true)}
				style={
					live
						? {
								transform: `rotateX(${at?.rx ?? 0}deg) rotateY(${at?.ry ?? 0}deg)`,
							}
						: undefined
				}
			>
				<span className="sm-cube-face sm-cube-s">
					<b>3</b>
				</span>
				<span className="sm-cube-face sm-cube-r">
					<b>i</b>
				</span>
				<span className="sm-cube-face sm-cube-back">
					<b>i³</b>
				</span>
				<span className="sm-cube-face sm-cube-left">
					<b>3</b>
				</span>
				<span className="sm-cube-face sm-cube-f">
					<b>i³</b>
				</span>
			</span>
		</span>
	);
}

/**
 * Waiting on the network. The hourglass from yui540/css-animations (MIT),
 * monochrome — the sand drains and then the glass turns over, which says
 * "this takes a moment" in a way a spinner never does.
 */
function Hourglass() {
	return (
		<svg className="sm-hourglass" viewBox="0 0 24 24" aria-hidden="true">
			<defs>
				<mask id="sm-hg-m1">
					<path
						fill="#fff"
						d="M6.16174 16.1526L11.9824 12.1111L17.9304 16.1526L17.2949 20.855H6.74632L6.16174 16.1526Z"
					/>
				</mask>
				<mask id="sm-hg-m2">
					<path
						fill="#fff"
						d="M17.9303 8.06956L12.1096 12.1111L6.16169 8.06956L6.79715 3.36718L17.3457 3.36719L17.9303 8.06956Z"
					/>
				</mask>
			</defs>
			<g className="sm-hg-spin">
				<g mask="url(#sm-hg-m1)">
					<rect
						className="sm-hg-sand1"
						x="6.16"
						y="12.11"
						width="11.77"
						height="8.74"
					/>
				</g>
				<g mask="url(#sm-hg-m2)">
					<g className="sm-hg-sand2">
						<rect
							x="17.93"
							y="12.11"
							width="11.77"
							height="8.74"
							transform="rotate(-180 17.93 12.11)"
						/>
					</g>
					<g className="sm-hg-stream">
						<rect
							x="12.84"
							y="12.11"
							width="1.5"
							height="8.74"
							transform="rotate(-180 12.84 12.11)"
						/>
					</g>
				</g>
				<path
					className="sm-hg-frame"
					fillRule="evenodd"
					clipRule="evenodd"
					d="M19 5.38028V6.50704C19 7.7277 18.475 8.76056 17.5125 9.32394L13.6632 11.9526L14.0877 12.232L14.0825 12.2398L17.5125 14.5822C18.475 15.2394 19 16.2723 19 17.493V18.6197C19 20.4977 17.6 22 15.85 22H8.15C6.4 22 5 20.4977 5 18.6197V17.493C5 16.2723 5.525 15.1455 6.4875 14.5822L10.3403 12.016L9.39854 11.396C9.3312 11.3708 9.26465 11.3374 9.2 11.2958L6.4875 9.41784C5.525 8.76056 5 7.7277 5 6.50704V5.38028C5 3.50235 6.4 2 8.15 2H15.85C17.6 2 19 3.50235 19 5.38028ZM10.3606 9.77859C10.3054 9.71327 10.2393 9.65511 10.1625 9.60563L7.45 7.7277C7.0125 7.53991 6.75 7.07042 6.75 6.50704V5.38028C6.75 4.53521 7.3625 3.87793 8.15 3.87793H15.85C16.6375 3.87793 17.25 4.53521 17.25 5.38028V6.50704C17.25 7.07042 16.9875 7.53991 16.55 7.8216L12.0356 10.8812L10.3606 9.77859ZM11.9786 13.0944L7.45 16.1784C7.0125 16.4601 6.75 16.9296 6.75 17.493V18.6197C6.75 19.4648 7.3625 20.1221 8.15 20.1221H15.85C16.6375 20.1221 17.25 19.4648 17.25 18.6197V17.493C17.25 16.9296 16.9875 16.4601 16.55 16.1784L13.0561 13.799L13.054 13.8023L11.9786 13.0944Z"
				/>
			</g>
		</svg>
	);
}

/**
 * The signing moment. While the wallet popup is open the page held nothing but
 * a busy button; now it holds a signature writing itself. Covers the three
 * in-flight phases with the copy that actually tells you what to do.
 */
function SigningOverlay({ phase }: { phase: Phase }) {
	const active =
		phase === "requesting" || phase === "signing" || phase === "submitting";
	const title =
		phase === "requesting"
			? "Preparing your ballot"
			: phase === "signing"
				? "Approve in your wallet"
				: "Recording on Stellar";
	const sub =
		phase === "requesting"
			? "Building the transaction from your picks."
			: phase === "signing"
				? "One signature covers every category. No real funds."
				: "Sending your signed ballot to testnet.";
	return (
		<AnimatePresence>
			{active && (
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.2 }}
					className="sm-signing"
					role="status"
					aria-live="polite"
				>
					<motion.div
						initial={{ opacity: 0, y: 14, scale: 0.98 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 10, scale: 0.98 }}
						transition={{ duration: 0.28, ease: EASE }}
						className="sm-signing-card"
					>
						{phase === "submitting" ? (
							// in flight: the sand drains and the glass turns over
							<div className="mb-5 mt-1" aria-hidden="true">
								<Hourglass />
							</div>
						) : (
							<>
								<div className="sm-sig" aria-hidden="true">
									<svg viewBox="0 0 190 62" role="presentation">
										<path d={SIGNATURE_PATH} />
									</svg>
									<span className="sm-nib" />
								</div>
								<div className="sm-sig-rule" aria-hidden="true" />
							</>
						)}
						<h2 className="mb-2 text-lg font-semibold tracking-tight text-neutral-50">
							{title}
						</h2>
						<p className="text-sm leading-relaxed text-neutral-400">{sub}</p>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	);
}

/**
 * Your ballot prints. The printer belongs HERE rather than in the explainer —
 * this is a receipt actually being issued, one row per category, stamped.
 */
function VoteReceipt() {
	return (
		<div className="sm-receipt" aria-hidden="true">
			<div className="sm-receipt-sheet">
				{[0, 1, 2].map((r) => (
					<span key={r} style={{ ["--sm-i" as string]: r }} />
				))}
			</div>
			<div className="sm-receipt-stamp" />
			<div className="sm-receipt-body" />
		</div>
	);
}

/**
 * The closed stage. Panels drop into place on load, then breathe; they never
 * part, because the round is not open yet — that IS the empty state's message.
 */
function StageCurtain() {
	const panels = [0, 1, 2, 3, 4];
	return (
		<div className="sm-stage" aria-hidden="true">
			<div className="sm-stage-glow" />
			<div className="sm-curtain sm-curtain--l">
				{panels.map((i) => (
					<i key={i} style={{ ["--sm-i" as string]: i }} />
				))}
			</div>
			<div className="sm-curtain sm-curtain--r">
				{panels.map((i) => (
					<i key={i} style={{ ["--sm-i" as string]: i }} />
				))}
			</div>
			<div className="sm-stage-seam" />
			<div className="sm-stage-valance" />
		</div>
	);
}

// Step-through explainer. One step at a time, its own art above the copy,
// dots and a primary action below — the help-card shape, not a slideshow.
function HowItWorks({
	open,
	onClose,
	picks = 1,
}: {
	open: boolean;
	onClose: () => void;
	picks?: number;
}) {
	const [i, setI] = useState(0);
	const [dir, setDir] = useState(1);
	const steps = useMemo(() => hiwSteps(picks), [picks]);
	const last = steps.length - 1;

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

	const step = steps[i];

	return (
		<AnimatePresence>
			{open && (
				<div
					className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
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
						className="relative w-full rounded-t-2xl border border-[#2f2f2f] bg-[#1c1c1c] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.5)] sm:max-w-md sm:rounded-2xl sm:p-6"
					>
						<button
							type="button"
							onClick={onClose}
							aria-label="Close"
							className="absolute right-8 top-8 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-[#3a3a3a] bg-[#1c1c1c]/85 text-neutral-400 backdrop-blur-sm transition-colors hover:border-[#555] hover:text-neutral-100"
						>
							<X className="h-4 w-4" />
						</button>

						<BallotArt step={i} />

						<div className="relative min-h-[128px] overflow-hidden">
							<AnimatePresence mode="wait" initial={false}>
								<motion.div
									key={i}
									initial={{ opacity: 0, x: dir * 28 }}
									animate={{ opacity: 1, x: 0 }}
									exit={{ opacity: 0, x: dir * -28 }}
									transition={{ duration: 0.26, ease: EASE }}
								>
									<h2 className="mb-2.5 text-[22px] font-semibold tracking-tight text-neutral-50">
										{step.t}
									</h2>
									<p className="text-sm leading-relaxed text-neutral-400">
										{step.d}
									</p>
								</motion.div>
							</AnimatePresence>
						</div>

						<div className="mt-5 flex items-center justify-center gap-1.5">
							{steps.map((s, idx) => (
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

						<div className="mt-5 flex items-center gap-2.5">
							{i > 0 && (
								<button
									type="button"
									onClick={() => go(i - 1)}
									className="inline-flex h-11 items-center rounded-full border border-[#2f2f2f] px-5 text-sm font-medium text-neutral-300 transition-colors hover:border-[#454545] hover:text-neutral-100"
								>
									Back
								</button>
							)}
							<motion.button
								type="button"
								whileTap={{ scale: 0.98 }}
								onClick={() => (i < last ? go(i + 1) : onClose())}
								className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-neutral-100 text-sm font-semibold text-black transition-colors hover:bg-white"
							>
								{i < last ? "Next" : "Got it"}
								{i < last && <ChevronRight className="h-4 w-4" />}
							</motion.button>
						</div>
					</motion.div>
				</div>
			)}
		</AnimatePresence>
	);
}

// ── Empty / draft state ────────────────────────────────────────────────────

function EmptyState({ picks = 1 }: { picks?: number }) {
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
				<I3Mark className="mx-auto mb-8 h-12 w-12 text-neutral-600" />
				<StageCurtain />
				<h1 className="mt-10 text-3xl sm:text-4xl font-semibold tracking-tight text-neutral-100 mb-3">
					The stage is being set
				</h1>
				<p className="text-neutral-400 leading-relaxed">
					The i³ Awards ballot isn't live yet. Check back soon.
				</p>
			</motion.div>
			<HowItWorks
				open={howOpen}
				onClose={() => setHowOpen(false)}
				picks={picks}
			/>
		</>
	);
}

// ── Open round: the ballot ─────────────────────────────────────────────────

function OpenBallot({ data }: { data: AwardsRoundData }) {
	const { round, nominees, voting } = data;
	const categories = round.categories;

	const [selections, setSelections] = useState<Record<string, string[]>>({});
	// 1 = the radio ballot (final round). >1 = approval ballot (shortlist round).
	const picksPerCategory = Math.max(1, Math.floor(round.picksPerCategory ?? 1));
	const [address, setAddress] = useState<string | null>(null);
	const [walletId, setWalletId] = useState<AwardsWalletId | null>(null);
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

	// A category counts as done when its SLATE is full — picksPerCategory
	// picks, or every nominee it has if fewer. The nominations phase asks for
	// four per category so four can be shortlisted; the final phase asks for
	// one. Same rule as the relay's requiredPicks, mirrored here so the page
	// never lets someone sign a ballot the relay will refuse.
	const requiredFor = useCallback(
		(categoryKey: string) =>
			Math.min(
				picksPerCategory,
				(nomineesByCategory.get(categoryKey) ?? []).length,
			),
		[picksPerCategory, nomineesByCategory],
	);
	const selectedCount = categories.filter((c) => {
		const need = requiredFor(c.key);
		return need > 0 && (selections[c.key] ?? []).length >= need;
	}).length;
	// The denominator is the categories that CAN be voted — the relay skips a
	// category with no nominees, so requiring it here would keep the button
	// disabled for everyone on a round opened before one category's list
	// landed, with nothing on screen saying why.
	const requiredCount = categories.filter((c) => requiredFor(c.key) > 0).length;
	const notWhitelisted = eligibility !== null && !eligibility.whitelisted;
	// One ballot per voter: the first one counts. `hasVoted` is chain OR
	// mirror, so it stays true after a testnet reset has cleared `votes` —
	// the ballot still exists in our record, and a new one would not count.
	const votedBefore = Boolean(eligibility?.hasVoted ?? eligibility?.votes);
	// null = the server could not check. Not a green light.
	const ballotStatusUnknown = eligibility?.hasVoted === null;
	// No ballot can be cast from here — no wallet is connected, or this address
	// isn't on the list, or it has already voted and that ballot is final. All
	// three mean the picks stop being editable and the CTA goes away, rather
	// than leaving a live form behind a button that will refuse.
	//
	// Disconnected counts. Letting a visitor build a whole ballot first reads
	// as progress and is not: connect, and the picks are either overwritten by
	// whatever the record already holds, or thrown away because the address
	// isn't a Pilot or has already voted. The ask is one click and it comes
	// first.
	const readOnly = !address || notWhitelisted || votedBefore;
	// The ballot surfaces (rail, mobile deck, CTA) stay up while a ballot is
	// still POSSIBLE — which includes "no wallet yet", whose call to action is
	// the connect button itself. Gating those on readOnly would have hidden the
	// one control a disconnected visitor needs. They come down only when this
	// address can never cast one: not a Pilot, or already voted.
	const ballotOpen = voting.open && !notWhitelisted && !votedBefore;
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
				const picked = next[category] ?? [];
				if (picked.includes(slug)) {
					// Tapping a pick again removes it.
					const rest = picked.filter((s) => s !== slug);
					if (rest.length === 0) delete next[category];
					else next[category] = rest;
					return next;
				}
				if (picksPerCategory === 1) {
					// Radio behaviour: the new pick replaces the old one.
					next[category] = [slug];
					return next;
				}
				// Approval behaviour: fill up to the cap, then ignore extra taps
				// (the card is rendered disabled at that point).
				if (picked.length >= picksPerCategory) return prev;
				next[category] = [...picked, slug];
				return next;
			});
		},
		[readOnly, busy, picksPerCategory],
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
			// Not a Pilot address → the ballot goes read-only. Clear any picks
			// they made while browsing disconnected: leaving them selected under
			// a now-disabled "Sign & submit" reads as a castable vote that isn't.
			if (!body.whitelisted) {
				prefilled.current = false;
				setSelections({});
				return body;
			}
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
				setWalletId(walletId);
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
		setWalletId(null);
		setEligibility(null);
		setTxHash(null);
		setPhase("idle");
		prefilled.current = false;
		// Pilot feedback: disconnect must clear the BALLOT too, not just the
		// session. Pilots vote from shared laptops at the venue — voter #2 was
		// seeing voter #1's picks and success banner still on screen.
		setSelections({});
		setError(null);
		setBallotPage(0);
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
				"Opened friendbot in a new tab. Fund the account there, then retry.",
			);
		} finally {
			setFunding(false);
		}
	}, [address, eligibility, refreshEligibility]);

	// ── sign & submit ──
	const handleSubmit = useCallback(async () => {
		// Pilot feedback: the round is one pick in EACH category. Signing a
		// partial ballot burns a wallet signature on an incomplete vote, so the
		// submit path refuses until every category has a pick.
		if (!address || selectedCount !== requiredCount) return;
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
			if (xdrRes.status === 409 && xdrBody?.error === "already_voted") {
				// Not a failure to report — the server is telling us this address
				// already has a ballot. Record it, and the page locks and shows
				// the receipt the way it does for any returning voter.
				setEligibility((prev) => (prev ? { ...prev, hasVoted: true } : prev));
				setPhase("idle");
				return;
			}
			if (!xdrRes.ok) {
				throw new Error(
					apiErrorMessage(xdrBody, "could not prepare the ballot"),
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
			if (submitRes.status === 409 && submitBody?.error === "already_voted") {
				setEligibility((prev) => (prev ? { ...prev, hasVoted: true } : prev));
				setPhase("idle");
				return;
			}
			if (!submitRes.ok) {
				throw new Error(
					apiErrorMessage(submitBody, "the vote could not be submitted"),
				);
			}
			setTxHash(submitBody.hash);
			// hasVoted too, not just votes: it is what locks the ballot, and
			// leaving it stale left a live "Sign & submit" under a cast vote.
			setEligibility((prev) =>
				prev ? { ...prev, votes: { ...selections }, hasVoted: true } : prev,
			);
			setPhase("submitted");
			window.scrollTo({ top: 0, behavior: "smooth" });
		} catch (err) {
			setError(walletErrorMessage(err));
			setPhase("idle");
		}
	}, [address, selections, selectedCount, round.slug]);

	// React #418 (text-content mismatch) on every load came from HERE, not the
	// countdown: date-fns `format` uses the runtime's timezone, so the server
	// pass rendered UTC and the browser rendered the visitor's local time. The
	// two HTML strings disagreed and React threw on hydrate.
	//
	// Fixed by rendering the deadline only AFTER mount — server HTML and the
	// first client render now both omit it, so there is nothing to mismatch, and
	// the local-time string appears a tick later. Both labels derive from the
	// same gate so they can never disagree with each other.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	const closesLabel =
		mounted && round.closesAt
			? format(new Date(round.closesAt), "MMMM d, yyyy 'at' h:mm a")
			: null;
	/** Short form for helper lines — a full timestamp there is noise. */
	const closesShort =
		mounted && round.closesAt
			? format(new Date(round.closesAt), "MMM d")
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
									: selectedCount < requiredCount
										? picksPerCategory > 1
											? `Pick ${picksPerCategory} in each category first`
											: `Pick all ${requiredCount} first`
										: ballotStatusUnknown
											? "Voting unavailable"
											: "Sign & submit",
					onClick: handleSubmit,
					disabled:
						selectedCount < requiredCount ||
						busy ||
						votedBefore ||
						ballotStatusUnknown,
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
			<StageReveal />
			<SigningOverlay phase={phase} />
			<TopBar
				onHowItWorks={() => setHowOpen(true)}
				wallet={{
					address,
					walletId,
					busy: phase === "connecting",
					onConnect: () => setWalletOpen(true),
					onDisconnect: handleDisconnect,
				}}
			/>

			{/* ── Hero ── */}
			<motion.header
				initial={{ opacity: 0 }}
				animate={{ opacity: 1 }}
				transition={{ duration: 0.45, ease: EASE }}
				className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-14 sm:pt-16 pb-10 text-center"
			>
				{/* Whose awards these are, said before the headline says which ones.
				    The mark is black artwork, so it needs the same light ground the
				    receipt stamp gives it — bare, it disappears into the page. */}
				<span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-[#2f2f2f] px-2.5 py-1 text-xs font-medium text-neutral-400">
					<Image
						src="/stellar-xlm-logo.png"
						alt=""
						width={14}
						height={14}
						className="h-3.5 w-3.5 rounded-full bg-neutral-100 p-0.5"
					/>
					SCF
				</span>
				<h1 className="mb-5 text-4xl font-semibold leading-[1.05] tracking-tight text-neutral-50 sm:text-6xl">
					<CubeMark />
					<span className="sr-only">{round.title}</span>
					<span aria-hidden="true">{round.title.replace(/^i³\s*/, "")}</span>
				</h1>
				<p className="text-neutral-400 text-base sm:text-lg leading-relaxed max-w-xl mx-auto">
					Three categories. One pick in each. SCF Pilots choose the projects
					that defined the year for their impact, innovation and
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
							{voting.reason ? `: ${voting.reason}` : ""}
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
							<VoteReceipt />
							<h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-neutral-100 mb-2">
								Your vote is on-chain
							</h2>
							<p className="text-sm text-neutral-300 leading-relaxed mb-4">
								Recorded on Stellar testnet. This is your ballot for the round.
								The first one cast is the one that counts, so it won't be
								replaced.
								{closesLabel && (
									<>
										{" "}
										Results are published after voting closes on{" "}
										<span className="text-neutral-100">{closesLabel}</span>.
									</>
								)}
							</p>
							<a
								href={explorerTxUrl(txHash)}
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

			{/* ── Already-voted notice (returning voter, this session hasn't
			    resubmitted). Same card and same printed ballot as the moment
			    they submitted: the receipt they were handed doesn't disappear
			    because they came back later. ── */}
			{votedBefore && phase !== "submitted" && address && (
				<motion.div
					initial={{ opacity: 0, y: 12 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4, ease: EASE }}
					className="max-w-2xl mx-auto px-4 sm:px-6 mb-8"
				>
					<div className="rounded-2xl border border-[#2f2f2f] bg-[#1c1c1c] p-6 text-center sm:p-7">
						<VoteReceipt />
						<h2 className="mb-2 text-xl font-semibold tracking-tight text-neutral-100 sm:text-2xl">
							You've already voted
						</h2>
						<p className="mb-4 text-sm leading-relaxed text-neutral-300">
							Your picks are below. This ballot is final. The first one cast is
							the one that counts.
							{voting.open && closesLabel && (
								<>
									{" "}
									Voting closes{" "}
									<span className="text-neutral-100">{closesLabel}</span>.
								</>
							)}
						</p>
						<a
							href={explorerAccountUrl(address)}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-300 transition-colors hover:text-neutral-100"
						>
							Verify your ballot on-chain
							<ArrowUpRight className="h-4 w-4" />
						</a>
					</div>
				</motion.div>
			)}

			{/* ── Read-only notice ── */}
			{!address && voting.open && (
				<div className="max-w-2xl mx-auto px-4 sm:px-6 mb-8">
					<div className="rounded-xl border border-[#2f2f2f] bg-[#1c1c1c] p-4 flex items-start gap-3">
						<Eye className="h-5 w-5 mt-0.5 text-neutral-500 flex-shrink-0" />
						<p className="text-sm text-neutral-400 leading-relaxed">
							<span className="text-neutral-100 font-medium">
								Connect a Pilot wallet to pick.
							</span>{" "}
							Browse the nominees and their highlights freely. Choosing comes
							after connecting, so a ballot is never built against the wrong
							address.
						</p>
					</div>
				</div>
			)}

			{notWhitelisted && (
				<div className="max-w-2xl mx-auto px-4 sm:px-6 mb-8">
					<div className="rounded-xl border border-[#2f2f2f] bg-[#1c1c1c] p-4 flex items-start gap-3">
						<Eye className="h-5 w-5 mt-0.5 text-neutral-500 flex-shrink-0" />
						<p className="text-sm text-neutral-400 leading-relaxed">
							<span className="text-neutral-100 font-medium">Read-only.</span>{" "}
							{address ? shortAddress(address) : "This address"} isn't on the
							Pilot voter list, but the nominees are still worth a look.
						</p>
					</div>
				</div>
			)}

			{/* ── Two-column: grid + ballot rail ── */}
			<div className="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-8 pb-14 lg:pb-20">
				{/* nominee grid */}
				<div className="lg:col-span-8 space-y-14">
					{categories.map((category) => (
						<section key={category.key} aria-label={category.name}>
							<div className="mb-5">
								<h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-neutral-50">
									<span className="sm-lift">
										<span>{category.name}</span>
									</span>
								</h2>
								{category.tagline && (
									<p className="mt-0.5 text-sm text-neutral-500">
										<span className="sm-lift">
											<span style={{ ["--sm-d" as string]: "110ms" }}>
												{category.tagline}
											</span>
										</span>
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
										needsConnect={!address}
										selected={(selections[category.key] ?? []).includes(
											nominee.slug,
										)}
										disabled={
											readOnly ||
											!voting.open ||
											// Cap reached: unpicked cards go inert so the limit is
											// visible rather than a tap that silently does nothing.
											(picksPerCategory > 1 &&
												(selections[category.key] ?? []).length >=
													picksPerCategory &&
												!(selections[category.key] ?? []).includes(
													nominee.slug,
												))
										}
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
								{selectedCount}/{requiredCount}
							</span>
						</div>
						<ul className="space-y-3 mb-5">
							{categories.map((c) => {
								const pickedSlugs = selections[c.key] ?? [];
								const picked = pickedSlugs.length
									? pickedSlugs.map((sl) => nomineeName(c.key, sl)).join(", ")
									: "";
								return (
									<li
										key={c.key}
										className="flex items-center justify-between gap-3"
									>
										<span className="text-xs text-neutral-500 truncate">
											{c.name}
											{picksPerCategory > 1 && (
												<span className="ml-1.5 tabular-nums text-neutral-600">
													{pickedSlugs.length}/{requiredFor(c.key)}
												</span>
											)}
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
													{picked ?? "Not picked"}
												</motion.span>
											</AnimatePresence>
										</div>
									</li>
								);
							})}
						</ul>
						{ballotOpen && <PrimaryButton full />}
						{closesShort && voting.open && (
							<p className="mt-3 text-xs text-neutral-400 text-center leading-relaxed">
								One signature, and it's final. Voting closes{" "}
								<span className="text-neutral-200">{closesShort}</span>.
							</p>
						)}
					</div>
				</aside>
			</div>

			{/* ── Last year, as history ── */}
			{/* The clearance rides the LAST block on the page: when the mobile
			    ballot deck is shown it's `fixed` (~230px tall) and would cover
			    whatever ends the page — which is now the 2025 source link rather
			    than the Interoperability nominees. Normal padding when the deck is
			    absent (not a Pilot / already voted) so there's no dead space. */}
			<PastWinners className={ballotOpen ? "pb-[17rem]" : "pb-32"} />

			{/* ── Mobile ballot deck (whole-card swipe, stacked like a deck) ── */}
			{ballotOpen && (
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
								{selectedCount}/{requiredCount}
							</span>
						</div>

						{/* the deck: swipe the whole top card; the rest peek behind it */}
						<div className="relative mb-3" style={{ height: 104 }}>
							{categories.map((category, idx) => {
								const depth =
									(idx - ballotPage + categories.length) % categories.length;
								const isTop = depth === 0;
								const pickedSlug = (selections[category.key] ?? [])[0];
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
												{address
													? "Not picked yet. Tap a nominee above."
													: "Connect a wallet to pick"}
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

			<HowItWorks
				open={howOpen}
				onClose={() => setHowOpen(false)}
				picks={data.round.picksPerCategory ?? 1}
			/>

			<NomineeHighlightsModal
				nominee={highlightNominee}
				isSelected={
					highlightNominee
						? (selections[highlightNominee.category] ?? []).includes(
								highlightNominee.slug,
							)
						: false
				}
				onClose={() => setHighlightNominee(null)}
				canPick={!readOnly && voting.open}
				onConnect={
					!address && voting.open
						? () => {
								setHighlightNominee(null);
								setWalletOpen(true);
							}
						: null
				}
				onVote={(slug) => {
					if (highlightNominee && !readOnly && voting.open) {
						const cat = highlightNominee.category;
						setError(null);
						setSelections((prev) => {
							const picked = prev[cat] ?? [];
							if (picked.includes(slug)) return prev;
							if (picksPerCategory === 1) return { ...prev, [cat]: [slug] };
							if (picked.length >= picksPerCategory) return prev;
							return { ...prev, [cat]: [...picked, slug] };
						});
					}
					setHighlightNominee(null);
				}}
			/>

			<AwardsToast
				message={error}
				onDismiss={() => setError(null)}
				raised={ballotOpen}
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
						className="pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-2xl border border-[#333] bg-[#1c1c1c]/95 px-4 py-3 text-left shadow-[0_16px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl"
					>
						<span className="mt-px flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-neutral-300">
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

/**
 * Stroopy, drawn in vector so he can move. An interpretation in the Stellar
 * mascot's spirit — visor face, pixel eyes, antenna — not the official art.
 * Sized by the caller; the badge is the connected wallet's own mark.
 */
export function Stroopy({ size, badge }: { size: number; badge?: string }) {
	// He lives inside the menu's AnimatePresence: while it is leaving this goes
	// false, and the shutters swing back closed over him.
	const present = useIsPresent();
	return (
		<span
			className={`sm-stroopy${present ? "" : " is-shut"}`}
			style={{ width: size, height: size }}
			aria-hidden="true"
		>
			{[0, 1, 2, 3].map((n) => (
				<span
					key={n}
					className="sm-spark"
					style={{
						["--sr-rot" as string]: `${n * 78 - 40}deg`,
						["--sr-d" as string]: `${n * 70}ms`,
					}}
				/>
			))}
			<span className="sm-sr-window">
				<svg className="sm-sr-rise" viewBox="0 0 64 64" role="presentation">
					<g className="sm-sr-bob">
						{/* shoulders first, so the head sits over them */}
						<path
							d="M13 64v-13a19 13 0 0 1 38 0v13z"
							fill="#F5C518"
							stroke="#2A2140"
							strokeWidth="2"
						/>
						<g className="sm-sr-ant">
							<path
								d="M32 15V9"
								stroke="#2A2140"
								strokeWidth="2.6"
								strokeLinecap="round"
							/>
							<circle
								cx="32"
								cy="5.8"
								r="4"
								fill="#F5C518"
								stroke="#2A2140"
								strokeWidth="1.8"
							/>
						</g>
						{/* head, with a lighter cap over the crown */}
						<rect
							x="10"
							y="13"
							width="44"
							height="39"
							rx="19"
							fill="#C6B6F0"
							stroke="#2A2140"
							strokeWidth="2"
						/>
						<path
							d="M13.5 26a18.5 12 0 0 1 37 0z"
							fill="#E6DEFA"
							stroke="#2A2140"
							strokeWidth="1.6"
						/>
						{/* the visor, wider than the head the way the real one is */}
						<rect x="7" y="25" width="50" height="22" rx="11" fill="#15111F" />
						<rect
							className="sm-sr-eye"
							x="19"
							y="29.5"
							width="7.6"
							height="8.8"
							rx="3.5"
							fill="#F5C518"
						/>
						<rect
							className="sm-sr-eye"
							x="37.4"
							y="29.5"
							width="7.6"
							height="8.8"
							rx="3.5"
							fill="#F5C518"
						/>
						{/* a glint in each eye, and pixel blush on the cheeks */}
						<circle cx="21.5" cy="32.1" r="1.4" fill="#FFF6D6" />
						<circle cx="39.9" cy="32.1" r="1.4" fill="#FFF6D6" />
						<rect
							x="14.4"
							y="39.4"
							width="5.6"
							height="3.4"
							rx="1.7"
							fill="#FF8FB4"
							opacity="0.85"
						/>
						<rect
							x="44"
							y="39.4"
							width="5.6"
							height="3.4"
							rx="1.7"
							fill="#FF8FB4"
							opacity="0.85"
						/>
						{/* pixel smile */}
						<rect x="27" y="40.6" width="3.3" height="3.3" fill="#F5C518" />
						<rect x="30.35" y="42.4" width="3.3" height="3.3" fill="#F5C518" />
						<rect x="33.7" y="40.6" width="3.3" height="3.3" fill="#F5C518" />
					</g>
				</svg>
				<span className="sm-sr-gloss" />
				<span className="sm-sr-shutter sm-sr-shutter-l" />
				<span className="sm-sr-shutter sm-sr-shutter-r" />
			</span>
			{badge && (
				<Image
					src={badge}
					alt=""
					width={Math.round(size * 0.42)}
					height={Math.round(size * 0.42)}
					className="sm-stroopy-badge"
				/>
			)}
		</span>
	);
}

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
							You'll sign a Stellar <strong>testnet</strong> transaction. No
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
									You'll sign a Stellar testnet transaction. No real funds.
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
	needsConnect,
	disabled,
	onToggle,
	onHighlights,
}: {
	nominee: Nominee;
	selected: boolean;
	// A card is inert for several reasons, but only one of them has something
	// the visitor can do about it — so only that one gets its own hint.
	needsConnect: boolean;
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
					{selected
						? "Selected"
						: needsConnect
							? "Connect to pick"
							: "Tap to select"}
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

// ── Last year's winners ────────────────────────────────────────────────────

/**
 * The 2025 result, from stellar.org's own recap of the round (linked from the
 * section). Facts as published and nothing else: no descriptions, numbers or
 * quotes of our own, because this is a record rather than a write-up.
 */
const WINNERS_2025 = [
	{
		category: "Impact",
		name: "Decaf",
		line: "Stablecoins you can actually use.",
		blurb:
			"Non-custodial app to send, receive, invest and spend stablecoins; cash-out in 180+ countries via MoneyGram.",
		finalists: "Beans App, Blend, Meru",
	},
	{
		category: "Innovation",
		name: "Etherfuse",
		line: "RWAs as usable rails.",
		blurb:
			"Brings Stablebonds (tokenized government treasuries) natively to Stellar, plus MXNe, a peso-denominated stable value backed by CETES.",
		finalists: "Almanax, Soroswap Finance, Dogstar",
	},
	{
		category: "Interoperability",
		name: "DeFindex",
		line: "One integration, many protocols.",
		blurb:
			"Wallets integrate one API and launch vaults that turn complex DeFi strategies into simple savings accounts.",
		finalists: "Hana Wallet, Reflector, Stellarcarbon",
	},
] as const;

/**
 * Last year, at the bottom of the page as context for this year's vote.
 *
 * Each winner is a small stage. The card sits behind a closed curtain until
 * it scrolls into view, then the curtain parts on the winner's name and a
 * burst of confetti goes up behind it — the same two mechanisms the page
 * already uses for the opening reveal and the vote receipt, at card size, so
 * "and the winner is" reads the way it does on the night rather than as a
 * grey footnote. It plays once per card, on the reader's scroll, never on
 * page load out of view.
 *
 * Several of these names are nominated again this year; that is left to
 * speak for itself.
 */
function WinnerCard({
	winner,
	index,
}: {
	winner: (typeof WINNERS_2025)[number];
	index: number;
}) {
	const [open, setOpen] = useState(false);
	const panels = [0, 1, 2, 3, 4, 5];
	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			whileInView={{ opacity: 1, y: 0 }}
			viewport={{ once: true, amount: 0.45 }}
			onViewportEnter={() => setOpen(true)}
			transition={{ duration: 0.5, ease: EASE, delay: index * 0.1 }}
			className={`sm-win relative overflow-hidden rounded-2xl border border-[#2f2f2f] bg-[#1c1c1c] p-5 sm:p-6 ${
				open ? "is-open" : ""
			}`}
			style={{ ["--sm-d" as string]: `${index * 0.16}s` }}
		>
			<span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400">
				{winner.category}
			</span>
			<p className="relative mt-2 text-2xl font-semibold tracking-tight text-neutral-50">
				{winner.name}
				{/* the burst goes up behind the name, as the curtain clears it */}
				{open && (
					<span className="sm-confetti" aria-hidden="true">
						{Array.from({ length: 14 }, (_, i) => (
							<i
								// biome-ignore lint/suspicious/noArrayIndexKey: static burst
								key={i}
								style={{
									["--sm-i" as string]: i,
									["--sm-x" as string]: `${(i % 2 ? 1 : -1) * (12 + ((i * 37) % 90))}px`,
									["--sm-y" as string]: `${-(50 + ((i * 53) % 90))}px`,
									["--sm-r" as string]: `${140 + ((i * 97) % 320)}deg`,
									["--sm-c" as string]: i % 2 === 0 ? "#ffffff" : "#8a8a8a",
								}}
							/>
						))}
					</span>
				)}
			</p>
			<p className="mt-1 text-sm font-medium text-neutral-200">{winner.line}</p>
			<p className="mt-3 text-sm leading-relaxed text-neutral-300">
				{winner.blurb}
			</p>
			<p className="mt-4 border-t border-[#2f2f2f] pt-3 text-xs leading-relaxed text-neutral-400">
				Also shortlisted: {winner.finalists}
			</p>
			{/* the curtain, closed until the card is in view */}
			<span className="sm-win-curtain" aria-hidden="true">
				<span className="sm-win-half l">
					{panels.map((n) => (
						<i key={n} />
					))}
				</span>
				<span className="sm-win-half r">
					{panels.map((n) => (
						<i key={n} />
					))}
				</span>
			</span>
		</motion.div>
	);
}

function PastWinners({ className = "" }: { className?: string }) {
	return (
		<section
			aria-label="2025 winners"
			className={`max-w-6xl mx-auto px-4 sm:px-6 ${className}`}
		>
			<div className="border-t border-[#2f2f2f] pt-12">
				<div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
					<h2 className="text-2xl font-semibold tracking-tight text-neutral-50">
						2025 winners
					</h2>
					<a
						href="https://stellar.org/blog/ecosystem/stellar-i-awards-2025"
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1 text-sm font-medium text-neutral-300 transition-colors hover:text-neutral-50"
					>
						The 2025 recap on stellar.org
						<ArrowUpRight className="h-4 w-4" />
					</a>
				</div>
				<p className="mb-7 max-w-2xl text-sm leading-relaxed text-neutral-300">
					The 2025 round ran at Stellar Meridian: 70+ applications, 98 SCF
					voters shortlisting 12 finalists, and 9 judges.
				</p>
				<div className="grid gap-4 sm:grid-cols-3">
					{WINNERS_2025.map((winner, i) => (
						<WinnerCard key={winner.category} winner={winner} index={i} />
					))}
				</div>
			</div>
		</section>
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
						The tally isn't available right now. Try again shortly.
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
							Tallied directly from Stellar testnet. Every vote is a public,
							verifiable transaction.
						</p>
					</div>
				)}
			</div>
			<HowItWorks
				open={howOpen}
				onClose={() => setHowOpen(false)}
				picks={data.round.picksPerCategory ?? 1}
			/>
		</>
	);
}
