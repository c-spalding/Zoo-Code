/**
 * Returns the shared tool-use section of the system prompt.
 *
 * When allowTextOnlyResponses is true the mandatory-tool-call requirement is
 * replaced with a softer instruction so models that prefer to "think out loud"
 * are not penalised for conversational turns.
 */
export function getSharedToolUseSection(allowTextOnlyResponses?: boolean): string {
	const toolRequirementInstruction = allowTextOnlyResponses
		? `Use tools when you need to take action, gather information, or make changes. If you only need to communicate or explain your approach, you may respond with text alone. However, to make progress on a task you must use tools.`
		: `You must call at least one tool per assistant response.`

	return `====

TOOL USE

You have access to a set of tools that are executed upon the user's approval. Use the provider-native tool-calling mechanism. Do not include XML markup or examples. ${toolRequirementInstruction} Prefer calling as many tools as are reasonably needed in a single response to reduce back-and-forth and complete tasks faster.`
}
