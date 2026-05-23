"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** Legacy execCommand-based copy. Returns true on success. */
function legacyCopy(text: string): boolean {
	try {
		const ta = document.createElement("textarea");
		ta.value = text;
		ta.style.position = "fixed";
		ta.style.top = "-1000px";
		ta.style.opacity = "0";
		document.body.appendChild(ta);
		ta.focus();
		ta.select();
		const ok = document.execCommand("copy");
		ta.remove();
		return ok;
	} catch {
		return false;
	}
}

interface Props {
	command: string;
	className?: string;
}

/**
 * A code block that displays a shell command + a copy-to-clipboard
 * button inline on the right. Designed for install instructions
 * (e.g., `npx skills add Stellar-Light/stellar-scout`).
 */
export function CopyCommand({ command, className }: Props) {
	const [copied, setCopied] = useState(false);

	const handle = () => {
		const onSuccess = () => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		};

		if (navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(command).then(onSuccess, () => {
				if (legacyCopy(command)) onSuccess();
			});
			return;
		}
		if (legacyCopy(command)) onSuccess();
	};

	return (
		<div
			className={
				className ??
				"flex items-center gap-3 rounded-lg bg-black/40 border border-border/30 p-4 font-mono text-sm text-foreground overflow-hidden"
			}
		>
			<span className="flex-1 truncate select-all" aria-label="Install command">
				{command}
			</span>
			<button
				type="button"
				onClick={handle}
				className="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
				title={copied ? "Copied!" : "Copy command"}
				aria-label={copied ? "Command copied to clipboard" : "Copy command to clipboard"}
			>
				{copied ? (
					<Check className="w-4 h-4 text-emerald-400" />
				) : (
					<Copy className="w-4 h-4" />
				)}
			</button>
		</div>
	);
}
