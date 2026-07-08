import CompanyTicker from "@/components/company-ticker";
import { getPayloadSafe } from "@/lib/payload-client";

export default async function CarouselSection() {
	const payload = await getPayloadSafe();
	let items: any[] = [];

	if (payload) {
		try {
			const result = await payload.find({
				collection: "carousel",
				where: {
					active: {
						equals: true,
					},
				},
				sort: "order",
				depth: 1, // Populate image relationship
			});

			items = result.docs;
		} catch (error) {
			// Silently handle fetch errors
		}
	}

	return <CompanyTicker items={items} className="mb-24" />;
}
