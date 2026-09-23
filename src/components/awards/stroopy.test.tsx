/**
 * The window shuts on the way out and opens fresh on the way back in.
 *
 * Both halves are CSS keyframes, but WHICH half plays is React: Stroopy reads
 * useIsPresent() from the wallet menu's AnimatePresence, so `is-shut` appears
 * only while the menu is leaving. And the menu unmounts between openings,
 * which is what lets the open keyframes restart, an avatar that stayed
 * mounted would play its reveal once and then sit there forever.
 *
 * Neither fact is visible to a screenshot, and I got the second one wrong by
 * reasoning about it instead of checking. Hence this.
 */
import { cleanup, render } from "@testing-library/react";
import { AnimatePresence, motion } from "motion/react";
import { afterEach, describe, expect, it } from "vitest";
import { Stroopy } from "./awards-ballot";

afterEach(cleanup);

/** the real shape: Stroopy nested inside the menu's exiting motion.div */
function Menu({ open }: { open: boolean }) {
	return (
		<AnimatePresence>
			{open && (
				<motion.div exit={{ opacity: 0, transition: { duration: 0.3 } }}>
					<Stroopy size={44} />
				</motion.div>
			)}
		</AnimatePresence>
	);
}

const tile = () => document.querySelector(".sm-stroopy");

describe("Stroopy in the wallet menu", () => {
	it("holds the window open while the menu is present", () => {
		render(<Menu open />);
		expect(tile()).not.toBeNull();
		expect(tile()?.className).not.toContain("is-shut");
	});

	it("shuts the window while the menu is leaving", () => {
		const { rerender } = render(<Menu open />);
		rerender(<Menu open={false} />);
		// AnimatePresence holds the node for the exit, that is the only window
		// in which the close keyframes can play.
		expect(tile()).not.toBeNull();
		expect(tile()?.className).toContain("is-shut");
	});

	it("mounts a fresh tile on reopen, so the reveal replays", () => {
		const { rerender } = render(<Menu open />);
		const first = tile();
		rerender(<Menu open={false} />);
		cleanup();
		render(<Menu open />);
		const second = tile();
		expect(second).not.toBeNull();
		expect(second).not.toBe(first);
		expect(second?.className).not.toContain("is-shut");
	});
});
