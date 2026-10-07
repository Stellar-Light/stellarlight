import type { Reconciliation } from "@/lib/stablecoin-reconciliation";

const compact = (n: number) =>
	n >= 1e9
		? `${(n / 1e9).toFixed(2)}B`
		: n >= 1e6
			? `${(n / 1e6).toFixed(1)}M`
			: n >= 1e3
				? `${(n / 1e3).toFixed(0)}K`
				: n.toFixed(0);

/**
 * Why our headline is bigger than everyone else's.
 *
 * The number on its own invites the reader to assume we are wrong, because
 * every other Stellar tracker prints a smaller one. This says exactly where
 * the difference comes from, in both directions — including the assets THEY
 * carry and we do not, which is the half that costs us something to admit and
 * is the reason the rest is believable.
 */
export function ReconciliationNote({ data }: { data: Reconciliation }) {
	const onlyOursTop = data.onlyOurs.slice(0, 3);
	const worst = data.divergences[0];
	return (
		<details className="mt-4 rounded-xl border border-border/50 bg-card/40 px-4 py-3">
			<summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
				Why this differs from other trackers
			</summary>
			<div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
				<p>
					We report{" "}
					<span className="text-foreground">{data.oursTracked} assets</span>{" "}
					with Stellar circulation; DeFiLlama reports{" "}
					<span className="text-foreground">{data.theirsTracked}</span>. The
					difference is mostly which assets are counted, not how they are
					measured — compared by ticker, since a ticker with two issuers is two
					assets to us and one line to them.
				</p>
				{onlyOursTop.length > 0 && (
					<p>
						<span className="text-foreground">
							{data.onlyOurs.length} we carry that they do not
						</span>{" "}
						— largest:{" "}
						{onlyOursTop.map((a, i) => (
							<span key={a.ticker}>
								{i > 0 && ", "}
								<span className="text-foreground">{a.ticker}</span>{" "}
								{compact(a.amount)}
							</span>
						))}
						. Mostly non-dollar and institutional issuance.
					</p>
				)}
				{data.onlyTheirs.length > 0 && (
					<p>
						<span className="text-foreground">
							{data.onlyTheirs.length} they carry that we do not
						</span>{" "}
						—{" "}
						{data.onlyTheirs.map((a, i) => (
							<span key={a.ticker}>
								{i > 0 && ", "}
								<span className="text-foreground">{a.ticker}</span>{" "}
								{compact(a.amount)}
							</span>
						))}
						. Those are gaps in our coverage, not theirs.
					</p>
				)}
				{worst && (
					<p>
						Where both track the same ticker, the widest disagreement is{" "}
						<span className="text-foreground">{worst.ticker}</span>: ours{" "}
						{compact(worst.ours)} against theirs {compact(worst.theirs)}.
					</p>
				)}
				<p className="text-xs">
					Compared live against DeFiLlama&apos;s public stablecoins endpoint.
					Every row here carries its own issuer, basis and measurement date, so
					any line of this can be checked rather than taken on trust.
				</p>
			</div>
		</details>
	);
}
