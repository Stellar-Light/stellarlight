"use client";

import Image from "next/image";
import { useState } from "react";
import { PROJECT_LOGOS } from "@/data/project-logos";

interface ProjectLogoProps {
	logo?:
		| string
		| { id: string; url?: string | null; filename?: string | null }
		| null
		| undefined;
	name: string;
	size?: number;
	className?: string;
}

export function ProjectLogo({
	logo,
	name,
	size = 120,
	className = "",
}: ProjectLogoProps) {
	const [logoError, setLogoError] = useState(false);

	// Get logo URL - handle both string ID and populated object.
	// A static owner-supplied mark (PROJECT_LOGOS) stands in for rows with no
	// media row — see src/data/project-logos.ts for why those can't come from CI.
	let logoUrl = PROJECT_LOGOS[name] ?? "/logo.png"; // Default fallback
	if (logo && !logoError) {
		if (typeof logo === "string") {
			// If it's just an ID, use fallback (should be populated in queries)
			logoUrl = PROJECT_LOGOS[name] ?? "/logo.png";
		} else if (logo.url) {
			logoUrl = logo.url;
		} else if (logo.filename) {
			// PayloadCMS serves media via /media endpoint
			logoUrl = `/media/${logo.filename}`;
		}
	}

	return (
		<Image
			src={logoError ? (PROJECT_LOGOS[name] ?? "/logo.png") : logoUrl}
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
