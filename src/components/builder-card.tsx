import { Briefcase, Github, Globe, MapPin, Twitter } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import type { Builder } from "@/payload-types";

interface BuilderCardProps {
	builder: Builder;
}

export function BuilderCard({ builder }: BuilderCardProps) {
	const profileUrl = `/builders/${builder.github_username}`;

	return (
		<Card className="group hover:shadow-lg transition-all duration-300 overflow-hidden">
			<Link href={profileUrl}>
				<CardContent className="p-6">
					<div className="flex items-start space-x-4">
						{/* Avatar */}
						<div className="flex-shrink-0">
							{builder.avatar_url ? (
								<Image
									src={builder.avatar_url}
									alt={builder.display_name}
									width={64}
									height={64}
									className="rounded-full"
								/>
							) : (
								<div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
									{builder.display_name.charAt(0).toUpperCase()}
								</div>
							)}
						</div>

						{/* Content */}
						<div className="flex-1 min-w-0">
							<h3 className="text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
								{builder.display_name}
							</h3>

							{builder.role_title && (
								<div className="flex items-center text-sm text-muted-foreground mt-1">
									<Briefcase className="w-3 h-3 mr-1" />
									<span className="truncate">{builder.role_title}</span>
								</div>
							)}

							{builder.location && (
								<div className="flex items-center text-sm text-muted-foreground mt-1">
									<MapPin className="w-3 h-3 mr-1" />
									<span>{builder.location}</span>
								</div>
							)}

							{builder.bio && (
								<p className="text-sm text-muted-foreground mt-2 line-clamp-2">
									{builder.bio}
								</p>
							)}

							{/* Stats */}
							{builder.stats &&
								((builder.stats.totalCommits30d ?? 0) > 0 ||
									(builder.stats.activeDays30d ?? 0) > 0) && (
									<div className="flex items-center space-x-4 mt-3">
										{(builder.stats.totalCommits30d ?? 0) > 0 && (
											<div className="text-xs text-muted-foreground">
												<span className="font-semibold">
													{builder.stats.totalCommits30d}
												</span>{" "}
												commits
											</div>
										)}
										{(builder.stats.activeDays30d ?? 0) > 0 && (
											<div className="text-xs text-muted-foreground">
												<span className="font-semibold">
													{builder.stats.activeDays30d}
												</span>{" "}
												active days
											</div>
										)}
									</div>
								)}

							{/* Projects count */}
							{builder.projects && builder.projects.length > 0 && (
								<div className="text-xs text-muted-foreground mt-2">
									{builder.projects.length} project
									{builder.projects.length !== 1 ? "s" : ""}
								</div>
							)}

							{/* Social links */}
							<div className="flex items-center space-x-3 mt-3">
								{builder.github_username && (
									<a
										href={`https://github.com/${builder.github_username}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-muted-foreground hover:text-foreground transition-colors"
										onClick={(e) => e.stopPropagation()}
									>
										<Github className="w-4 h-4" />
									</a>
								)}
								{builder.website_url && (
									<a
										href={builder.website_url}
										target="_blank"
										rel="noopener noreferrer"
										className="text-muted-foreground hover:text-foreground transition-colors"
										onClick={(e) => e.stopPropagation()}
									>
										<Globe className="w-4 h-4" />
									</a>
								)}
								{builder.twitter_handle && (
									<a
										href={`https://twitter.com/${builder.twitter_handle.replace("@", "").replace("https://x.com/", "").replace("https://twitter.com/", "")}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-muted-foreground hover:text-foreground transition-colors"
										onClick={(e) => e.stopPropagation()}
									>
										<Twitter className="w-4 h-4" />
									</a>
								)}
							</div>
						</div>
					</div>
				</CardContent>
			</Link>
		</Card>
	);
}
