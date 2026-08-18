"use client";

/**
 * ReadingProgress — a 1px line at the top of the viewport that fills as the
 * reader moves down the page. For long-form pieces only (the research posts
 * run 3–5k words); it answers "how much is left" without a word.
 *
 * Monochrome (foreground at 60%), fixed, pointer-events none, hidden under
 * reduced motion (a static bar that jumps is worse than none).
 *
 * Pattern from Amicro's progress-indicator + use-scroll-progress (MIT,
 * © Syed Subhan), reduced to motion's own useScroll.
 */
import { motion, useScroll, useSpring } from "motion/react";

export function ReadingProgress() {
	const { scrollYProgress } = useScroll();
	const width = useSpring(scrollYProgress, {
		stiffness: 200,
		damping: 30,
		mass: 0.3,
	});
	// Reduced motion is enforced in CSS (`motion-reduce:hidden`), not JS:
	// motion's useReducedMotion caches its answer in a module global after the
	// first hook call, so a JS-side `if (reduce) return null` is order-
	// dependent — it can render the bar for a reader who asked for no motion.
	// The media query is authoritative and applies before hydration too.
	return (
		<motion.div
			aria-hidden="true"
			data-testid="reading-progress"
			style={{ scaleX: width, transformOrigin: "0% 50%" }}
			className="pointer-events-none fixed left-0 right-0 top-0 z-[60] h-px bg-foreground/60 motion-reduce:hidden"
		/>
	);
}
