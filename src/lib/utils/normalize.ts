/**
 * Generate a URL-friendly slug from a string
 */
export function generateSlug(text: string): string {
	return text
		.toLowerCase()
		.trim()
		.replace(/[^\w\s-]/g, "")
		.replace(/[\s_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * Normalize a URL to extract and clean the domain
 * - Strips protocol (http/https)
 * - Removes www prefix
 * - Removes trailing slashes
 * - Converts to lowercase
 */
export function normalizeUrl(url: string | null | undefined): string | null {
	if (!url) return null;

	try {
		// Add protocol if missing for URL parsing
		let urlStr = url.trim();
		if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
			urlStr = `https://${urlStr}`;
		}

		const urlObj = new URL(urlStr);
		let domain = urlObj.hostname.toLowerCase();

		// Remove www prefix
		if (domain.startsWith("www.")) {
			domain = domain.slice(4);
		}

		return domain;
	} catch {
		// If URL parsing fails, try basic normalization
		let normalized = url.toLowerCase().trim();
		normalized = normalized.replace(/^https?:\/\//, "");
		normalized = normalized.replace(/^www\./, "");
		normalized = normalized.replace(/\/$/, "");
		return normalized.split("/")[0] || null;
	}
}

/**
 * Normalize a URL field (keeps full URL but normalized)
 */
export function normalizeUrlField(
	url: string | null | undefined,
): string | null {
	if (!url) return null;

	const trimmed = url.trim();
	if (!trimmed) return null;

	try {
		// Add protocol if missing
		let urlStr = trimmed;
		if (!urlStr.startsWith("http://") && !urlStr.startsWith("https://")) {
			urlStr = `https://${urlStr}`;
		}

		const urlObj = new URL(urlStr);
		urlObj.protocol = "https:"; // Normalize to https
		let hostname = urlObj.hostname.toLowerCase();

		// Remove www prefix
		if (hostname.startsWith("www.")) {
			hostname = hostname.slice(4);
			urlObj.hostname = hostname;
		}

		// Remove trailing slash
		urlObj.pathname = urlObj.pathname.replace(/\/$/, "");

		return urlObj.toString();
	} catch {
		return trimmed;
	}
}
