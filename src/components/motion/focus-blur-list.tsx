"use client";

/**
 * FocusBlurList — hovering (or keyboard-focusing) one item in a group softly
 * dims and blurs its siblings, so attention lands on the one under the
 * pointer. Calm and monochrome: no color, no movement, only opacity + a
 * 1px blur, and only while something in the group is hovered.
 *
 * Wrap a link group (nav dropdown, footer columns) in <FocusBlurList> and
 * each link in <FocusBlurItem>. Reduced motion: no blur, opacity only.
 *
 * Pattern from Amicro's Focus Blur Links (MIT, © Syed Subhan), rebuilt as a
 * tiny context so it works across any markup.
 */
import { motion, useReducedMotion } from "motion/react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useId,
	useMemo,
	useState,
} from "react";

type Ctx = {
	active: string | null;
	setActive: (id: string | null) => void;
};
const FocusBlurCtx = createContext<Ctx | null>(null);

export function FocusBlurList({
	children,
	className,
	as: Tag = "div",
}: {
	children: ReactNode;
	className?: string;
	as?: "div" | "ul" | "nav";
}) {
	const [active, setActive] = useState<string | null>(null);
	const value = useMemo(() => ({ active, setActive }), [active]);
	const clear = useCallback(() => setActive(null), []);
	return (
		<FocusBlurCtx.Provider value={value}>
			<Tag className={className} onMouseLeave={clear} onBlur={clear}>
				{children}
			</Tag>
		</FocusBlurCtx.Provider>
	);
}

export function FocusBlurItem({
	children,
	className,
	as: Tag = "div",
}: {
	children: ReactNode;
	className?: string;
	as?: "div" | "li";
}) {
	const id = useId();
	const ctx = useContext(FocusBlurCtx);
	const reduce = useReducedMotion();
	const someoneActive = !!ctx?.active;
	const isMe = ctx?.active === id;
	const dimmed = someoneActive && !isMe;
	const M = Tag === "li" ? motion.li : motion.div;
	return (
		<M
			className={className}
			onMouseEnter={() => ctx?.setActive(id)}
			onFocus={() => ctx?.setActive(id)}
			animate={{
				opacity: dimmed ? 0.45 : 1,
				filter: dimmed && !reduce ? "blur(1px)" : "blur(0px)",
			}}
			transition={{ duration: 0.18, ease: "easeOut" }}
		>
			{children}
		</M>
	);
}
