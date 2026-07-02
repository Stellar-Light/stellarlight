"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Menu, X, Home, Settings, ChevronDown, Layers, Lightbulb, DollarSign, Building2, Trophy, Code2, Users, Sparkles, Terminal, MessageCircleQuestion, Handshake } from "lucide-react";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";

export function Navigation() {
	const pathname = usePathname();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isExploreOpen, setIsExploreOpen] = useState(false);
	const [isVisible, setIsVisible] = useState(true);
	const [hasScrolled, setHasScrolled] = useState(false);
	const lastScrollY = useRef(0);

	// Auto-hide navbar on scroll
	useEffect(() => {
		const handleScroll = () => {
			const currentScrollY = window.scrollY;

			setHasScrolled(currentScrollY > 20);

			if (currentScrollY < lastScrollY.current || currentScrollY < 100) {
				setIsVisible(true);
			} else if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
				setIsVisible(false);
				setIsExploreOpen(false);
				setMobileMenuOpen(false);
			}

			lastScrollY.current = currentScrollY;
		};

		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => window.removeEventListener("scroll", handleScroll);
	}, []);

	// Check if user is authenticated (only admins should see admin links)
	// This MUST be strict - only show admin links if user is actually logged in
	useEffect(() => {
		const checkAuth = async () => {
			try {
				// Always use window.location.origin in the browser — NEXT_PUBLIC_APP_URL
				// is inlined at build time and may not match the live origin.
				const appUrl = window.location.origin;
				// Use Payload's auth endpoint - if this returns 200, user is authenticated
				const response = await fetch(`${appUrl}/api/users/me`, {
					credentials: "include",
					method: "GET",
					headers: {
						"Content-Type": "application/json",
					},
				});
				
				// STRICT CHECK: Only set authenticated if:
				// 1. Response is 200 OK
				// 2. Response contains user data (could be direct user object or wrapped in 'user' property)
				// 3. User has an ID (proving they're logged in)
				if (response.status === 200) {
					try {
						const data = await response.json();
						// Payload might return user directly or wrapped in 'user' property
						const user = data?.user || data;
						// Check if we have valid user data with an ID
						const hasValidUser = user && typeof user === 'object' && user.id;
						setIsAuthenticated(hasValidUser);
					} catch (parseError) {
						// If we can't parse the response, assume not authenticated
						setIsAuthenticated(false);
					}
				} else {
					// Any non-200 response means not authenticated
					setIsAuthenticated(false);
				}
			} catch (error) {
				// On ANY error (network, CORS, etc.), assume NOT authenticated
				// This is the safe default - never show admin links unless we're 100% sure
				setIsAuthenticated(false);
			}
		};
		
		// Check immediately
		checkAuth();
		
		// Re-check auth periodically to handle logout scenarios (every 2 minutes)
		const interval = setInterval(checkAuth, 120000);
		return () => clearInterval(interval);
	}, []);

	const navItems = [
		{ href: "/blog", label: "Blog" },
		{ href: "/submit", label: "Submit" },
	];

	// Grouped explore items — laid out side-by-side on desktop, accordion-style
	// section headers on mobile. Keeps the menu scannable as it grows.
	// Ideas link now points to the local /ideas page (replaced the external
	// ideas.stellarlight.xyz redirect when the RFPs platform shipped in PR #77).
	const exploreGroups = [
		{
			label: "Directory",
			items: [
				{ name: "Projects", href: "/directory", description: "Discover Stellar projects", icon: Layers },
				{ name: "Partners", href: "/partners", description: "Anchors, ramps, auditors & infra to build with", icon: Handshake },
				{ name: "Builders", href: "/builders", description: "Meet Stellar developers", icon: Users },
				{ name: "Entities", href: "/entities", description: "Explore organizations", icon: Building2 },
				{ name: "Hackathons", href: "/hackathons", description: "Ecosystem hackathon events", icon: Code2 },
			],
		},
		{
			label: "Build & Insights",
			items: [
				{ name: "Ask Stellar", href: "/ask", description: "Ask the ecosystem in natural language", icon: MessageCircleQuestion },
				{ name: "Scout", href: "/scout", description: "AI skill for Stellar ecosystem research", icon: Sparkles },
				{ name: "Skills", href: "/skills", description: "AI tool marketplace for Stellar builders", icon: Terminal },
				{ name: "Ideas", href: "/ideas", description: "Browse RFPs & project ideas", icon: Lightbulb },
				{ name: "Developer Activity", href: "/leaderboard", description: "Developer and ecosystem metrics", icon: Trophy },
				{ name: "Stablecoin", href: "https://stablecoin.stellarlight.xyz/", description: "Stellar stablecoin explorer", icon: DollarSign },
			],
		},
	];
	const exploreItems = exploreGroups.flatMap((g) => g.items);

	return (
		<nav
			className={cn(
				"fixed left-0 w-screen z-50 border-b bg-[#171717] border-[#2F2F2F] transition-all duration-300 ease-in-out overflow-visible",
				hasScrolled ? 'shadow-[0_1px_3px_rgba(0,0,0,0.3)]' : '',
				isVisible ? 'translate-y-0' : '-translate-y-full'
			)}
			style={{ top: 'var(--banner-height, 0px)' }}
		>
			<div className="w-full max-w-6xl mx-auto flex h-16 items-center justify-between px-6">
				<div>
					<Link
						href="/"
						className="flex items-center space-x-3"
						data-testid="logo-stellar-light"
					>
						<Image
							src="/logo.png"
							alt="Stellar Light Logo"
							width={32}
							height={32}
							className="w-8 h-8 object-contain"
						/>
						<span className="text-sm font-semibold text-[#E5E5E5] stellar-light-logo">
							Stellar Light
						</span>
					</Link>
				</div>

				<div className="hidden md:flex items-center space-x-1">
					<div
						className="relative"
						onMouseEnter={() => setIsExploreOpen(true)}
						onMouseLeave={() => setIsExploreOpen(false)}
					>
						<button
							className="flex items-center gap-1.5 px-4 py-2 text-sm text-[#E5E5E5] transition-all duration-150 rounded-lg hover:bg-white/5"
							data-testid="nav-explore"
						>
							Explore
							<ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isExploreOpen && 'rotate-180')} />
						</button>

						{isExploreOpen && (
							<div className="absolute right-0 top-full pt-2 z-50">
								<div className="w-[540px] bg-[#262626] border border-[#2F2F2F] rounded-xl shadow-[0_4px_12px_rgba(0,0,0,0.4)] p-3 grid grid-cols-2 gap-x-2 animate-in fade-in slide-in-from-top-1 duration-200">
									{exploreGroups.map((group) => (
										<div key={group.label}>
											<div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-[#737373] font-medium">
												{group.label}
											</div>
											<div className="space-y-0.5">
												{group.items.map((item) => {
													const Icon = item.icon;
													const isExternal = item.href.startsWith('http');

													const content = (
														<div className="flex items-start gap-3">
															<Icon className="w-4 h-4 text-[#A3A3A3] group-hover:text-white transition-colors flex-shrink-0 mt-0.5" />
															<div className="flex-1 min-w-0">
																<div className="text-sm font-medium text-[#E5E5E5] mb-0.5 group-hover:text-white transition-colors">
																	{item.name}
																</div>
																<div className="text-xs text-[#A3A3A3] leading-snug">
																	{item.description}
																</div>
															</div>
														</div>
													);

													return isExternal ? (
														<a
															key={item.name}
															href={item.href}
															target="_blank"
															rel="noopener noreferrer"
															className="block px-3 py-2.5 rounded-lg hover:bg-white/5 transition-all duration-150 group"
															data-testid={`nav-link-${item.name.toLowerCase()}`}
														>
															{content}
														</a>
													) : (
														<Link
															key={item.name}
															href={item.href}
															className="block px-3 py-2.5 rounded-lg hover:bg-white/5 transition-all duration-150 group"
															data-testid={`nav-link-${item.name.toLowerCase()}`}
														>
															{content}
														</Link>
													);
												})}
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</div>

					{navItems.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className={cn(
								"relative px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300",
								pathname === item.href
									? "text-white bg-white/10"
									: "text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/5",
							)}
						>
							{item.label}
						</Link>
					))}

					{isAuthenticated && (
						<>
							<div className="mx-2 h-6 w-px bg-[#2F2F2F]" />
							<Link
								href="/"
								className="relative px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/5 flex items-center gap-2"
								title="Home"
							>
								<Home className="w-4 h-4" />
								<span className="hidden lg:inline">Home</span>
							</Link>
							<Link
								href="/admin"
								className="relative px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/5 flex items-center gap-2"
								title="Admin Panel"
							>
								<Settings className="w-4 h-4" />
								<span className="hidden lg:inline">Admin</span>
							</Link>
						</>
					)}
				</div>

				<button
					onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
					className="md:hidden p-2 rounded-lg hover:bg-white/5 transition-all duration-150"
					aria-label="Toggle menu"
					data-testid="button-mobile-menu"
				>
					{mobileMenuOpen ? (
						<X className="w-5 h-5 text-[#E5E5E5]" />
					) : (
						<Menu className="w-5 h-5 text-[#E5E5E5]" />
					)}
				</button>
			</div>

			{mobileMenuOpen && (
				<div className="md:hidden border-t border-[#2F2F2F] animate-in slide-in-from-top duration-200">
					<div className="px-6 py-3 space-y-1">
						{exploreGroups.map((group, idx) => (
							<details
								key={group.label}
								open={idx === 0}
								className="group"
							>
								<summary className="cursor-pointer list-none flex items-center justify-between px-3 py-2.5 rounded-lg text-xs uppercase tracking-wider text-[#A3A3A3] font-semibold hover:bg-white/5 active:bg-white/10 transition-colors">
									<span>{group.label}</span>
									<ChevronDown className="w-3.5 h-3.5 transition-transform duration-200 group-open:rotate-180" />
								</summary>
								<div className="space-y-0.5 pb-2">
									{group.items.map((item) => {
										const Icon = item.icon;
										const isExternal = item.href.startsWith('http');

										const content = (
											<div className="flex items-center gap-3">
												<Icon className="w-4 h-4 text-[#A3A3A3] flex-shrink-0" />
												<span className="text-sm font-medium text-[#E5E5E5]">
													{item.name}
												</span>
											</div>
										);

										return isExternal ? (
											<a
												key={item.name}
												href={item.href}
												target="_blank"
												rel="noopener noreferrer"
												className="block px-6 py-2 rounded-lg hover:bg-white/5 transition-all duration-150 active:bg-white/10"
												onClick={() => setMobileMenuOpen(false)}
												data-testid={`mobile-nav-link-${item.name.toLowerCase()}`}
											>
												{content}
											</a>
										) : (
											<Link
												key={item.name}
												href={item.href}
												className="block px-6 py-2 rounded-lg hover:bg-white/5 transition-all duration-150 active:bg-white/10"
												onClick={() => setMobileMenuOpen(false)}
												data-testid={`mobile-nav-link-${item.name.toLowerCase()}`}
											>
												{content}
											</Link>
										);
									})}
								</div>
							</details>
						))}
						{navItems.map((item) => (
							<Link
								key={item.href}
								href={item.href}
								onClick={() => setMobileMenuOpen(false)}
								className={cn(
									"block px-4 py-3 text-sm font-medium rounded-lg transition-colors",
									pathname === item.href
										? "text-white bg-white/10"
										: "text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/5",
								)}
							>
								{item.label}
							</Link>
						))}
						{isAuthenticated && (
							<>
								<div className="my-2 h-px bg-[#2F2F2F]" />
								<Link
									href="/"
									onClick={() => setMobileMenuOpen(false)}
									className="block px-4 py-3 text-sm font-medium rounded-lg transition-colors text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/5 flex items-center gap-2"
								>
									<Home className="w-4 h-4" />
									Home
								</Link>
								<Link
									href="/admin"
									onClick={() => setMobileMenuOpen(false)}
									className="block px-4 py-3 text-sm font-medium rounded-lg transition-colors text-[#A3A3A3] hover:text-[#E5E5E5] hover:bg-white/5 flex items-center gap-2"
								>
									<Settings className="w-4 h-4" />
									Admin Panel
								</Link>
							</>
						)}
					</div>
				</div>
			)}
		</nav>
	);
}
