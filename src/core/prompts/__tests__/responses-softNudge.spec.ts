// npx vitest core/prompts/__tests__/responses-softNudge.spec.ts

import { formatResponse } from "../responses"

// Fork tranche T10 (allowTextOnlyResponses). formatResponse.softNudge() is sent
// on behalf of the user when a text-only turn's implicit follow-up question
// auto-approval timer fires. It must read as guidance, not an error, and must
// never change shape silently since Task.ts detects the timer-fired case by
// comparing the human's reply text against this exact string (see
// fork-docs/fork-feature-inventory.md T10 defect F-LC-3).
describe("formatResponse.softNudge", () => {
	it("is framed as guidance, not an error", () => {
		const message = formatResponse.softNudge()

		expect(message).not.toContain("[ERROR]")
		expect(message).not.toContain("ERROR")
	})

	it("tells the model to proceed or call attempt_completion", () => {
		const message = formatResponse.softNudge()

		expect(message).toContain("proceed with the next step of the task")
		expect(message).toContain("attempt_completion")
	})

	it("instructs the model not to respond conversationally", () => {
		const message = formatResponse.softNudge()

		expect(message).toContain("do not respond to it conversationally")
	})

	it("is deterministic (stable across calls) so it can be used as a timer-fired marker", () => {
		expect(formatResponse.softNudge()).toBe(formatResponse.softNudge())
	})

	it("does not contain square brackets anywhere in the message", () => {
		// The archive implementation's first draft wrapped the message in
		// square brackets like an error tag; the final archive version removed
		// them so the message reads as neutral guidance rather than an alert.
		const message = formatResponse.softNudge()

		expect(message).not.toMatch(/[[\]]/)
	})
})
