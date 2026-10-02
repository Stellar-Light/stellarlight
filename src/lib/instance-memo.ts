/**
 * Per-instance memo of an async build: one in-flight promise shared by every
 * caller that arrives while it runs, kept for ttlMs, dropped on rejection so
 * the next caller rebuilds. For reads that do not depend on the request and
 * were repeated on every call. ponytail: per instance; a shared cache if the
 * instance count makes this matter.
 */
export function instanceMemo<T>(
	ttlMs: number,
	build: () => Promise<T>,
): () => Promise<T> {
	let slot: { at: number; value: Promise<T> } | null = null;
	return () => {
		const now = Date.now();
		if (!slot || now - slot.at > ttlMs) {
			const value = build();
			slot = { at: now, value };
			value.catch(() => {
				slot = null;
			});
		}
		return slot.value;
	};
}
