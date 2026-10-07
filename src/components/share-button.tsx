"use client";

import { Check, Share2 } from "lucide-react";
import { useState } from "react";
import { IconSwap, IconSwapItem } from "@/components/motion/icon-swap";

interface ShareButtonProps {
	slug: string;
}

export default function ShareButton({ slug }: ShareButtonProps) {
	const [copied, setCopied] = useState(false);

	const handleShare = async () => {
		const url = `${window.location.origin}/project/${slug}`;

		if (navigator.share) {
			try {
				await navigator.share({ url });
				return;
			} catch {
				// User cancelled or share failed — fall through to clipboard
			}
		}

		try {
			await navigator.clipboard.writeText(url);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Fallback for browsers that block clipboard
			const input = document.createElement("input");
			input.value = url;
			document.body.appendChild(input);
			input.select();
			document.execCommand("copy");
			document.body.removeChild(input);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	return (
		<button
			type="button"
			onClick={handleShare}
			className="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 font-semibold rounded-full border border-border/50 shadow-sm text-muted-foreground hover:text-foreground hover:border-border transition-all duration-150 cursor-pointer bg-transparent"
		>
			<IconSwap>
				{copied ? (
					<IconSwapItem key="copied">
						<Check className="w-3.5 h-3.5 text-foreground" />
					</IconSwapItem>
				) : (
					<IconSwapItem key="share">
						<Share2 className="w-3.5 h-3.5" />
					</IconSwapItem>
				)}
			</IconSwap>
			<span className={copied ? "text-foreground" : undefined}>
				{copied ? "Copied" : "Share"}
			</span>
		</button>
	);
}
