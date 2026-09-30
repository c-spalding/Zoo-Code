import {
	BedrockClient,
	ListFoundationModelsCommand,
	ListInferenceProfilesCommand,
	type BedrockClientConfig,
	type FoundationModelSummary,
	type InferenceProfileSummary,
} from "@aws-sdk/client-bedrock"
import { fromIni } from "@aws-sdk/credential-providers"

import {
	type BedrockDiscoveredTarget,
	type ProviderSettings,
	expandBedrockTargetsWith1MVariants,
	inferBedrockInvokeTargetKind,
	parseBedrockArn,
	parseBedrockBaseModelId,
	resolveBedrockModelInfo,
} from "@roo-code/types"

import { Package } from "../../shared/package"

// T4: Bedrock dynamic discovery of foundation models and inference profiles.
//
// This mirrors the credential plumbing in AwsBedrockHandler's constructor (see bedrock.ts)
// but targets the Bedrock *control plane* (`@aws-sdk/client-bedrock`) rather than the runtime
// (`@aws-sdk/client-bedrock-runtime`) used for Converse calls. The two SDK packages each ship
// their own `Config` type where `token`/`credentials` are tagged with package-private branded
// types, so we keep this plumbing local rather than trying to share a single generic helper.
const toBedrockClientConfig = (options: ProviderSettings): BedrockClientConfig => {
	const config: BedrockClientConfig = {
		userAgentAppId: `ZooCode#${Package.version}`,
		region: options.awsRegion,
	}

	if (options.awsUseApiKey && options.awsApiKey) {
		config.token = { token: options.awsApiKey }
		config.authSchemePreference = ["httpBearerAuth"]
	} else if (options.awsUseProfile && options.awsProfile) {
		config.credentials = fromIni({
			profile: options.awsProfile,
			ignoreCache: true,
		})
	} else if (options.awsAccessKey && options.awsSecretKey) {
		config.credentials = {
			accessKeyId: options.awsAccessKey,
			secretAccessKey: options.awsSecretKey,
			...(options.awsSessionToken ? { sessionToken: options.awsSessionToken } : {}),
		}
	}

	return config
}

const buildFoundationTarget = (summary: FoundationModelSummary): BedrockDiscoveredTarget | undefined => {
	const targetId = summary.modelId
	if (!targetId) {
		return undefined
	}

	// AWS surfaces some foundation models that are only invokable via an inference profile.
	// Calling Converse with the bare model id results in "The provided model identifier is
	// invalid". The control-plane response advertises this up front via
	// `inferenceTypesSupported`; if AWS lists supported types and ON_DEMAND is NOT among them,
	// surfacing this as a "Direct model" dropdown entry is misleading and the resulting
	// invocation will always fail. Skip it -- the user can still pick the matching
	// inference-profile entry (or supply a custom ARN) instead.
	const inferenceTypes = summary.inferenceTypesSupported
	if (Array.isArray(inferenceTypes) && inferenceTypes.length > 0 && !inferenceTypes.includes("ON_DEMAND")) {
		return undefined
	}

	const resolved = resolveBedrockModelInfo({ baseModelId: targetId, targetId })
	const parsedArn = parseBedrockArn(summary.modelArn)

	return {
		id: targetId,
		label: summary.modelName ? `${summary.modelName} (${targetId})` : targetId,
		baseModelId: resolved.baseModelId,
		targetKind: "foundation-model",
		contextWindow: resolved.info.contextWindow,
		contextSource: resolved.contextSource,
		description: summary.providerName,
		arn: summary.modelArn,
		region: parsedArn.region,
		isGlobal: false,
		isCrossRegion: false,
		supportsImages: resolved.info.supportsImages,
		supportsPromptCache: resolved.info.supportsPromptCache,
	}
}

