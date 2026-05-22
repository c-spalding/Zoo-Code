import { type ToolName, toolNames } from "@roo-code/types"
import { type ToolParamName, toolParamNames } from "../../shared/tools"

/**
 * A single extracted tool call from assistant text output.
 */
export interface ExtractedToolCall {
	name: ToolName
	params: Record<string, string>
	rawText: string // The original matched text (for stripping from display)
}

/**
 * Result of scanning assistant text for embedded tool calls and thinking content.
 */
export interface ExtractionResult {
	toolCalls: ExtractedToolCall[]
	thinking: string // Accumulated content from <think>, <thinking>, <reasoning> tags
	cleanedText: string // Text with thinking tags and tool call markup removed
}

// Matches <think>...</think>, <thinking>...</thinking>, <reasoning>...</reasoning>
const THINKING_TAG_REGEX = /<(think|thinking|reasoning)>([\s\S]*?)<\/\1>/gi

// Matches a fenced code block tagged as tool_call containing JSON
const FENCED_TOOL_CALL_REGEX = /```tool_call\r?\n([\s\S]*?)```/gi

// Matches Anthropic-style <invoke name="tool"><parameter name="k">v</parameter></invoke>
const INVOKE_TOOL_CALL_REGEX = /<invoke\s+name="([^"]+)">([\s\S]*?)<\/invoke>/gi

/**
 * Extracts tool calls (XML and JSON-in-fenced-code formats) and inline thinking
 * content from assistant text output.
 *
 * This is used as a fallback for open-weight models (e.g. via Bedrock) that
 * emit tool calls as text rather than as native function-calling protocol
 * messages.
 */
export class TextToolCallExtractor {
	/**
	 * Scan text for embedded tool calls and inline thinking content.
	 *
	 * Only extracts calls for tools present in the allowedTools list.
	 * Returns an empty toolCalls array if no valid tool calls are found.
	 *
	 * Inline thinking tags (<think>, <thinking>, <reasoning>) are extracted
	 * and returned in the `thinking` field so they can be rendered as
	 * collapsible reasoning blocks in the UI.
	 *
	 * @param text - The full assistant text to scan
	 * @param allowedTools - Tools permitted in the current mode
	 * @returns ExtractionResult with toolCalls, thinking, and cleanedText
	 */
	static extract(text: string, allowedTools: ToolName[]): ExtractionResult {
		const allowedSet = new Set(allowedTools)
		const thinkingParts: string[] = []

		// --- Step 1: Strip thinking tags and accumulate their content ---
		let workingText = text.replace(THINKING_TAG_REGEX, (_match, _tag, inner: string) => {
			const trimmed = inner.trim()
			if (trimmed) {
				thinkingParts.push(trimmed)
			}
			return ""
		})

		const thinking = thinkingParts.join("\n\n")

		// --- Step 2: Extract tool calls and remove their markup ---
		const toolCalls: ExtractedToolCall[] = []
		const strippedParts: string[] = []

		// Try to extract XML-format tool calls first, then JSON-in-fenced-code blocks.
		// We walk through the text in order, collecting stripped segments between matches.

		let lastIndex = 0
		const xmlMatches = TextToolCallExtractor.findXmlToolCalls(workingText, allowedSet)
		const jsonMatches = TextToolCallExtractor.findJsonToolCalls(workingText, allowedSet)
		const invokeMatches = TextToolCallExtractor.findInvokeToolCalls(workingText, allowedSet)

		// Merge and sort all matches by their start position in the text.
		// Where matches overlap (unlikely but possible), prefer the one that starts first.
		const allMatches = [...xmlMatches, ...jsonMatches, ...invokeMatches].sort((a, b) => a.start - b.start)

		for (const match of allMatches) {
			// Skip overlapping matches
			if (match.start < lastIndex) {
				continue
			}
			// Collect the text between the previous match end and this match start
			if (match.start > lastIndex) {
				strippedParts.push(workingText.slice(lastIndex, match.start))
			}
			toolCalls.push(match.call)
			lastIndex = match.end
		}

		// Collect any trailing text after the last match
		if (lastIndex < workingText.length) {
			strippedParts.push(workingText.slice(lastIndex))
		}

		const cleanedText = strippedParts.join("").trim()

		return { toolCalls, thinking, cleanedText }
	}

