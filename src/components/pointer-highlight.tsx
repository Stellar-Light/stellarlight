"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

interface PointerHighlightProps {
	children: ReactNode;
	rectangleClassName?: string;
	pointerClassName?: string;
	containerClassName?: string;
}

/**
 * Animated rectangle that draws around child content with a moving pointer cursor.
 * Inspired by Aceternity UI's PointerHighlight.
 */
export function PointerHighlight({
	children,
	rectangleClassName = "border-[#FDDA24] bg-[#FDDA24]/20",
	pointerClassName = "text-[#FDDA24] h-4 w-4",
	containerClassName = "inline-block",
}: PointerHighlightProps) {
	const containerRef = useRef<HTMLSpanElement>(null);
	const [dims, setDims] = useState<{ width: number; height: number } | null>(
		null,
	);

	useEffect(() => {
		if (!containerRef.current) return;
		const update = () => {
			if (!containerRef.current) return;
			const rect = containerRef.current.getBoundingClientRect();
			setDims({ width: rect.width, height: rect.height });
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(containerRef.current);
		return () => ro.disconnect();
	}, []);

	return (
		<span
			ref={containerRef}
			className={`relative ${containerClassName}`}
		>
			{children}
			{dims && (
				<motion.div
					className={`absolute inset-0 pointer-events-none border ${rectangleClassName}`}
					initial={{
						width: 0,
						height: 0,
						opacity: 0,
					}}
					animate={{
						width: dims.width,
						height: dims.height,
						opacity: 1,
					}}
					transition={{
						duration: 1,
						delay: 1.2,
						ease: "easeOut",
					}}
					style={{
						top: 0,
						left: 0,
					}}
				/>
			)}
			{dims && (
				<motion.svg
					className={`absolute pointer-events-none ${pointerClassName}`}
					viewBox="0 0 16 16"
					fill="currentColor"
					initial={{
						opacity: 0,
						top: 0,
						left: 0,
					}}
					animate={{
						opacity: [0, 1, 1, 0],
						top: [0, dims.height - 8, dims.height - 8, dims.height - 8],
						left: [
							0,
							dims.width - 8,
							dims.width - 8,
							dims.width - 8,
						],
					}}
					transition={{
						duration: 2,
						delay: 1,
						ease: "easeOut",
						times: [0, 0.6, 0.9, 1],
					}}
				>
					<path d="M1.5 1.5l4 13 2-5 5-2-11-6z" />
				</motion.svg>
			)}
		</span>
	);
}
