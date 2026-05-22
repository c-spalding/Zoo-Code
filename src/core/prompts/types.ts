/**
 * Settings passed to system prompt generation functions
 */
export interface SystemPromptSettings {
	todoListEnabled: boolean
	useAgentRules: boolean
	/** When true, recursively discover and load .roo/rules from subdirectories */
	enableSubfolderRules?: boolean
	newTaskRequireTodos: boolean
	/** When true, model should hide vendor/company identity in responses */
	isStealthModel?: boolean
	/**
	 * When true, text-only responses from the model are accepted without forcing
	 * a tool-use retry. The system prompt instruction is softened accordingly.
	 */
	allowTextOnlyResponses?: boolean
	/**
	 * When true, the system prompt instructs the model to embed tool calls as XML
	 * in its text output so the TextToolCallExtractor can parse them. Used for
	 * open-weight models via Bedrock that do not support native function-calling.
	 */
	textToolCallFallback?: boolean
}
