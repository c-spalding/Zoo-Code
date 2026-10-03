import type { ToolName } from "@roo-code/types"

import { toolParamNames, type ToolParamName } from "../../shared/tools"

import { THINKING_TAG_REGEX } from "./thinking-tags"

/**
 * A single tool call extracted from a model's plain-text response.
 */
export interface ExtractedToolCall {
	name: ToolName
	params: Record<string, string>
	rawText: string
}

/**
 * Result of scanning a block of text for thinking tags and tool calls.
 */
export interface ExtractionResult {
	toolCalls: ExtractedToolCall[]
	thinking: string
	cleanedText: string
}

// Fenced code block containing a JSON tool call, e.g.:
// ```tool_call
// {"name": "read_file", "arguments": {"path": "foo.ts"}}
// ```
const FENCED_TOOL_CALL_REGEX = /```tool_call\r?\n([\s\S]*?)```/gi

// Anthropic-style invoke format, e.g.:
// <invoke name="read_file"><parameter name="path">foo.ts</parameter></invoke>
const INVOKE_TOOL_CALL_REGEX = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/gi

// A single XML parameter child element inside either an XML-format tool call
// or an Anthropic invoke block, e.g. <path>foo.ts</path> or
// <parameter name="path">foo.ts</parameter>.
const XML_PARAM_REGEX = /<([a-zA-Z_][a-zA-Z0-9_]*)>([\s\S]*?)<\/\1>/g
const INVOKE_PARAM_REGEX = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g

interface InternalMatch {
	start: number
	end: number
	toolCall: ExtractedToolCall
}

/**
 * Parses tool calls embedded directly in a model's plain-text response. This is
 * the fallback path for models without native function-calling support
 * (`textToolCallFallback` provider setting): such models are instructed (see
 * `getSharedToolUseSection`) to express tool calls as XML, and this class turns
 * that text back into the same `ExtractedToolCall` shape the native-protocol
 * path produces, so the two paths can share downstream handling.
 *
 * Three formats are recognised, in this scan order (first match at a given
 * text position wins when formats overlap):
 *   1. XML:     <tool_name><param>value</param></tool_name>
 *   2. Invoke:  <invoke name="tool_name"><parameter name="param">value</parameter></invoke>
 *   3. JSON:    ```tool_call\n{"name": "tool_name", "arguments": {...}}\n```
 *      (also accepts "parameters" as an alias for "arguments")
 *
 * Thinking tags (<think>, <thinking>, <reasoning>) are stripped before tool-call
 * scanning begins, using the shared regex from `thinking-tags.ts` (fork tranche
 * T8) rather than redefining it, so both features agree on tag syntax.
 */
export class TextToolCallExtractor {
	/**
	 * Extracts thinking content and tool calls from `text`, restricted to tool
	 * names present in `allowedTools`. Tool calls naming a tool not in
	 * `allowedTools` (or not a recognised tool name at all) are left in place as
	 * part of the returned `cleanedText` rather than being extracted - the
	 * caller's allowlist is a security boundary, not a parsing hint.
	 */
	static extract(text: string, allowedTools: ReadonlySet<string>): ExtractionResult {
		const { thinking, textWithoutThinking } = this.removeThinkingTagsInternal(text)

		const matches: InternalMatch[] = [
			...this.findXmlToolCalls(textWithoutThinking, allowedTools),
			...this.findInvokeToolCalls(textWithoutThinking, allowedTools),
			...this.findJsonToolCalls(textWithoutThinking, allowedTools),
		].sort((a, b) => a.start - b.start)

		const toolCalls: ExtractedToolCall[] = []
		const keptSegments: string[] = []
		let cursor = 0

		for (const match of matches) {
			// Skip matches that overlap a previously accepted match (e.g. an XML
			// match and a JSON match both claiming an overlapping span).
			if (match.start < cursor) {
				continue
			}
			keptSegments.push(textWithoutThinking.slice(cursor, match.start))
			toolCalls.push(match.toolCall)
			cursor = match.end
		}
		keptSegments.push(textWithoutThinking.slice(cursor))

		return {
			toolCalls,
			thinking,
			cleanedText: keptSegments.join("").trim(),
		}
	}

	/**
	 * Removes thinking tags from `text`, returning only the cleaned text (the
	 * extracted thinking content, if any, is discarded). Exposed as a standalone
	 * utility for callers that only need display-text cleanup.
	 */
	static removeThinkingTags(text: string): string {
		return this.removeThinkingTagsInternal(text).textWithoutThinking
	}

	private static removeThinkingTagsInternal(text: string): { thinking: string; textWithoutThinking: string } {
		const thinkingParts: string[] = []
		const textWithoutThinking = text.replace(THINKING_TAG_REGEX, (_match, _tagName, content: string) => {
			const trimmed = content.trim()
			if (trimmed.length > 0) {
				thinkingParts.push(trimmed)
			}
			return ""
		})

		return {
			thinking: thinkingParts.join("\n\n"),
			textWithoutThinking: textWithoutThinking.trim(),
		}
	}

