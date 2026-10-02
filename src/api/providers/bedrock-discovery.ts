import {
	BedrockClient,
	ListFoundationModelsCommand,
	ListInferenceProfilesCommand,
	type BedrockClientConfig,
	type FoundationModelSummary,
	type InferenceProfileSummary,
} from "@aws-sdk/client-bedrock"
import { BedrockRuntimeClient, ConverseCommand, type BedrockRuntimeClientConfig } from "@aws-sdk/client-bedrock-runtime"
import { fromIni } from "@aws-sdk/credential-providers"

import {
	type BedrockDiscoveredTarget,
	type BedrockMaxOutputProbeResult,
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

// T6: Bedrock max-output-tokens probe. Mirrors toBedrockClientConfig above but targets the
// Bedrock *runtime* plane (`@aws-sdk/client-bedrock-runtime`) used for Converse calls, since
// the probe needs to actually invoke the model to discover its real max-output-tokens cap.
// Also carries the optional custom-endpoint override (toBedrockClientConfig does not need
// this today since discovery always targets the standard Bedrock control-plane endpoint).
const toBedrockRuntimeClientConfig = (options: ProviderSettings): BedrockRuntimeClientConfig => {
	const config: BedrockRuntimeClientConfig = {
		userAgentAppId: `ZooCode#${Package.version}`,
		region: options.awsRegion,
		...(options.awsBedrockEndpoint && options.awsBedrockEndpointEnabled
			? { endpoint: options.awsBedrockEndpoint }
			: {}),
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

/************************************************************************************
 *
 *     T6: EMPIRICAL MAX-OUTPUT-TOKENS PROBE
 *
 * Bedrock's control-plane APIs (ListFoundationModels/ListInferenceProfiles) do not expose
 * a per-model max-output-tokens cap -- that only surfaces as a ValidationException from the
 * Converse API itself when a request's `inferenceConfig.maxTokens` exceeds it. Rather than
 * hand-maintain a static table that goes stale whenever AWS raises or lowers a model's cap,
 * we empirically probe it: try the documented ceiling first, fall back to parsing AWS's
 * error message for an explicit hint, and finally binary-search if neither of those work.
 *
 *************************************************************************************/

// Upper bound for any single probe attempt. Larger than every published Anthropic max output
// cap as of 2026, so a model that accepts this value has effectively no additional cap worth
// discovering. Exported so tests (and callers wanting the "documented" default) can reference
// it without duplicating the magic number.
export const BEDROCK_MAX_OUTPUT_PROBE_CEILING = 1_000_000

// Lower bound for the binary search. No shipped Bedrock model has a max-output-tokens cap
// below this, so there's no point probing smaller values.
const MIN_PROBE_FLOOR = 8_192

// Patterns AWS has been observed to use when rejecting an out-of-range `max_tokens` value.
// Ordered loosely from most to least specific; `extractMaxTokensFromError` takes the smallest
// valid match across all of them so an overly-greedy pattern can't produce a too-large cap.
const MAX_TOKENS_HINT_PATTERNS: RegExp[] = [
	/maxtokens\s*[:=]?\s*\d+[^\d]+(\d{3,7})/i,
	/maximum(?:[\s_-]?tokens?)?[^\d]{0,40}(\d{3,7})/i,
	/<=?\s*(\d{3,7})\s*(?:tokens?)?/,
	/less than or equal to\s*(\d{3,7})/i,
	/up to\s*(\d{3,7})\s*tokens?/i,
]

/**
 * Scan a Bedrock validation error for an explicit max-output-tokens hint (e.g. "max_tokens:
 * 256000 must be less than or equal to 128000 for this model"). Tries every pattern in
 * {@link MAX_TOKENS_HINT_PATTERNS} and returns the smallest in-range match, since AWS error
 * messages sometimes echo both the requested (too-large) value and the actual cap -- taking
 * the smallest valid number avoids accidentally picking the rejected value back up.
 */
const extractMaxTokensFromError = (error: unknown): number | undefined => {
	const message = error instanceof Error ? error.message : typeof error === "string" ? error : ""
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const responseBody = (error as any)?.$response?.body
	const aggregate = `${message} ${typeof responseBody === "string" ? responseBody : ""}`

	let best: number | undefined
	for (const pattern of MAX_TOKENS_HINT_PATTERNS) {
		const match = aggregate.match(pattern)
		if (!match || !match[1]) continue
		const candidate = Number.parseInt(match[1], 10)
		if (!Number.isFinite(candidate)) continue
		if (candidate < MIN_PROBE_FLOOR || candidate > BEDROCK_MAX_OUTPUT_PROBE_CEILING) continue
		if (best === undefined || candidate < best) {
			best = candidate
		}
	}
	return best
}

/**
 * Determine whether an error from a Converse probe call represents AWS rejecting the
 * requested `max_tokens` value specifically (as opposed to e.g. a throttling error, a
 * credentials error, or a transient network failure) -- the only case where continuing the
 * probe/binary-search makes sense. Any other error should propagate immediately.
 */
const isMaxTokensValidationError = (error: unknown): boolean => {
	if (!error) return false
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const name = String((error as any).name ?? "")
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const type = String((error as any).__type ?? "")
	const looksLikeValidationError =
		name === "ValidationException" ||
		name.toLowerCase().includes("validation") ||
		type.toLowerCase().includes("validation")
	if (!looksLikeValidationError) {
		return false
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const message = String((error as any).message ?? "").toLowerCase()
	return (
		message.includes("max_tokens") ||
		message.includes("maxtokens") ||
		message.includes("maximum tokens") ||
		message.includes("output tokens") ||
		message.includes("max output")
	)
}

export interface BedrockMaxOutputProbeOptions {
	options: ProviderSettings
	modelId: string
	probeCeiling?: number
	/**
	 * Test injection point: when provided, replaces the real `BedrockRuntimeClient.send(new
	 * ConverseCommand(...))` call. Should resolve for an accepted `maxTokens` and reject
	 * (ideally with a validation-shaped error, see {@link isMaxTokensValidationError}) for a
	 * rejected one. Never used in production -- the real path always constructs a client.
	 */
	runProbe?: (maxTokens: number) => Promise<void>
}

/**
 * Empirically discover the real max-output-tokens cap for a Bedrock invoke target by sending
 * tiny Converse probes with escalating/binary-searched `inferenceConfig.maxTokens` values.
 *
 * Strategy (in order, cheapest first):
 * 1. Try {@link BEDROCK_MAX_OUTPUT_PROBE_CEILING} directly. If AWS accepts it, the model has
 *    no meaningful cap worth discovering -- done in one request.
 * 2. On a max-tokens validation error, try to parse an explicit cap out of AWS's error
 *    message (see {@link extractMaxTokensFromError}) and verify it with one more probe.
 * 3. Otherwise binary-search `[MIN_PROBE_FLOOR, probeCeiling - 1]` for the largest value AWS
 *    accepts (~17 requests worst case for the default 1M ceiling).
 *
 * Any non-max-tokens error (throttling, auth, network, etc.) is rethrown immediately without
 * continuing the search, since retrying with a different `maxTokens` value won't help.
 */
export const probeBedrockMaxOutputTokens = async ({
	options,
	modelId,
	probeCeiling = BEDROCK_MAX_OUTPUT_PROBE_CEILING,
	runProbe,
}: BedrockMaxOutputProbeOptions): Promise<BedrockMaxOutputProbeResult> => {
	if (!options.awsRegion) {
		throw new Error("AWS region is required to probe Bedrock max output tokens")
	}
	if (!modelId) {
		throw new Error("Model id is required to probe Bedrock max output tokens")
	}

	const client = runProbe ? undefined : new BedrockRuntimeClient(toBedrockRuntimeClientConfig(options))

	const attempt = async (maxTokens: number): Promise<void> => {
		if (runProbe) {
			await runProbe(maxTokens)
			return
		}
		const command = new ConverseCommand({
			modelId,
			messages: [{ role: "user", content: [{ text: "Hi." }] }],
			inferenceConfig: { maxTokens },
		})
		await client!.send(command)
	}

	let attempts = 0

	try {
		attempts += 1
		await attempt(probeCeiling)
		return { maxOutputTokens: probeCeiling, source: "accepted", attempts }
	} catch (error) {
		if (!isMaxTokensValidationError(error)) {
			throw error
		}

		const hint = extractMaxTokensFromError(error)
		if (hint && hint < probeCeiling && hint >= MIN_PROBE_FLOOR) {
			try {
				attempts += 1
				await attempt(hint)
				return { maxOutputTokens: hint, source: "hint", attempts }
			} catch (innerError) {
				if (!isMaxTokensValidationError(innerError)) {
					throw innerError
				}
				// Fall through to binary search below -- the hint didn't pan out.
			}
		}

		let lo = MIN_PROBE_FLOOR
		let hi = probeCeiling - 1
		let bestAccepted: number | undefined

		while (lo <= hi) {
			const mid = Math.floor((lo + hi) / 2)
			attempts += 1
			try {
				await attempt(mid)
				bestAccepted = mid
				lo = mid + 1
			} catch (innerError) {
				if (!isMaxTokensValidationError(innerError)) {
					throw innerError
				}
				hi = mid - 1
			}
		}

		if (bestAccepted) {
			return { maxOutputTokens: bestAccepted, source: "binary-search", attempts }
		}

		throw new Error(
			`Bedrock rejected every probed max_tokens value (floor ${MIN_PROBE_FLOOR}, ceiling ${probeCeiling}). Original error: ${
				error instanceof Error ? error.message : String(error)
			}`,
		)
	}
}
