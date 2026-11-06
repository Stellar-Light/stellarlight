import { useCallback, useEffect, useState } from "react";

export function useQueryState<T extends string = string>(
	key: string,
	fallback: NoInfer<T>,
	allowed?: readonly T[],
) {
	const [value, setValue] = useState<T>(fallback);

	useEffect(() => {
		const raw = new URLSearchParams(window.location.search).get(key);
		const valid = raw !== null && (!allowed || allowed.includes(raw as T));
		setValue(valid ? (raw as T) : fallback);
	}, [key, fallback, allowed]);

	const update = useCallback(
		(next: T) => {
			setValue(next);
			const url = new URL(window.location.href);
			if (next === fallback) url.searchParams.delete(key);
			else url.searchParams.set(key, next);
			window.history.replaceState(null, "", url);
		},
		[key, fallback],
	);

	return [value, update] as const;
}
