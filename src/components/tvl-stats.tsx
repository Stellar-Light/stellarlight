"use client";

import { useState, memo, useRef, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import Image from "next/image";
import NumberTicker from "@/components/fancy/text/basic-number-ticker";
import { useStellarTVL } from "@/hooks/useStellarTVL";
import { useDeFiProtocols } from "@/hooks/useDeFiProtocols";
import { useRWATVL } from "@/hooks/useRWATVL";

const ISSUER_LOGOS: Record<string, string> = {
	"Franklin Templeton": "/issuers/franklin-templeton.png",
	"Spiko": "/issuers/spiko.jpg",
	"Ondo Finance": "/issuers/ondo.jpg",
	"Ondo": "/issuers/ondo.jpg",
	"Ondo USDY": "/issuers/ondo.jpg",
	"Circle": "/issuers/circle.png",
	"Circle International": "/issuers/circle.png",
	"RedSwan Digital": "/issuers/redswan.jpg",
	"RedSwan": "/issuers/redswan.jpg",
};

function formatValue(value: number): string {
	if (value >= 1_000_000_000) {
		return `$${(value / 1_000_000_000).toFixed(1)}B`;
	}
	if (value >= 1_000_000) {
		return `$${(value / 1_000_000).toFixed(1)}M`;
	}
	if (value >= 1_000) {
		return `$${(value / 1_000).toFixed(1)}K`;
	}
	return `$${value.toFixed(0)}`;
}

function getTVLValue(value: number) {
	if (value >= 1_000_000_000) return value / 1_000_000_000;
	if (value >= 1_000_000) return value / 1_000_000;
	return value;
}

function getTVLSuffix(value: number) {
	if (value >= 1_000_000_000) return "B";
	if (value >= 1_000_000) return "M";
	return "";
}

// Memoized ticker so it doesn't re-roll when tooltip state changes
const TVLNumber = memo(function TVLNumber({ value }: { value: number }) {
	const hasAnimated = useRef(false);

	useEffect(() => {
		if (value > 0) hasAnimated.current = true;
	}, [value]);

	if (hasAnimated.current) {
		return <>${getTVLValue(value).toFixed(2)}{getTVLSuffix(value)}</>;
	}

	return (
		<>
			$
			<NumberTicker
				from={0}
				target={getTVLValue(value)}
				autoStart={true}
				transition={{ duration: 2, type: "tween", ease: "easeInOut" }}
			/>
			{getTVLSuffix(value)}
		</>
	);
});

interface TooltipItem {
	name: string;
	value: number;
	logo?: string;
	category?: string;
}

function HoverCard({ items, label, totalCount }: { items: TooltipItem[]; label: string; totalCount: number }) {
	return (
		<div
			className="absolute left-0 top-full mt-2 w-[280px] sm:w-[300px] rounded-xl border border-[#2F2F2F] shadow-[0_8px_24px_rgba(0,0,0,0.6)] p-4 bg-[#262626] animate-in fade-in slide-in-from-top-1 duration-200"
			style={{ backgroundColor: '#262626', zIndex: 9999, isolation: 'isolate' }}
		>
			<p className="text-xs font-medium text-[#A3A3A3] mb-3">{label}</p>
			<div className="space-y-3">
				{items.map((item, i) => {
					const localLogo = ISSUER_LOGOS[item.name];
					const logoSrc = localLogo || item.logo;
					return (
						<div key={item.name} className="flex items-center justify-between gap-3">
							<div className="flex items-center gap-2.5 min-w-0">
								<span className="text-xs text-[#A3A3A3] w-4 flex-shrink-0">{i + 1}</span>
								{logoSrc ? (
									<img
										src={logoSrc}
										alt={item.name}
										width={20}
										height={20}
										className="w-5 h-5 rounded-full object-cover flex-shrink-0"
									/>
								) : (
									<div className="w-5 h-5 rounded-full bg-[#404040] flex-shrink-0" />
								)}
								<span className="text-sm text-[#E5E5E5] truncate">{item.name}</span>
							</div>
							<span className="text-sm text-[#E5E5E5] font-medium flex-shrink-0">
								{formatValue(item.value)}
							</span>
						</div>
					);
				})}
			</div>
			{totalCount > 5 && (
				<p className="text-xs text-[#A3A3A3] mt-3 pt-2.5 border-t border-[#2F2F2F]">
					& {totalCount - 5} more
				</p>
			)}
		</div>
	);
}

export default function TVLStats() {
	const { data: stellarTVL = 0, isLoading } = useStellarTVL();
	const { data: protocolData } = useDeFiProtocols();
	const { data: rwaData, isLoading: isRWALoading } = useRWATVL();
	const [showDefiTooltip, setShowDefiTooltip] = useState(false);
	const [showRwaTooltip, setShowRwaTooltip] = useState(false);

	const topProtocols = protocolData?.topProtocols ?? [];
	const totalProtocols = protocolData?.totalProtocols ?? 0;

	const rwaTVL = rwaData?.tvl ?? 1_688_000_000;
	const topIssuers = rwaData?.topIssuers ?? [];
	const totalAssets = rwaData?.totalAssets ?? 0;

	const defiItems: TooltipItem[] = topProtocols.map((p) => ({
		name: p.name,
		value: p.tvl,
		logo: p.logo,
		category: p.category,
	}));

	const rwaItems: TooltipItem[] = topIssuers.map((i) => ({
		name: i.name,
		value: i.value,
	}));

	return (
		<div className="flex flex-wrap gap-6 mt-6">
			<div
				className="relative"
				onMouseEnter={() => setShowDefiTooltip(true)}
				onMouseLeave={() => setShowDefiTooltip(false)}
			>
				<a
					href="https://defillama.com/chain/Stellar"
					target="_blank"
					rel="noopener noreferrer"
					className="block hover:opacity-80 transition-opacity cursor-pointer"
				>
					<div>
						<div className="flex items-center gap-2 mb-1">
							<p className="text-sm text-muted-foreground">DeFi TVL</p>
							<ExternalLink className="w-3 h-3 text-muted-foreground" />
						</div>
						<p className="text-2xl font-semibold text-foreground" style={{ minWidth: '140px' }}>
							{isLoading ? (
								<span className="text-muted-foreground">Loading...</span>
							) : (
								<TVLNumber value={stellarTVL} />
							)}
						</p>
					</div>
				</a>

				{showDefiTooltip && defiItems.length > 0 && (
					<HoverCard items={defiItems} label="Top Protocols" totalCount={totalProtocols} />
				)}
			</div>

			<div
				className="relative border-l border-border pl-6"
				onMouseEnter={() => setShowRwaTooltip(true)}
				onMouseLeave={() => setShowRwaTooltip(false)}
			>
				<a
					href="https://app.rwa.xyz/networks/stellar"
					target="_blank"
					rel="noopener noreferrer"
					className="block hover:opacity-80 transition-opacity cursor-pointer"
				>
					<div>
						<div className="flex items-center gap-2 mb-1">
							<p className="text-sm text-muted-foreground">RWA TVL</p>
							<ExternalLink className="w-3 h-3 text-muted-foreground" />
						</div>
						<p className="text-2xl font-semibold text-foreground" style={{ minWidth: '140px' }}>
							{isRWALoading ? (
								<span className="text-muted-foreground">Loading...</span>
							) : (
								<TVLNumber value={rwaTVL} />
							)}
						</p>
					</div>
				</a>

				{showRwaTooltip && rwaItems.length > 0 && (
					<HoverCard items={rwaItems} label="Top Issuers" totalCount={totalAssets} />
				)}
			</div>
		</div>
	);
}
