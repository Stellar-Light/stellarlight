"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

interface SiteBannerProps {
	message: string;
	linkUrl?: string | null;
	backgroundColor: "primary" | "blue" | "green" | "amber" | "red" | "gray";
}

const colorMap = {
	primary: "bg-gradient-to-r from-purple-600 to-blue-600 text-white",
	blue: "bg-blue-600 text-white",
	green: "bg-green-600 text-white",
	amber: "bg-amber-500 text-black",
	red: "bg-red-600 text-white",
	gray: "bg-gray-700 text-white",
};

export function SiteBanner({ message, linkUrl, backgroundColor }: SiteBannerProps) {
	const [isVisible, setIsVisible] = useState(true);
	const [isMounted, setIsMounted] = useState(false);
	const bannerRef = useRef<HTMLDivElement>(null);

	// Generate a storage key based on the message content
	// This ensures the banner shows again if the admin changes the message
	const storageKey = `banner-dismissed-${message.substring(0, 50)}`;

	useEffect(() => {
		setIsMounted(true);
		const isDismissed = sessionStorage.getItem(storageKey);
		if (isDismissed) {
			setIsVisible(false);
		}
	}, [storageKey]);

	// Measure actual banner height and update CSS variable
	useEffect(() => {
		if (!isMounted) return;

		if (!isVisible) {
			document.documentElement.style.setProperty('--banner-height', '0px');
			return;
		}

		const updateHeight = () => {
			if (bannerRef.current) {
				const height = bannerRef.current.offsetHeight;
				document.documentElement.style.setProperty('--banner-height', `${height}px`);
			}
		};

		updateHeight();

		// Re-measure on resize (text reflow may change height)
		window.addEventListener('resize', updateHeight);
		return () => {
			window.removeEventListener('resize', updateHeight);
			document.documentElement.style.setProperty('--banner-height', '0px');
		};
	}, [isVisible, isMounted]);

	const handleClose = (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsVisible(false);
		sessionStorage.setItem(storageKey, "true");
	};

	// Don't render anything until mounted (prevents hydration mismatch)
	if (!isMounted || !isVisible) {
		return null;
	}

	const bgColorClass = colorMap[backgroundColor] || colorMap.primary;

	return (
		<div
			ref={bannerRef}
			className={`fixed top-0 left-0 right-0 z-[60] w-full ${bgColorClass} px-4 py-2`}
			style={{
				transform: 'translateZ(0)',
				willChange: 'auto',
			}}
		>
			<div className="container mx-auto flex items-center justify-between gap-3">
				{linkUrl ? (
					<a
						href={linkUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex-1 text-center text-xs sm:text-sm hover:underline cursor-pointer leading-snug line-clamp-2"
					>
						{message}
					</a>
				) : (
					<div className="flex-1 text-center text-xs sm:text-sm leading-snug line-clamp-2">
						{message}
					</div>
				)}
				<button
					onClick={handleClose}
					className="flex-shrink-0 rounded-md p-1 hover:bg-black/10 transition-colors z-10"
					aria-label="Close banner"
				>
					<X className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}
