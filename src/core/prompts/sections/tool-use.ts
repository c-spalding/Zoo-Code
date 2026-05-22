/**
 * Returns the shared tool-use section of the system prompt.
 *
 * When allowTextOnlyResponses is true the mandatory-tool-call requirement is
 * replaced with a softer instruction so models that prefer to "think out loud"
 * are not penalised for conversational turns.
 *
 * When textToolCallFallback is true, the section explains the XML format the
 * model must use so that embedded tool calls can be extracted from plain text.
 */
export function getSharedToolUseSection(allowTextOnlyResponses?: boolean, textToolCallFallback?: boolean): string {
	if (textToolCallFallback) {
		// When the fallback extractor is active, the model is not using native
		// function-calling.  Instruct it to embed tool calls as XML so the
		// extractor can reliably parse them.
		return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. This environment does not use native function-calling. Instead, you must embed tool calls directly in your text response using the following XML format:

<tool_name>
  <parameter_name>value</parameter_name>
</tool_name>

Replace "tool_name" with the exact tool name and add one child element per parameter. You may wrap reasoning in <thinking>...</thinking> before the tool call - it will be rendered as a collapsible block. You must call at least one tool per assistant response to make progress. Prefer calling as many tools as are reasonably needed in a single response to reduce back-and-forth and complete tasks faster.`
	}

	const toolRequirementInstruction = allowTextOnlyResponses
		? `Use tools when you need to take action, gather information, or make changes. If you only need to communicate or explain your approach, you may respond with text alone. However, to make progress on a task you must use tools.`
		: `You must call at least one tool per assistant response.`

	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. Use the provider-native tool-calling mechanism. Do not include XML markup or examples. ${toolRequirementInstruction} Prefer calling as many tools as are reasonably needed in a single response to reduce back-and-forth and complete tasks faster.`
}
