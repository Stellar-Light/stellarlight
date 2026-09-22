// @vitest-environment jsdom

/**
 * The highlights sheet's CTA has three states, and the difference between them
 * is the whole point of the fix: a reader with no wallet can do something about
 * it, a reader who isn't a Pilot (or has already voted) cannot. Offering the
 * first a button and the second silence is deliberate — the earlier version
 * showed everyone "Vote for X" and, once picks were gated, would have left a
 * button that silently did nothing.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NomineeHighlightsModal } from "./nominee-highlights-modal";

afterEach(cleanup);

const nominee = {
	slug: "beans",
	name: "Beans",
	category: "impact",
	tagline: "A wallet built for real people",
	summary: null,
	projectUrl: "https://example.com",
	logoUrl: null,
	highlights: [],
} as never;

function open(props: Record<string, unknown>) {
	render(
		<NomineeHighlightsModal
			nominee={nominee}
			isSelected={false}
			onClose={() => {}}
			onVote={() => {}}
			{...props}
		/>,
	);
}

describe("highlights sheet CTA", () => {
	it("offers the pick when a pick is possible", () => {
		open({ canPick: true });
		expect(screen.getByRole("button", { name: /Vote for Beans/ })).toBeTruthy();
	});

	it("offers to connect when the only thing missing is a wallet", () => {
		const onConnect = vi.fn();
		open({ canPick: false, onConnect });
		const btn = screen.getByRole("button", { name: /Connect wallet to vote/ });
		btn.click();
		expect(onConnect).toHaveBeenCalledOnce();
		// and it must NOT have offered a pick it cannot honour
		expect(screen.queryByRole("button", { name: /Vote for Beans/ })).toBeNull();
	});

	it("offers nothing when the reader could never pick from here", () => {
		// not a Pilot, or already voted: onConnect is null and there is no CTA,
		// rather than a button that refuses
		open({ canPick: false, onConnect: null });
		expect(screen.queryByRole("button", { name: /Vote for Beans/ })).toBeNull();
		expect(
			screen.queryByRole("button", { name: /Connect wallet to vote/ }),
		).toBeNull();
	});
});
