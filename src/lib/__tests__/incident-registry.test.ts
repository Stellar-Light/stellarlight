/**
 * The curated incident registry (scripts/ingest-incidents.ts) states each
 * incident from primary records: the ledger, the validators' SLP, and the
 * live frozen ledger keys entry, all read 2026-11-23. Golden
 * yieldblox-incident-facts asks for the event date, the drained quantity and
 * the quarantine; SLP-0008's freeze of the Mercado Bitcoin account is the
 * other Quorum Freeze on Mainnet and belongs next to it.
 */
import { describe, expect, it } from "vitest";
import { INCIDENTS } from "../../../scripts/ingest-incidents";
import { chunkMarkdown } from "../research-ingest";

const byId = (id: string) => {
	const inc = INCIDENTS.find((i) => i.id === id);
	if (!inc) throw new Error(`no incident ${id}`);
	return inc;
};

// The golden probe's forbidden renderings (sls-022).
const FORBIDDEN = [
	/may 2026.{0,40}(attempted|contained)/i,
	/\$61 ?m|61 million dollars/i,
];

describe("YieldBlox incident record", () => {
	const inc = byId("blend-2026-05-oracle-manipulation");
	const text = `${inc.title}\n${inc.body}`;

	it("states the event date, the drained quantities and their transactions", () => {
		expect(text).toContain("Event date: 2026-02-22");
		expect(text).toContain("61,249,278.3064502 XLM");
		expect(text).toContain("1,000,196.7040837 USDC");
		expect(text).toContain(
			"3e81a3f7b6e17cc22d0a1f33e9dcf90e5664b125b9e61f108b8d2f082f2d4657",
		);
		expect(text).toContain(
			"ae721cacee382bdecac8d2c47286ecd42cb4711f658bb2aec7cba60dc64a31ff",
		);
	});

	it("states the quarantine and the SLP-0006 freeze as restriction, not recovery", () => {
		expect(text).toMatch(/quarantined the attacker accounts/);
		expect(text).toContain("SLP-0006");
		expect(text).toContain("CAP-0077");
		expect(text).toContain("48,069,119.80 XLM");
		expect(text).toContain("restricted, not returned");
	});

	it("repeats no USD total that no primary record states", () => {
		expect(text).not.toMatch(/10\.2 ?million|\$10\.2|7\.3 ?million/i);
		for (const re of FORBIDDEN) expect(text).not.toMatch(re);
	});
});

describe("Mercado Bitcoin incident record", () => {
	const inc = byId("mercado-bitcoin-2026-11-wallet-drain");
	const text = `${inc.title}\n${inc.body}`;

	it("states the date, the XLM moved, its transaction and the SLP-0008 freeze", () => {
		expect(text).toContain("Event date: 2026-11-02");
		expect(text).toContain("6,717,490 XLM");
		expect(text).toContain(
			"869b6976c19eb51e41d266aa4b5945ad1a63719c8a4dc70e19e41181be898238",
		);
		expect(text).toContain("SLP-0008");
		expect(text).toContain(
			"GDXYRI6IONQA5YTGRLQ6O3FGJ2BWXPJTTQPUXFPSEXSRKBZLFKMZSOLP",
		);
		expect(text).toContain("not an exploit of the Stellar protocol");
	});
});

describe("Comet incident record", () => {
	const inc = byId("comet-2026-08-backstop-drain");
	const text = `${inc.title}\n${inc.body}`;

	it("states the date, the USDC drained, its first transaction and the attacker", () => {
		expect(text).toContain("Event date: 2026-08-25");
		expect(text).toContain("717,518.9234092 USDC");
		expect(text).toContain(
			"41c898a15b13658d45cb8fbef2e5d93f69a501c5093cb4c0296205d69e2fc622",
		);
		expect(text).toContain(
			"GCENJ4XBLXCPENO7HOIKD2DBAOBUOFZWS2DRHMCCDKC3PQYNSSGHWYHC",
		);
		expect(text).toContain(
			"CAS3FL6TLZKDGGSISDBWGGPXT3NRR4DYTZD7YOD3HMYO6LTJUVGRVEAM",
		);
	});

	it("keeps drain, white-hat payout and Blend's state apart, with no USD total", () => {
		expect(text).toContain("not recorded as returned");
		expect(text).toContain("Comet Incident Remediation");
		expect(text).toContain("no on-chain pause");
		expect(text).not.toMatch(/\$\s?717|717 ?k|USD total of/i);
	});
});

describe("every incident record", () => {
	it("compiles to one chunk under its own title, at a URL no SLP row holds", () => {
		const urls = new Set<string>();
		for (const inc of INCIDENTS) {
			const chunks = chunkMarkdown({
				md: `# ${inc.title}\n\n${inc.body}`,
				parentDocId: `incident-${inc.id}`,
				title: inc.title,
				url: inc.url,
				tags: inc.tags,
				publishedAt: inc.publishedAt,
			});
			expect(chunks, inc.id).toHaveLength(1);
			expect(chunks[0].title, inc.id).toBe(inc.title);
			// rank serves one row per URL: a second row at an SLP's URL drops.
			expect(inc.url, inc.id).not.toMatch(
				/stellar-protocol\/blob\/master\/limits\//,
			);
			urls.add(inc.url);
		}
		expect(urls.size).toBe(INCIDENTS.length);
	});
});
