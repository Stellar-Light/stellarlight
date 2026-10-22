// @vitest-environment jsdom

/**
 * A 429 from /api/community-skills carries an `error` and a `hint` written
 * for agents ("Wait 37 seconds, then resend the same request."). The modal
 * showed both to people; it shows them a plain line with the wait instead.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillSubmissionModal } from "./skill-submission-modal";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("skill submission modal on a 429", () => {
	it("tells people how long to wait, not the agent-facing text", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							error: "rate limit exceeded",
							hint: "Wait 37 seconds, then resend the same request.",
							retryAfterSeconds: 37,
						}),
						{ status: 429, headers: { "content-type": "application/json" } },
					),
			),
		);
		render(<SkillSubmissionModal open onClose={() => {}} />);
		fireEvent.click(screen.getByRole("button", { name: "Submit" }));
		expect(
			await screen.findByText("Too many submissions. Try again in 37 seconds."),
		).toBeTruthy();
		expect(screen.queryByText(/resend the same request/)).toBeNull();
		expect(screen.queryByText("rate limit exceeded")).toBeNull();
	});
});
