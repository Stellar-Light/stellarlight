"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Routes that render their OWN full-page chrome and must not inherit the
 * global banner / nav / footer. /awards is a standalone award-show surface
 * (its own sticky top bar + wallet) — the site nav competes with it.
 *
 * This is ONLY a visibility gate: the chrome it hides is passed in as
 * `children` and stays server-rendered in the layout, so no server-only
 * module (Navigation → payload) is dragged into the client bundle.
 */
const STANDALONE = ["/awards"];

export function HideOnStandalone({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	if (pathname && STANDALONE.some((p) => pathname.startsWith(p))) return null;
	return <>{children}</>;
}
