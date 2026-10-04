import { getSharedToolUseSection } from "../tool-use"

describe("getSharedToolUseSection", () => {
	it("should include native tool-calling instructions", () => {
		const section = getSharedToolUseSection()

		expect(section).toContain("provider-native tool-calling mechanism")
		expect(section).toContain("Do not include XML markup or examples")
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

	it("should NOT include XML formatting instructions", () => {
		const section = getSharedToolUseSection()

		expect(section).not.toContain("<actual_tool_name>")
		expect(section).not.toContain("</actual_tool_name>")
	})

	// Fork tranche T9 (textToolCallFallback). These guard the off-state
	// byte-identity requirement: calling with no options, or with the flag
	// explicitly false/undefined, must never change existing prompt output
	// (see fork-docs/fork-feature-inventory.md T9 defect F-AI-2).
	describe("textToolCallFallback flag", () => {
		const baseSection = getSharedToolUseSection()

		it("produces byte-identical output when called with no options", () => {
			expect(getSharedToolUseSection(undefined)).toBe(baseSection)
		})

		it("produces byte-identical output when textToolCallFallback is false", () => {
			expect(getSharedToolUseSection({ textToolCallFallback: false })).toBe(baseSection)
		})

		it("produces byte-identical output when textToolCallFallback is undefined", () => {
			expect(getSharedToolUseSection({ textToolCallFallback: undefined })).toBe(baseSection)
		})

		it("appends XML fallback guidance when textToolCallFallback is true", () => {
			const section = getSharedToolUseSection({ textToolCallFallback: true })

			expect(section).toContain("If you do not have native function-calling capability")
			expect(section).toContain("<tool_name>")
			expect(section).toContain("<parameter_name>value</parameter_name>")
			expect(section).toContain("<thinking>...</thinking>")
		})

		it("still includes the unchanged base sentence when the flag is true", () => {
			const section = getSharedToolUseSection({ textToolCallFallback: true })

			expect(section).toContain("Use the provider-native tool-calling mechanism")
			expect(section).toContain("Do not include XML markup or examples.")
			expect(section).toContain("You must call at least one tool per assistant response")
		})

		it("keeps everything before the fallback sentence identical to the off-state output", () => {
			const onSection = getSharedToolUseSection({ textToolCallFallback: true })
			const insertionPoint = onSection.indexOf(" If you do not have native function-calling capability")

			expect(insertionPoint).toBeGreaterThan(-1)
			expect(onSection.slice(0, insertionPoint)).toBe(
				baseSection.slice(0, baseSection.indexOf(" You must call at least one tool")),
			)
		})
	})

	// Fork tranche T10 (allowTextOnlyResponses). These guard the off-state
	// byte-identity requirement: calling with no options, or with the flag
	// explicitly false/undefined, must never change existing prompt output.
	describe("allowTextOnlyResponses flag", () => {
		const baseSection = getSharedToolUseSection()

		it("produces byte-identical output when called with no options", () => {
			expect(getSharedToolUseSection(undefined)).toBe(baseSection)
		})

		it("produces byte-identical output when allowTextOnlyResponses is false", () => {
			expect(getSharedToolUseSection({ allowTextOnlyResponses: false })).toBe(baseSection)
		})

		it("produces byte-identical output when allowTextOnlyResponses is undefined", () => {
			expect(getSharedToolUseSection({ allowTextOnlyResponses: undefined })).toBe(baseSection)
		})

		it("still requires a tool call per response when the flag is off", () => {
			expect(baseSection).toContain("You must call at least one tool per assistant response")
		})

		it("relaxes the closing sentence when allowTextOnlyResponses is true", () => {
			const section = getSharedToolUseSection({ allowTextOnlyResponses: true })

			expect(section).toContain("you may respond with text alone")
			expect(section).not.toContain("You must call at least one tool per assistant response")
		})

		it("keeps everything before the closing sentence identical to the off-state output", () => {
			const onSection = getSharedToolUseSection({ allowTextOnlyResponses: true })
			const offInsertionPoint = baseSection.indexOf("You must call at least one tool")
			const onInsertionPoint = onSection.indexOf("Use tools when you need to take action")

			expect(onInsertionPoint).toBeGreaterThan(-1)
			expect(onSection.slice(0, onInsertionPoint)).toBe(baseSection.slice(0, offInsertionPoint))
		})

		it("still ends with the multiple-tools guidance when the flag is true", () => {
			const section = getSharedToolUseSection({ allowTextOnlyResponses: true })

			expect(section).toContain("Prefer calling as many tools as are reasonably needed")
		})

		it("composes with textToolCallFallback without altering either sentence", () => {
			const section = getSharedToolUseSection({ textToolCallFallback: true, allowTextOnlyResponses: true })

			expect(section).toContain("If you do not have native function-calling capability")
			expect(section).toContain("you may respond with text alone")
		})
	})
})