	/**
	 * Remove inline thinking tags from a text string without extracting their
	 * content.  Used to clean already-displayed text blocks after the thinking
	 * content has been emitted as a separate reasoning block.
	 *
	 * @param text - The raw text that may contain thinking tags
	 * @returns The text with all thinking tag pairs (and their content) removed
	 */
	static removeThinkingTags(text: string): string {
		return text.replace(THINKING_TAG_REGEX, "").trim()
	}

	// ---------------------------------------------------------------------------
	// Private helpers
	// ---------------------------------------------------------------------------

	private static isAllowedTool(name: string, allowedSet: Set<ToolName>): name is ToolName {
		return toolNames.includes(name as ToolName) && allowedSet.has(name as ToolName)
	}

	private static buildParams(entries: Iterable<[string, string]>): Record<string, string> | null {
		const params: Record<string, string> = {}
		for (const [key, value] of entries) {
			if (toolParamNames.includes(key as ToolParamName)) {
				params[key] = value
			}
		}
		// Require at least one recognised parameter
		if (Object.keys(params).length === 0) {
			return null
		}
		return params
	}

	/**
	 * Find XML-format tool calls, e.g.:
	 *
	 *   <read_file>
	 *     <path>/src/main.ts</path>
	 *   </read_file>
	 */
	private static findXmlToolCalls(
		text: string,
		allowedSet: Set<ToolName>,
	): Array<{ start: number; end: number; call: ExtractedToolCall }> {
		const results: Array<{ start: number; end: number; call: ExtractedToolCall }> = []

		// Build a pattern that matches any of the allowed+known tool names.
		// We escape each name (they are all snake_case so no regex chars, but be safe).
		const names = toolNames.filter((n) => allowedSet.has(n)).map((n) => escapeRegex(n))

		if (names.length === 0) {
			return results
		}

		const pattern = new RegExp(`<(${names.join("|")})(\\s[^>]*)?>([\\s\\S]*?)<\\/\\1>`, "gi")

		let match: RegExpExecArray | null
		while ((match = pattern.exec(text)) !== null) {
			const toolName = match[1].toLowerCase()
			const innerXml = match[3]
			const rawText = match[0]

			if (!TextToolCallExtractor.isAllowedTool(toolName, allowedSet)) {
				continue
			}

			// Extract child elements as parameters
			const paramEntries = TextToolCallExtractor.extractXmlParams(innerXml)
			const params = TextToolCallExtractor.buildParams(paramEntries)
			if (!params) {
				continue
			}

			results.push({
				start: match.index,
				end: match.index + rawText.length,
				call: { name: toolName, params, rawText },
			})
		}

		return results
	}

	/**
	 * Extract child element key/value pairs from the body of an XML tool call.
	 * Only returns string-valued leaf elements (no nested structures).
	 *
	 * Example input:
	 *   "\n  <path>/src/main.ts</path>\n"
	 * Returns:
	 *   [["path", "/src/main.ts"]]
	 */
	private static extractXmlParams(innerXml: string): Array<[string, string]> {
		const entries: Array<[string, string]> = []
		// Match <paramName>value</paramName> at one level of depth only
		const childPattern = /<([A-Za-z_][A-Za-z0-9_]*)>([\s\S]*?)<\/\1>/g
		let child: RegExpExecArray | null
		while ((child = childPattern.exec(innerXml)) !== null) {
			entries.push([child[1], child[2].trim()])
		}
		return entries
	}