const buildInferenceProfileTarget = (summary: InferenceProfileSummary): BedrockDiscoveredTarget | undefined => {
	const targetId = summary.inferenceProfileId
	if (!targetId) {
		return undefined
	}

	const baseModelIds = Array.from(
		new Set(
			(summary.models ?? [])
				.map((model) => model.modelArn)
				.filter((modelArn): modelArn is string => Boolean(modelArn))
				.map((modelArn) => parseBedrockBaseModelId(modelArn)),
		),
	)
	const baseModelId = baseModelIds[0] ?? parseBedrockBaseModelId(targetId)
	if (!baseModelId) {
		return undefined
	}

	const resolved = resolveBedrockModelInfo({ baseModelId, targetId })
	const targetKind = inferBedrockInvokeTargetKind({
		targetId,
		explicitKind: summary.type === "SYSTEM_DEFINED" ? "system-profile" : "application-profile",
	})
	const parsedArn = parseBedrockArn(summary.inferenceProfileArn)

	return {
		id: targetId,
		label: summary.inferenceProfileName ? `${summary.inferenceProfileName} (${targetId})` : targetId,
		baseModelId: resolved.baseModelId,
		targetKind:
			targetKind === "system-profile" || targetKind === "application-profile"
				? targetKind
				: "application-profile",
		contextWindow: resolved.info.contextWindow,
		contextSource: resolved.contextSource,
		description: summary.description,
		arn: summary.inferenceProfileArn,
		region: parsedArn.region,
		status: summary.status,
		isGlobal: targetId.startsWith("global."),
		isCrossRegion: targetKind === "system-profile" && !targetId.startsWith("global."),
		supportsImages: resolved.info.supportsImages,
		supportsPromptCache: resolved.info.supportsPromptCache,
	}
}

const listInferenceProfiles = async (client: BedrockClient) => {
	const results: InferenceProfileSummary[] = []
	let nextToken: string | undefined

	do {
		const response = await client.send(
			new ListInferenceProfilesCommand({
				nextToken,
				maxResults: 100,
			}),
		)

		results.push(...(response.inferenceProfileSummaries ?? []))
		nextToken = response.nextToken
	} while (nextToken)

	return results
}

/**
 * Discover the foundation models and inference profiles available to the configured
 * AWS credentials/region, returning them as a sorted, deduped, 1M-context-expanded list
 * of {@link BedrockDiscoveredTarget} entries suitable for a searchable dropdown.
 *
 * Foundation models without ON_DEMAND support are filtered out (they can only be invoked
 * via an inference profile). Inference profiles that are not ACTIVE are filtered out.
 */
export const discoverBedrockTargets = async (options: ProviderSettings): Promise<BedrockDiscoveredTarget[]> => {
	if (!options.awsRegion) {
		return []
	}

	const client = new BedrockClient(toBedrockClientConfig(options))

	const [foundationModelsResponse, inferenceProfiles] = await Promise.all([
		client.send(new ListFoundationModelsCommand({})),
		listInferenceProfiles(client),
	])

	const targets = [
		...(foundationModelsResponse.modelSummaries ?? [])
			.map((summary) => buildFoundationTarget(summary))
			.filter((target): target is BedrockDiscoveredTarget => Boolean(target)),
		...inferenceProfiles
			.filter((summary) => summary.status === "ACTIVE")
			.map((summary) => buildInferenceProfileTarget(summary))
			.filter((target): target is BedrockDiscoveredTarget => Boolean(target)),
	]

	const dedupedTargets = Array.from(new Map(targets.map((target) => [target.id, target])).values())

	const sortedTargets = dedupedTargets.sort((a, b) => {
		const kindOrder = { "foundation-model": 0, "system-profile": 1, "application-profile": 2 }
		const kindCompare = kindOrder[a.targetKind] - kindOrder[b.targetKind]
		if (kindCompare !== 0) {
			return kindCompare
		}

		if (a.baseModelId !== b.baseModelId) {
			return a.baseModelId.localeCompare(b.baseModelId)
		}

		return a.label.localeCompare(b.label)
	})

	// AWS often returns a single inference profile id for models that support both
	// default and 1M context windows. Expand those into two dropdown entries so users can
	// pick the context tier explicitly; the `:1m` suffix is round-tripped through the runtime.
	return expandBedrockTargetsWith1MVariants(sortedTargets)
}
