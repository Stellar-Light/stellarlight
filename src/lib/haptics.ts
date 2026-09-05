/**
 * A single, throttled haptic tick for touch scrubbing — the finger crossing
 * from one bar or day to the next gets a short pulse, the way a native chart
 * does. Backed by web-haptics (https://haptics.lochie.me): `navigator.vibrate`
 * on Android, the switch-element trick on iOS. Loaded lazily and only on a
 * touch device, so desktop and the server never pay for it and a browser
 * without haptics is a silent no-op — never an error.
 */
type Haptics = {
	trigger: (input: number, opts?: { intensity?: number }) => Promise<void>;
};

let instance: Haptics | null = null;
let loading: Promise<Haptics | null> | null = null;
let lastTickAt = 0;

/** Minimum gap between pulses; a fast scrub across 30 bars is not 30 buzzes. */
const MIN_GAP_MS = 45;

function isTouchDevice(): boolean {
	return (
		typeof window !== "undefined" &&
		typeof navigator !== "undefined" &&
		(navigator.maxTouchPoints ?? 0) > 0
	);
}

async function load(): Promise<Haptics | null> {
	if (instance) return instance;
	if (!loading) {
		loading = import("web-haptics")
			.then((m) => {
				instance = new m.WebHaptics() as unknown as Haptics;
				return instance;
			})
			.catch(() => null);
	}
	return loading;
}

/** Fire one short pulse if this is a touch device and the throttle allows. */
export function hapticTick(): void {
	if (!isTouchDevice()) return;
	const now = performance.now();
	if (now - lastTickAt < MIN_GAP_MS) return;
	lastTickAt = now;
	void load().then((h) => h?.trigger(8, { intensity: 0.35 }).catch(() => {}));
}
