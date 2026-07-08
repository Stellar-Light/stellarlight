"use client";

import { ArrowUpDown, ChevronDown, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "@/components/ui/drawer";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";

function ScfIcon({ className }: { className?: string }) {
	return (
		<svg
			className={className}
			width="14"
			height="18"
			viewBox="0 0 38 48"
			fill="none"
			xmlns="http://www.w3.org/2000/svg"
		>
			<path
				fillRule="evenodd"
				clipRule="evenodd"
				d="M37.129 7.88671V11.0958C36.7191 11.3028 36.3104 11.5109 35.8994 11.7167C35.2869 12.0228 34.8197 12.4664 34.5366 13.0983C34.3757 13.4583 34.2677 13.8293 34.2666 14.2246C34.2666 14.4998 34.2744 14.7739 34.292 15.048C34.346 15.866 34.3008 16.6818 34.2138 17.4942C34.1333 18.2428 33.9923 18.9815 33.8017 19.7114C33.5406 20.7088 33.1858 21.6732 32.7341 22.6002C32.1678 23.7649 31.4693 24.8449 30.6364 25.8368C30.2001 26.3575 29.734 26.8496 29.2305 27.3032C29.1226 27.4012 29.0884 27.4914 29.1071 27.6324C29.1666 28.0683 29.214 28.5065 29.2625 28.9446C29.3088 29.3641 29.3495 29.7835 29.3947 30.2029C29.4432 30.6598 29.4939 31.1167 29.5423 31.5736C29.5875 31.993 29.6305 32.4124 29.6745 32.8319C29.7153 33.2161 29.7583 33.6003 29.7979 33.9845C29.8398 34.3885 29.8784 34.7926 29.9213 35.1955C29.972 35.6678 30.026 36.1401 30.0767 36.6124C30.1274 37.0857 30.1736 37.5591 30.2232 38.0314C30.2739 38.507 30.3279 38.9837 30.3775 39.4593C30.427 39.936 30.4711 40.4137 30.5218 40.8904C30.5791 41.4288 30.6441 41.9649 30.7014 42.5032C30.7851 43.2882 30.8644 44.0731 30.9471 44.8581C31.0209 45.5582 31.0947 46.2584 31.1696 46.9586C31.2071 47.3053 31.2478 47.651 31.2875 47.9967H31.2181C31.1939 47.9813 31.1707 47.9615 31.1432 47.9527C30.9372 47.8866 30.7267 47.8327 30.524 47.7567C30.0359 47.5751 29.5511 47.3835 29.0653 47.1953C27.9382 46.7593 26.8122 46.3222 25.6851 45.8863C24.6153 45.4723 23.5455 45.0606 22.4768 44.6467C21.4434 44.2482 20.4099 43.8496 19.3776 43.4489C19.2795 43.4104 19.1969 43.4115 19.0999 43.4533C18.9016 43.5381 18.6978 43.6118 18.4962 43.6889C17.5167 44.0665 16.5373 44.4441 15.5578 44.8217C14.3591 45.2852 13.1604 45.7509 11.9606 46.2144C10.6539 46.7197 9.34725 47.2239 8.04058 47.7281C7.91498 47.7765 7.78827 47.8228 7.66157 47.869C7.54258 47.9119 7.42359 47.9538 7.30461 47.9967H7.23519C7.27486 47.651 7.31562 47.3042 7.35308 46.9586C7.4291 46.2551 7.50292 45.5505 7.57784 44.8459C7.67369 43.9454 7.77065 43.046 7.8665 42.1454C7.95794 41.2878 8.05049 40.4292 8.14194 39.5716C8.23008 38.7404 8.31601 37.9092 8.40415 37.078C8.50992 36.0817 8.61789 35.0854 8.72366 34.0891C8.8129 33.2502 8.89774 32.4113 8.98698 31.5725C9.06851 30.8073 9.15224 30.0411 9.23487 29.276C9.26242 29.0217 9.28776 28.7674 9.31089 28.5131C9.3164 28.4569 9.33183 28.4338 9.39352 28.4129C9.51251 28.3733 9.62379 28.3094 9.73727 28.2511C10.5559 27.8338 11.3734 27.4144 12.1931 26.9993C12.2305 26.9806 12.2988 26.9905 12.3385 27.0126C13.0822 27.4166 13.8567 27.7502 14.6643 28.0067C15.4653 28.261 16.2828 28.4327 17.1157 28.5296C17.9067 28.621 18.7011 28.6364 19.4944 28.5758C20.9762 28.4624 22.4008 28.1123 23.7637 27.5113C24.8621 27.0258 25.8768 26.4038 26.799 25.6364C28.1475 24.5135 29.2261 23.1704 30.0293 21.6083C30.6088 20.482 31.0132 19.2964 31.2401 18.0524C31.4109 17.1144 31.4924 16.1665 31.434 15.211C31.412 14.8488 31.3768 14.4866 31.3459 14.1244C31.3448 14.1057 31.3371 14.0881 31.3294 14.0605C20.8881 19.3767 10.4534 24.6842 0.0022035 29.9993V29.8782C0.0022035 28.8863 0.00330525 27.8944 0 26.9014C0 26.8144 0.0286455 26.7737 0.104666 26.7351C5.80182 23.8409 11.4979 20.9433 17.1939 18.0469L23.6711 14.7552C24.7508 14.2058 25.8294 13.6576 26.9092 13.1072C28.8923 12.0965 30.8699 11.0782 32.852 10.0665C34.2391 9.35861 35.6295 8.65624 37.0177 7.95057C37.0552 7.93185 37.0915 7.90873 37.1279 7.88671H37.129ZM26.4145 29.3971C21.7177 31.9181 16.9339 32.1383 12.03 30.0708C11.5497 34.6032 11.0682 39.1345 10.5867 43.6779C10.6363 43.6592 10.6682 43.6482 10.7013 43.6361C11.7557 43.2298 12.8101 42.8236 13.8644 42.4174C15.6151 41.7414 17.3658 41.0666 19.1154 40.3873C19.2222 40.3455 19.3093 40.3521 19.4117 40.3928C20.7195 40.9025 22.0295 41.4089 23.3384 41.9154C24.6451 42.4207 25.9517 42.9249 27.2595 43.4291C27.4821 43.515 27.7046 43.5997 27.9382 43.69C27.4292 38.9132 26.9224 34.1518 26.4167 29.3971H26.4145ZM19.5076 0.0318324C22.5286 0.227792 25.2753 1.19768 27.7443 2.9525C27.763 2.96572 27.7795 2.97893 27.8082 3.00094C27.7674 3.02406 27.7355 3.04388 27.7024 3.06039C26.7924 3.52387 25.8812 3.98624 24.9723 4.45082C24.8996 4.48825 24.8445 4.49266 24.7696 4.45082C23.5598 3.78698 22.2741 3.33011 20.9178 3.08131C19.8458 2.88425 18.7661 2.8237 17.6776 2.90076C16.145 3.00975 14.6786 3.37745 13.2794 4.00826C11.8119 4.6699 10.5107 5.57263 9.38471 6.72307C7.91608 8.22139 6.87382 9.97401 6.25464 11.9787C6.01335 12.7604 5.85911 13.5607 5.76876 14.3732C5.67071 15.2473 5.67512 16.1203 5.75114 16.9955C5.76326 17.1331 5.78419 17.2707 5.80292 17.4183C5.84699 17.3973 5.88555 17.3808 5.92191 17.3621C8.76332 15.9177 11.6058 14.4756 14.4462 13.0279C17.7415 11.3479 21.0324 9.66136 24.3278 7.98139C28.5761 5.81593 32.8278 3.65488 37.0772 1.49162C37.0948 1.48281 37.1125 1.47621 37.1301 1.4685V4.67761C34.5542 5.98767 31.9783 7.29663 29.4035 8.6078C26.5941 10.0368 23.7846 11.4646 20.9773 12.8958C14.0253 16.4374 7.07654 19.9811 0.127803 23.5238C0.0914453 23.5425 0.052884 23.559 0.00330525 23.5822V23.4556C0.00330525 22.467 0.004407 21.4795 0.00110175 20.4909C0.00110175 20.3984 0.030849 20.3565 0.111277 20.3158C0.544265 20.1 0.983863 19.8953 1.40143 19.652C2.37648 19.085 2.87006 18.2263 2.86565 17.0968C2.86345 16.6091 2.81718 16.1214 2.82268 15.6337C2.85464 12.6118 3.66442 9.81548 5.29611 7.26801C7.00823 4.59504 9.32962 2.62334 12.2294 1.33419C13.4689 0.782642 14.7635 0.408338 16.1021 0.195866C17.2314 0.0175207 18.3673 -0.0430284 19.5087 0.0307315L19.5076 0.0318324Z"
				fill="currentColor"
			/>
		</svg>
	);
}

const projectTypes = [
	{ id: "all", label: "All Types" },
	{ id: "Wallet", label: "Wallet" },
	{ id: "DEX", label: "DEX" },
	{ id: "Lending", label: "Lending" },
	{ id: "Bridge", label: "Bridge" },
	{ id: "Payments", label: "Payments" },
	{ id: "Anchor", label: "Anchor" },
	{ id: "SDK", label: "SDK" },
	{ id: "Indexer", label: "Indexer" },
	{ id: "Explorer", label: "Explorer" },
	{ id: "Analytics", label: "Analytics" },
	{ id: "AI", label: "AI" },
	{ id: "Gaming", label: "Gaming" },
	{ id: "Education", label: "Education" },
	{ id: "Security", label: "Security" },
	{ id: "NFT", label: "NFT" },
	{ id: "RWA", label: "RWA" },
	{ id: "Stablecoin", label: "Stablecoin" },
	{ id: "Social Impact", label: "Social Impact" },
];

// All SCF rounds (newest first)
const scfRounds = [
	42, 41, 40, 39, 38, 37, 36, 35, 34, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24,
	23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 11, 10, 9, 8, 7, 6, 3, 2,
];

const sortOptions = [
	{ id: "featured", label: "Relevant" },
	{ id: "name-asc", label: "Name (A\u2013Z)" },
	{ id: "name-desc", label: "Name (Z\u2013A)" },
	{ id: "newest", label: "Newest" },
];

export function DirectoryFilters() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const searchQuery = searchParams.get("q") || "";
	const typeFilter = searchParams.get("type") || "all";
	const scfFilter = searchParams.get("scf") || "";
	const sortFilter = searchParams.get("sort") || "featured";
	const [typeDrawerOpen, setTypeDrawerOpen] = useState(false);
	const [scfDrawerOpen, setScfDrawerOpen] = useState(false);
	const [sortDrawerOpen, setSortDrawerOpen] = useState(false);
	const [inputValue, setInputValue] = useState(searchQuery);
	const debouncedSearch = useDebounce(inputValue, 300);

	const isScfActive = scfFilter !== "";

	const buildUrl = useCallback(
		(overrides: Record<string, string>) => {
			const params = new URLSearchParams();
			const q = overrides.q ?? searchQuery;
			const typ = overrides.type ?? typeFilter;
			const scf = overrides.scf ?? scfFilter;
			const sort = overrides.sort ?? sortFilter;
			if (q) params.set("q", q);
			if (typ !== "all") params.set("type", typ);
			if (scf) params.set("scf", scf);
			if (sort !== "featured") params.set("sort", sort);
			const qs = params.toString();
			return qs ? `/directory?${qs}` : "/directory";
		},
		[searchQuery, typeFilter, scfFilter, sortFilter],
	);

	useEffect(() => {
		if (debouncedSearch === searchQuery) return;
		router.replace(buildUrl({ q: debouncedSearch }));
		router.refresh();
	}, [debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		setInputValue(searchQuery);
	}, [searchQuery]);

	const clearSearch = () => {
		setInputValue("");
		router.replace(buildUrl({ q: "" }));
		router.refresh();
	};

	const handleTypeChange = (value: string) => {
		router.push(buildUrl({ type: value }));
		router.refresh();
		setTypeDrawerOpen(false);
	};

	const handleSortChange = (value: string) => {
		router.push(buildUrl({ sort: value }));
		router.refresh();
		setSortDrawerOpen(false);
	};

	const handleScfToggle = () => {
		router.push(buildUrl({ scf: isScfActive ? "" : "all" }));
		router.refresh();
	};

	const handleScfRoundChange = (round: string) => {
		router.push(buildUrl({ scf: round }));
		router.refresh();
		setScfDrawerOpen(false);
	};

	const handleSearchSubmit = (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		router.replace(buildUrl({ q: inputValue }));
	};

	const selectedTypeLabel =
		projectTypes.find((t) => t.id === typeFilter)?.label ?? "All Types";
	const selectedSortLabel =
		sortOptions.find((s) => s.id === sortFilter)?.label ?? "Relevant";
	const selectedScfLabel =
		scfFilter === "all" ? "All Rounds" : scfFilter ? `Round ${scfFilter}` : "";

	const btnBase =
		"h-11 px-4 bg-card text-foreground border border-border rounded-xl hover:bg-white/5 transition-all duration-150 flex items-center gap-2 outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]";

	// SCF button content (shared between desktop and mobile)
	const scfButtonContent = (
		<>
			<ScfIcon className="w-3.5 h-4 flex-shrink-0" />
			<span className="text-sm">SCF</span>
		</>
	);

	return (
		<form onSubmit={handleSearchSubmit} className="flex flex-col gap-3">
			{/* Row 1: Search + Type + Sort */}
			<div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
				{/* Search */}
				<div className="relative w-full md:max-w-[560px]">
					<Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
					<input
						type="text"
						name="q"
						placeholder="Search projects or organizations..."
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						className="w-full h-11 pl-12 pr-10 bg-card text-sm text-foreground placeholder-muted-foreground rounded-xl border border-border transition-all duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_#171717,0_0_0_4px_rgba(255,255,255,0.6)]"
					/>
					{inputValue && (
						<button
							type="button"
							onClick={clearSearch}
							className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors duration-150"
						>
							<X className="w-4 h-4" />
						</button>
					)}
				</div>

				{/* Desktop: Type + SCF + Sort + Rounds */}
				<div className="hidden md:flex md:items-center md:gap-3">
					{/* Type Dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger className={cn(btnBase, "min-w-[150px]")}>
							<span className="flex-1 text-left text-sm truncate">
								{selectedTypeLabel}
							</span>
							<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-[180px] max-h-[400px] overflow-y-auto">
							{projectTypes.map((type) => (
								<DropdownMenuItem
									key={type.id}
									onClick={() => handleTypeChange(type.id)}
									className={
										typeFilter === type.id
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5"
									}
								>
									{type.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>

					{/* SCF Toggle */}
					<button
						type="button"
						onClick={handleScfToggle}
						className={cn(
							btnBase,
							"px-4",
							isScfActive
								? "bg-white/10 border-white/20"
								: "text-muted-foreground",
						)}
					>
						{scfButtonContent}
					</button>

					{/* SCF Rounds Dropdown (appears when SCF is active) */}
					{isScfActive && (
						<DropdownMenu>
							<DropdownMenuTrigger className={cn(btnBase, "min-w-[140px]")}>
								<span className="flex-1 text-left text-sm truncate">
									{selectedScfLabel}
								</span>
								<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
							</DropdownMenuTrigger>
							<DropdownMenuContent className="w-[160px] max-h-[400px] overflow-y-auto">
								<DropdownMenuItem
									onClick={() => handleScfRoundChange("all")}
									className={
										scfFilter === "all"
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5"
									}
								>
									All Rounds
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								{scfRounds.map((round) => (
									<DropdownMenuItem
										key={round}
										onClick={() => handleScfRoundChange(String(round))}
										className={
											scfFilter === String(round)
												? "bg-white/10 text-foreground"
												: "text-foreground hover:bg-white/5"
										}
									>
										Round {round}
									</DropdownMenuItem>
								))}
							</DropdownMenuContent>
						</DropdownMenu>
					)}

					{/* Sort Dropdown */}
					<DropdownMenu>
						<DropdownMenuTrigger className={cn(btnBase, "min-w-[150px]")}>
							<ArrowUpDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
							<span className="flex-1 text-left text-sm truncate">
								{selectedSortLabel}
							</span>
							<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
						</DropdownMenuTrigger>
						<DropdownMenuContent className="w-[180px]">
							{sortOptions.map((option) => (
								<DropdownMenuItem
									key={option.id}
									onClick={() => handleSortChange(option.id)}
									className={
										sortFilter === option.id
											? "bg-white/10 text-foreground"
											: "text-foreground hover:bg-white/5"
									}
								>
									{option.label}
								</DropdownMenuItem>
							))}
						</DropdownMenuContent>
					</DropdownMenu>
				</div>

				{/* Mobile: Row 1 — Type + Sort */}
				<div className="md:hidden flex gap-3">
					<Drawer open={typeDrawerOpen} onOpenChange={setTypeDrawerOpen}>
						<DrawerTrigger asChild>
							<button type="button" className={cn("flex-1", btnBase)}>
								<span className="flex-1 text-left text-sm truncate">
									{selectedTypeLabel}
								</span>
								<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
							</button>
						</DrawerTrigger>
						<DrawerContent>
							<DrawerHeader>
								<DrawerTitle>Type</DrawerTitle>
								<DrawerDescription>Filter projects by type</DrawerDescription>
							</DrawerHeader>
							<div className="mt-4 space-y-1 pb-4 max-h-[60vh] overflow-y-auto">
								{projectTypes.map((type) => (
									<button
										key={type.id}
										type="button"
										onClick={() => handleTypeChange(type.id)}
										className={cn(
											"w-full text-left px-3 py-3 rounded-xl text-sm transition-all duration-150",
											typeFilter === type.id
												? "bg-[#262626] text-[#E5E5E5]"
												: "text-[#A3A3A3] hover:bg-[#222222] hover:text-[#E5E5E5]",
										)}
									>
										{type.label}
									</button>
								))}
							</div>
						</DrawerContent>
					</Drawer>

					<Drawer open={sortDrawerOpen} onOpenChange={setSortDrawerOpen}>
						<DrawerTrigger asChild>
							<button type="button" className={btnBase}>
								<ArrowUpDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
								<span className="text-sm truncate">{selectedSortLabel}</span>
							</button>
						</DrawerTrigger>
						<DrawerContent>
							<DrawerHeader>
								<DrawerTitle>Sort by</DrawerTitle>
								<DrawerDescription>
									Choose how to sort projects
								</DrawerDescription>
							</DrawerHeader>
							<div className="mt-4 space-y-1 pb-4">
								{sortOptions.map((option) => (
									<button
										key={option.id}
										type="button"
										onClick={() => handleSortChange(option.id)}
										className={cn(
											"w-full text-left px-3 py-3 rounded-xl text-sm transition-all duration-150",
											sortFilter === option.id
												? "bg-[#262626] text-[#E5E5E5]"
												: "text-[#A3A3A3] hover:bg-[#222222] hover:text-[#E5E5E5]",
										)}
									>
										{option.label}
									</button>
								))}
							</div>
						</DrawerContent>
					</Drawer>
				</div>

				{/* Mobile: Row 2 — SCF toggle + Rounds (own line) */}
				<div className="md:hidden flex gap-3">
					<button
						type="button"
						onClick={handleScfToggle}
						className={cn(
							btnBase,
							"px-4",
							isScfActive
								? "bg-white/10 border-white/20"
								: "text-muted-foreground",
						)}
					>
						{scfButtonContent}
					</button>

					{isScfActive && (
						<Drawer open={scfDrawerOpen} onOpenChange={setScfDrawerOpen}>
							<DrawerTrigger asChild>
								<button type="button" className={cn("flex-1", btnBase)}>
									<span className="flex-1 text-left text-sm truncate">
										{selectedScfLabel}
									</span>
									<ChevronDown className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
								</button>
							</DrawerTrigger>
							<DrawerContent>
								<DrawerHeader>
									<DrawerTitle>SCF Round</DrawerTitle>
									<DrawerDescription>Filter by funding round</DrawerDescription>
								</DrawerHeader>
								<div className="mt-4 space-y-1 pb-4 max-h-[60vh] overflow-y-auto">
									<button
										type="button"
										onClick={() => handleScfRoundChange("all")}
										className={cn(
											"w-full text-left px-3 py-3 rounded-xl text-sm transition-all duration-150",
											scfFilter === "all"
												? "bg-[#262626] text-[#E5E5E5]"
												: "text-[#A3A3A3] hover:bg-[#222222] hover:text-[#E5E5E5]",
										)}
									>
										All Rounds
									</button>
									{scfRounds.map((round) => (
										<button
											key={round}
											type="button"
											onClick={() => handleScfRoundChange(String(round))}
											className={cn(
												"w-full text-left px-3 py-3 rounded-xl text-sm transition-all duration-150",
												scfFilter === String(round)
													? "bg-[#262626] text-[#E5E5E5]"
													: "text-[#A3A3A3] hover:bg-[#222222] hover:text-[#E5E5E5]",
											)}
										>
											Round {round}
										</button>
									))}
								</div>
							</DrawerContent>
						</Drawer>
					)}
				</div>
			</div>
		</form>
	);
}
