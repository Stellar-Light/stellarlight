"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { STELLAR_SCOUT_SKILL } from "@/lib/stellar-scout-skill";

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
	className?: string;
	label?: string;
}

export function ScoutCopyButton({ className, label = "Copy skill" }: Props) {
	const [copied, setCopied] = useState(false);

	const handle = () => {
		const text = STELLAR_SCOUT_SKILL;
		const onSuccess = () => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		};

		if (navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(text).then(onSuccess, () => {
				if (legacyCopy(text)) onSuccess();
				else window.open("/skills/stellar-scout.md", "_blank");
			});
			return;
		}
		if (legacyCopy(text)) onSuccess();
		else window.open("/skills/stellar-scout.md", "_blank");
	};

	return (
		<button
			type="button"
			onClick={handle}
			className={
				className ??
				"inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-white/5 transition-colors"
			}
			title="Copy the Stellar Scout skill manifest to your clipboard"
		>
			{copied ? (
				<>
					<Check className="w-4 h-4" />
					Copied
				</>
			) : (
				<>
					<Copy className="w-4 h-4" />
					{label}
				</>
			)}
		</button>
	);
}
