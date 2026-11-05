"use client";

import Link from "next/link";
import "./globals.css";

/**
 * The last boundary, for an error in a layout. There is no root layout here:
 * (frontend) and (payload) each own theirs, and an error thrown by a layout is
 * not caught by the error.tsx beside it. Like src/app/not-found.tsx this page
 * brings its own <html>/<body> and stays standalone (no Navigation, no Footer,
 * no providers), so it cannot fail for the same reason the request did.
 */
export default function GlobalError({
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
		<html lang="en" className="dark">
			<body className="min-h-screen bg-background font-sans antialiased">
				<div className="max-w-3xl mx-auto px-4 py-24 sm:py-32">
					<Link
						href="/"
						className="text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						Stellar Light
					</Link>
					<p className="text-sm font-medium text-muted-foreground mt-12 mb-3">
						Error
					</p>
					<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-4">
						This page failed to load
					</h1>
					<p className="text-muted-foreground mb-6 max-w-prose">
						Something broke while this page was being built. Trying again
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
			</body>
		</html>
	);
}
