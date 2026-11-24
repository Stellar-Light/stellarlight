import type { Metadata } from "next";
import { SdfCohortDashboard } from "@/components/sdf-cohort-dashboard";

/**
 * /partners/sdf/cohort: the cohort dashboard for the partners named in
 * COHORT_PARTNERS. The page itself carries no data: it asks for the
 * partner's key and reads the keyed /api/cohort/* endpoints with it, so the
 * numbers here are the API's numbers. noindex, absent from the sitemap, no
 * links to it.
 */
export const metadata: Metadata = {
	title: "Cohort | Stellar Light",
	description: "Partner-only cohort data.",
	robots: {
		index: false,
		follow: false,
		googleBot: { index: false, follow: false },
	},
};

export default function SdfCohortPage() {
	return <SdfCohortDashboard />;
}
