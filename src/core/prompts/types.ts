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
	 * Per-profile custom instructions for the active provider profile. Kept separate
	 * from the global custom instructions so the two can be rendered under distinct
	 * headings without colliding (see provider-settings `profileCustomInstructions`).
	 */
	profileCustomInstructions?: string
	/**
	 * When true, the TOOL USE section gains an additional sentence describing an XML
	 * tool-call fallback format for models without native function-calling support
	 * (see provider-settings `textToolCallFallback`). When false/undefined, the
	 * section's output is unchanged from its default wording.
	 */
	textToolCallFallback?: boolean
	/**
	 * When true, the TOOL USE section's closing sentence tells the model it may
	 * respond with text alone when it only needs to communicate, rather than
	 * requiring a tool call every turn (see provider-settings
	 * `allowTextOnlyResponses`). When false/undefined, the section's output is
	 * unchanged from its default wording.
	 */
	allowTextOnlyResponses?: boolean
}
