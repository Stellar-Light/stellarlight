/**
 * Our own wall time on a response, so a consumer can tell our latency from
 * the network's without a log dive. Research reports its phases; every
 * listing and detail route reports at least the total.
 */
const bootAt = Date.now();
let served = 0;

export function serverTiming(startedAt: number): Record<string, string> {
	served += 1;
	const parts = [`total;dur=${Date.now() - startedAt}`];
	// The first request an instance serves is the one that paid the cold
	// start; the marker lets a consumer separate that minute from the rest.
	if (served === 1)
		parts.unshift(`cold;dur=${Math.max(0, startedAt - bootAt)}`);
	return { "Server-Timing": parts.join(", ") };
}
