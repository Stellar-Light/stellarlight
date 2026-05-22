"use client";

import { useState } from "react";

interface Country {
	country: string;
	devs: number;
}

interface Props {
	topCountries: Country[];
	located: number;
	totalActive: number;
}

// Tiny country → ISO alpha-2 lookup for flag emoji. We only need to cover
// the countries that actually show up in Stellar's dev geo data.
const COUNTRY_CODE: Record<string, string> = {
	"United States": "US",
	"United Kingdom": "GB",
	"Nigeria": "NG",
	"India": "IN",
	"Costa Rica": "CR",
	"Argentina": "AR",
	"Canada": "CA",
	"Germany": "DE",
	"Brazil": "BR",
	"Türkiye": "TR",
	"Turkey": "TR",
	"Spain": "ES",
	"Kenya": "KE",
	"Vietnam": "VN",
	"France": "FR",
	"China": "CN",
	"Japan": "JP",
	"Mexico": "MX",
	"Colombia": "CO",
	"Chile": "CL",
	"Peru": "PE",
	"Venezuela": "VE",
	"Australia": "AU",
	"Netherlands": "NL",
	"Portugal": "PT",
	"Italy": "IT",
	"Poland": "PL",
	"Ukraine": "UA",
	"Russia": "RU",
	"South Africa": "ZA",
	"Egypt": "EG",
	"Pakistan": "PK",
	"Bangladesh": "BD",
	"Indonesia": "ID",
	"Philippines": "PH",
	"Singapore": "SG",
	"South Korea": "KR",
	"Switzerland": "CH",
	"Sweden": "SE",
	"Norway": "NO",
	"Denmark": "DK",
	"Finland": "FI",
	"Ireland": "IE",
	"Belgium": "BE",
	"Austria": "AT",
	"Czechia": "CZ",
	"Greece": "GR",
	"Romania": "RO",
	"Hungary": "HU",
	"Israel": "IL",
};

function flagEmoji(country: string): string {
	const code = COUNTRY_CODE[country];
	if (!code) return "🌐";
	// Convert ISO code → regional indicator symbols
	return code
		.toUpperCase()
		.split("")
		.map((c) => String.fromCodePoint(127397 + c.charCodeAt(0)))
		.join("");
}

function CountryCard({
	rank,
	country,
	devs,
	share,
}: {
	rank: number;
	country: Country;
	devs: number;
	share: number;
}) {
	return (
		<div className="rounded-xl border border-border/50 bg-card p-4">
			<div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/80 mb-2">
				<span>#{rank}</span>
				<span className="text-sm leading-none">
					{flagEmoji(country.country)}
				</span>
				<span className="truncate">{country.country}</span>
			</div>
			<div className="text-2xl font-bold text-foreground tabular-nums tracking-tight mb-1">
				{devs.toLocaleString()}
			</div>
			<div className="text-xs text-muted-foreground">
				{share.toFixed(1)}% of located devs
			</div>
		</div>
	);
}

export function EcosystemGeoCards({ topCountries, located, totalActive }: Props) {
	const [open, setOpen] = useState(false);
	if (!topCountries.length || located === 0) return null;

	const top4 = topCountries.slice(0, 4);
	const top10 = topCountries.slice(0, 10);
	const coverage = Math.round((located / totalActive) * 100);

	return (
		<div
			className="relative mb-2"
			onMouseEnter={() => setOpen(true)}
			onMouseLeave={() => setOpen(false)}
		>
			<div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
				<div className="text-[11px] uppercase tracking-wide text-muted-foreground/80">
					Where Stellar devs build from
				</div>
				<div className="text-[11px] text-muted-foreground/70">
					{located.toLocaleString()} of {totalActive.toLocaleString()} active devs publish a location · hover for top 10
				</div>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
				{top4.map((c, i) => (
					<CountryCard
						key={c.country}
						rank={i + 1}
						country={c}
						devs={c.devs}
						share={(c.devs / located) * 100}
					/>
				))}
			</div>

			{open && top10.length > 4 && (
				<div
					className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-border/60 bg-card shadow-[0_8px_24px_rgba(0,0,0,0.6)] p-4 animate-in fade-in slide-in-from-top-1 duration-150"
					style={{ isolation: "isolate" }}
				>
					<div className="flex items-baseline justify-between mb-3">
						<p className="text-xs font-medium text-muted-foreground">
							Top 10 countries
						</p>
						<p className="text-[11px] text-muted-foreground/70">
							Coverage: {coverage}% of active devs
						</p>
					</div>
					<div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
						{top10.map((c, i) => (
							<div
								key={c.country}
								className="flex items-center justify-between gap-3"
							>
								<div className="flex items-center gap-2.5 min-w-0">
									<span className="text-xs text-muted-foreground w-4 flex-shrink-0 tabular-nums">
										{i + 1}
									</span>
									<span className="text-base leading-none flex-shrink-0">
										{flagEmoji(c.country)}
									</span>
									<span className="text-sm text-foreground truncate">
										{c.country}
									</span>
								</div>
								<span className="text-sm text-foreground font-medium tabular-nums flex-shrink-0">
									{c.devs.toLocaleString()}
								</span>
							</div>
						))}
					</div>
					<p className="text-[11px] text-muted-foreground/70 mt-3 pt-2.5 border-t border-border/40">
						Counts only devs with a public location set on their GitHub profile.
					</p>
				</div>
			)}
		</div>
	);
}
