"use client";

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";

interface SocialEmbedProps {
	url: string;
}

function detectPlatform(url: string): "twitter" | "instagram" | "youtube" | "unknown" {
	if (/x\.com|twitter\.com/i.test(url)) return "twitter";
	if (/instagram\.com/i.test(url)) return "instagram";
	if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
	return "unknown";
}

function getYouTubeEmbedUrl(url: string): string | null {
	const patterns = [
		/youtube\.com\/watch\?v=([^&]+)/,
		/youtu\.be\/([^?]+)/,
		/youtube\.com\/embed\/([^?]+)/,
	];
	for (const p of patterns) {
		const m = url.match(p);
		if (m) return `https://www.youtube.com/embed/${m[1]}`;
	}
	return null;
}

function TwitterEmbed({ url }: { url: string }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!ref.current) return;

		const load = () => {
			if ((window as any).twttr?.widgets) {
				(window as any).twttr.widgets.load(ref.current);
			}
		};

		if ((window as any).twttr) {
			load();
		} else {
			const script = document.getElementById("twitter-wjs");
			if (!script) {
				const s = document.createElement("script");
				s.id = "twitter-wjs";
				s.src = "https://platform.twitter.com/widgets.js";
				s.async = true;
				s.onload = load;
				document.head.appendChild(s);
			} else {
				script.addEventListener("load", load);
			}
		}
	}, [url]);

	return (
		<div ref={ref} className="my-4 flex justify-center">
			<blockquote className="twitter-tweet" data-dnt="true" data-theme="dark">
				<a href={url}>{url}</a>
			</blockquote>
		</div>
	);
}

function InstagramEmbed({ url }: { url: string }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!ref.current) return;

		const load = () => {
			if ((window as any).instgrm?.Embeds) {
				(window as any).instgrm.Embeds.process();
			}
		};

		if ((window as any).instgrm) {
			load();
		} else {
			const script = document.getElementById("instagram-embed-js");
			if (!script) {
				const s = document.createElement("script");
				s.id = "instagram-embed-js";
				s.src = "https://www.instagram.com/embed.js";
				s.async = true;
				s.onload = load;
				document.head.appendChild(s);
			} else {
				script.addEventListener("load", load);
			}
		}
	}, [url]);

	return (
		<div ref={ref} className="my-4 flex justify-center">
			<blockquote
				className="instagram-media"
				data-instgrm-permalink={url}
				data-instgrm-version="14"
				style={{ maxWidth: 540, width: "100%" }}
			/>
		</div>
	);
}

function YouTubeEmbed({ url }: { url: string }) {
	const embedUrl = getYouTubeEmbedUrl(url);
	if (!embedUrl) return <FallbackEmbed url={url} />;

	return (
		<div className="my-4 aspect-video w-full overflow-hidden rounded-xl border border-border/50">
			<iframe
				src={embedUrl}
				title="YouTube video"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
				allowFullScreen
				className="h-full w-full"
			/>
		</div>
	);
}

function FallbackEmbed({ url }: { url: string }) {
	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			className="my-4 flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4 hover:border-primary/50 transition-colors"
		>
			<ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
			<span className="text-sm text-[#FDDA24] underline truncate">{url}</span>
		</a>
	);
}

export function SocialEmbed({ url }: SocialEmbedProps) {
	if (!url) return null;
	const platform = detectPlatform(url);

	if (platform === "twitter") return <TwitterEmbed url={url} />;
	if (platform === "instagram") return <InstagramEmbed url={url} />;
	if (platform === "youtube") return <YouTubeEmbed url={url} />;
	return <FallbackEmbed url={url} />;
}