	/**
	 * Find Anthropic-style invoke format tool calls, e.g.:
	 *
	 *   <invoke name="read_file">
	 *     <parameter name="path">/src/main.ts</parameter>
	 *   </invoke>
	 */
	private static findInvokeToolCalls(
		text: string,
		allowedSet: Set<ToolName>,
	): Array<{ start: number; end: number; call: ExtractedToolCall }> {
		const results: Array<{ start: number; end: number; call: ExtractedToolCall }> = []
		const pattern = new RegExp(INVOKE_TOOL_CALL_REGEX.source, "gi")

		let match: RegExpExecArray | null
		while ((match = pattern.exec(text)) !== null) {
			const toolName = match[1].toLowerCase()
			const innerXml = match[2]
			const rawText = match[0]

			if (!TextToolCallExtractor.isAllowedTool(toolName, allowedSet)) {
				continue
			}

			// Extract <parameter name="key">value</parameter> children
			const paramEntries = TextToolCallExtractor.extractInvokeParams(innerXml)
			const params = TextToolCallExtractor.buildParams(paramEntries)
			if (!params) {
				continue
			}

			results.push({
				start: match.index,
				end: match.index + rawText.length,
				call: { name: toolName, params, rawText },
			})
		}

		return results
	}

	/**
	 * Extract parameter key/value pairs from the body of an <invoke> tool call.
	 *
	 * Example input:
	 *   "\n  <parameter name=\"path\">/src/main.ts</parameter>\n"
	 * Returns:
	 *   [["path", "/src/main.ts"]]
	 */
	private static extractInvokeParams(innerXml: string): Array<[string, string]> {
		const entries: Array<[string, string]> = []
		const paramPattern = /<parameter\s+name="([^"]+)">([\s\S]*?)<\/parameter>/g
		let child: RegExpExecArray | null
		while ((child = paramPattern.exec(innerXml)) !== null) {
			entries.push([child[1], child[2].trim()])
		}
		return entries
	}

	/**
	 * Find JSON-in-fenced-code tool calls, e.g.:
	 *
	 *   ```tool_call
	 *   {"name": "read_file", "arguments": {"path": "/src/main.ts"}}
	 *   ```
	 *
	 * Also accepts "parameters" as an alias for "arguments".
	 */
	private static findJsonToolCalls(
		text: string,
		allowedSet: Set<ToolName>,
	): Array<{ start: number; end: number; call: ExtractedToolCall }> {
		const results: Array<{ start: number; end: number; call: ExtractedToolCall }> = []
		const pattern = new RegExp(FENCED_TOOL_CALL_REGEX.source, "gi")

		let match: RegExpExecArray | null
		while ((match = pattern.exec(text)) !== null) {
			const rawText = match[0]
			const jsonBody = match[1].trim()

			let parsed: unknown
			try {
				parsed = JSON.parse(jsonBody)
			} catch {
				// Malformed JSON - skip silently
				continue
			}

			if (typeof parsed !== "object" || parsed === null) {
				continue
			}

			const obj = parsed as Record<string, unknown>
			const toolName = typeof obj.name === "string" ? obj.name.toLowerCase() : undefined

			if (!toolName || !TextToolCallExtractor.isAllowedTool(toolName, allowedSet)) {
				continue
			}

			// Support both "arguments" and "parameters" keys
			const argsObj = obj.arguments ?? obj.parameters
			if (typeof argsObj !== "object" || argsObj === null) {
				continue
			}

			const argEntries = Object.entries(argsObj as Record<string, unknown>).map(([k, v]): [string, string] => [
				k,
				typeof v === "string" ? v : JSON.stringify(v),
			])

			const params = TextToolCallExtractor.buildParams(argEntries)
			if (!params) {
				continue
			}

			results.push({
				start: match.index,
				end: match.index + rawText.length,
				call: { name: toolName, params, rawText },
			})
		}

		return results
	}
}

function escapeRegex(str: string): string {
	return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
