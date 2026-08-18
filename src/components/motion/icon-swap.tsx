"use client";

/**
 * IconSwap — a state change told with motion instead of a hard swap.
 *
 * Wrap the icon that changes with state (Copy → Check, Share → Check,
 * unselected → selected) and key each state; the outgoing icon scales/blurs
 * out as the incoming one scales/blurs in. Popping the old element out of
 * layout means the button never jumps width mid-transition.
 *
 * Adapted from Amicro's IconSwap (MIT, © Syed Subhan —
 * github.com/Subhan-code/Amicro--Micro-transitions-), trimmed to the one
 * primitive this site needs and made reduced-motion aware: with
 * prefers-reduced-motion the swap is an instant crossfade with no scale/blur.
 *
 *   <IconSwap>
 *     {copied ? <IconSwapItem key="ok"><Check/></IconSwapItem>
 *             : <IconSwapItem key="copy"><Copy/></IconSwapItem>}
 *   </IconSwap>
 */
import {
	AnimatePresence,
	type HTMLMotionProps,
	motion,
	useReducedMotion,
} from "motion/react";
import type React from "react";

export function IconSwap({ children }: { children: React.ReactNode }) {
	return (
		<AnimatePresence mode="popLayout" initial={false}>
			{children}
		</AnimatePresence>
	);
}

export function IconSwapItem({
	children,
	className,
	...props
}: HTMLMotionProps<"span">) {
	const reduce = useReducedMotion();
	const hidden = reduce
		? { opacity: 0 }
		: { opacity: 0, scale: 0.25, filter: "blur(4px)" };
	const shown = reduce
		? { opacity: 1 }
		: { opacity: 1, scale: 1, filter: "blur(0px)" };
	return (
		<motion.span
			initial={hidden}
			animate={shown}
			exit={hidden}
			transition={
				reduce
					? { duration: 0.12 }
					: { type: "spring", duration: 0.3, bounce: 0 }
			}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
			}}
			className={className}
			{...props}
		>
			{children}
		</motion.span>
	);
}
