import { SiGithub, SiX, SiDiscord } from "react-icons/si";
import Image from "next/image";
import Link from "next/link";

export default function Footer() {
	return (
		<footer className="mt-16">
			<div className="max-w-6xl mx-auto px-6 py-12">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
					<div>
						<div className="flex items-center space-x-2 mb-4">
							<Image
								src="/logo.png"
								alt="Stellar Light Logo"
								width={32}
								height={32}
								className="w-8 h-8"
							/>
							<span className="text-lg font-semibold text-foreground">
								Stellar Light
							</span>
						</div>
						<p className="text-sm text-muted-foreground">
							Discover and submit innovative project ideas for the Stellar
							blockchain ecosystem.
						</p>
					</div>
					<div>
						<h4 className="font-semibold mb-4 text-foreground">Resources</h4>
						<ul className="space-y-2 text-sm text-muted-foreground">
							<li>
								<a
									href="https://communityfund.stellar.org/"
									target="_blank"
									rel="noopener noreferrer"
									className="hover:text-foreground transition-all duration-150"
								>
									Grants
								</a>
							</li>
							<li>
								<a
									href="https://developers.stellar.org/"
									target="_blank"
									rel="noopener noreferrer"
									className="hover:text-foreground transition-all duration-150"
								>
									Documentation
								</a>
							</li>
							<li>
								<Link
									href="/partners"
									className="hover:text-foreground transition-all duration-150"
								>
									Partner directory
								</Link>
							</li>
							<li>
								<Link
									href="/partners/chat"
									className="hover:text-foreground transition-all duration-150"
								>
									Find a partner
								</Link>
							</li>
						</ul>
					</div>
					<div>
						<h4 className="font-semibold mb-4 text-foreground">Community</h4>
						<div className="flex gap-4">
							<a
								href="https://twitter.com/StellarOrg"
								target="_blank"
								rel="noopener noreferrer"
								className="w-9 h-9 rounded-lg bg-[#262626] border border-[#2F2F2F] flex items-center justify-center hover:bg-white/5 hover:border-white/20 transition-all"
								aria-label="X (Twitter)"
								data-testid="link-footer-twitter"
							>
								<SiX className="w-4 h-4 text-[#E5E5E5]" />
							</a>
							<a
								href="https://github.com/stellar"
								target="_blank"
								rel="noopener noreferrer"
								className="w-9 h-9 rounded-lg bg-[#262626] border border-[#2F2F2F] flex items-center justify-center hover:bg-white/5 hover:border-white/20 transition-all"
								aria-label="GitHub"
								data-testid="link-footer-github"
							>
								<SiGithub className="w-4 h-4 text-[#E5E5E5]" />
							</a>
							<a
								href="https://discord.gg/8KtTHJPB8f"
								target="_blank"
								rel="noopener noreferrer"
								className="w-9 h-9 rounded-lg bg-[#262626] border border-[#2F2F2F] flex items-center justify-center hover:bg-white/5 hover:border-white/20 transition-all"
								aria-label="Discord"
								data-testid="link-footer-discord"
							>
								<SiDiscord className="w-4 h-4 text-[#E5E5E5]" />
							</a>
						</div>
					</div>
				</div>
				<div className="mt-8 pt-8 text-center text-sm text-muted-foreground">
					<p>&copy; {new Date().getFullYear()} Stellar Light</p>
				</div>
			</div>
		</footer>
	);
}

