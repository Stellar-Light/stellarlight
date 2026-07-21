"use client";

import { useEffect, useState } from "react";

/**
 * True when the viewport is phone-sized. Used to pick the right surface for
 * the same content — a bottom Drawer on mobile, a centered modal on desktop
 * (the RainbowKit pattern). SSR-safe: starts false, corrects on mount.
 */
export function useIsMobile(query = "(max-width: 767px)"): boolean {
	const [isMobile, setIsMobile] = useState(false);
	useEffect(() => {
		const mql = window.matchMedia(query);
		const sync = () => setIsMobile(mql.matches);
		sync();
		mql.addEventListener("change", sync);
		return () => mql.removeEventListener("change", sync);
	}, [query]);
	return isMobile;
}
