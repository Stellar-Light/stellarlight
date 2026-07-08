"use client";

import { useEffect, useRef, useState } from "react";

interface FlickeringGridBgProps {
	className?: string;
	squareSize?: number;
	gridGap?: number;
	color?: string;
	maxOpacity?: number;
	flickerChance?: number;
	width?: number;
	height?: number;
}

/**
 * Simple full-area flickering grid for hero backgrounds.
 * Each cell randomly fades in/out at `flickerChance` probability per frame.
 */
export function FlickeringGridBg({
	className = "",
	squareSize = 4,
	gridGap = 6,
	color = "#60A5FA",
	maxOpacity = 0.3,
	flickerChance = 0.03,
	width = 1200,
	height = 600,
}: FlickeringGridBgProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [isClient, setIsClient] = useState(false);

	useEffect(() => {
		setIsClient(true);
	}, []);

	useEffect(() => {
		if (!isClient || !canvasRef.current) return;

		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		ctx.scale(dpr, dpr);

		const cellSize = squareSize + gridGap;
		const cols = Math.ceil(width / cellSize);
		const rows = Math.ceil(height / cellSize);

		// Each cell has an opacity, randomly updates per frame
		const opacities = new Float32Array(cols * rows);
		for (let i = 0; i < opacities.length; i++) {
			opacities[i] = Math.random() * maxOpacity;
		}

		const [r, g, b] = (() => {
			// Parse hex color
			const hex = color.replace("#", "");
			return [
				parseInt(hex.substring(0, 2), 16),
				parseInt(hex.substring(2, 4), 16),
				parseInt(hex.substring(4, 6), 16),
			];
		})();

		let animationId: number;
		const animate = () => {
			ctx.clearRect(0, 0, width, height);

			for (let i = 0; i < opacities.length; i++) {
				if (Math.random() < flickerChance) {
					opacities[i] = Math.random() * maxOpacity;
				}
				const x = (i % cols) * cellSize;
				const y = Math.floor(i / cols) * cellSize;
				ctx.fillStyle = `rgba(${r},${g},${b},${opacities[i]})`;
				ctx.fillRect(x, y, squareSize, squareSize);
			}

			animationId = requestAnimationFrame(animate);
		};

		animationId = requestAnimationFrame(animate);

		return () => {
			cancelAnimationFrame(animationId);
		};
	}, [
		isClient,
		squareSize,
		gridGap,
		color,
		maxOpacity,
		flickerChance,
		width,
		height,
	]);

	return (
		<canvas ref={canvasRef} className={className} style={{ width, height }} />
	);
}
