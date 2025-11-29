import { getPayloadSafe } from "@/lib/payload-client";
import CompanyTicker from "@/components/company-ticker";

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
			console.error("Error fetching carousel items:", error);
		}
	}

	return <CompanyTicker items={items} className="mb-24" />;
}

