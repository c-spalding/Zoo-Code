/**
 * Options controlling the TOOL USE section's wording.
 */
export interface SharedToolUseSectionOptions {
	/**
	 * When true (fork tranche T9), appends a sentence describing an XML tool-call
	 * fallback format for models without native function-calling support. The base
	 * sentence is otherwise byte-for-byte identical to the default output, so
	 * leaving this unset/false never changes existing prompt output.
	 */
	textToolCallFallback?: boolean
}

export function getSharedToolUseSection(options?: SharedToolUseSectionOptions): string {
	// The fallback sentence is appended, never interpolated into the base
	// sentence, so the off-state (options undefined or textToolCallFallback
	// false) renders byte-for-byte identical to the pre-T9 output.
	const fallbackInstruction = options?.textToolCallFallback
		? ` If you do not have native function-calling capability, embed tool calls directly in your text response using the following XML format instead:\n\n<tool_name>\n    <parameter_name>value</parameter_name>\n</tool_name>\n\nReplace "tool_name" with the exact tool name and add one child element per parameter. You may wrap reasoning in <thinking>...</thinking> before the tool call - it will be rendered as a collapsible block.`
		: ""

	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. Use the provider-native tool-calling mechanism. Do not include XML markup or examples.${fallbackInstruction} You must call at least one tool per assistant response. Prefer calling as many tools as are reasonably needed in a single response to reduce back-and-forth and complete tasks faster.`
}
