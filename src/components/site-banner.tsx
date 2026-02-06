"use client";

import { useEffect, useState } from "react";
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

// Height of the banner in pixels
const BANNER_HEIGHT = 48;

export function SiteBanner({ message, linkUrl, backgroundColor }: SiteBannerProps) {
	const [isVisible, setIsVisible] = useState(true);
	const [isMounted, setIsMounted] = useState(false);

	// Generate a storage key based on the message content
	// This ensures the banner shows again if the admin changes the message
	const storageKey = `banner-dismissed-${message.substring(0, 50)}`;

	useEffect(() => {
		setIsMounted(true);
		// Check if banner was previously dismissed in this session only
		const isDismissed = sessionStorage.getItem(storageKey);
		if (isDismissed) {
			setIsVisible(false);
		}
	}, [storageKey]);

	// Update CSS variable when visibility changes
	useEffect(() => {
		if (isMounted) {
			document.documentElement.style.setProperty(
				'--banner-height',
				isVisible ? `${BANNER_HEIGHT}px` : '0px'
			);
		}

		return () => {
			if (isMounted) {
				document.documentElement.style.setProperty('--banner-height', '0px');
			}
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
			className={`fixed top-0 left-0 right-0 z-[60] w-full ${bgColorClass} px-4`}
			style={{
				height: `${BANNER_HEIGHT}px`,
				transform: 'translateZ(0)', // Force GPU acceleration and prevent jank
				willChange: 'auto', // Optimize rendering
			}}
		>
			<div className="container mx-auto h-full flex items-center justify-between gap-4">
				{linkUrl ? (
					<a
						href={linkUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="flex-1 text-center text-sm sm:text-base hover:underline cursor-pointer"
					>
						{message}
					</a>
				) : (
					<div className="flex-1 text-center text-sm sm:text-base">
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
