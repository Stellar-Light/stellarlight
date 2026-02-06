"use client";

import Image from "next/image";
import { useState } from "react";
import { Building2 } from "lucide-react";

interface EntityLogoProps {
	logo?: string | { id: string; url?: string | null; filename?: string | null } | null | undefined;
	name: string;
	size?: number;
	className?: string;
	showFallbackIcon?: boolean;
}

export function EntityLogo({
	logo,
	name,
	size = 120,
	className = "",
	showFallbackIcon = false,
}: EntityLogoProps) {
	const [logoError, setLogoError] = useState(false);

	// Get logo URL - handle both string ID and populated object
	let logoUrl = "/logo.png"; // Default fallback
	if (logo && !logoError) {
		if (typeof logo === "string") {
			// If it's just an ID, use fallback (should be populated in queries)
			logoUrl = "/logo.png";
		} else if (logo.url) {
			logoUrl = logo.url;
		} else if (logo.filename) {
			// PayloadCMS serves media via /media endpoint
			logoUrl = `/media/${logo.filename}`;
		}
	}

	// If no logo or error, show fallback icon if requested
	if ((!logo || logoError) && showFallbackIcon) {
		return (
			<div className={`rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center border border-border/50 ${className}`} style={{ width: size, height: size }}>
				<Building2 className="text-primary" style={{ width: size * 0.4, height: size * 0.4 }} />
			</div>
		);
	}

	return (
		<Image
			src={logoError ? "/logo.png" : logoUrl}
			alt={`${name} logo`}
			width={size}
			height={size}
			className={`rounded-xl object-cover flex-shrink-0 ${className}`}
			onError={() => {
				setLogoError(true);
			}}
		/>
	);
}




