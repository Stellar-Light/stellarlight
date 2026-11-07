// @vitest-environment jsdom

/**
 * Re-check 2026-11-05: the app had no error boundary, so one component's
 * exception (the TVL card's TypeError on a null figure) blanked the whole
 * project page. The frontend boundary keeps the layout and offers a retry;
 * the root boundary brings its own document for an error in a layout.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

describe("an exception never blanks a page", () => {
	it("the frontend boundary says what happened, retries, and points the way on", async () => {
		const { default: FrontendError } = await import("@/app/(frontend)/error");
		const reset = vi.fn();
		render(<FrontendError error={new Error("boom")} reset={reset} />);
		expect(
			screen.getByRole("heading", { name: "Part of this page failed to load" }),
		).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: "Try again" }));
		expect(reset).toHaveBeenCalledTimes(1);
		expect(
			screen.getByRole("link", { name: /Directory/ }).getAttribute("href"),
		).toBe("/directory");
	});

	it("the root boundary brings its own document, for an error in a layout", async () => {
		const { default: GlobalError } = await import("@/app/global-error");
		const html = renderToStaticMarkup(
			<GlobalError error={new Error("boom")} reset={() => {}} />,
		);
		expect(html).toMatch(/^<html/);
		expect(html).toContain("This page failed to load");
		expect(html).toContain("Try again");
	});
});
