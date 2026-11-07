/**
 * The concierge card renders a partner whose curated lists are null (#1909):
 * partnerAssistant serves null sectors and regions when none is recorded,
 * never "none", and the card read both as arrays.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchCard } from "./partner-concierge-chat";

const partner = (over: Record<string, unknown> = {}) => ({
	slug: "tools-x",
	name: "Tools X",
	partnerType: "tooling",
	tagline: "Developer tooling",
	websiteUrl: null,
	acceptingClients: true,
	sectors: null,
	regions: null,
	assets: null,
	seps: null,
	rampTypes: null,
	freshness: "fresh",
	url: "https://stellarlight.xyz/partners/tools-x",
	...over,
});

describe("MatchCard", () => {
	it("renders a partner with no sectors or regions recorded", () => {
		const html = renderToStaticMarkup(<MatchCard p={partner()} />);
		expect(html).toContain("Tools X");
	});

	it("still shows the sectors a curator recorded", () => {
		const html = renderToStaticMarkup(
			<MatchCard p={partner({ sectors: ["payments"], regions: ["latam"] })} />,
		);
		expect(html).toContain("Payments");
	});
});
