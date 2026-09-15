/**
 * schema.org JSON-LD builders.
 *
 * The site had exactly one structured-data block (SoftwareApplication on
 * /skills/[slug]) while the directory we compete with ships Organization +
 * WebSite on its homepage and an ItemList on its projects page. For a
 * directory that is the cheap half of rich-result eligibility: ItemList is
 * what tells a crawler "this page is a list of these named things at these
 * URLs" rather than leaving it to infer that from markup.
 *
 * Every builder returns a plain object. Callers JSON.stringify it into a
 * <script type="application/ld+json">, the idiom already used on the skill
 * page — no user-controlled string reaches the JSON-LD body, so there is no
 * injection surface.
 */

const SITE_ID = "#org";
const WEBSITE_ID = "#website";

export interface JsonLdNode {
	"@type": string;
	[k: string]: unknown;
}

/** The publisher. One @id the other nodes point at, so a crawler reads the
 *  whole site as one entity rather than a page-shaped guess each time. */
export function organizationNode(base: string): JsonLdNode {
	return {
		"@type": "Organization",
		"@id": `${base}/${SITE_ID}`,
		name: "StellarLight",
		url: base,
		logo: `${base}/opengraph.png`,
		description:
			"A curated, continuously verified index of the Stellar ecosystem: projects, organizations, repositories, builders, audits and funding.",
		sameAs: ["https://github.com/Stellar-Light/stellarlight"],
	};
}

/** The site itself. `potentialAction` is what makes a sitelinks search box
 *  eligible — we already serve /directory?q=, so the capability is real and
 *  the markup is not a claim we cannot back. */
export function webSiteNode(base: string): JsonLdNode {
	return {
		"@type": "WebSite",
		"@id": `${base}/${WEBSITE_ID}`,
		url: base,
		name: "StellarLight",
		publisher: { "@id": `${base}/${SITE_ID}` },
		potentialAction: {
			"@type": "SearchAction",
			target: {
				"@type": "EntryPoint",
				urlTemplate: `${base}/directory?q={search_term_string}`,
			},
			"query-input": "required name=search_term_string",
		},
	};
}

/**
 * A page that IS a list. `numberOfItems` describes the items actually carried
 * in `itemListElement`, never the size of the collection behind it — an
 * ItemList claiming 1,115 while listing 24 is a mismatch a crawler can check,
 * and the whole point of this markup is that it agrees with the page.
 */
export function itemListNode(
	base: string,
	opts: {
		path: string;
		name: string;
		items: Array<{ name: string; url: string }>;
	},
): JsonLdNode {
	return {
		"@type": "ItemList",
		"@id": `${base}${opts.path}#list`,
		url: `${base}${opts.path}`,
		name: opts.name,
		numberOfItems: opts.items.length,
		itemListElement: opts.items.map((it, i) => ({
			"@type": "ListItem",
			position: i + 1,
			name: it.name,
			url: it.url.startsWith("http") ? it.url : `${base}${it.url}`,
		})),
	};
}

/** Wrap nodes in the @graph envelope crawlers expect. */
export function graph(nodes: JsonLdNode[]): Record<string, unknown> {
	return { "@context": "https://schema.org", "@graph": nodes };
}
