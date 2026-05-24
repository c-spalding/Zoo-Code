/*
Semantics for Reasoning Effort (ThinkingBudget)

Capability surface:
- modelInfo.supportsReasoningEffort: boolean | Array<"disable" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max">
  - true  → UI shows ["low","medium","high"]
  - array → UI shows exactly the provided values

Effort levels (per platform.claude.com/docs/en/build-with-claude/effort and OpenAI docs):
  - "minimal" / "low" / "medium" / "high": broadly supported.
  - "xhigh":  GPT-5.x, Anthropic Opus 4.7.
  - "max":    Anthropic Opus 4.7, Sonnet 4.6 - removes any effort cap.

Selection behavior:
- "disable":
  - Label: t("settings:providers.reasoningEffort.none")
  - set enableReasoningEffort = false
  - persist reasoningEffort = "disable"
  - request builders omit any reasoning parameter/body sections
- "none":
  - Label: t("settings:providers.reasoningEffort.none")
  - set enableReasoningEffort = true
  - persist reasoningEffort = "none"
  - request builders include reasoning with value "none"
- "minimal" | "low" | "medium" | "high" | "xhigh" | "max":
  - set enableReasoningEffort = true
  - persist the selected value
  - request builders include reasoning with the selected effort

Required:
- If modelInfo.requiredReasoningEffort is true, do not synthesize a "None" choice. Only show values from the capability.
- On mount, if unset and a default exists, set enableReasoningEffort = true and use modelInfo.reasoningEffort.

Notes:
- Current selection is normalized to the capability: unsupported persisted values are not shown.
- Both "disable" and "none" display as the "None" label per UX, but are wired differently as above.
- "minimal" uses t("settings:providers.reasoningEffort.minimal").
*/

import { useEffect, type ReactNode } from "react"
import { Checkbox } from "vscrui"

import { type ProviderSettings, type ModelInfo, type ReasoningEffortExtended, reasoningEfforts } from "@roo-code/types"

import {
	DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
	DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS,
	GEMINI_25_PRO_MIN_THINKING_TOKENS,
} from "@roo/api"

