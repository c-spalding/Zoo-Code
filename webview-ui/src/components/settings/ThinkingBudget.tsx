/*
Semantics for Reasoning Effort (ThinkingBudget)

Capability surface:
- modelInfo.supportsReasoningEffort: boolean | Array&lt;"disable" | "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"&gt;
  - true  → UI shows ["low","medium","high"]
  - array → UI shows exactly the provided values (e.g. GPT-5.5 includes "xhigh")

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
	getModelMaxOutputTokens,
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
	 * When true, renders the max-output-tokens control via `MaxOutputTokensControl`
	 * (slider + numeric input, with room for provider-specific affordances) instead of
	 * the plain slider used by every other provider. Set by `BedrockThinkingBudget` to
	 * add the "Detect max output tokens" probe button without changing any other
	 * provider's rendering.
	 */
	useEnhancedMaxOutputControl?: boolean
	/** Rendered next to the max-output-tokens value (e.g. Bedrock's probe/reset buttons). */
	maxOutputTokensExtraSlot?: ReactNode
	/** Rendered below the max-output-tokens control (e.g. probe status text). */
	maxOutputTokensHelperText?: ReactNode
}

export const ThinkingBudget = ({
	apiConfiguration,
	setApiConfigurationField,
	modelInfo,
	useEnhancedMaxOutputControl,
	maxOutputTokensExtraSlot,
	maxOutputTokensHelperText,
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
	// Models that advertise a user-configurable max output budget (e.g. Z.ai GLM) but do not
	// use the reasoning-budget slider. The reasoning-budget branch already renders its own
	// max-tokens control, so only surface this standalone slider when that branch is inactive.
	const isMaxTokensConfigurable = !!modelInfo && modelInfo.supportsMaxTokens && !isReasoningBudgetSupported

	// "disable" turns off reasoning entirely; "none" is a valid reasoning level.
	// Both display as "None" in the UI but behave differently.
	// Arrays from supportsReasoningEffort may include "disable" (e.g. Z.ai GLM), so type the
	// full option set as ReasoningEffortExtended | "disable" from the start to avoid casts.
	type ReasoningEffortOption = ReasoningEffortExtended | "disable"
	const supports = modelInfo?.supportsReasoningEffort

	// D3 (smoke-test-triage.md): models that advertise BOTH a reasoning budget AND an
	// explicit effort array are using Anthropic's "adaptive thinking" shape (Bedrock
	// Sonnet 5 / Opus 5 / Opus 4.7 / Opus 4.8 / Fable 5(.1) / Mythos 5). The API ignores
	// any token-budget input for these models - the model decides how long to think
	// based on the effort bucket - so the per-thinking-tokens slider is meaningless and
	// the effort dropdown must be shown instead.
	//
	// Deliberately gated on Array.isArray(supports) rather than on
	// `isReasoningBudgetSupported && isReasoningEffortSupported` alone: OpenRouter's and
	// Requesty's dynamic fetchers set BOTH supportsReasoningBinary AND
	// supportsReasoningBudget true for their Anthropic 5.x entries but never set an
	// explicit supportsReasoningEffort array, so they must keep today's bare-checkbox
	// UI. Only the fork's Bedrock catalog (and any future provider that advertises a
	// real effort array alongside a budget flag) should move to the adaptive branch.
	const isAdaptiveEffortModel = isReasoningBudgetSupported && Array.isArray(supports) && supports.length > 0

	const baseAvailableOptions: ReadonlyArray<ReasoningEffortOption> =
		supports === true
			? (reasoningEfforts as readonly ReasoningEffortOption[])
			: Array.isArray(supports)
				? (supports as ReadonlyArray<ReasoningEffortOption>)
				: (reasoningEfforts as readonly ReasoningEffortOption[])

	// Add "disable" option only when:
	// 1. requiredReasoningEffort is not true, AND
	// 2. supportsReasoningEffort is boolean true (not an explicit array)
	// When the model provides an explicit array, respect those exact values.
	const shouldAutoAddDisable =
		!modelInfo?.requiredReasoningEffort && supports === true && !baseAvailableOptions.includes("disable")
	const availableOptions: ReadonlyArray<ReasoningEffortOption> = shouldAutoAddDisable
		? ["disable", ...baseAvailableOptions]
		: baseAvailableOptions

	// Use the model's declared default when present; otherwise fall back based on requiredReasoningEffort.
	const modelDefaultReasoningEffort = modelInfo?.reasoningEffort as ReasoningEffortExtended | undefined
	const defaultReasoningEffort: ReasoningEffortOption =
		modelDefaultReasoningEffort ?? (modelInfo?.requiredReasoningEffort ? "medium" : "disable")
	// Current reasoning effort from settings, or fall back to default.
	// Clamp to availableOptions so the Select trigger always renders a valid option.
	const storedReasoningEffort = apiConfiguration.reasoningEffort as ReasoningEffortOption | undefined
	const rawReasoningEffort: ReasoningEffortOption = storedReasoningEffort || defaultReasoningEffort
	const fallbackReasoningEffort = availableOptions.includes(defaultReasoningEffort)
		? defaultReasoningEffort
		: (availableOptions[0] ?? rawReasoningEffort)
	const currentReasoningEffort: ReasoningEffortOption = availableOptions.includes(rawReasoningEffort)
		? rawReasoningEffort
		: fallbackReasoningEffort

	// Keep normalized defaults pending so Save persists them to the provider profile.
	useEffect(() => {
		if (
			isReasoningEffortSupported &&
			storedReasoningEffort !== currentReasoningEffort &&
			currentReasoningEffort !== "disable"
		) {
			setApiConfigurationField("reasoningEffort", currentReasoningEffort as ReasoningEffortExtended)
		}
	}, [isReasoningEffortSupported, storedReasoningEffort, currentReasoningEffort, setApiConfigurationField])

	// Sync enableReasoningEffort based on the dropdown selection.
	//
	// This effect is only meaningful for the EFFORT-ONLY path, where the dropdown is the
	// user's single source of truth for whether reasoning is on. In the adaptive-thinking
	// path (budget + effort array, e.g. Bedrock Sonnet 5 / Opus 4.7) the dedicated "Use
	// reasoning" checkbox is the source of truth, and forcibly re-enabling reasoning here
	// would prevent the user from ever switching it off (ticking the checkbox off would be
	// immediately reverted because the dropdown still shows a non-"disable" value). Archive
	// precedent: 06996004a scoped this exact effect to the effort-only path for the same
	// reason.
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

	// Default max output budget for models that expose a standalone max-tokens slider.
	// When the user hasn't set an explicit `modelMaxTokens`, fall back to the same value
	// the runtime would use (the default output clamp) so behavior is unchanged.
	const defaultMaxOutputTokens =
		(isMaxTokensConfigurable && selectedModelId && modelInfo
			? getModelMaxOutputTokens({ modelId: selectedModelId, model: modelInfo, settings: apiConfiguration })
			: undefined) ??
		modelInfo?.maxTokens ??
		DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS
	const standaloneMaxOutputTokens = apiConfiguration.modelMaxTokens ?? defaultMaxOutputTokens

	if (!modelInfo) {
		return null
	}

	// Shared markup for the "Max Output Tokens" slider, reused by the standalone control
	// (supportsMaxTokens models) and the reasoning-budget branch below. When
	// `useEnhancedMaxOutputControl` is set (Bedrock only, via `BedrockThinkingBudget`),
	// swaps the plain slider for `MaxOutputTokensControl`, which adds a numeric input and
	// room for the "Detect max output tokens" probe button/status text.
	const renderMaxTokensSlider = (min: number, max: number, value: number, testId?: string) =>
		useEnhancedMaxOutputControl ? (
			<div className="flex flex-col gap-1" {...(testId ? { "data-testid": testId } : {})}>
				<div className="font-medium">{t("settings:thinkingBudget.maxTokens")}</div>
				<MaxOutputTokensControl
					value={value}
					min={min}
					max={max}
					// B4 sweep extra (smoke-test-triage.md tranche B): archive passed both
					// of these into MaxOutputTokensControl; HEAD had dropped them (cosmetic
					// gap - defaultValue only matters when value is falsy, and
					// inputAriaLabel only affects the numeric input's accessible name).
					defaultValue={DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS}
					inputAriaLabel={t("settings:thinkingBudget.maxTokens")}
					onChange={(newValue) => setApiConfigurationField("modelMaxTokens", newValue)}
					extraSlot={maxOutputTokensExtraSlot}
					helperText={maxOutputTokensHelperText}
				/>
			</div>
		) : (
			<div className="flex flex-col gap-1" {...(testId ? { "data-testid": testId } : {})}>
				<div className="font-medium">{t("settings:thinkingBudget.maxTokens")}</div>
				<div className="flex items-center gap-1">
					<Slider
						min={min}
						max={max}
						step={1024}
						value={[value]}
						onValueChange={([newValue]) => setApiConfigurationField("modelMaxTokens", newValue)}
					/>
					<div className="w-12 text-sm text-center">{value}</div>
				</div>
			</div>
		)

	// Standalone max output tokens slider for models that advertise `supportsMaxTokens`
	// (e.g. Z.ai GLM) but do not surface the reasoning-budget control.
	const maxOutputTokensControl =
		isMaxTokensConfigurable && modelInfo.maxTokens
			? renderMaxTokensSlider(1024, modelInfo.maxTokens, standaloneMaxOutputTokens, "max-output-tokens")
			: null

	// Models with supportsReasoningBinary (binary reasoning) show a simple on/off toggle -
	// UNLESS the model is also an adaptive-effort model (D3: budget + explicit effort array,
	// e.g. Bedrock Sonnet 5 / Opus 5 / Fable 5(.1) / Mythos 5 set supportsReasoningBinary AND
	// supportsReasoningBudget AND an effort array). Those models must fall through to the
	// budget branch below so the max-output control (D2) and the effort dropdown (D3) are
	// reachable.
	//
	// CROSS-PROVIDER GUARD: this relaxation is deliberately scoped to
	// `isAdaptiveEffortModel` (which requires Array.isArray(supportsReasoningEffort)), NOT to
	// `!isReasoningBudgetSupported`. OpenRouter's and Requesty's dynamic fetchers also set
	// both supportsReasoningBinary AND supportsReasoningBudget true for their Anthropic 5.x
	// entries (openrouter.ts, requesty.ts) but never set an explicit effort array, so
	// `isAdaptiveEffortModel` is false for them and they keep today's bare-checkbox UI
	// unchanged - only the fork's Bedrock catalog (array-metadata models) gets the new
	// behaviour.
	// A binary-only-reasoning model can still advertise `supportsMaxTokens`, so surface the
	// standalone max-output slider alongside the toggle when it applies.
	if (isReasoningSupported && !isAdaptiveEffortModel) {
		return (
			<>
				{maxOutputTokensControl}
				<div className="flex flex-col gap-1">
					<Checkbox
						checked={enableReasoningEffort}
						onChange={(checked: boolean) =>
							setApiConfigurationField("enableReasoningEffort", checked === true)
						}>
						{t("settings:providers.useReasoning")}
					</Checkbox>
				</div>
			</>
		)
	}

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
			{/*
			 * D2 (smoke-test-triage.md): the max-output-tokens control is rendered for ALL
			 * hybrid-reasoning models regardless of whether reasoning is currently enabled -
			 * archive parity (06996004a). The cap is the response-length envelope and is
			 * independent of whether the model is thinking; hiding it behind the "Use
			 * reasoning" checkbox made it impossible to lower the output cap without first
			 * enabling reasoning.
			 */}
			{renderMaxTokensSlider(
				8192,
				Math.max(modelInfo.maxTokens || 8192, customMaxOutputTokens, DEFAULT_HYBRID_REASONING_MODEL_MAX_TOKENS),
				customMaxOutputTokens,
			)}
			{(isReasoningBudgetRequired || enableReasoningEffort) &&
				(isAdaptiveEffortModel ? (
					// D3: adaptive-thinking models (budget + effort array) ignore the token
					// budget entirely - the effort dropdown is the only configurable knob.
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
								// In adaptive mode "disable"/"none" can't be selected here because
								// the parent checkbox above already gates whether reasoning is on.
								// Persist the picked effort as-is.
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
		<>
			{maxOutputTokensControl}
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
							// "none", "minimal", "low", "medium", "high" all enable reasoning
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
		</>
	) : (
		maxOutputTokensControl
	)
}
