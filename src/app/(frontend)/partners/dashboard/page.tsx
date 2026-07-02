import type { Metadata } from "next";
import { PartnerPortal } from "@/components/partner-portal";

/**
 * Partner portal — the self-service surface for ecosystem partners.
 *
 *   /partners/dashboard
 *
 * Login (against the partner-accounts auth collection) → see your profile
 * with the manual/verified split made visual → edit your own facts. The
 * AI chatbot onboarding (next brick) drops into this same shell as an
 * alternative to the form.
 *
 * Pure client component below — Payload's cookie auth + REST do all the
 * server work, so this stays a thin shell.
 */

export const metadata: Metadata = {
	title: "Partner Portal | Stellar Light",
	description:
		"Manage your ecosystem partner profile on Stellar Light. Keep your services, regions, and pricing current so builders (and their agents) can find you.",
	robots: { index: false, follow: false }, // private surface — keep out of search
};

export default function PartnerDashboardPage() {
	return <PartnerPortal />;
}
