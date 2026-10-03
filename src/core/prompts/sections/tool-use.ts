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
	/**
	 * When true (fork tranche T10), relaxes the closing sentence so the model
	 * knows it may respond with text alone when it only needs to communicate or
	 * explain its approach, rather than being told it must always call a tool.
	 * When false/undefined, the closing sentence is byte-for-byte identical to
	 * the default output, so leaving this unset/false never changes existing
	 * prompt output.
	 */
	allowTextOnlyResponses?: boolean
}

export function getSharedToolUseSection(options?: SharedToolUseSectionOptions): string {
	// The fallback sentence is appended, never interpolated into the base
	// sentence, so the off-state (options undefined or textToolCallFallback
	// false) renders byte-for-byte identical to the pre-T9 output.
	const fallbackInstruction = options?.textToolCallFallback
		? ` If you do not have native function-calling capability, embed tool calls directly in your text response using the following XML format instead:\n\n<tool_name>\n    <parameter_name>value</parameter_name>\n</tool_name>\n\nReplace "tool_name" with the exact tool name and add one child element per parameter. You may wrap reasoning in <thinking>...</thinking> before the tool call - it will be rendered as a collapsible block.`
		: ""

	// The closing sentence is swapped (not appended), but the off-state branch is
	// byte-for-byte identical to the pre-T10 literal, so leaving this
	// unset/false never changes existing prompt output.
	const callRequirement = options?.allowTextOnlyResponses
		? "Use tools when you need to take action, gather information, or make changes. If you only need to communicate or explain your approach, you may respond with text alone. However, to make progress on a task you must use tools."
		: "You must call at least one tool per assistant response."

	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. Use the provider-native tool-calling mechanism. Do not include XML markup or examples.${fallbackInstruction} ${callRequirement} Prefer calling as many tools as are reasonably needed in a single response to reduce back-and-forth and complete tasks faster.`
}
