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
}
