import { redirect } from "next/navigation";

/**
 * /partners/join → /partners/chat
 *
 * The standalone "get listed" chat was superseded by the partner concierge,
 * which handles BOTH finding a partner and getting listed in one surface.
 * This route survives only as a redirect for old links.
 */
export default function PartnerJoinPage() {
	redirect("/partners/chat");
}