import { useAppTranslation } from "@src/i18n/TranslationContext"
import { Slider, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@src/components/ui"
import { useSelectedModel } from "@src/components/ui/hooks/useSelectedModel"

import { MaxOutputTokensControl } from "./MaxOutputTokensControl"

interface ThinkingBudgetProps {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: <K extends keyof ProviderSettings>(
		field: K,
		value: ProviderSettings[K],
		isUserAction?: boolean,
	) => void
	modelInfo?: ModelInfo
	/**
	 * Optional render slot for provider-specific affordances next to the max-output-tokens
	 * control (e.g. the Bedrock "Detect max output tokens" button). Only rendered when the
	 * provider passes one in; non-Bedrock providers keep the historic plain-slider layout.
	 */
	maxOutputTokensExtraSlot?: ReactNode
	/** Optional helper text rendered below the max-output-tokens control. */
	maxOutputTokensHelperText?: ReactNode
	/**
	 * When true, ThinkingBudget renders the new combined slider+numeric input control for
	 * max output tokens (used by Bedrock today). Other providers stick with the legacy slider
	 * to avoid surprising existing users.
	 */
	useEnhancedMaxOutputControl?: boolean
}

export const ThinkingBudget = ({
	apiConfiguration,
	setApiConfigurationField,
	modelInfo,
	maxOutputTokensExtraSlot,
	maxOutputTokensHelperText,
	useEnhancedMaxOutputControl = false,
}: ThinkingBudgetProps) => {
	const { t } = useAppTranslation()
	const { id: selectedModelId } = useSelectedModel(apiConfiguration)

	// Check if this is a Gemini 2.5 Pro model
	const isGemini25Pro = selectedModelId && selectedModelId.includes("gemini-2.5-pro")
	const minThinkingTokens = isGemini25Pro ? GEMINI_25_PRO_MIN_THINKING_TOKENS : 1024

	// Check model capabilities
	const isReasoningSupported = !!modelInfo && modelInfo.supportsReasoningBinary
	const isReasoningBudgetSupported = !!modelInfo && modelInfo.supportsReasoningBudget
	const isReasoningBudgetRequired = !!modelInfo && modelInfo.requiredReasoningBudget
	const isReasoningEffortSupported = !!modelInfo && modelInfo.supportsReasoningEffort

	// Build available reasoning efforts list from capability.
	// `ReasoningEffortExtended` covers the full universe of values the type system
	// recognises ("none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max").
	// Some models opt into a subset via `supportsReasoningEffort: [...]`; we honour
	// whatever shape they advertise rather than narrowing the type here.
	const supports = modelInfo?.supportsReasoningEffort
	const baseAvailableOptions: ReadonlyArray<ReasoningEffortExtended> =
		supports === true
			? (reasoningEfforts as readonly ReasoningEffortExtended[])
			: Array.isArray(supports)
				? (supports as ReadonlyArray<ReasoningEffortExtended>)
				: (reasoningEfforts as readonly ReasoningEffortExtended[])

	// "disable" turns off reasoning entirely; "none" is a valid reasoning level.
	// Both display as "None" in the UI but behave differently.
	// Add "disable" option only when:
	// 1. requiredReasoningEffort is not true, AND
	// 2. supportsReasoningEffort is boolean true (not an explicit array)
	// When the model provides an explicit array, respect those exact values.
	type ReasoningEffortOption = ReasoningEffortExtended | "disable"
	const shouldAutoAddDisable =
		!modelInfo?.requiredReasoningEffort && supports === true && !baseAvailableOptions.includes("disable" as any)
	const availableOptions: ReadonlyArray<ReasoningEffortOption> = shouldAutoAddDisable
		? (["disable", ...baseAvailableOptions] as ReasoningEffortOption[])
		: (baseAvailableOptions as ReadonlyArray<ReasoningEffortOption>)

	// Default reasoning effort - use model's default if available
	// GPT-5 models have "medium" as their default in the model configuration
	const modelDefaultReasoningEffort = modelInfo?.reasoningEffort as ReasoningEffortExtended | undefined
	const defaultReasoningEffort: ReasoningEffortOption = modelInfo?.requiredReasoningEffort
		? modelDefaultReasoningEffort || "medium"
		: "disable"
	// Current reasoning effort from settings, or fall back to default
	const storedReasoningEffort = apiConfiguration.reasoningEffort as ReasoningEffortOption | undefined
	const currentReasoningEffort: ReasoningEffortOption = storedReasoningEffort || defaultReasoningEffort

	// Set default reasoning effort when model supports it and no value is set
	useEffect(() => {
		if (isReasoningEffortSupported && !apiConfiguration.reasoningEffort) {
			// Only set a default if reasoning is required, otherwise leave as undefined (which maps to "disable")
			if (modelInfo?.requiredReasoningEffort && defaultReasoningEffort !== "disable") {
				setApiConfigurationField("reasoningEffort", defaultReasoningEffort as ReasoningEffortExtended, false)
			}
		}
	}, [
		isReasoningEffortSupported,
		apiConfiguration.reasoningEffort,
		defaultReasoningEffort,
		modelInfo?.requiredReasoningEffort,
		setApiConfigurationField,
	])

	// Sync enableReasoningEffort based on dropdown selection.
	//
	// This effect is only meaningful for the EFFORT-ONLY path, where the dropdown
	// is the user's single source of truth for whether reasoning is on. In the
	// adaptive-thinking path (both budget + effort) the dedicated "Use reasoning"
	// checkbox above is the source of truth, and forcibly re-enabling reasoning
	// here would prevent the user from ever switching it off (issue: ticking the
	// checkbox off would be immediately reverted because the dropdown still shows
	// a non-"disable" value).
	//
	// We also skip this when supportsReasoningBudget is true, because budget-only
	// models render their own checkbox and don't expose the effort dropdown at all.
	const isEffortOnlyPath = isReasoningEffortSupported && !isReasoningBudgetSupported
	useEffect(() => {
		if (!isEffortOnlyPath) return
		const shouldEnable = modelInfo?.requiredReasoningEffort || currentReasoningEffort !== "disable"
		if (shouldEnable && apiConfiguration.enableReasoningEffort !== true) {
			setApiConfigurationField("enableReasoningEffort", true, false)
		}
	}, [
		isEffortOnlyPath,
		modelInfo?.requiredReasoningEffort,
		currentReasoningEffort,
		apiConfiguration.enableReasoningEffort,
		setApiConfigurationField,
	])

	const enableReasoningEffort = apiConfiguration.enableReasoningEffort
	const customMaxOutputTokens = apiConfiguration.modelMaxTokens || DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS
	const customMaxThinkingTokens =
		apiConfiguration.modelMaxThinkingTokens || DEFAULT_HYBRID_REASONING_MODEL_THINKING_TOKENS

	// Dynamically expand or shrink the max thinking budget based on the custom
	// max output tokens so that there's always a 20% buffer.
	const modelMaxThinkingTokens = modelInfo?.maxThinkingTokens
		? Math.min(modelInfo.maxThinkingTokens, Math.floor(0.8 * customMaxOutputTokens))
		: Math.floor(0.8 * customMaxOutputTokens)

	// If the custom max thinking tokens are going to exceed it's limit due
	// to the custom max output tokens being reduced then we need to shrink it
	// appropriately.
	useEffect(() => {
		if (isReasoningBudgetSupported && customMaxThinkingTokens > modelMaxThinkingTokens) {
			setApiConfigurationField("modelMaxThinkingTokens", modelMaxThinkingTokens, false)
		}
	}, [isReasoningBudgetSupported, customMaxThinkingTokens, modelMaxThinkingTokens, setApiConfigurationField])

	if (!modelInfo) {
		return null
	}

	// Models with supportsReasoningBinary (binary reasoning) show a simple on/off toggle
	if (isReasoningSupported) {
		return (
			<div className="flex flex-col gap-1">
				<Checkbox
					checked={enableReasoningEffort}
					onChange={(checked: boolean) =>
						setApiConfigurationField("enableReasoningEffort", checked === true)
					}>
					{t("settings:providers.useReasoning")}
				</Checkbox>
			</div>
		)
	}

	const maxOutputTokensSliderMax = Math.max(
		modelInfo.maxTokens || 8192,
		customMaxOutputTokens,
		DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS,
	)

	// Models that advertise BOTH a reasoning budget AND an effort capability are
	// using Anthropic's "adaptive" thinking shape (e.g. Bedrock Opus 4.7). On those
	// models the API ignores any token-budget input - the model decides how long to
	// think based on the effort bucket - so the per-thinking-tokens slider would be
	// misleading. We keep the max output-tokens control because it caps the overall
	// response envelope and is independent of how hard the model thinks.
	//
	// See https://docs.aws.amazon.com/bedrock/latest/userguide/claude-messages-adaptive-thinking.html:
	//   "Claude Opus 4.7 ... only support adaptive thinking. Manual extended thinking
	//    (thinking.type: 'enabled' with budget_tokens) is not supported on these
	//    models and will return a 400 error."
	const useAdaptiveEffortInsteadOfBudget =
		isReasoningBudgetSupported && isReasoningEffortSupported && Array.isArray(supports) && supports.length > 0

	// The max-output-tokens control is rendered for ALL hybrid-reasoning models
	// regardless of whether reasoning is currently enabled, because that cap is
	// the response-length envelope and is independent of whether the model thinks.
	// Previously this slider was hidden when the user unchecked "Use reasoning",
	// which made it impossible to lower the output cap without first enabling
	// reasoning - misleading and unrelated to the thinking toggle.
	const renderMaxOutputTokensControl = () => (
		<div className="flex flex-col gap-1">
			<div className="font-medium">{t("settings:thinkingBudget.maxTokens")}</div>
			{useEnhancedMaxOutputControl ? (
				<MaxOutputTokensControl
					value={customMaxOutputTokens}
					min={8192}
					max={maxOutputTokensSliderMax}
					defaultValue={DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS}
					onChange={(value) => setApiConfigurationField("modelMaxTokens", value)}
					inputAriaLabel={t("settings:thinkingBudget.maxTokens")}
					extraSlot={maxOutputTokensExtraSlot}
					helperText={maxOutputTokensHelperText}
				/>
			) : (
				<div className="flex items-center gap-1">
					<Slider
						min={8192}
						max={maxOutputTokensSliderMax}
						step={1024}
						value={[customMaxOutputTokens]}
						onValueChange={([value]) => setApiConfigurationField("modelMaxTokens", value)}
					/>
					<div className="w-12 text-sm text-center">{customMaxOutputTokens}</div>
				</div>
			)}
		</div>
	)

	return isReasoningBudgetSupported && !!modelInfo.maxTokens ? (
		<>
			{!isReasoningBudgetRequired && (
				<div className="flex flex-col gap-1">
					<Checkbox
						checked={enableReasoningEffort}
						onChange={(checked: boolean) =>
							setApiConfigurationField("enableReasoningEffort", checked === true)
						}>
						{t("settings:providers.useReasoning")}
					</Checkbox>
				</div>
			)}
			{renderMaxOutputTokensControl()}
			{(isReasoningBudgetRequired || enableReasoningEffort) &&
				(useAdaptiveEffortInsteadOfBudget ? (
					<div className="flex flex-col gap-1" data-testid="reasoning-effort">
						<label className="block font-medium mb-1">
							{t("settings:providers.reasoningEffort.label")}
						</label>
						<Select
							value={
								currentReasoningEffort === "disable" || currentReasoningEffort === "none"
									? (modelDefaultReasoningEffort ?? "medium")
									: currentReasoningEffort
							}
							onValueChange={(value: ReasoningEffortOption) => {
								// In adaptive mode "disable" / "none" can't be selected here
								// because the parent checkbox already gates whether reasoning
								// is on. Persist the picked effort as-is.
								setApiConfigurationField("reasoningEffort", value as ReasoningEffortExtended)
							}}>
							<SelectTrigger className="w-full">
								<SelectValue
									placeholder={t(
										`settings:providers.reasoningEffort.${
											currentReasoningEffort === "disable" || currentReasoningEffort === "none"
												? (modelDefaultReasoningEffort ?? "medium")
												: currentReasoningEffort
										}`,
									)}
								/>
							</SelectTrigger>
							<SelectContent>
								{baseAvailableOptions.map((value) => (
									<SelectItem key={value} value={value}>
										{value === "none"
											? t("settings:providers.reasoningEffort.none")
											: t(`settings:providers.reasoningEffort.${value}`)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				) : (
					<div className="flex flex-col gap-1">
						<div className="font-medium">{t("settings:thinkingBudget.maxThinkingTokens")}</div>
						<div className="flex items-center gap-1" data-testid="reasoning-budget">
							<Slider
								min={minThinkingTokens}
								max={modelMaxThinkingTokens}
								step={minThinkingTokens === 128 ? 128 : 1024}
								value={[customMaxThinkingTokens]}
								onValueChange={([value]) => setApiConfigurationField("modelMaxThinkingTokens", value)}
							/>
							<div className="w-12 text-sm text-center">{customMaxThinkingTokens}</div>
						</div>
					</div>
				))}
		</>
	) : isReasoningEffortSupported ? (
		<div className="flex flex-col gap-1" data-testid="reasoning-effort">
			<div className="flex justify-between items-center">
				<label className="block font-medium mb-1">{t("settings:providers.reasoningEffort.label")}</label>
			</div>
			<Select
				value={currentReasoningEffort}
				onValueChange={(value: ReasoningEffortOption) => {
					// "disable" turns off reasoning entirely; "none" is a valid reasoning level
					if (value === "disable") {
						setApiConfigurationField("enableReasoningEffort", false)
						setApiConfigurationField("reasoningEffort", "disable")
					} else {
						// "none" / "minimal" / "low" / "medium" / "high" / "xhigh" / "max" all enable reasoning
						setApiConfigurationField("enableReasoningEffort", true)
						setApiConfigurationField("reasoningEffort", value as ReasoningEffortExtended)
					}
				}}>
				<SelectTrigger className="w-full">
					<SelectValue
						placeholder={
							currentReasoningEffort
								? currentReasoningEffort === "none" || currentReasoningEffort === "disable"
									? t("settings:providers.reasoningEffort.none")
									: t(`settings:providers.reasoningEffort.${currentReasoningEffort}`)
								: t("settings:common.select")
						}
					/>
				</SelectTrigger>
				<SelectContent>
					{availableOptions.map((value) => (
						<SelectItem key={value} value={value}>
							{value === "none" || value === "disable"
								? t("settings:providers.reasoningEffort.none")
								: t(`settings:providers.reasoningEffort.${value}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	) : null
}
