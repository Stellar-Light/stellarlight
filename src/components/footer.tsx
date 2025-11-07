export default function Footer() {
	return (
		<footer className="mt-24 border-t border-border/50 bg-background/50 backdrop-blur-sm">
			<div className="max-w-7xl mx-auto px-6 py-16">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
					<div className="space-y-4">
						<div className="flex items-center space-x-2 mb-2">
							<span className="text-xl font-bold text-foreground">
								Stellar Light
							</span>
						</div>
						<p className="text-sm text-muted-foreground leading-relaxed">
							Explore dApps, Tools, Stablecoins, Wallets, DAOs & more built on
							Stellar. Your gateway to the Stellar ecosystem.
						</p>
					</div>
					<div>
						<h4 className="font-semibold mb-5 text-foreground">Resources</h4>
						<ul className="space-y-3 text-sm text-muted-foreground">
							<li>
								<a
									href="https://communityfund.stellar.org/"
									target="_blank"
									rel="noopener noreferrer"
									className="hover:text-foreground transition-colors duration-200 hover:translate-x-1 inline-block"
								>
									Grants
								</a>
							</li>
							<li>
								<a
									href="https://developers.stellar.org/"
									target="_blank"
									rel="noopener noreferrer"
									className="hover:text-foreground transition-colors duration-200 hover:translate-x-1 inline-block"
								>
									Documentation
								</a>
							</li>
						</ul>
					</div>
					<div>
						<h4 className="font-semibold mb-5 text-foreground">Community</h4>
						<ul className="space-y-3 text-sm text-muted-foreground">
							<li>
								<a
									href="https://discord.gg/8KtTHJPB8f"
									target="_blank"
									rel="noopener noreferrer"
									className="hover:text-foreground transition-colors duration-200 hover:translate-x-1 inline-block"
								>
									Discord
								</a>
							</li>
							<li>
								<a
									href="https://x.com/BuildOnStellar"
									target="_blank"
									rel="noopener noreferrer"
									className="hover:text-foreground transition-colors duration-200 hover:translate-x-1 inline-block"
								>
									X (Twitter)
								</a>
							</li>
						</ul>
					</div>
				</div>
				<div className="pt-8 border-t border-border/50 text-center text-sm text-muted-foreground">
					<p>&copy; 2025 Stellar Light. All rights reserved.</p>
				</div>
			</div>
		</footer>
	);
}

