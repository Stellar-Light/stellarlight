import Link from "next/link";
import "./globals.css";

/**
 * Root-level 404, for URLs that match no route at all.
 *
 * There is no root layout here — `(frontend)` and `(payload)` each own theirs —
 * so a totally unmatched path never enters either group, and Next falls back to
 * its own built-in "This page could not be found". That means the sibling
 * `(frontend)/not-found.tsx` only covers `notFound()` calls from inside a
 * frontend route; this file covers everything else, and has to bring its own
 * <html>/<body>.
 *
 * Deliberately standalone: no Navigation, no Footer, no payload providers, so
 * this page cannot fail for the same reason the request already failed.
 */
export default function RootNotFound() {
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
						404
					</p>
					<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-4">
						We don&apos;t have a page at this address
					</h1>
					<p className="text-muted-foreground mb-10 max-w-prose">
						The link may be out of date — projects get renamed, merged into
						another record, or withdrawn. Searching the directory is usually the
						fastest way to find what you were after.
					</p>

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
