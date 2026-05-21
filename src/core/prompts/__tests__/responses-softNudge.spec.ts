// npx vitest core/prompts/__tests__/responses-softNudge.spec.ts

import { formatResponse } from "../responses"

describe("formatResponse.softNudge", () => {
	it("should return a string", () => {
		const result = formatResponse.softNudge()

		expect(typeof result).toBe("string")
	})

	it("should NOT start with [ERROR]", () => {
		const result = formatResponse.softNudge()

		expect(result.startsWith("[ERROR]")).toBe(false)
	})

	it("should contain 'attempt_completion'", () => {
		const result = formatResponse.softNudge()

		expect(result).toContain("attempt_completion")
	})

	it("should contain 'automated message'", () => {
		const result = formatResponse.softNudge()

		expect(result).toContain("automated message")
	})

	it("should be framed as guidance rather than an error", () => {
		const result = formatResponse.softNudge()

		// Should not start with [ERROR] (confirmed above), should encourage proceeding
		expect(result).not.toMatch(/^\[ERROR\]/)
	})
})
