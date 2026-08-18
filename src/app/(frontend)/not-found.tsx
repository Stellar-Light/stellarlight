import Link from "next/link";

/**
 * Every miss used to render Next's stock "404 This page could not be found" —
 * 5KB with no nav, no footer, and not one link back into the site. Projects get
 * renamed and merged, so this page is reached by real readers following real
 * links, not just by crawlers.
 *
 * Living under (frontend) means it inherits the layout's nav and footer, so the
 * way out is already on the page; this just says what happened and points at
 * the two lists most misses are looking for.
 */
export default function NotFound() {
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
			<p className="text-sm font-medium text-muted-foreground mb-3">404</p>
			<h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground mb-4">
				We don't have a page at this address
			</h1>
			<p className="text-muted-foreground mb-10 max-w-prose">
				The link may be out of date — projects get renamed, merged into another
				record, or withdrawn. Searching the directory is usually the fastest way
				to find what you were after.
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

			<p className="text-sm text-muted-foreground mt-10">
				Think something should be here?{" "}
				<Link href="/submit" className="text-foreground underline">
					Tell us about it
				</Link>
				.
			</p>
		</div>
	);
}
