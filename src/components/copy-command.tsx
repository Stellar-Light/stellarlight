"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface CopyCommandProps {
	command: string;
}

export function CopyCommand({ command }: CopyCommandProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async (e: React.MouseEvent) => {
		// Prevent the parent link from being triggered
		e.preventDefault();
		e.stopPropagation();

		try {
			await navigator.clipboard.writeText(command);
		} catch {
			const input = document.createElement("input");
			input.value = command;
			document.body.appendChild(input);
			input.select();
			document.execCommand("copy");
			document.body.removeChild(input);
		}
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="mt-3 w-full flex items-center gap-2 bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 font-mono text-xs border border-white/10 transition-colors cursor-pointer"
		>
			<span className="text-muted-foreground select-none">$</span>
			<code className="flex-1 text-left truncate text-foreground/80">
				{command}
			</code>
			{copied ? (
				<Check className="w-3.5 h-3.5 text-foreground flex-shrink-0" />
			) : (
				<Copy className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
			)}
		</button>
	);
}
