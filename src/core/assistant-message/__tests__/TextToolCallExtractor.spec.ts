import { TextToolCallExtractor } from "../TextToolCallExtractor"

describe("TextToolCallExtractor", () => {
	const allowedTools = new Set(["read_file", "write_to_file", "execute_command", "ask_followup_question"])

	describe("thinking tag extraction", () => {
		it("extracts a single <think> tag", () => {
			const result = TextToolCallExtractor.extract("<think>Let me consider this.</think>Done.", allowedTools)
			expect(result.thinking).toBe("Let me consider this.")
			expect(result.cleanedText).toBe("Done.")
		})

		it("extracts a single <thinking> tag", () => {
			const result = TextToolCallExtractor.extract("<thinking>Reasoning here.</thinking>Answer.", allowedTools)
			expect(result.thinking).toBe("Reasoning here.")
			expect(result.cleanedText).toBe("Answer.")
		})

		it("extracts a single <reasoning> tag", () => {
			const result = TextToolCallExtractor.extract("<reasoning>Chain of thought.</reasoning>Final.", allowedTools)
			expect(result.thinking).toBe("Chain of thought.")
			expect(result.cleanedText).toBe("Final.")
		})

		it("joins multiple thinking blocks with a blank line", () => {
			const result = TextToolCallExtractor.extract(
				"<think>First.</think>middle<think>Second.</think>end",
				allowedTools,
			)
			expect(result.thinking).toBe("First.\n\nSecond.")
			expect(result.cleanedText).toBe("middleend")
		})

		it("is case-insensitive for tag names", () => {
			const result = TextToolCallExtractor.extract("<THINK>Upper case.</THINK>Rest.", allowedTools)
			expect(result.thinking).toBe("Upper case.")
			expect(result.cleanedText).toBe("Rest.")
		})

		it("drops empty thinking tags without adding blank entries", () => {
			const result = TextToolCallExtractor.extract("<think></think>Visible text.", allowedTools)
			expect(result.thinking).toBe("")
			expect(result.cleanedText).toBe("Visible text.")
		})

		it("removes thinking tags before scanning for tool calls", () => {
			const text = "<think>planning</think><read_file><path>foo.ts</path></read_file>"
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.thinking).toBe("planning")
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].name).toBe("read_file")
		})
	})

	describe("XML format tool call extraction", () => {
		it("extracts a simple XML tool call", () => {
			const result = TextToolCallExtractor.extract("<read_file><path>foo.ts</path></read_file>", allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0]).toMatchObject({
				name: "read_file",
				params: { path: "foo.ts" },
			})
		})

		it("extracts multiple XML tool calls in order", () => {
			const text =
				"<read_file><path>a.ts</path></read_file>middle<execute_command><command>ls</command></execute_command>"
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(2)
			expect(result.toolCalls[0].name).toBe("read_file")
			expect(result.toolCalls[1].name).toBe("execute_command")
		})

		it("rejects a tool name that is not a recognised tool at all", () => {
			const result = TextToolCallExtractor.extract(
				"<not_a_real_tool><path>foo.ts</path></not_a_real_tool>",
				allowedTools,
			)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("rejects a recognised tool that is not in allowedTools", () => {
			const restricted = new Set(["read_file"])
			const result = TextToolCallExtractor.extract(
				"<execute_command><command>ls</command></execute_command>",
				restricted,
			)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("rejects a tool call with no recognized params", () => {
			const result = TextToolCallExtractor.extract(
				"<read_file><bogus_param>foo.ts</bogus_param></read_file>",
				allowedTools,
			)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("ignores unrecognized params but keeps recognized ones", () => {
			const result = TextToolCallExtractor.extract(
				"<read_file><path>foo.ts</path><bogus_param>x</bogus_param></read_file>",
				allowedTools,
			)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].params).toEqual({ path: "foo.ts" })
		})

		it("handles multi-line parameter values", () => {
			const text = "<write_to_file><path>foo.ts</path><content>line one\nline two</content></write_to_file>"
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].params.content).toBe("line one\nline two")
		})

		it("captures the exact rawText of the matched call", () => {
			const text = "<read_file><path>foo.ts</path></read_file>"
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls[0].rawText).toBe(text)
		})
	})

	describe("Anthropic invoke format", () => {
		it("extracts a single-parameter invoke call", () => {
			const text = '<invoke name="read_file"><parameter name="path">foo.ts</parameter></invoke>'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0]).toMatchObject({
				name: "read_file",
				params: { path: "foo.ts" },
			})
		})

		it("extracts a multi-parameter invoke call", () => {
			const text =
				'<invoke name="write_to_file"><parameter name="path">foo.ts</parameter><parameter name="content">hello</parameter></invoke>'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].params).toEqual({ path: "foo.ts", content: "hello" })
		})

		it("rejects an unknown tool name in invoke format", () => {
			const text = '<invoke name="not_a_real_tool"><parameter name="path">foo.ts</parameter></invoke>'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("rejects an invoke call naming a tool outside allowedTools", () => {
			const restricted = new Set(["read_file"])
			const text = '<invoke name="execute_command"><parameter name="command">ls</parameter></invoke>'
			const result = TextToolCallExtractor.extract(text, restricted)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("rejects an invoke call with no recognized params", () => {
			const text = '<invoke name="read_file"><parameter name="bogus_param">x</parameter></invoke>'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(0)
		})
	})

	describe("JSON-in-fenced-code tool call extraction", () => {
		it("extracts a valid JSON tool call using 'arguments'", () => {
			const text = '```tool_call\n{"name": "read_file", "arguments": {"path": "foo.ts"}}\n```'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0]).toMatchObject({
				name: "read_file",
				params: { path: "foo.ts" },
			})
		})

		it("accepts 'parameters' as an alias for 'arguments'", () => {
			const text = '```tool_call\n{"name": "read_file", "parameters": {"path": "foo.ts"}}\n```'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].params).toEqual({ path: "foo.ts" })
		})

		it("silently rejects malformed JSON", () => {
			const text = '```tool_call\n{"name": "read_file", "arguments": {path: foo.ts}}\n```'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("rejects an unknown tool name", () => {
			const text = '```tool_call\n{"name": "not_a_real_tool", "arguments": {"path": "foo.ts"}}\n```'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("rejects a call with no recognized params", () => {
			const text = '```tool_call\n{"name": "read_file", "arguments": {"bogus_param": "x"}}\n```'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("rejects a tool name not in allowedTools", () => {
			const restricted = new Set(["read_file"])
			const text = '```tool_call\n{"name": "execute_command", "arguments": {"command": "ls"}}\n```'
			const result = TextToolCallExtractor.extract(text, restricted)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("handles CRLF line endings in the fenced block", () => {
			const text = '```tool_call\r\n{"name": "read_file", "arguments": {"path": "foo.ts"}}\r\n```'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].params).toEqual({ path: "foo.ts" })
		})
	})

	describe("combined scenarios", () => {
		it("extracts both thinking and an XML tool call from the same message", () => {
			const text = "<think>planning the read</think><read_file><path>foo.ts</path></read_file>"
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.thinking).toBe("planning the read")
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].name).toBe("read_file")
		})

		it("handles thinking-only text with no tool calls", () => {
			const result = TextToolCallExtractor.extract("<think>just thinking</think>", allowedTools)
			expect(result.thinking).toBe("just thinking")
			expect(result.toolCalls).toHaveLength(0)
			expect(result.cleanedText).toBe("")
		})

		it("handles tool-call-only text with no thinking", () => {
			const result = TextToolCallExtractor.extract("<read_file><path>foo.ts</path></read_file>", allowedTools)
			expect(result.thinking).toBe("")
			expect(result.toolCalls).toHaveLength(1)
		})

		it("extracts multiple different formats (XML + JSON) in one message", () => {
			const text =
				'<read_file><path>a.ts</path></read_file>text```tool_call\n{"name": "execute_command", "arguments": {"command": "ls"}}\n```'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(2)
			expect(result.toolCalls.map((c) => c.name)).toEqual(["read_file", "execute_command"])
		})

		it("extracts multiple formats including invoke", () => {
			const text =
				'<invoke name="read_file"><parameter name="path">a.ts</parameter></invoke>text<execute_command><command>ls</command></execute_command>'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(2)
			expect(result.toolCalls.map((c) => c.name)).toEqual(["read_file", "execute_command"])
		})

		it("handles overlapping matches gracefully by keeping only the first", () => {
			// A JSON fenced block that itself contains XML-like text should not be
			// double-counted as both a JSON match and an XML match.
			const text = '```tool_call\n{"name": "read_file", "arguments": {"path": "<path>nested</path>"}}\n```'
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].name).toBe("read_file")
		})

		it("preserves surrounding text order across multiple tool calls", () => {
			const text =
				"before<read_file><path>a.ts</path></read_file>middle<read_file><path>b.ts</path></read_file>after"
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.cleanedText).toBe("beforemiddleafter")
			expect(result.toolCalls.map((c) => c.params.path)).toEqual(["a.ts", "b.ts"])
		})

		it("returns no tool calls when allowedTools is empty", () => {
			const result = TextToolCallExtractor.extract(
				"<read_file><path>foo.ts</path></read_file>",
				new Set<string>(),
			)
			expect(result.toolCalls).toHaveLength(0)
		})

		it("returns empty results for plain text with no markup at all", () => {
			const result = TextToolCallExtractor.extract("Just a plain response, nothing special.", allowedTools)
			expect(result.thinking).toBe("")
			expect(result.toolCalls).toHaveLength(0)
			expect(result.cleanedText).toBe("Just a plain response, nothing special.")
		})
	})

	describe("edge cases", () => {
		it("handles an empty string input", () => {
			const result = TextToolCallExtractor.extract("", allowedTools)
			expect(result.thinking).toBe("")
			expect(result.toolCalls).toHaveLength(0)
			expect(result.cleanedText).toBe("")
		})

		it("trims whitespace around XML parameter values", () => {
			const text = "<read_file><path>\n   foo.ts  \n</path></read_file>"
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls[0].params.path).toBe("foo.ts")
		})

		it("matches tool names case-sensitively for XML format", () => {
			// Tool tag names are matched case-insensitively (regex uses /gi), but
			// the recognized tool name set is case-sensitive; this ensures no
			// crash and documents actual behavior for a mixed-case tag.
			const result = TextToolCallExtractor.extract("<READ_FILE><path>foo.ts</path></READ_FILE>", allowedTools)
			expect(result.toolCalls).toHaveLength(1)
			expect(result.toolCalls[0].name).toBe("read_file")
		})

		it("supports multiple allowed tools in a single extraction pass", () => {
			const text =
				"<read_file><path>a.ts</path></read_file><ask_followup_question><question>Why?</question><follow_up>[]</follow_up></ask_followup_question>"
			const result = TextToolCallExtractor.extract(text, allowedTools)
			expect(result.toolCalls.map((c) => c.name)).toEqual(["read_file", "ask_followup_question"])
		})
	})

	describe("removeThinkingTags", () => {
		it("removes a <think> tag", () => {
			expect(TextToolCallExtractor.removeThinkingTags("<think>hidden</think>visible")).toBe("visible")
		})

		it("removes a <thinking> tag", () => {
			expect(TextToolCallExtractor.removeThinkingTags("<thinking>hidden</thinking>visible")).toBe("visible")
		})

		it("removes a <reasoning> tag", () => {
			expect(TextToolCallExtractor.removeThinkingTags("<reasoning>hidden</reasoning>visible")).toBe("visible")
		})

		it("removes mixed thinking tag variants in one string", () => {
			const text = "<think>a</think>mid<reasoning>b</reasoning>end"
			expect(TextToolCallExtractor.removeThinkingTags(text)).toBe("midend")
		})

		it("trims the result", () => {
			expect(TextToolCallExtractor.removeThinkingTags("  <think>a</think>  visible  ")).toBe("visible")
		})

		it("leaves text with no tags unchanged (aside from trimming)", () => {
			expect(TextToolCallExtractor.removeThinkingTags("plain text")).toBe("plain text")
		})

		it("returns an empty string for empty input", () => {
			expect(TextToolCallExtractor.removeThinkingTags("")).toBe("")
		})

		it("returns an empty string when the text is only thinking tags", () => {
			expect(TextToolCallExtractor.removeThinkingTags("<think>only thinking</think>")).toBe("")
		})

		it("is case-insensitive", () => {
			expect(TextToolCallExtractor.removeThinkingTags("<THINKING>hidden</THINKING>visible")).toBe("visible")
		})
	})
})
