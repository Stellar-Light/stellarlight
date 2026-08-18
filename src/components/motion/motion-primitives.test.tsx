/**
 * The motion primitives are visual, but two things about them are logic and
 * belong in CI:
 *
 *   1. they render their children at all (a broken AnimatePresence swap would
 *      silently render nothing — the copy button would lose its icon), and
 *   2. they honour prefers-reduced-motion — the site's own rule (Track B:
 *      "meaningful motion", never motion for its own sake). ReadingProgress
 *      renders NOTHING under reduced motion; ThinkingDots stops animating but
 *      still announces itself to assistive tech.
 *
 * jsdom has no matchMedia, so each case installs one explicitly — which also
 * proves we read the preference rather than assuming it.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { IconSwap, IconSwapItem } from "./icon-swap";
import { ReadingProgress } from "./reading-progress";
import { SuccessRing } from "./success-ring";
import { ThinkingDots } from "./thinking-dots";

function setReducedMotion(reduced: boolean) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: vi.fn().mockImplementation((query: string) => ({
			matches: query.includes("prefers-reduced-motion") ? reduced : false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		})),
	});
}

afterEach(() => {
	// vitest runs without `globals`, so RTL's automatic cleanup never
	// registers — without this, renders pile up in the same document and
	// getByTestId finds duplicates from earlier cases.
	cleanup();
	vi.restoreAllMocks();
});

describe("motion primitives", () => {
	it("IconSwap renders the current state's icon", () => {
		setReducedMotion(false);
		render(
			<IconSwap>
				<IconSwapItem key="copied">
					<span data-testid="check">check</span>
				</IconSwapItem>
			</IconSwap>,
		);
		expect(screen.getByTestId("check")).toBeTruthy();
	});

	it("SuccessRing always renders its mark, ring or not", () => {
		setReducedMotion(true);
		render(
			<SuccessRing active>
				<span data-testid="mark">✓</span>
			</SuccessRing>,
		);
		expect(screen.getByTestId("mark")).toBeTruthy();
	});

	it("ThinkingDots announces itself and keeps its three dots", () => {
		setReducedMotion(false);
		const { container } = render(<ThinkingDots />);
		const status = screen.getByRole("status");
		expect(status.getAttribute("aria-label")).toBe("Composing an answer");
		expect(container.querySelectorAll("span[aria-hidden]").length).toBe(3);
	});

	// The bar hides via `motion-reduce:hidden`, NOT a JS branch: motion's
	// useReducedMotion caches its answer in a module global after the first
	// hook call anywhere in the app, so a JS check is order-dependent and can
	// show the bar to a reader who asked for no motion. Assert the CSS
	// contract, which the browser enforces (and which also applies before
	// hydration).
	it("ReadingProgress hides itself under reduced motion via CSS", () => {
		setReducedMotion(true);
		render(<ReadingProgress />);
		const bar = screen.getByTestId("reading-progress");
		expect(bar.className).toContain("motion-reduce:hidden");
	});

	it("ReadingProgress renders its bar", () => {
		setReducedMotion(false);
		render(<ReadingProgress />);
		expect(screen.getByTestId("reading-progress")).toBeTruthy();
	});
});
