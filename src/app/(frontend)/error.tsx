"use client";

import Link from "next/link";

/**
 * A component that threw used to blank the whole page: the app had no error
 * boundary, and one card's TypeError on a null TVL figure took a project page
 * down (re-check 2026-11-05). This catches what a frontend route throws, in
 * the shape of the 404 page: the layout's nav and footer stay, it says what
 * happened, and it offers a retry and the lists most readers are after. An
 * error in the layout itself falls to src/app/global-error.tsx.
 */
export default function FrontendError({
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const routes = [
		{ href: "/directory", label: "Directory", hint: "Every project we track" },
		{
			href: "/builders",
			label: "Builders",
			hint: "Who is shipping on Stellar",
		},
		{ href: "/entities", label: "Entities", hint: "Teams and organizations" },
		{ href: "/hackathons", label: "Events", hint: "Hackathons and programs" },
	];

	return (
		<div className="max-w-3xl mx-auto px-4 py-24 sm:py-32">
			<p className="text-sm font-medium text-muted-foreground mb-3">Error</p>
			<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-4">
				Part of this page failed to load
			</h1>
			<p className="text-muted-foreground mb-6 max-w-prose">
				Something on this page broke while it was being shown. Trying again
				usually works; the lists below load on their own.
			</p>
			<button
				type="button"
				onClick={reset}
				className="mb-10 rounded-xl border border-border/50 bg-card px-4 py-2 font-medium text-foreground hover:border-white/30 transition-colors duration-200"
			>
				Try again
			</button>

			<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
				{routes.map((r) => (
					<Link
						key={r.href}
						href={r.href}
						className="group rounded-xl border border-border/50 bg-card p-4 hover:border-white/30 transition-colors duration-200"
					>
						<span className="block font-medium text-foreground group-hover:text-primary transition-colors">
							{r.label}
						</span>
						<span className="block text-sm text-muted-foreground mt-0.5">
							{r.hint}
						</span>
					</Link>
				))}
			</div>
		</div>
	);
}
