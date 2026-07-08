"use client";

import { useEffect, useRef, useState } from "react";

interface FlickeringGridProps {
	className?: string;
	squareSize?: number;
	gridGap?: number;
	color?: string;
	inactiveColor?: string;
	maxOpacity?: number;
	trailRadius?: number;
	width?: number;
	height?: number;
	logoSrc: string;
}

interface Square {
	x: number;
	y: number;
	filled: number;
	lastActivated: number;
	activationOrder: number;
	flickerPhase: number;
	flickerIntensity: number;
}

interface TrailPosition {
	x: number;
	y: number;
	age: number;
}

export function FlickeringGrid({
	className = "",
	squareSize = 8,
	gridGap = 4,
	color = "#FDDA24",
	inactiveColor = "#525252",
	maxOpacity = 1,
	trailRadius = 100,
	width = 450,
	height = 450,
	logoSrc,
}: FlickeringGridProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const logoImageRef = useRef<HTMLImageElement>(null);
	const [isClient, setIsClient] = useState(false);
	const mouseTrail = useRef<TrailPosition[]>([]);
	const isMountedRef = useRef(true);

	useEffect(() => {
		setIsClient(true);
	}, []);

	useEffect(() => {
		if (!isClient || !canvasRef.current || !logoImageRef.current) return;

		isMountedRef.current = true;
		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d", { willReadFrequently: true });
		const logoImg = logoImageRef.current;

		if (!ctx) return;

		const roundRect = (
			ctx: CanvasRenderingContext2D,
			x: number,
			y: number,
			width: number,
			height: number,
			radius: number,
		) => {
			ctx.beginPath();
			ctx.moveTo(x + radius, y);
			ctx.lineTo(x + width - radius, y);
			ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
			ctx.lineTo(x + width, y + height - radius);
			ctx.quadraticCurveTo(
				x + width,
				y + height,
				x + width - radius,
				y + height,
			);
			ctx.lineTo(x + radius, y + height);
			ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
			ctx.lineTo(x, y + radius);
			ctx.quadraticCurveTo(x, y, x + radius, y);
			ctx.closePath();
		};

		let cleanup: (() => void) | undefined;

		const setupCanvas = () => {
			if (!logoImg.naturalWidth || !logoImg.naturalHeight) {
				return;
			}

			canvas.width = width;
			canvas.height = height;

			const tempCanvas = document.createElement("canvas");
			const tempCtx = tempCanvas.getContext("2d");
			if (!tempCtx) return;

			tempCanvas.width = logoImg.naturalWidth;
			tempCanvas.height = logoImg.naturalHeight;
			tempCtx.drawImage(logoImg, 0, 0);
			const imageData = tempCtx.getImageData(
				0,
				0,
				logoImg.naturalWidth,
				logoImg.naturalHeight,
			);
			const pixels = imageData.data;

			const scaleX = logoImg.naturalWidth / width;
			const scaleY = logoImg.naturalHeight / height;
			const blockSizeWithGap = squareSize + gridGap;

			const squares: Square[] = [];

			// Process image pixels to create grid pattern
			if (logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0 && pixels) {
				for (let y = 0; y < height; y += blockSizeWithGap) {
					for (let x = 0; x < width; x += blockSizeWithGap) {
						const logoX = Math.floor(x * scaleX);
						const logoY = Math.floor(y * scaleY);
						const logoBlockWidth = Math.ceil(squareSize * scaleX);
						const logoBlockHeight = Math.ceil(squareSize * scaleY);

						let hasContent = false;
						let totalAlpha = 0;
						let pixelCount = 0;

						for (
							let by = 0;
							by < logoBlockHeight && logoY + by < logoImg.naturalHeight;
							by++
						) {
							for (
								let bx = 0;
								bx < logoBlockWidth && logoX + bx < logoImg.naturalWidth;
								bx++
							) {
								const idx =
									((logoY + by) * logoImg.naturalWidth + (logoX + bx)) * 4;
								const alpha = pixels[idx + 3];
								totalAlpha += alpha;
								pixelCount++;
								if (alpha > 50) {
									hasContent = true;
								}
							}
						}

						if (hasContent && pixelCount > 0 && totalAlpha / pixelCount > 30) {
							squares.push({
								x,
								y,
								filled: 0,
								lastActivated: 0,
								activationOrder: -1,
								flickerPhase: Math.random() * Math.PI * 2,
								flickerIntensity: 0.03 + Math.random() * 0.07,
							});
						}
					}
				}
			}

			// Fallback: create a grid pattern if no squares were created
			if (squares.length === 0) {
				for (let y = 0; y < height; y += blockSizeWithGap) {
					for (let x = 0; x < width; x += blockSizeWithGap) {
						// Create a pattern that covers about 30% of the grid
						if (Math.random() > 0.7) {
							squares.push({
								x,
								y,
								filled: 0,
								lastActivated: 0,
								activationOrder: -1,
								flickerPhase: Math.random() * Math.PI * 2,
								flickerIntensity: 0.03 + Math.random() * 0.07,
							});
						}
					}
				}
			}

			const handleMouseMove = (e: MouseEvent) => {
				const rect = canvas.getBoundingClientRect();
				const newPos = {
					x: e.clientX - rect.left,
					y: e.clientY - rect.top,
					age: 0,
				};

				mouseTrail.current.unshift(newPos);

				if (mouseTrail.current.length > 25) {
					mouseTrail.current.pop();
				}
			};

			const handleMouseLeave = () => {
				mouseTrail.current = [];
			};

			canvas.addEventListener("mousemove", handleMouseMove);
			canvas.addEventListener("mouseleave", handleMouseLeave);

			let animationId: number;
			let currentTime = 0;
			let activationCounter = 0;
			let retraceStartTime = -1;

			const animate = () => {
				if (!isMountedRef.current) return;

				ctx.clearRect(0, 0, width, height);
				currentTime++;

				mouseTrail.current.forEach((pos) => pos.age++);

				const isHovering = mouseTrail.current.length > 0;

				if (!isHovering && retraceStartTime === -1) {
					retraceStartTime = currentTime;
					const filledSquares = squares.filter(
						(s) => s.filled > 0 && s.activationOrder >= 0,
					);
					const maxOrder = Math.max(
						...filledSquares.map((s) => s.activationOrder),
						0,
					);
					filledSquares.forEach((square) => {
						square.activationOrder = maxOrder - square.activationOrder;
					});
				} else if (isHovering) {
					retraceStartTime = -1;
				}

				squares.forEach((square) => {
					let closestDistance = Infinity;
					let closestAge = 0;

					mouseTrail.current.forEach((trailPos) => {
						const dx = square.x + squareSize / 2 - trailPos.x;
						const dy = square.y + squareSize / 2 - trailPos.y;
						const distance = Math.sqrt(dx * dx + dy * dy);

						if (distance < closestDistance) {
							closestDistance = distance;
							closestAge = trailPos.age;
						}
					});

					if (closestDistance < trailRadius && isHovering) {
						const ageFactor = Math.max(0, 1 - closestAge / 60);
						const targetFill = ageFactor;
						square.filled = Math.min(
							maxOpacity,
							square.filled + (targetFill - square.filled) * 0.15,
						);
						square.lastActivated = currentTime;
						square.activationOrder = activationCounter++;
					} else if (
						!isHovering &&
						square.filled > 0 &&
						retraceStartTime >= 0
					) {
						const retraceTime = currentTime - retraceStartTime;
						const unfillStart = square.activationOrder * 0.8;
						if (retraceTime >= unfillStart) {
							square.filled = Math.max(0, square.filled - 0.1);
							if (square.filled === 0) {
								square.activationOrder = -1;
							}
						}
					} else if (isHovering && closestDistance >= trailRadius) {
						square.filled = Math.max(0, square.filled - 0.02);
					}

					square.flickerPhase += 0.05 + Math.random() * 0.03;

					const radius = 2;

					const flicker =
						Math.sin(square.flickerPhase) * square.flickerIntensity;
					const flickerBrightness = Math.max(0, flicker);

					ctx.save();
					roundRect(ctx, square.x, square.y, squareSize, squareSize, radius);
					if (flickerBrightness > 0 && square.filled === 0) {
						const baseGrey = parseInt(inactiveColor.slice(1), 16);
						const r = (baseGrey >> 16) & 255;
						const g = (baseGrey >> 8) & 255;
						const b = baseGrey & 255;
						const brightR = Math.min(255, r + flickerBrightness * 180);
						const brightG = Math.min(255, g + flickerBrightness * 180);
						const brightB = Math.min(255, b + flickerBrightness * 180);
						ctx.fillStyle = `rgb(${brightR}, ${brightG}, ${brightB})`;
					} else {
						ctx.fillStyle = inactiveColor;
					}
					ctx.fill();
					ctx.restore();

					if (square.filled > 0) {
						ctx.save();
						roundRect(ctx, square.x, square.y, squareSize, squareSize, radius);
						ctx.fillStyle = `${color}${Math.floor(square.filled * 255)
							.toString(16)
							.padStart(2, "0")}`;
						ctx.fill();
						ctx.restore();
					}
				});

				animationId = requestAnimationFrame(animate);
			};

			animate();

			return () => {
				if (animationId) {
					cancelAnimationFrame(animationId);
				}
				canvas.removeEventListener("mousemove", handleMouseMove);
				canvas.removeEventListener("mouseleave", handleMouseLeave);
			};
		};

		const initCanvas = async () => {
			try {
				if (logoImg.complete && logoImg.naturalWidth > 0) {
					if (isMountedRef.current) {
						cleanup = setupCanvas();
					}
				} else {
					await new Promise<void>((resolve, reject) => {
						const timeout = setTimeout(() => {
							reject(new Error("Image load timeout"));
						}, 10000);

						logoImg.onload = () => {
							clearTimeout(timeout);
							if (logoImg.naturalWidth > 0) {
								resolve();
							} else {
								reject(new Error("Image loaded but has no dimensions"));
							}
						};
						logoImg.onerror = (error) => {
							clearTimeout(timeout);
							// Silently handle image load errors
							reject(new Error("Image failed to load"));
						};
					});
					if (isMountedRef.current && logoImg.naturalWidth > 0) {
						cleanup = setupCanvas();
					}
				}
			} catch (error) {
				// Silently handle initialization errors
			}
		};

		initCanvas();

		return () => {
			isMountedRef.current = false;
			logoImg.onload = null;
			if (cleanup) {
				cleanup();
			}
		};
	}, [
		isClient,
		squareSize,
		gridGap,
		color,
		inactiveColor,
		maxOpacity,
		trailRadius,
		width,
		height,
		logoSrc,
	]);

	if (!isClient) {
		return null;
	}

	return (
		<div className={`relative ${className}`}>
			<img
				ref={logoImageRef}
				src={logoSrc}
				alt="Logo shape"
				className="absolute opacity-0 pointer-events-none w-0 h-0"
				crossOrigin={logoSrc.startsWith("http") ? "anonymous" : undefined}
				onLoad={() => {
					// Image loaded successfully
				}}
				onError={() => {
					// Silently handle image load errors
				}}
			/>
			<canvas
				ref={canvasRef}
				className="cursor-pointer bg-background/50 rounded-xl"
				style={{ width: `${width}px`, height: `${height}px` }}
			/>
		</div>
	);
}
