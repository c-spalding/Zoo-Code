import { type ToolName } from "@roo-code/types"
import { TextToolCallExtractor } from "../TextToolCallExtractor"

describe("TextToolCallExtractor", () => {
	describe("extract", () => {
		describe("thinking tag extraction", () => {
			it("should extract content from <think>...</think> tags", () => {
				const text = "<think>This is my reasoning</think>Some other text"
				const result = TextToolCallExtractor.extract(text, [])

				expect(result.thinking).toBe("This is my reasoning")
				expect(result.cleanedText).toBe("Some other text")
				expect(result.toolCalls).toHaveLength(0)
			})

			it("should extract content from <thinking>...</thinking> tags", () => {
				const text = "<thinking>Analyzing the problem</thinking>Response text"
				const result = TextToolCallExtractor.extract(text, [])

				expect(result.thinking).toBe("Analyzing the problem")
				expect(result.cleanedText).toBe("Response text")
			})

			it("should extract content from <reasoning>...</reasoning> tags", () => {
				const text = "<reasoning>Step by step logic</reasoning>Final answer"
				const result = TextToolCallExtractor.extract(text, [])

				expect(result.thinking).toBe("Step by step logic")
				expect(result.cleanedText).toBe("Final answer")
			})

			it("should handle multiple thinking blocks, concatenating with double newlines", () => {
				const text = "<think>First thought</think>Some text<thinking>Second thought</thinking>More text"
				const result = TextToolCallExtractor.extract(text, [])

				expect(result.thinking).toBe("First thought\n\nSecond thought")
				expect(result.cleanedText).toBe("Some textMore text")
			})

			it("should handle case-insensitive tag matching", () => {
				const text = "<THINK>Upper case</THINK><Thinking>Mixed case</Thinking><REASONING>All caps</REASONING>"
				const result = TextToolCallExtractor.extract(text, [])

				expect(result.thinking).toBe("Upper case\n\nMixed case\n\nAll caps")
				expect(result.cleanedText).toBe("")
			})

			it("should handle empty thinking tags producing empty thinking string", () => {
				const text = "<think></think><thinking>  </thinking>Some text"
				const result = TextToolCallExtractor.extract(text, [])

				expect(result.thinking).toBe("")
				expect(result.cleanedText).toBe("Some text")
			})

			it("should remove thinking content from text before tool scanning", () => {
				const text = "<think>Reasoning</think><read_file><path>/src/main.ts</path></read_file>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.thinking).toBe("Reasoning")
				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
				expect(result.cleanedText).toBe("")
			})
		})

		describe("XML format tool call extraction", () => {
			it("should extract a simple read_file call", () => {
				const text = "<read_file><path>/src/main.ts</path></read_file>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
				expect(result.toolCalls[0].params).toEqual({ path: "/src/main.ts" })
				expect(result.toolCalls[0].rawText).toBe(text)
				expect(result.cleanedText).toBe("")
			})

			it("should extract execute_command call", () => {
				const text = "<execute_command><command>ls -la</command></execute_command>"
				const result = TextToolCallExtractor.extract(text, ["execute_command"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("execute_command")
				expect(result.toolCalls[0].params).toEqual({ command: "ls -la" })
			})

			it("should extract multiple tool calls from a single message", () => {
				const text = `
					<read_file><path>/src/file1.ts</path></read_file>
					Some text between
					<read_file><path>/src/file2.ts</path></read_file>
				`
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(2)
				expect(result.toolCalls[0].params.path).toBe("/src/file1.ts")
				expect(result.toolCalls[1].params.path).toBe("/src/file2.ts")
				expect(result.cleanedText).toContain("Some text between")
			})

			it("should reject unknown tool names", () => {
				const text = "<hack_system><target>foo</target></hack_system>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should reject tools not in the allowedTools list", () => {
				const text = "<execute_command><command>ls</command></execute_command>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should reject tool blocks with no recognised parameters", () => {
				const text = "<read_file><unknown_param>value</unknown_param></read_file>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should ignore parameters whose names are not in toolParamNames", () => {
				const text = "<read_file><path>/src/main.ts</path><invalid_param>ignored</invalid_param></read_file>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].params).toEqual({ path: "/src/main.ts" })
				expect(result.toolCalls[0].params).not.toHaveProperty("invalid_param")
			})

			it("should handle multi-line parameter values", () => {
				const content = "line 1\nline 2\nline 3"
				const text = `<write_to_file><path>/test.txt</path><content>${content}</content></write_to_file>`
				const result = TextToolCallExtractor.extract(text, ["write_to_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].params.content).toBe(content)
			})

			it("should return correct rawText for each match", () => {
				const toolCallText = "<read_file><path>/src/main.ts</path></read_file>"
				const text = `Before text ${toolCallText} After text`
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].rawText).toBe(toolCallText)
			})
		})

		describe("Anthropic invoke format", () => {
			it("should extract invoke call with single parameter", () => {
				const text = '<invoke name="read_file"><parameter name="path">/src/main.ts</parameter></invoke>'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
				expect(result.toolCalls[0].params).toEqual({ path: "/src/main.ts" })
			})

			it("should extract invoke calls with multiple parameters", () => {
				const text = `<invoke name="execute_command">
					<parameter name="command">npm test</parameter>
					<parameter name="cwd">/project</parameter>
				</invoke>`
				const result = TextToolCallExtractor.extract(text, ["execute_command"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].params).toEqual({
					command: "npm test",
					cwd: "/project",
				})
			})

			it("should reject invoke calls with unknown tool names", () => {
				const text = '<invoke name="unknown_tool"><parameter name="param">value</parameter></invoke>'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should reject invoke calls not in allowedTools list", () => {
				const text = '<invoke name="execute_command"><parameter name="command">ls</parameter></invoke>'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should reject invoke calls with no recognised parameters", () => {
				const text = '<invoke name="read_file"><parameter name="invalid">value</parameter></invoke>'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})
		})

		describe("JSON-in-fenced-code extraction", () => {
			it("should extract valid tool_call JSON with arguments", () => {
				const text = '```tool_call\n{"name": "read_file", "arguments": {"path": "/src/main.ts"}}\n```'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
				expect(result.toolCalls[0].params).toEqual({ path: "/src/main.ts" })
			})

			it('should support "parameters" as alias for "arguments"', () => {
				const text = '```tool_call\n{"name": "read_file", "parameters": {"path": "/src/test.ts"}}\n```'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].params).toEqual({ path: "/src/test.ts" })
			})

			it("should reject malformed JSON without throwing", () => {
				const text = '```tool_call\n{"name": "read_file", "arguments": {invalid json}\n```'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should reject JSON with unknown tool name", () => {
				const text = '```tool_call\n{"name": "unknown_tool", "arguments": {"param": "value"}}\n```'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should reject JSON with no recognised parameters", () => {
				const text = '```tool_call\n{"name": "read_file", "arguments": {"invalid_param": "value"}}\n```'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should reject JSON not in allowedTools list", () => {
				const text = '```tool_call\n{"name": "execute_command", "arguments": {"command": "ls"}}\n```'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(0)
			})

			it("should handle JSON with CRLF line endings", () => {
				const text = '```tool_call\r\n{"name": "read_file", "arguments": {"path": "/src/main.ts"}}\r\n```'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].params).toEqual({ path: "/src/main.ts" })
			})
		})

		describe("combined scenarios", () => {
			it("should extract thinking tags and XML tool calls together", () => {
				const text = `
					<think>I need to read this file</think>
					<read_file><path>/src/main.ts</path></read_file>
					Some remaining text
				`
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.thinking).toBe("I need to read this file")
				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
				expect(result.cleanedText).toContain("Some remaining text")
				expect(result.cleanedText).not.toContain("<think>")
				expect(result.cleanedText).not.toContain("<read_file>")
			})

			it("should handle thinking tags but no tool calls", () => {
				const text = "<think>Just thinking</think>Response without tools"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.thinking).toBe("Just thinking")
				expect(result.toolCalls).toHaveLength(0)
				expect(result.cleanedText).toBe("Response without tools")
			})

			it("should handle tool calls but no thinking", () => {
				const text = "<read_file><path>/src/main.ts</path></read_file>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.thinking).toBe("")
				expect(result.toolCalls).toHaveLength(1)
			})

			it("should extract multiple formats in one message (XML + JSON)", () => {
				const text = `
					<read_file><path>/src/file1.ts</path></read_file>
					Some text
					\`\`\`tool_call
					{"name": "execute_command", "arguments": {"command": "npm test"}}
					\`\`\`
				`
				const result = TextToolCallExtractor.extract(text, ["read_file", "execute_command"])

				expect(result.toolCalls).toHaveLength(2)
				expect(result.toolCalls[0].name).toBe("read_file")
				expect(result.toolCalls[1].name).toBe("execute_command")
			})

			it("should extract multiple formats including invoke", () => {
				const text = `
					<read_file><path>/src/file1.ts</path></read_file>
					<invoke name="execute_command"><parameter name="command">ls</parameter></invoke>
					\`\`\`tool_call
					{"name": "list_files", "arguments": {"path": ".", "recursive": "true"}}
					\`\`\`
				`
				const result = TextToolCallExtractor.extract(text, ["read_file", "execute_command", "list_files"])

				expect(result.toolCalls).toHaveLength(3)
				expect(result.toolCalls[0].name).toBe("read_file")
				expect(result.toolCalls[1].name).toBe("execute_command")
				expect(result.toolCalls[2].name).toBe("list_files")
			})

			it("should handle overlapping matches gracefully", () => {
				// This tests that overlapping matches don't cause crashes
				const text = "<read_file><path>/src/main.ts</path></read_file>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
			})

			it("should preserve text order when extracting multiple tool calls", () => {
				const text = `
					First text
					<read_file><path>/file1.ts</path></read_file>
					Middle text
					<read_file><path>/file2.ts</path></read_file>
					Last text
				`
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(2)
				expect(result.cleanedText).toContain("First text")
				expect(result.cleanedText).toContain("Middle text")
				expect(result.cleanedText).toContain("Last text")
				// Verify order is preserved
				const firstIndex = result.cleanedText.indexOf("First")
				const middleIndex = result.cleanedText.indexOf("Middle")
				const lastIndex = result.cleanedText.indexOf("Last")
				expect(firstIndex).toBeLessThan(middleIndex)
				expect(middleIndex).toBeLessThan(lastIndex)
			})

			it("should handle empty allowedTools list", () => {
				const text = "<read_file><path>/src/main.ts</path></read_file>"
				const result = TextToolCallExtractor.extract(text, [])

				expect(result.toolCalls).toHaveLength(0)
				expect(result.cleanedText).toBe(text)
			})

			it("should handle text with no thinking tags or tool calls", () => {
				const text = "Just plain text with no special markup"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.thinking).toBe("")
				expect(result.toolCalls).toHaveLength(0)
				expect(result.cleanedText).toBe(text)
			})
		})

		describe("edge cases", () => {
			it("should handle empty string input", () => {
				const result = TextToolCallExtractor.extract("", ["read_file"])

				expect(result.thinking).toBe("")
				expect(result.toolCalls).toHaveLength(0)
				expect(result.cleanedText).toBe("")
			})

			it("should handle tool calls with whitespace in XML", () => {
				const text = `
					<read_file>
						<path>  /src/main.ts  </path>
					</read_file>
				`
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				// Whitespace should be trimmed from parameter values
				expect(result.toolCalls[0].params.path).toBe("/src/main.ts")
			})

			it("should handle tool names with mixed case", () => {
				const text = "<READ_FILE><path>/src/main.ts</path></READ_FILE>"
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
			})

			it("should handle JSON tool names with mixed case", () => {
				const text = '```tool_call\n{"name": "READ_FILE", "arguments": {"path": "/src/main.ts"}}\n```'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
			})

			it("should handle invoke tool names with mixed case", () => {
				const text = '<invoke name="READ_FILE"><parameter name="path">/src/main.ts</parameter></invoke>'
				const result = TextToolCallExtractor.extract(text, ["read_file"])

				expect(result.toolCalls).toHaveLength(1)
				expect(result.toolCalls[0].name).toBe("read_file")
			})

			it("should handle multiple allowed tools", () => {
				const text = `
					<read_file><path>/src/main.ts</path></read_file>
					<execute_command><command>ls</command></execute_command>
					<write_to_file><path>/test.txt</path><content>test</content></write_to_file>
				`
				const allowedTools: ToolName[] = ["read_file", "execute_command", "write_to_file"]
				const result = TextToolCallExtractor.extract(text, allowedTools)

				expect(result.toolCalls).toHaveLength(3)
				expect(result.toolCalls[0].name).toBe("read_file")
				expect(result.toolCalls[1].name).toBe("execute_command")
				expect(result.toolCalls[2].name).toBe("write_to_file")
			})
		})
	})

	describe("removeThinkingTags", () => {
		it("should remove <think> tags from text", () => {
			const text = "<think>Some reasoning</think>Remaining text"
			const result = TextToolCallExtractor.removeThinkingTags(text)

			expect(result).toBe("Remaining text")
			expect(result).not.toContain("<think>")
		})

		it("should remove <thinking> tags from text", () => {
			const text = "<thinking>Analysis</thinking>Response"
			const result = TextToolCallExtractor.removeThinkingTags(text)

			expect(result).toBe("Response")
		})

		it("should remove <reasoning> tags from text", () => {
			const text = "<reasoning>Logic</reasoning>Answer"
			const result = TextToolCallExtractor.removeThinkingTags(text)

			expect(result).toBe("Answer")
		})

		it("should remove all thinking tag variants from text", () => {
			const text = "<think>First</think>Text<thinking>Second</thinking>More<reasoning>Third</reasoning>End"
			const result = TextToolCallExtractor.removeThinkingTags(text)

			expect(result).toBe("TextMoreEnd")
			expect(result).not.toContain("<think>")
			expect(result).not.toContain("<thinking>")
			expect(result).not.toContain("<reasoning>")
		})

		it("should return trimmed text", () => {
			const text = "  <think>Reasoning</think>  Text  "
			const result = TextToolCallExtractor.removeThinkingTags(text)

			expect(result).toBe("Text")
		})

		it("should return original text unchanged if no thinking tags present", () => {
			const text = "Just plain text"
			const result = TextToolCallExtractor.removeThinkingTags(text)

			expect(result).toBe(text)
		})

		it("should handle empty string", () => {
			const result = TextToolCallExtractor.removeThinkingTags("")

			expect(result).toBe("")
		})

		it("should handle text with only thinking tags", () => {
			const text = "<think>Only thinking</think>"
			const result = TextToolCallExtractor.removeThinkingTags(text)

			expect(result).toBe("")
		})

		it("should handle case-insensitive tags", () => {
			const text = "<THINK>Upper</THINK><Thinking>Mixed</Thinking><REASONING>Caps</REASONING>Text"
			const result = TextToolCallExtractor.removeThinkingTags(text)

			expect(result).toBe("Text")
		})
	})
})
