import {
	entryBasisLine,
	placementSourceLine,
} from "@/lib/hackathon-build-links";

/** Where a build comes from and what its placement rests on, in the words
 * the event page and a builder's profile both use. showSource: also name a
 * DoraHacks row's source (a profile mixes sources; an event page does not). */
export function BuildSourceNote({
	row,
	event,
	showSource = false,
}: {
	row: {
		id: string;
		entryBasis?: string | null;
		contracts?: readonly unknown[] | null;
		isWinner?: boolean | null;
		winnerSource?: string | null;
	};
	event: string;
	showSource?: boolean;
}) {
	const basis =
		entryBasisLine(row, event) ??
		(showSource && row.id.startsWith("dorahacks-buidl-")
			? "DoraHacks submission."
			: null);
	const placement = placementSourceLine(row);
	if (!basis && !placement) return null;
	return (
		<p className="text-xs text-muted-foreground/80 mb-3">
			{basis}
			{placement && (
				<>
					{basis ? " " : ""}
					{placement}{" "}
					<a
						href={row.winnerSource ?? undefined}
						target="_blank"
						rel="noopener noreferrer"
						className="underline underline-offset-2"
					>
						Source
					</a>
				</>
			)}
		</p>
	);
}
