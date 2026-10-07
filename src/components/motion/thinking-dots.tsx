"use client";

/**
 * ThinkingDots — three dots that breathe in sequence while an answer is on
 * its way. Replaces the pulsing empty box on /ask and the concierge: the box
 * said "something is loading", this says "someone is composing" — which is
 * the truthful state while the first streamed token is in flight.
 *
 * Monochrome, 3×4px, no color. Reduced motion: three static dots.
 *
 * Pattern from Amicro's typing-indicator (MIT, © Syed Subhan), reduced.
 */
import { motion, useReducedMotion } from "motion/react";

export function ThinkingDots({
	className,
	label = "Composing an answer",
}: {
	className?: string;
	label?: string;
}) {
	const reduce = useReducedMotion();
	return (
		<span
			role="status"
			aria-label={label}
			className={className}
			style={{
				display: "inline-flex",
				alignItems: "center",
				gap: 5,
				height: 16,
			}}
		>
			{[0, 1, 2].map((i) => (
				<motion.span
					key={i}
					aria-hidden="true"
					style={{
						width: 4,
						height: 4,
						borderRadius: 9999,
						background: "currentColor",
						display: "inline-block",
					}}
					animate={
						reduce
							? { opacity: 0.6 }
							: { opacity: [0.25, 1, 0.25], y: [0, -2, 0] }
					}
					transition={
						reduce
							? { duration: 0 }
							: {
									duration: 1.1,
									repeat: Number.POSITIVE_INFINITY,
									ease: "easeInOut",
									delay: i * 0.16,
								}
					}
				/>
			))}
		</span>
	);
}
