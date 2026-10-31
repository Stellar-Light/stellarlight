/**
 * The research golden eval's junk rule, shared so every reader of a served
 * research passage judges "junk" the same way: the golden eval
 * (run-golden.ts) and the Jev source scoring (jev-eval.ts --task sources),
 * which uses it as the non-Jev baseline.
 */

/** Chunks that should never dominate a result set: pure nav, dates, boilerplate. */
export const JUNK_TITLE =
	/^\d{4}-\d{2}-\d{2}$|posts tagged|^meeting notes$|^on this page$/i;

/** True when a chunk has under 200 characters of body once headers,
 * breadcrumb bullets and "On this page" scaffolding are stripped. */
export function isThin(content: string): boolean {
	const body = content
		.replace(/^#.*$/gm, "")
		.replace(/^\s*[-*]\s.*$/gm, "")
		.replace(/on this page/gi, "")
		.trim();
	return body.length < 200;
}
