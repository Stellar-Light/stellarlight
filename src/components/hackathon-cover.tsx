import Image from "next/image";

/**
 * The cover panel on a hackathon card.
 *
 * Only the DoraHacks feed ships artwork; hand-tracked events (HackMeridian,
 * Rise In, Luma) carry whatever their organizer publishes, and a few have
 * nothing at all. The banner used to be wrapped in `image_url && (...)`, so a
 * coverless row lost its whole header — including the Open / Upcoming /
 * Winners badges that live inside it. This always renders a panel: the image
 * when there is one, a quiet monogram when there isn't.
 */
export function HackathonCover({
	src,
	title,
	organization,
	aspect,
	sizes,
	children,
}: {
	src?: string;
	title: string;
	organization?: string;
	/** Tailwind aspect classes — cards and banners want different ratios. */
	aspect: string;
	sizes?: string;
	/** Badges and affordances layered over the cover. */
	children?: React.ReactNode;
}) {
	const monogram = (organization ?? title).trim().charAt(0).toUpperCase();

	return (
		<div
			className={`relative w-full ${aspect} overflow-hidden bg-white/[0.02]`}
		>
			{src ? (
				<>
					<Image
						src={src}
						alt={title}
						fill
						sizes={sizes}
						className="object-cover group-hover:scale-[1.03] transition-transform duration-300"
					/>
					<div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
				</>
			) : (
				<div className="absolute inset-0 flex items-center justify-center border-b border-border/50 bg-[radial-gradient(120%_120%_at_50%_0%,rgba(255,255,255,0.06),transparent_70%)]">
					<span
						aria-hidden="true"
						className="text-5xl font-semibold tracking-tight text-white/15 select-none"
					>
						{monogram}
					</span>
				</div>
			)}
			{children}
		</div>
	);
}
