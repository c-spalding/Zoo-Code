import { z } from "zod"

import { reasoningEffortSettingSchema, verbosityLevelsSchema } from "../model.js"
import type { ProviderIdentifier } from "../provider-identifiers.js"

export const API_PROVIDER_FIELD = "apiProvider"
export const SETTINGS_SHAPE_FIELD = "settingsShape"
export const API_MODEL_ID_FIELD = "apiModelId"

export const baseProviderSettingsShape = {
	includeMaxTokens: z.boolean().optional(),
	todoListEnabled: z.boolean().optional(),
	modelTemperature: z.number().nullish(),
	rateLimitSeconds: z.number().optional(),
	consecutiveMistakeLimit: z.number().min(0).optional(),
	enableReasoningEffort: z.boolean().optional(),
	reasoningEffort: reasoningEffortSettingSchema.optional(),
	modelMaxTokens: z.number().optional(),
	modelMaxThinkingTokens: z.number().optional(),
	verbosity: verbosityLevelsSchema.optional(),

	// Custom instructions appended to the system prompt when this profile is active.
	// Combined with global custom instructions and mode-specific instructions.
	// NOTE: Deliberately distinct from the global `customInstructions` key in
	// globalSettingsSchema. They previously shared the same key name, which caused
	// the flat global-state store to collide and the profile text to be duplicated
	// in the system prompt. See ProviderSettingsManager.migrateProfileCustomInstructions.
	profileCustomInstructions: z.string().optional(),

	// When true, inline thinking tags (<think>, <thinking>, <reasoning>) found in the
	// model's streamed text output are extracted in real time and rendered as
	// collapsible reasoning blocks instead of being shown as raw text. Useful for
	// open-weight and other models that emit their chain-of-thought inline rather than
	// via a dedicated reasoning-content channel. Works with any provider; does not
	// require or interact with any other setting.
	extractInlineThinking: z.boolean().optional(),
}

export const apiModelIdProviderModelShape = {
	...baseProviderSettingsShape,
	[API_MODEL_ID_FIELD]: z.string().optional(),
}

type ModelId = string | undefined
type UntypedProviderSettings = Record<string, unknown>
type ProviderModelIdAccessor = (settings: UntypedProviderSettings) => ModelId
type ProviderSettingsFromSchema<S extends z.ZodRawShape> = z.infer<z.ZodObject<S>>
type TypedProviderModelIdAccessor<S extends z.ZodRawShape> = (settings: ProviderSettingsFromSchema<S>) => ModelId

type ProviderDefinitionInput<P extends ProviderIdentifier, S extends z.ZodRawShape> = {
	apiProvider: P
	schema: S
	modelIdKey?: Extract<keyof S, string>
	getModelId: TypedProviderModelIdAccessor<S>
}

export type ProviderDefinition = {
	apiProvider: ProviderIdentifier
	settingsShape: z.ZodRawShape
	modelIdKey?: string
	schema: z.ZodDiscriminatedUnionOption<typeof API_PROVIDER_FIELD>
	getModelId: ProviderModelIdAccessor
}

export const createModelIdAccessor =
	(modelIdKey: string): ProviderModelIdAccessor =>
	(settings) =>
		settings[modelIdKey] as ModelId

// `modelIdKey` supports deprecated exports. Remove it in favor of an accessor-only contract when those exports are removed.
export const createProviderDefinition = <P extends ProviderIdentifier, S extends z.ZodRawShape>({
	apiProvider,
	schema,
	...modelIdDefinition
}: ProviderDefinitionInput<P, S>) => {
	const settingsSchema = z.object(schema)
	const getModelId: ProviderModelIdAccessor = (settings) => {
		const parsedSettings = settingsSchema.safeParse(settings)
		return parsedSettings.success ? modelIdDefinition.getModelId(parsedSettings.data) : undefined
	}

	return {
		apiProvider,
		settingsShape: schema,
		modelIdKey: modelIdDefinition.modelIdKey,
		schema: z.object({
			...schema,
			[API_PROVIDER_FIELD]: z.literal(apiProvider),
		}),
		getModelId,
	}
}
