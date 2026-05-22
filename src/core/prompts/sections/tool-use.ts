/**
 * Returns the shared tool-use section of the system prompt.
 *
 * When allowTextOnlyResponses is true the mandatory-tool-call requirement is
 * replaced with a softer instruction so models that prefer to "think out loud"
 * are not penalised for conversational turns.
 *
 * When textToolCallFallback is true an additional sentence is added that tells
 * the model to embed tool calls as XML if it does not have native function-
 * calling capability.  Models that do support native function-calling will
 * still use it (the instruction says "prefer native"), so their behaviour is
 * unchanged.  For models that cannot use native function-calling the XML
 * fallback ensures they know how to express tool calls so the post-stream
 * TextToolCallExtractor can parse and execute them.
 */
export function getSharedToolUseSection(allowTextOnlyResponses?: boolean, textToolCallFallback?: boolean): string {
	const toolRequirementInstruction = allowTextOnlyResponses
		? `Use tools when you need to take action, gather information, or make changes. If you only need to communicate or explain your approach, you may respond with text alone. However, to make progress on a task you must use tools.`
		: `You must call at least one tool per assistant response.`

	const fallbackInstruction = textToolCallFallback
		? ` If you do not have native function-calling capability, embed tool calls directly in your text response using the following XML format instead:\n\n<tool_name>\n  <parameter_name>value</parameter_name>\n</tool_name>\n\nReplace "tool_name" with the exact tool name and add one child element per parameter. You may wrap reasoning in <thinking>...</thinking> before the tool call - it will be rendered as a collapsible block.`
		: ""

	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. Prefer the provider-native tool-calling mechanism when available. Do not include XML markup when using native tool-calling.${fallbackInstruction} ${toolRequirementInstruction} Prefer calling as many tools as are reasonably needed in a single response to reduce back-and-forth and complete tasks faster.`
}
