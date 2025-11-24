"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

interface CarouselItem {
	id: string;
	name: string;
	image?: string | {
		id: string;
		url?: string | null;
		filename?: string | null;
	} | null;
	url?: string | null;
}

interface CompanyTickerProps {
	items: CarouselItem[];
	className?: string;
}

export default function CompanyTicker({
	items,
	className = "",
}: CompanyTickerProps) {
	const scrollerRef = useRef<HTMLDivElement>(null);
	const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

	useEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;

		// Clear any existing clones to prevent duplicates
		const scrollContent = scroller.querySelector("[data-scroll-content]");
		if (!scrollContent) return;

		// Remove any existing clones
		const allContent = scroller.querySelectorAll("[data-scroll-content]");
		if (allContent.length > 1) {
			for (let i = 1; i < allContent.length; i++) {
				allContent[i].remove();
			}
		}

		// Clone the content once for seamless infinite loop
		// With original + 1 clone = 2x content, animating -50% = -100% of original = seamless loop
		const clone = scrollContent.cloneNode(true) as HTMLElement;
		scroller.appendChild(clone);
	}, [items]);

	const getImageUrl = (item: CarouselItem): string | null => {
		if (!item.image) return null;
		if (typeof item.image === "string") return null;
		if (item.image.url) return item.image.url;
		if (item.image.filename) return `/media/${item.image.filename}`;
		return null;
	};

	const handleImageError = (itemId: string) => {
		setImageErrors((prev) => ({ ...prev, [itemId]: true }));
	};

	if (items.length === 0) {
		return null;
	}

	return (
		<div className={`relative overflow-hidden py-12 group ${className}`}>
			<div className="text-center mb-8">
				<p className="text-sm text-muted-foreground uppercase tracking-wider">
					Built on Stellar
				</p>
			</div>

			<div className="relative">
				<div
					ref={scrollerRef}
					className="flex gap-16 overflow-hidden carousel-container"
					style={{
						maskImage:
							"linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
						WebkitMaskImage:
							"linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
					}}
				>
					<div data-scroll-content className="flex gap-16 animate-scroll">
						{items.map((item) => {
							const imageUrl = getImageUrl(item);
							const hasError = imageErrors[item.id];
							const content = (
								<div className="flex items-center justify-center min-w-[200px] h-20 px-8">
									{imageUrl && !hasError ? (
										<div className="relative w-full h-full max-h-16 flex items-center justify-center">
											<Image
												src={imageUrl}
												alt={item.name}
												width={200}
												height={80}
												className="object-contain max-h-16 w-auto opacity-60 hover:opacity-100 transition-opacity duration-300"
												onError={() => handleImageError(item.id)}
											/>
										</div>
									) : (
										<span className="text-2xl font-bold text-foreground/60 hover:text-foreground transition-colors whitespace-nowrap">
											{item.name}
										</span>
									)}
								</div>
							);

							if (item.url) {
								return (
									<a
										key={item.id}
										href={item.url}
										target="_blank"
										rel="noopener noreferrer"
										className="block"
									>
										{content}
									</a>
								);
							}

							return (
								<div key={item.id}>
									{content}
								</div>
							);
						})}
					</div>
				</div>

				<div
					className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent pointer-events-none"
					aria-hidden="true"
				/>
				<div
					className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent pointer-events-none"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}

