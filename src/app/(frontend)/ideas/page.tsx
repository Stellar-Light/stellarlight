import type { Metadata } from "next";
import { IdeasListing } from "@/components/ideas-listing";

export const metadata: Metadata = {
	title: "Ideas & RFPs",
	description:
		"Discover confirmed RFPs for the Stellar ecosystem. Find opportunities to build and contribute to high-impact projects.",
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