	private static isAllowedTool(name: string, allowedTools: ReadonlySet<string>): name is ToolName {
		return allowedTools.has(name)
	}

	/**
	 * Builds a params record from raw string key/value pairs, keeping only keys
	 * that are recognised tool-parameter names. Returns `undefined` if no
	 * recognised parameters were found, so callers can reject the match
	 * entirely (a tool call with zero recognised params is almost always a
	 * false-positive XML match, e.g. prose that happens to contain matching
	 * angle brackets).
	 */
	private static buildParams(rawParams: Array<[string, string]>): Record<string, string> | undefined {
		const params: Record<string, string> = {}
		let foundRecognized = false

		for (const [key, value] of rawParams) {
			if (toolParamNames.includes(key as ToolParamName)) {
				params[key] = value
				foundRecognized = true
			}
		}

		return foundRecognized ? params : undefined
	}

	private static findXmlToolCalls(text: string, allowedTools: ReadonlySet<string>): InternalMatch[] {
		const matches: InternalMatch[] = []
		// Build one regex per allowed tool name so we only match known tool tags,
		// never arbitrary prose that happens to look like XML.
		for (const toolName of allowedTools) {
			const tagRegex = new RegExp(`<${toolName}>([\\s\\S]*?)<\\/${toolName}>`, "gi")
			let match: RegExpExecArray | null
			while ((match = tagRegex.exec(text)) !== null) {
				if (!this.isAllowedTool(toolName, allowedTools)) {
					continue
				}
				const rawParams = this.extractXmlParams(match[1])
				const params = this.buildParams(rawParams)
				if (!params) {
					continue
				}
				matches.push({
					start: match.index,
					end: match.index + match[0].length,
					toolCall: {
						name: toolName as ToolName,
						params,
						rawText: match[0],
					},
				})
			}
		}
		return matches
	}

	private static extractXmlParams(inner: string): Array<[string, string]> {
		const params: Array<[string, string]> = []
		let match: RegExpExecArray | null
		const regex = new RegExp(XML_PARAM_REGEX)
		while ((match = regex.exec(inner)) !== null) {
			params.push([match[1], match[2].trim()])
		}
		return params
	}

	private static findInvokeToolCalls(text: string, allowedTools: ReadonlySet<string>): InternalMatch[] {
		const matches: InternalMatch[] = []
		const regex = new RegExp(INVOKE_TOOL_CALL_REGEX)
		let match: RegExpExecArray | null
		while ((match = regex.exec(text)) !== null) {
			const toolName = match[1]
			if (!this.isAllowedTool(toolName, allowedTools)) {
				continue
			}
			const rawParams = this.extractInvokeParams(match[2])
			const params = this.buildParams(rawParams)
			if (!params) {
				continue
			}
			matches.push({
				start: match.index,
				end: match.index + match[0].length,
				toolCall: {
					name: toolName,
					params,
					rawText: match[0],
				},
			})
		}
		return matches
	}

	private static extractInvokeParams(inner: string): Array<[string, string]> {
		const params: Array<[string, string]> = []
		const regex = new RegExp(INVOKE_PARAM_REGEX)
		let match: RegExpExecArray | null
		while ((match = regex.exec(inner)) !== null) {
			params.push([match[1], match[2].trim()])
		}
		return params
	}

	private static findJsonToolCalls(text: string, allowedTools: ReadonlySet<string>): InternalMatch[] {
		const matches: InternalMatch[] = []
		const regex = new RegExp(FENCED_TOOL_CALL_REGEX)
		let match: RegExpExecArray | null
		while ((match = regex.exec(text)) !== null) {
			let parsed: unknown
			try {
				parsed = JSON.parse(match[1].trim())
			} catch {
				// Malformed JSON is silently skipped - not every fenced block
				// claiming to be a tool call is well-formed, and surfacing a
				// parse error to the model would be more disruptive than simply
				// leaving the block in the displayed text.
				continue
			}

			if (typeof parsed !== "object" || parsed === null) {
				continue
			}

			const obj = parsed as Record<string, unknown>
			const toolName = obj.name
			if (typeof toolName !== "string" || !this.isAllowedTool(toolName, allowedTools)) {
				continue
			}

			const argsValue = obj.arguments ?? obj.parameters
			if (typeof argsValue !== "object" || argsValue === null) {
				continue
			}

			const rawParams: Array<[string, string]> = Object.entries(argsValue as Record<string, unknown>).map(
				([key, value]) => [key, typeof value === "string" ? value : JSON.stringify(value)],
			)
			const params = this.buildParams(rawParams)
			if (!params) {
				continue
			}

			matches.push({
				start: match.index,
				end: match.index + match[0].length,
				toolCall: {
					name: toolName,
					params,
					rawText: match[0],
				},
			})
		}
		return matches
	}
}
