import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { liveTally } from "@/lib/awards/publish";
import { findRoundId } from "@/lib/awards/record";
import { loadRoundResult } from "@/lib/awards/round";
import { testnetExplorerTxUrl } from "@/lib/awards/stellar";
import { tallyViewRows } from "@/lib/awards/tally-view";
import { getPayloadSafe } from "@/lib/payload-client";

/**
 * /awards/tally — the owner's live view of a round: who voted for what, who
 * has not, and the standings the publish lane would count right now.
 *
 * Admin-only by construction: the page renders only for a signed-in admin
 * (the `users` collection cookie) and 404s for everyone else, so it reads
 * as nonexistent to the public. Every row is an address→picks mapping that
 * the public surfaces deliberately never serve. Not in the nav, not in the
 * sitemap, noindex.
 */

export const metadata: Metadata = {
	title: "i³ tally",
	robots: {
		index: false,
		follow: false,
		googleBot: { index: false, follow: false },
	},
};

export const dynamic = "force-dynamic";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-6)}`;

export default async function AwardsTallyPage({
	searchParams,
}: {
	searchParams: Promise<{ round?: string }>;
}) {
	const payload = await getPayloadSafe();
	if (!payload) notFound();
	const { user } = await payload.auth({ headers: await headers() });
	// biome-ignore lint/suspicious/noExplicitAny: auth result shape
	if (!user || (user as any).collection !== "users") notFound();

	const { round: requested } = await searchParams;
	const rounds = await payload.find({
		collection: "award-rounds",
		limit: 20,
		depth: 0,
		sort: "-createdAt",
		overrideAccess: true,
	});
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shape
	const roundDocs = rounds.docs as any[];
	const slug =
		requested ||
		roundDocs.find((r) => r.status === "open")?.slug ||
		roundDocs[0]?.slug ||
		null;

	const read = slug ? await loadRoundResult(slug) : null;
	const loaded = read?.ok ? read.loaded : null;

	const picker = (
		<nav className="flex flex-wrap gap-2 mb-8" aria-label="Rounds">
			{roundDocs.map((r) => (
				<Link
					key={r.slug}
					href={`/awards/tally?round=${r.slug}`}
					className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
						r.slug === slug
							? "border-foreground text-foreground"
							: "border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
					}`}
				>
					{r.slug} · {r.status}
				</Link>
			))}
		</nav>
	);

	if (!loaded) {
		return (
			<main className="max-w-6xl mx-auto px-4 py-10">
				<h1 className="text-2xl font-semibold mb-6">i³ tally</h1>
				{picker}
				<p className="text-muted-foreground">
					{read && !read.ok
						? "The round could not be read right now. Try again in a moment."
						: "No round to show."}
				</p>
			</main>
		);
	}

	const roundId = await findRoundId(payload, loaded.round.slug);
	const [voters, ballots, tally] = await Promise.all([
		payload.find({
			collection: "award-voters",
			where: { round: { equals: roundId } },
			limit: 1000,
			depth: 0,
			overrideAccess: true,
		}),
		payload.find({
			collection: "award-ballots",
			where: { round: { equals: roundId } },
			limit: 1000,
			depth: 0,
			overrideAccess: true,
		}),
		liveTally(loaded),
	]);
	// biome-ignore lint/suspicious/noExplicitAny: Payload doc shapes
	const view = tallyViewRows(voters.docs as any[], ballots.docs as any[]);
	const nameOf = new Map(loaded.nominees.map((n) => [n.slug, n.name]));
	const categories = loaded.round.categories;

	return (
		<main className="max-w-6xl mx-auto px-4 py-10">
			<h1 className="text-2xl font-semibold mb-1">i³ tally</h1>
			<p className="text-muted-foreground mb-6">
				{loaded.round.title} · {loaded.round.status}
				{loaded.round.testMode ? " · test round" : ""}
				{loaded.round.openToAll ? " · open to any wallet" : ""} · picks per
				category {loaded.round.picksPerCategory ?? 1} · standings from{" "}
				{tally.source}
				{tally.relayOnly ? ` · ${tally.relayOnly} relay-only ballot(s)` : ""}
			</p>
			{picker}

			<section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
				{[
					[`${view.voted} / ${view.whitelisted}`, "voted / whitelisted"],
					[String(view.notVoted), "whitelisted, not voted"],
					[String(view.revoted), "re-voted (first ballot counts)"],
					[String(view.walkIns), "walk-ins (not whitelisted)"],
				].map(([n, label]) => (
					<div key={label} className="rounded-xl border border-border/50 p-4">
						<div className="text-2xl font-semibold tabular-nums">{n}</div>
						<div className="text-xs text-muted-foreground">{label}</div>
					</div>
				))}
			</section>

			<h2 className="text-sm font-medium text-muted-foreground mb-3">
				Standings (first ballot per address)
			</h2>
			<section className="grid md:grid-cols-3 gap-4 mb-12">
				{tally.tally.categories.map((c) => {
					const max = Math.max(1, ...c.results.map((r) => r.votes));
					return (
						<div key={c.key} className="rounded-xl border border-border/50 p-4">
							<h3 className="font-medium mb-3">
								{c.name}{" "}
								<span className="text-muted-foreground font-normal text-sm">
									· {c.totalVotes} vote(s)
								</span>
							</h3>
							{c.results.length === 0 ? (
								<p className="text-sm text-muted-foreground">no ballots yet</p>
							) : (
								<ol className="space-y-2">
									{c.results.map((r) => (
										<li key={r.slug} className="text-sm">
											<div className="flex justify-between gap-2">
												<span>{r.name}</span>
												<span className="tabular-nums text-muted-foreground">
													{r.votes}
												</span>
											</div>
											<div className="h-1.5 rounded bg-border/40 mt-1 overflow-hidden">
												<div
													className="h-full bg-foreground/70"
													style={{
														width: `${Math.round((100 * r.votes) / max)}%`,
													}}
												/>
											</div>
										</li>
									))}
								</ol>
							)}
						</div>
					);
				})}
			</section>

			<h2 className="text-sm font-medium text-muted-foreground mb-3">
				Every address
			</h2>
			<div className="overflow-x-auto rounded-xl border border-border/50">
				<table className="w-full text-sm">
					<thead className="text-muted-foreground text-left">
						<tr>
							<th className="p-3 font-medium">address</th>
							<th className="p-3 font-medium">label</th>
							<th className="p-3 font-medium">voted</th>
							{categories.map((c) => (
								<th key={c.key} className="p-3 font-medium">
									{c.name}
								</th>
							))}
							<th className="p-3 font-medium">submitted</th>
							<th className="p-3 font-medium">tx</th>
						</tr>
					</thead>
					<tbody>
						{view.rows.map((r) => (
							<tr
								key={r.address}
								className="border-t border-border/40 align-top"
							>
								<td className="p-3 font-mono text-xs" title={r.address}>
									{short(r.address)}
								</td>
								<td className="p-3">
									{r.label}
									{!r.whitelisted ? (
										<span className="text-muted-foreground"> walk-in</span>
									) : null}
								</td>
								<td className="p-3">
									{r.voted ? (
										<>
											yes
											{r.revoted ? (
												<span className="text-muted-foreground">
													{" "}
													(re-voted ×{r.submissions})
												</span>
											) : null}
										</>
									) : (
										<span className="text-muted-foreground">no</span>
									)}
								</td>
								{categories.map((c) => (
									<td key={c.key} className="p-3">
										{(r.picks[c.key] ?? []).length === 0 ? (
											<span className="text-muted-foreground">–</span>
										) : (
											<div className="flex flex-wrap gap-1">
												{(r.picks[c.key] ?? []).map((s) => (
													<span
														key={s}
														className="text-xs px-2 py-0.5 rounded-full border border-border/50"
													>
														{nameOf.get(s) ?? s}
													</span>
												))}
											</div>
										)}
									</td>
								))}
								<td className="p-3 text-muted-foreground tabular-nums whitespace-nowrap">
									{r.at ? r.at.replace("T", " ").slice(0, 16) : "–"}
								</td>
								<td className="p-3 font-mono text-xs">
									{r.txHash ? (
										<a
											href={testnetExplorerTxUrl(r.txHash)}
											target="_blank"
											rel="noopener noreferrer"
											className="underline underline-offset-2"
										>
											{r.txHash.slice(0, 8)}…
										</a>
									) : (
										<span className="text-muted-foreground">–</span>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</main>
	);
}
