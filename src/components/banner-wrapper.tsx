import { getPayloadSafe } from "@/lib/payload-client";
import type { Banner } from "@/payload-types";
import { SiteBanner } from "./site-banner";

export async function BannerWrapper() {
	const payload = await getPayloadSafe();

	if (!payload) {
		return null;
	}

	try {
		const banner = (await payload.findGlobal({
			slug: "banner",
		})) as Banner;

		// Only render if banner is enabled and has a message
		if (!banner?.enabled || !banner?.message) {
			return null;
		}

		return (
			<SiteBanner
				message={banner.message}
				linkUrl={banner.linkUrl || null}
				backgroundColor={(banner.backgroundColor as any) || "primary"}
			/>
		);
	} catch (error) {
		// Silently handle fetch errors
		return null;
	}
}
