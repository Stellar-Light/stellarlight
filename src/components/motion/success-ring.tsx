"use client";

/**
 * SuccessRing — one expanding ring behind a confirmation mark, fired once
 * when `active` flips true. Says "that happened" without a toast.
 *
 * Monochrome by default (uses currentColor at low alpha) so it sits on the
 * calm palette; pass a className to tint. Reduced motion: no ring, the mark
 * simply appears.
 *
 * Pattern from Amicro's Subscribe/Expand-Ring interactions (MIT, © Syed
 * Subhan), rebuilt as a single-shot wrapper.
 */
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type React from "react";

export function SuccessRing({
	active,
	children,
	className,
	size = 40,
}: {
	active: boolean;
	children: React.ReactNode;
	className?: string;
	/** px; the ring expands from this diameter to ~2.2× */
	size?: number;
}) {
	const reduce = useReducedMotion();
	return (
		<span
			className={className}
			style={{
				position: "relative",
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: size,
				height: size,
			}}
		>
			<AnimatePresence>
				{active && !reduce && (
					<motion.span
						key="ring"
						aria-hidden="true"
						initial={{ opacity: 0.6, scale: 0.6 }}
						animate={{ opacity: 0, scale: 2.2 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.7, ease: "easeOut" }}
						style={{
							position: "absolute",
							inset: 0,
							borderRadius: "9999px",
							border: "1.5px solid currentColor",
							pointerEvents: "none",
						}}
					/>
				)}
			</AnimatePresence>
			<motion.span
				initial={false}
				animate={
					active
						? { scale: 1, opacity: 1 }
						: { scale: reduce ? 1 : 0.8, opacity: 1 }
				}
				transition={{ type: "spring", stiffness: 500, damping: 28 }}
				style={{ display: "inline-flex" }}
			>
				{children}
			</motion.span>
		</span>
	);
}
