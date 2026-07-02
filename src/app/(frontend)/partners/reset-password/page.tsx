import type { Metadata } from "next";
import { Suspense } from "react";
import { PartnerResetPassword } from "@/components/partner-reset-password";

/**
 * Partner password reset / account-invite landing.
 *
 *   /partners/reset-password?token=…
 *
 * Where both partner-facing reset-token emails land:
 *   - "Forgot password" from the portal login card
 *   - the publish-invite email ("set your password") minted by the
 *     Partners afterChange hook
 *
 * Partners can't use Payload's default /admin/reset/:token page (they're
 * blocked from the admin panel), so this page POSTs the auto-mounted
 * REST endpoint /api/partner-accounts/reset-password instead.
 */

export const metadata: Metadata = {
	title: "Set your password | Stellar Light",
	description: "Set or reset your Stellar Light partner account password.",
	robots: { index: false, follow: false }, // token-bearing private surface
};

export default function PartnerResetPasswordPage() {
	return (
		// useSearchParams in the client component requires a Suspense boundary.
		<Suspense fallback={null}>
			<PartnerResetPassword />
		</Suspense>
	);
}
