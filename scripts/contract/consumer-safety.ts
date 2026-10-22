/**
 * Consumer safety: two promises the main consumer's catalog build relies on,
 * checked by `pnpm contract:check` (build-contract.ts --check).
 *
 * 1. Every non-GET operation declares `x-side-effecting` as a boolean. The
 *    consumer refuses to build when an operation it exposes is marked true,
 *    and treats an unmarked one as safe, so a missing flag on an operation
 *    that writes reads as safe. matchPartners only reads, so it says false.
 * 2. An operationId the base spec served is not removed or renamed unless a
 *    changelog entry at this spec version names it and says BREAKING: the
 *    consumer keys its catalog on operationIds, so a silent rename breaks it.
 */
import type { ChangelogEntry } from "../../src/lib/changelog";

type Spec = { paths?: Record<string, unknown> };
type PathItem = Record<string, unknown>;

/** OpenAPI operation keys other than get. */
const NON_GET_METHODS = [
	"put",
	"post",
	"delete",
	"options",
	"head",
	"patch",
	"trace",
];

export function sideEffectingProblems(spec: Spec): string[] {
	const out: string[] = [];
	for (const [path, item] of Object.entries(spec.paths ?? {}))
		for (const method of NON_GET_METHODS) {
			const op = (item as PathItem)[method] as PathItem | undefined;
			if (op && typeof op["x-side-effecting"] !== "boolean")
				out.push(
					`${op.operationId ?? "an operation"} (${method.toUpperCase()} ${path}) must declare x-side-effecting: true if a call does anything beyond answering (creates a record, sends mail, feeds a listing), false if it only reads`,
				);
		}
	return out;
}

export function operationIds(spec: Spec): Set<string> {
	const ids = new Set<string>();
	for (const item of Object.values(spec.paths ?? {}))
		for (const op of Object.values(item as PathItem))
			if (op && typeof op === "object" && "operationId" in op)
				ids.add(String((op as { operationId: unknown }).operationId));
	return ids;
}

/** Base operationIds this spec no longer serves, minus those a changelog
 * entry at `spec@<version>` names beside the word BREAKING. */
export function unannouncedRemovals(
	base: Set<string>,
	current: Set<string>,
	changelog: ChangelogEntry[],
	version: string,
): string[] {
	const named = new Set(
		changelog
			.filter((e) => e.version === `spec@${version}`)
			.map((e) => `${e.summary} ${e.detail ?? ""}`)
			.filter((text) => /\bBREAKING\b/.test(text))
			.flatMap((text) => text.match(/\w+/g) ?? []),
	);
	return [...base].filter((id) => !current.has(id) && !named.has(id)).sort();
}
