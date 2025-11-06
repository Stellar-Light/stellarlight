"use client";

import { useEffect, useRef } from "react";

interface CompanyTickerProps {
	companies: string[];
	className?: string;
}

export default function CompanyTicker({
	companies,
	className = "",
}: CompanyTickerProps) {
	const scrollerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;

		const scrollContent = scroller.querySelector("[data-scroll-content]");
		if (!scrollContent) return;

		const clone = scrollContent.cloneNode(true) as HTMLElement;
		scroller.appendChild(clone);
	}, []);

	return (
		<div className={`relative overflow-hidden py-12 ${className}`}>
			<div className="text-center mb-8">
				<p className="text-sm text-muted-foreground uppercase tracking-wider">
					Built on Stellar
				</p>
			</div>

			<div className="relative">
				<div
					ref={scrollerRef}
					className="flex gap-16 overflow-hidden"
					style={{
						maskImage:
							"linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
						WebkitMaskImage:
							"linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
					}}
				>
					<div data-scroll-content className="flex gap-16 animate-scroll">
						{companies.map((company, index) => (
							<div
								key={index}
								className="flex items-center justify-center min-w-[200px] h-16 px-8"
							>
								<span className="text-2xl font-bold text-foreground/60 hover:text-foreground transition-colors whitespace-nowrap">
									{company}
								</span>
							</div>
						))}
					</div>
				</div>

				<div
					className="absolute left-0 top-0 bottom-0 w-32 bg-gradient-to-r from-background to-transparent pointer-events-none"
					aria-hidden="true"
				/>
				<div
					className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-background to-transparent pointer-events-none"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}

