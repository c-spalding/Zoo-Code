import { z } from "zod"

import { providerIdentifiers } from "../provider-identifiers.js"
import {
	API_MODEL_ID_FIELD,
	apiModelIdProviderModelShape,
	createModelIdAccessor,
	createProviderDefinition,
} from "./common.js"

export const bedrockProviderDefinition = createProviderDefinition({
	apiProvider: providerIdentifiers.bedrock,
	modelIdKey: API_MODEL_ID_FIELD,
	getModelId: createModelIdAccessor(API_MODEL_ID_FIELD),
	schema: {
		...apiModelIdProviderModelShape,
		awsAccessKey: z.string().optional(),
		awsSecretKey: z.string().optional(),
		awsSessionToken: z.string().optional(),
		awsRegion: z.string().optional(),
		awsUseCrossRegionInference: z.boolean().optional(),
		awsUseGlobalInference: z.boolean().optional(), // Enable Global Inference profile routing when supported
		awsUsePromptCache: z.boolean().optional(),
		awsProfile: z.string().optional(),
		awsUseProfile: z.boolean().optional(),
		awsApiKey: z.string().optional(),
		awsUseApiKey: z.boolean().optional(),
		awsCustomArn: z.string().optional(),
		awsModelContextWindow: z.number().optional(),
		// T6: Empirically detected (or manually entered) per-config cap on the model's max
		// output tokens. Takes precedence over the static `bedrockModels.<id>.maxTokens` table
		// when present (see `resolveBedrockModelInfo`'s `maxOutputTokensOverride` parameter).
		// Populated by the "Detect max output tokens" probe button (see
		// `probeBedrockMaxOutputTokens` in src/api/providers/bedrock-discovery.ts) or manually.
		awsModelMaxOutputTokens: z.number().optional(),
		awsBedrockEndpointEnabled: z.boolean().optional(),
		awsBedrockEndpoint: z.string().optional(),
		awsBedrock1MContext: z.boolean().optional(), // Enable 'context-1m-2025-08-07' beta for 1M context window.
		awsBedrockServiceTier: z.enum(["STANDARD", "FLEX", "PRIORITY"]).optional(), // AWS Bedrock service tier selection
		// The invoke target (model ID, inference profile ID, or ARN) explicitly selected from the discovered
		// targets dropdown. When unset, the target is inferred from apiModelId/awsCustomArn.
		awsBedrockInvokeTarget: z.string().optional(),
		// The kind of invoke target selected (foundation model, system/application inference profile, prompt
		// router, custom ARN, or unknown). Used to reconcile discovery results with legacy static model IDs.
		awsBedrockTargetKind: z
			.enum([
				"foundation-model",
				"system-profile",
				"application-profile",
				"custom-arn",
				"prompt-router",
				"unknown",
			])
			.optional(),
	},
})
