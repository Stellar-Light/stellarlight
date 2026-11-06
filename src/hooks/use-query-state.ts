import { useCallback, useEffect, useState } from "react";

type QueryValue = string | number | boolean;

function parse<T extends QueryValue>(
	raw: string | null,
	fallback: T,
	allowed?: readonly T[],
): T {
	if (raw === null) return fallback;
	let value: QueryValue = raw;
	if (typeof fallback === "boolean") value = raw === "1";
	if (typeof fallback === "number") value = Number(raw);
	if (Number.isNaN(value)) return fallback;
	if (allowed && !allowed.includes(value as T)) return fallback;
	return value as T;
}

export function useQueryState<T extends string | number>(
	key: string,
	fallback: T,
	allowed: readonly T[],
): readonly [T, (next: T) => void];
export function useQueryState(
	key: string,
	fallback: string,
): readonly [string, (next: string) => void];
export function useQueryState(
	key: string,
	fallback: number,
): readonly [number, (next: number) => void];
export function useQueryState(
	key: string,
	fallback: boolean,
): readonly [boolean, (next: boolean) => void];
export function useQueryState<T extends QueryValue>(
	key: string,
	fallback: T,
	allowed?: readonly T[],
) {
	const [value, setValue] = useState<T>(fallback);

	useEffect(() => {
		const raw = new URLSearchParams(window.location.search).get(key);
		setValue(parse(raw, fallback, allowed));
	}, [key, fallback, allowed]);

	const update = useCallback(
		(next: T) => {
			setValue(next);
			const url = new URL(window.location.href);
			if (next === fallback || next === "") url.searchParams.delete(key);
			else
				url.searchParams.set(
					key,
					typeof next === "boolean" ? "1" : String(next),
				);
			window.history.replaceState(null, "", url);
		},
		[key, fallback],
	);

	return [value, update] as const;
}
