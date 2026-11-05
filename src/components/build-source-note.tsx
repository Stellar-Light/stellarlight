import {
	entryBasisLine,
	placementSourceLine,
} from "@/lib/hackathon-build-links";

/** A source URL as text: its host and path, no scheme. */
const sourceText = (url: string) => url.replace(/^https?:\/\//, "");

/** Where a build comes from and what its placement rests on, in the words
 * the event page and a builder's profile both use. showSource: also name a
 * DoraHacks row's source (a profile mixes sources; an event page does not).
 * linkSource: link the placement's source; only where no outer link wraps
 * the note (a card is a link, so there it is named as text). */
export function BuildSourceNote({
	row,
	event,
	showSource = false,
	linkSource = false,
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
	linkSource?: boolean;
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
					{linkSource ? (
						<a
							href={row.winnerSource ?? undefined}
							target="_blank"
							rel="noopener noreferrer"
							className="underline underline-offset-2"
						>
							Source
						</a>
					) : (
						<span className="break-all">
							Source: {sourceText(row.winnerSource ?? "")}
						</span>
					)}
				</>
			)}
		</p>
	);
}
