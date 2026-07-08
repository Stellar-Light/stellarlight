"use client";

import { useEffect, useRef } from "react";

interface NumberTickerProps {
	from: number;
	target: number;
	autoStart?: boolean;
	transition?: {
		duration: number;
		type: string;
		ease: string;
	};
	className?: string;
}

export default function NumberTicker({
	from,
	target,
	autoStart = true,
	transition = { duration: 2, type: "tween", ease: "easeInOut" },
	className = "",
}: NumberTickerProps) {
	const nodeRef = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		if (!autoStart || !nodeRef.current) return;

		const node = nodeRef.current;
		const startTime = Date.now();
		const duration = transition.duration * 1000;

		const updateValue = () => {
			const elapsed = Date.now() - startTime;
			const progress = Math.min(elapsed / duration, 1);

			let current: number;
			if (transition.ease === "easeInOut") {
				const easeProgress =
					progress < 0.5
						? 2 * progress * progress
						: 1 - (-2 * progress + 2) ** 2 / 2;
				current = from + (target - from) * easeProgress;
			} else {
				current = from + (target - from) * progress;
			}

			node.textContent = current.toFixed(2);

			if (progress < 1) {
				requestAnimationFrame(updateValue);
			} else {
				node.textContent = target.toFixed(2);
			}
		};

		requestAnimationFrame(updateValue);
	}, [from, target, autoStart, transition]);

	return (
		<span ref={nodeRef} className={className}>
			{from.toFixed(2)}
		</span>
	);
}
