import { getSharedToolUseSection } from "../tool-use"

describe("getSharedToolUseSection", () => {
	it("should include native tool-calling preference", () => {
		const section = getSharedToolUseSection()

		expect(section).toContain("Prefer the provider-native tool-calling mechanism when available")
		expect(section).toContain("Do not include XML markup when using native tool-calling")
	})

	it("should include multiple tools per message guidance", () => {
		const section = getSharedToolUseSection()

		expect(section).toContain("You must call at least one tool per assistant response")
		expect(section).toContain("Prefer calling as many tools as are reasonably needed")
	})

	it("should NOT include single tool per message restriction", () => {
		const section = getSharedToolUseSection()

		expect(section).not.toContain("You must use exactly one tool call per assistant response")
		expect(section).not.toContain("Do not call zero tools or more than one tool")
	})

	it("should NOT include XML fallback instructions by default", () => {
		const section = getSharedToolUseSection()

		expect(section).not.toContain("<tool_name>")
		expect(section).not.toContain("embed tool calls directly in your text response")
	})

	describe("allowTextOnlyResponses flag", () => {
		it("when true: should NOT contain the mandatory tool-call requirement", () => {
			const section = getSharedToolUseSection(true)

			expect(section).not.toContain("You must call at least one tool per assistant response")
		})

		it("when true: should contain permission to respond with text alone", () => {
			const section = getSharedToolUseSection(true)

			expect(section).toContain("you may respond with text alone")
		})

		it("when true: should still encourage tool use for progress", () => {
			const section = getSharedToolUseSection(true)

			expect(section).toContain("Use tools when you need to take action")
		})

		it("when false: should contain the mandatory tool-call requirement", () => {
			const section = getSharedToolUseSection(false)

			expect(section).toContain("You must call at least one tool per assistant response")
		})

		it("when false: should NOT contain permission to respond with text alone", () => {
			const section = getSharedToolUseSection(false)

			expect(section).not.toContain("you may respond with text alone")
		})

		it("when undefined (default): should contain the mandatory tool-call requirement", () => {
			const section = getSharedToolUseSection(undefined)

			expect(section).toContain("You must call at least one tool per assistant response")
		})

		it("when undefined (default): should NOT contain permission to respond with text alone", () => {
			const section = getSharedToolUseSection(undefined)

			expect(section).not.toContain("you may respond with text alone")
		})
	})

	describe("textToolCallFallback flag", () => {
		it("when true: should include XML fallback format instructions", () => {
			const section = getSharedToolUseSection(undefined, true)

			expect(section).toContain("embed tool calls directly in your text response")
			expect(section).toContain("<tool_name>")
			expect(section).toContain("<parameter_name>value</parameter_name>")
		})

		it("when true: should still prefer native tool-calling", () => {
			const section = getSharedToolUseSection(undefined, true)

			expect(section).toContain("Prefer the provider-native tool-calling mechanism when available")
		})

		it("when true: should mention thinking tag support", () => {
			const section = getSharedToolUseSection(undefined, true)

			expect(section).toContain("<thinking>")
		})

		it("when false: should NOT include XML fallback format instructions", () => {
			const section = getSharedToolUseSection(undefined, false)

			expect(section).not.toContain("embed tool calls directly in your text response")
			expect(section).not.toContain("<tool_name>")
		})

		it("when undefined (default): should NOT include XML fallback format instructions", () => {
			const section = getSharedToolUseSection(undefined, undefined)

			expect(section).not.toContain("embed tool calls directly in your text response")
			expect(section).not.toContain("<tool_name>")
		})

		it("when true with allowTextOnlyResponses: both flags apply independently", () => {
			const section = getSharedToolUseSection(true, true)

			expect(section).toContain("you may respond with text alone")
			expect(section).toContain("embed tool calls directly in your text response")
		})
	})
})
