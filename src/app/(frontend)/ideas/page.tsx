import type { Metadata } from "next";
import { IdeasListing } from "@/components/ideas-listing";

export const metadata: Metadata = {
	title: "Stellar Build Ideas & Open RFPs",
	description:
		"What to build on Stellar that someone will fund: open SCF requests for proposals, sponsor briefs and gaps in the ecosystem nobody has filled.",
	alternates: { canonical: "/ideas" },
};

export default function IdeasPage() {
	return (
		<div className="min-h-screen relative">
			<main className="max-w-6xl mx-auto px-4 sm:px-6 py-16 pt-28">
				<IdeasListing />
			</main>
		</div>
	);
}
