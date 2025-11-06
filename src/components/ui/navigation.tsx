"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Menu, X, Home, Settings } from "lucide-react";
import Image from "next/image";
import { useState, useEffect } from "react";

export function Navigation() {
	const pathname = usePathname();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
	const [isAuthenticated, setIsAuthenticated] = useState(false);

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
		{ href: "/directory", label: "Projects" },
		{ href: "/entities", label: "Entities" },
		{ href: "/blog", label: "Blog" },
		{ href: "/submit", label: "Submit" },
	];

	return (
		<nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80 shadow-sm">
			<div className="container mx-auto flex h-20 items-center justify-between px-6">
				<Link
					href="/"
					className="flex items-center space-x-3 group transition-transform hover:scale-105"
				>
					<div className="flex h-10 w-10 items-center justify-center rounded-lg overflow-hidden">
						<Image
							src="/logo.png"
							alt="Stellar Light Logo"
							width={40}
							height={40}
							className="object-contain"
						/>
					</div>
					<span className="text-2xl font-bold tracking-tight">
						<span className="text-gradient">Stellar</span>
						<span className="text-foreground">Light</span>
					</span>
				</Link>

				<div className="hidden md:flex items-center space-x-1">
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

				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="icon"
						className="md:hidden h-10 w-10"
						onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
						type="button"
					>
						{mobileMenuOpen ? (
							<X className="h-5 w-5" />
						) : (
							<Menu className="h-5 w-5" />
						)}
					</Button>
				</div>
			</div>

			{mobileMenuOpen && (
				<div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl">
					<div className="container mx-auto px-6 py-4 space-y-1">
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
