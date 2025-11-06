"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export function Navigation() {
	const pathname = usePathname();
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

	const navItems = [
		{ href: "/directory", label: "Projects" },
		{ href: "/entities", label: "Entities" },
		{ href: "/submit", label: "Submit" },
	];

	return (
		<nav className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
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
								"relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
								pathname === item.href
									? "text-primary bg-primary/10"
									: "text-muted-foreground hover:text-foreground hover:bg-accent/50",
							)}
						>
							{item.label}
							{pathname === item.href && (
								<span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary to-primary/60 rounded-full" />
							)}
						</Link>
					))}
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
					</div>
				</div>
			)}
		</nav>
	);
}
