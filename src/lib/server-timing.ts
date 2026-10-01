/**
 * Our own wall time on a response, so a consumer can tell our latency from
 * the network's without a log dive. Research reports its phases; every
 * listing and detail route reports at least the total.
 */
export function serverTiming(startedAt: number): Record<string, string> {
	return { "Server-Timing": `total;dur=${Date.now() - startedAt}` };
}
