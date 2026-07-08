"use client";

import { Check, Link2 } from "lucide-react";
import { useState } from "react";

export function IdeaShareButton() {
	const [copied, setCopied] = useState(false);

	const handleShare = async () => {
		try {
			await navigator.clipboard.writeText(window.location.href);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			const input = document.createElement("input");
			input.value = window.location.href;
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
			className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground border border-border/50 hover:border-border bg-card transition-all duration-150"
		>
			{copied ? (
				<Check className="w-4 h-4 text-foreground" />
			) : (
				<Link2 className="w-4 h-4" />
			)}
			<span>{copied ? "Copied!" : "Copy link"}</span>
		</button>
	);
}
