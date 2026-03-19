"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Menu, X, Home, Settings, ChevronDown, Layers, Lightbulb, DollarSign, Building2 } from "lucide-react";
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
			} 
			else if (currentScrollY > lastScrollY.current && currentScrollY > 100) {
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
				const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
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

	const exploreItems = [
		{ name: "Projects", href: "/directory", description: "Discover Stellar projects", icon: Layers },
		{ name: "Entities", href: "/entities", description: "Explore organizations", icon: Building2 },
		{ name: "Ideas", href: "https://ideas.stellarlight.xyz/", description: "Browse project ideas", icon: Lightbulb },
		{ name: "Stablecoin", href: "https://stablecoin.stellarlight.xyz/", description: "Stellar stablecoin explorer", icon: DollarSign },
	];

	return (
		<nav
			className={cn(
				"fixed left-0 right-0 z-50 border-b bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 transition-all duration-300 ease-in-out border-border/40",
				hasScrolled ? 'shadow-[0_1px_3px_rgba(0,0,0,0.3)]' : 'shadow-sm',
				isVisible ? 'translate-y-0' : '-translate-y-full'
			)}
			style={{ top: 'var(--banner-height, 0px)' }}
		>
			<div className="container mx-auto flex h-16 items-center justify-between px-6">
				<div className="opacity-100 animate-in fade-in slide-in-from-top-2 duration-400">
					<Link
						href="/"
						className="flex items-center space-x-3 group transition-transform hover:scale-105"
						data-testid="logo-stellar-light"
					>
						<div className="flex h-8 w-8 items-center justify-center rounded-lg overflow-hidden">
							<Image
								src="/logo.png"
								alt="Stellar Light Logo"
								width={32}
								height={32}
								className="object-contain"
							/>
						</div>
						<span className="text-lg font-semibold text-foreground">
							Stellar Light
						</span>
					</Link>
				</div>

				<div className="hidden md:flex items-center space-x-1">
					<div 
						className="relative opacity-100 animate-in fade-in slide-in-from-top-2 duration-400 delay-200"
						onMouseEnter={() => setIsExploreOpen(true)}
						onMouseLeave={() => setIsExploreOpen(false)}
					>
						<button
							className="flex items-center gap-1.5 px-4 py-2 text-sm text-foreground transition-all duration-150 rounded-lg hover:bg-accent/50"
							data-testid="nav-explore"
						>
							Explore
							<ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isExploreOpen && 'rotate-180')} />
						</button>

						{isExploreOpen && (
							<div className="absolute right-0 top-full pt-2">
								<div className="w-[260px] bg-popover border border-border rounded-xl shadow-lg p-1 animate-in fade-in slide-in-from-top-1 duration-200">
									{exploreItems.map((item) => {
										const Icon = item.icon;
										const isExternal = item.href.startsWith('http');
										
										const content = (
											<div className="flex items-center gap-3">
												<Icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
												<div className="flex-1">
													<div className="text-sm font-medium text-foreground mb-1 group-hover:text-foreground transition-colors">
														{item.name}
													</div>
													<div className="text-xs text-muted-foreground leading-relaxed">
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
												className="block px-3 py-3 rounded-lg hover:bg-accent/50 transition-all duration-150 group"
												data-testid={`nav-link-${item.name.toLowerCase()}`}
											>
												{content}
											</a>
										) : (
											<Link
												key={item.name}
												href={item.href}
												className="block px-3 py-3 rounded-lg hover:bg-accent/50 transition-all duration-150 group"
												data-testid={`nav-link-${item.name.toLowerCase()}`}
											>
												{content}
											</Link>
										);
									})}
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
									? "text-primary bg-primary/10"
									: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
							)}
						>
							{item.label}
							{pathname === item.href && (
								<span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary via-[#FDDA24] to-primary/60 rounded-full" />
							)}
						</Link>
					))}

					{isAuthenticated && (
						<>
							<div className="mx-2 h-6 w-px bg-border" />
							<Link
								href="/"
								className="relative px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center gap-2"
								title="Home"
							>
								<Home className="w-4 h-4" />
								<span className="hidden lg:inline">Home</span>
							</Link>
							<Link
								href="/admin"
								className="relative px-4 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center gap-2"
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
					className="md:hidden p-2 rounded-lg hover:bg-accent/50 transition-all duration-150 opacity-100 animate-in fade-in slide-in-from-top-2 duration-400 delay-200"
					aria-label="Toggle menu"
					data-testid="button-mobile-menu"
				>
					{mobileMenuOpen ? (
						<X className="w-5 h-5 text-foreground" />
					) : (
						<Menu className="w-5 h-5 text-foreground" />
					)}
				</button>
			</div>

			{mobileMenuOpen && (
				<div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl animate-in slide-in-from-top-2 duration-200">
					<div className="container mx-auto px-6 py-4 space-y-1">
						{exploreItems.map((item) => {
							const Icon = item.icon;
							const isExternal = item.href.startsWith('http');
							
							const content = (
								<div className="flex items-center gap-3">
									<Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
									<div className="flex-1">
										<div className="font-medium text-foreground mb-1">{item.name}</div>
										<div className="text-xs text-muted-foreground leading-relaxed">{item.description}</div>
									</div>
								</div>
							);
							
							return isExternal ? (
								<a
									key={item.name}
									href={item.href}
									target="_blank"
									rel="noopener noreferrer"
									className="block px-3 py-3 rounded-xl text-sm hover:bg-accent/50 transition-all duration-150 active:bg-accent"
									onClick={() => setMobileMenuOpen(false)}
									data-testid={`mobile-nav-link-${item.name.toLowerCase()}`}
								>
									{content}
								</a>
							) : (
								<Link
									key={item.name}
									href={item.href}
									className="block px-3 py-3 rounded-xl text-sm hover:bg-accent/50 transition-all duration-150 active:bg-accent"
									onClick={() => setMobileMenuOpen(false)}
									data-testid={`mobile-nav-link-${item.name.toLowerCase()}`}
								>
									{content}
								</Link>
							);
						})}
						{navItems.map((item) => (
							<Link
								key={item.href}
								href={item.href}
								onClick={() => setMobileMenuOpen(false)}
								className={cn(
									"block px-4 py-3 text-sm font-medium rounded-lg transition-colors",
									pathname === item.href
										? "text-primary bg-primary/10"
										: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
								)}
							>
								{item.label}
							</Link>
						))}
						{isAuthenticated && (
							<>
								<div className="my-2 h-px bg-border" />
								<Link
									href="/"
									onClick={() => setMobileMenuOpen(false)}
									className="block px-4 py-3 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center gap-2"
								>
									<Home className="w-4 h-4" />
									Home
								</Link>
								<Link
									href="/admin"
									onClick={() => setMobileMenuOpen(false)}
									className="block px-4 py-3 text-sm font-medium rounded-lg transition-colors text-muted-foreground hover:text-foreground hover:bg-accent/50 flex items-center gap-2"
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
