import { useCallback, useEffect, useState } from "react";

export function useUrlParam(key: string, fallback = "") {
	const [value, setValue] = useState(fallback);

	useEffect(() => {
		setValue(new URLSearchParams(window.location.search).get(key) ?? fallback);
	}, [key, fallback]);

	const update = useCallback(
		(next: string) => {
			setValue(next);
			const url = new URL(window.location.href);
			if (next.trim() && next !== fallback) url.searchParams.set(key, next);
			else url.searchParams.delete(key);
			window.history.replaceState(null, "", url);
		},
		[key, fallback],
	);

	return [value, update] as const;
}
