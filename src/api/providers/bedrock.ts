import {
	BedrockRuntimeClient,
	ConverseStreamCommand,
	ConverseStreamCommandOutput,
	ConverseCommand,
	BedrockRuntimeClientConfig,
	ContentBlock,
	Message,
	SystemContentBlock,
	Tool,
	ToolConfiguration,
	ToolChoice,
} from "@aws-sdk/client-bedrock-runtime"
import { BedrockClient, ListInferenceProfilesCommand, type BedrockClientConfig } from "@aws-sdk/client-bedrock"
import { NodeHttpHandler } from "@smithy/node-http-handler"
import OpenAI from "openai"
import { fromIni } from "@aws-sdk/credential-providers"
import { Anthropic } from "@anthropic-ai/sdk"
import { HttpProxyAgent } from "http-proxy-agent"
import { HttpsProxyAgent } from "https-proxy-agent"

import {
	type ModelInfo,
	type ProviderSettings,
	type BedrockModelId,
	type BedrockServiceTier,
	bedrockDefaultModelId,
	bedrockModels,
	bedrockDefaultPromptRouterModelId,
	BEDROCK_DEFAULT_TEMPERATURE,
	AWS_INFERENCE_PROFILE_MAPPING,
	BEDROCK_1M_CONTEXT_MODEL_IDS,
	BEDROCK_GLOBAL_INFERENCE_MODEL_IDS,
	BEDROCK_DISABLEABLE_THINKING_MODEL_IDS,
	BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS,
	BEDROCK_OPENAI_EFFORT_MODEL_IDS,
	BEDROCK_SERVICE_TIER_MODEL_IDS,
	BEDROCK_SERVICE_TIER_PRICING,
	SERVICE_TIER_KEY,
	ApiProviderError,
	inferBedrockInvokeTargetKind,
	parseBedrockBaseModelId,
	resolveBedrockModelInfo,
	stripBedrock1MContextSuffix,
} from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

import { ApiStream } from "../transform/stream"
import { BaseProvider } from "./base-provider"
import { logger } from "../../utils/logging"
import { Package } from "../../shared/package"
import { MultiPointStrategy } from "../transform/cache-strategy/multi-point-strategy"
import { ModelInfo as CacheModelInfo } from "../transform/cache-strategy/types"
import { convertToBedrockConverseMessages as sharedConverter } from "../transform/bedrock-converse-format"
import { getModelParams } from "../transform/model-params"
import { shouldUseReasoningBudget } from "../../shared/api"
import { normalizeToolSchema, stripBedrockStrictIncompatibleConstraints } from "../../utils/json-schema"
import { getSystemProxyUrl } from "../../utils/networkProxy"
import type { SingleCompletionHandler, ApiHandlerCreateMessageMetadata, CompletePromptOptions } from "../index"
import { mergeAbortSignalAndTimeout } from "./utils/abort-signal"

/************************************************************************************
 *
 *     TYPES
 *
 *************************************************************************************/

// Define interface for Bedrock inference config
interface BedrockInferenceConfig {
	maxTokens: number
	temperature?: number
}

// Claude 4.7+ adaptive-thinking effort levels, from lowest to highest reasoning effort.
// See normalizeReasoningEffortForBedrock / mapReasoningBudgetToBedrockEffort below.
type BedrockAdaptiveEffort = "low" | "medium" | "high" | "xhigh" | "max"

// Claude 4.7+ adaptive-thinking display mode: "summarized" surfaces thinking content in
// the Zoo Code UI; "omitted" keeps thinking internal only (never sent back to the client).
type BedrockAdaptiveDisplay = "summarized" | "omitted"

// GPT-6 Sol/Luna reasoning-effort levels (Bedrock Converse, `reasoning.effort`).
// Confirmed via scripts/probe-bedrock-reasoning.mjs against live AWS credentials
// (2026-09-30): the nested shape `additionalModelRequestFields.reasoning.effort` is
// accepted; the flat `reasoning_effort` field is rejected with `ValidationException:
// Unknown parameter: 'reasoning_effort'`. Distinct from BedrockAdaptiveEffort because
// AWS documents "none" as a valid explicit value for this family, unlike Claude's
// adaptive-thinking contract (which uses a separate `thinking: { type: "disabled" }`
// shape instead - see BEDROCK_DISABLEABLE_THINKING_MODEL_IDS).
type BedrockOpenAiEffort = "none" | "low" | "medium" | "high" | "xhigh" | "max"

// Define interface for Bedrock additional model request fields
// This includes thinking configuration, 1M context beta, and other model-specific parameters
interface BedrockAdditionalModelFields {
	thinking?:
		| {
				type: "enabled"
				budget_tokens: number
		  }
		| {
				// Claude 4.7+ adaptive thinking — no budget_tokens, uses output_config.effort instead
				type: "adaptive"
				display?: BedrockAdaptiveDisplay
		  }
		| {
				// Explicit opt-out of reasoning. Only a subset of adaptive-thinking models
				// (see BEDROCK_DISABLEABLE_THINKING_MODEL_IDS) accept this variant.
				type: "disabled"
		  }
	output_config?: {
		effort: BedrockAdaptiveEffort
	}
	// GPT-6 Sol/Luna reasoning effort (see BEDROCK_OPENAI_EFFORT_MODEL_IDS) - the
	// nested Converse shape, confirmed distinct from Claude's `thinking`/`output_config`.
	reasoning?: {
		effort: BedrockOpenAiEffort
	}
	anthropic_beta?: string[]
	[key: string]: any // Add index signature to be compatible with DocumentType
}

/**
 * Map a legacy reasoning-budget (token count) onto the nearest adaptive-thinking
 * effort bucket. Used as a fallback when the user hasn't set an explicit
 * reasoningEffort value for an adaptive-thinking model, so existing
 * budget-based settings still produce a sensible effort level. This mapping
 * never produces "xhigh" or "max" — those are only reachable via an explicit
 * user choice through normalizeReasoningEffortForBedrock.
 */
function mapReasoningBudgetToBedrockEffort(budget: number | undefined): BedrockAdaptiveEffort {
	const normalizedBudget = typeof budget === "number" && Number.isFinite(budget) && budget > 0 ? budget : 0
	if (normalizedBudget <= 4096) {
		return "low"
	}
	if (normalizedBudget <= 16384) {
		return "medium"
	}
	return "high"
}

/**
 * Normalize a user-supplied reasoningEffort setting into a Bedrock
 * adaptive-thinking effort level. Returns undefined when the value doesn't
 * map to a Bedrock effort level (e.g. "disable", "none", or unset), so the
 * caller can fall back to mapReasoningBudgetToBedrockEffort.
 */
function normalizeReasoningEffortForBedrock(value: unknown): BedrockAdaptiveEffort | undefined {
	if (typeof value !== "string") {
		return undefined
	}
	const normalizedValue = value.toLowerCase()
	if (
		normalizedValue === "low" ||
		normalizedValue === "medium" ||
		normalizedValue === "high" ||
		normalizedValue === "xhigh" ||
		normalizedValue === "max"
	) {
		return normalizedValue
	}
	if (normalizedValue === "minimal") {
		return "low"
	}
	return undefined
}

/**
 * Normalize a user-supplied reasoningEffort setting into a GPT-6 Sol/Luna
 * effort level (see BEDROCK_OPENAI_EFFORT_MODEL_IDS). Unlike
 * normalizeReasoningEffortForBedrock, "none" is a valid explicit value here
 * (AWS documents it directly on these models' cards), and "minimal"/"disable"
 * map to "none" rather than being dropped, since the caller always wants to
 * send *some* effort value for these ids (falling back to "none" rather than
 * omitting the field entirely, so the request never silently defaults to
 * AWS's "medium").
 */
function normalizeReasoningEffortForOpenAiBedrock(value: unknown): BedrockOpenAiEffort {
	if (typeof value !== "string") {
		return "none"
	}
	const normalizedValue = value.toLowerCase()
	if (
		normalizedValue === "none" ||
		normalizedValue === "low" ||
		normalizedValue === "medium" ||
		normalizedValue === "high" ||
		normalizedValue === "xhigh" ||
		normalizedValue === "max"
	) {
		return normalizedValue
	}
	// "minimal", "disable", or anything unrecognized falls back to "none".
	return "none"
}

/**
 * Type-safe membership check against a `readonly string[]` (e.g. the
 * `as const` model-id lists from `@roo-code/types`). Avoids the `as any`
 * cast that `Array<T>.includes` would otherwise require when checking a
 * wider `string` against a narrower readonly tuple type.
 */
function isMemberOf<T extends string>(list: readonly T[], value: string): value is T {
	return (list as readonly string[]).includes(value)
}

// Define interface for Bedrock payload
interface BedrockPayload {
	modelId: BedrockModelId | string
	messages: Message[]
	system?: SystemContentBlock[]
	inferenceConfig: BedrockInferenceConfig
	anthropic_version?: string
	additionalModelRequestFields?: BedrockAdditionalModelFields
	toolConfig?: ToolConfiguration
}

// Extended payload type that includes service_tier as a top-level parameter
// AWS Bedrock service tiers (STANDARD, FLEX, PRIORITY) are specified at the top level
// https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html
type BedrockPayloadWithServiceTier = BedrockPayload & {
	[SERVICE_TIER_KEY]?: BedrockServiceTier
}

// Define specific types for content block events to avoid 'as any' usage
// These handle the multiple possible structures returned by AWS SDK
interface ContentBlockStartEvent {
	start?: {
		text?: string
		thinking?: string
		toolUse?: {
			toolUseId?: string
			name?: string
		}
	}
	contentBlockIndex?: number
	// Alternative structure used by some AWS SDK versions
	content_block?: {
		type?: string
		thinking?: string
	}
	// Official AWS SDK structure for reasoning (as documented)
	contentBlock?: {
		type?: string
		thinking?: string
		reasoningContent?: {
			text?: string
		}
		// Tool use block start
		toolUse?: {
			toolUseId?: string
			name?: string
		}
	}
}

interface ContentBlockDeltaEvent {
	delta?: {
		text?: string
		thinking?: string
		type?: string
		// AWS SDK structure for reasoning content deltas
		reasoningContent?: {
			text?: string
		}
		// Tool use input delta
		toolUse?: {
			input?: string
		}
	}
	contentBlockIndex?: number
}

// Define types for stream events based on AWS SDK
export interface StreamEvent {
	messageStart?: {
		role?: string
	}
	messageStop?: {
		stopReason?: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence"
		additionalModelResponseFields?: Record<string, unknown>
	}
	contentBlockStart?: ContentBlockStartEvent
	contentBlockDelta?: ContentBlockDeltaEvent
	metadata?: {
		usage?: {
			inputTokens: number
			outputTokens: number
			totalTokens?: number // Made optional since we don't use it
			// New cache-related fields
			cacheReadInputTokens?: number
			cacheWriteInputTokens?: number
			cacheReadInputTokenCount?: number
			cacheWriteInputTokenCount?: number
		}
		metrics?: {
			latencyMs: number
		}
	}
	// New trace field for prompt router
	trace?: {
		promptRouter?: {
			invokedModelId?: string
			usage?: {
				inputTokens: number
				outputTokens: number
				totalTokens?: number // Made optional since we don't use it
				// New cache-related fields
				cacheReadTokens?: number
				cacheWriteTokens?: number
				cacheReadInputTokenCount?: number
				cacheWriteInputTokenCount?: number
			}
		}
	}
}

// Type for usage information in stream events
export type UsageType = {
	inputTokens?: number
	outputTokens?: number
	cacheReadInputTokens?: number
	cacheWriteInputTokens?: number
	cacheReadInputTokenCount?: number
	cacheWriteInputTokenCount?: number
}

/************************************************************************************
 *
 *     PROVIDER
 *
 *************************************************************************************/

export class AwsBedrockHandler extends BaseProvider implements SingleCompletionHandler {
	protected options: ProviderSettings
	private client: BedrockRuntimeClient
	private arnInfo: any
	private readonly providerName = "Bedrock"

	// Cross-region inference profile id allowlist, populated lazily via a single
	// `ListInferenceProfilesCommand` call against the user's region. AWS only routes
	// requests when a regional system inference profile (e.g. `us.moonshotai.kimi-k2.5`)
	// has been published; brand-new foundation models often launch on-demand BEFORE the
	// matching regional profile exists. Without this gate we'd unconditionally prepend
	// the regional prefix and Bedrock would reject the call as
	// "the provided model identifier is invalid".
	//
	// Lifecycle:
	//   undefined -> lookup is pending or was never started; preserve legacy behavior
	//                (apply the prefix as before) so we don't regress users today.
	//   null      -> lookup failed (e.g. missing `bedrock:ListInferenceProfiles` IAM
	//                permission, network error). Same fallback as `undefined`.
	//   Set       -> AWS-confirmed regional profile ids; only apply the prefix when
	//                the candidate id is in this set.
	private crossRegionProfileIdsResolved: Set<string> | null | undefined = undefined
	private crossRegionProfileIdsPromise?: Promise<Set<string> | null>

	constructor(options: ProviderSettings) {
		super()
		this.options = options
		const region = this.options.awsRegion

		// process the various user input options, be opinionated about the intent of the options
		// and determine the model to use during inference and for cost calculations
		// There are variations on ARN strings that can be entered making the conditional logic
		// more involved than the non-ARN branch of logic
		if (this.options.awsCustomArn) {
			this.arnInfo = this.parseArn(this.options.awsCustomArn, region)

			if (!this.arnInfo.isValid) {
				logger.error("Invalid ARN format", {
					ctx: "bedrock",
					errorMessage: this.arnInfo.errorMessage,
				})

				// Throw a consistent error with a prefix that can be detected by callers
				const errorMessage =
					this.arnInfo.errorMessage ||
					"Invalid ARN format. ARN should follow the pattern: arn:aws:bedrock:region:account-id:resource-type/resource-name"
				throw new Error("INVALID_ARN_FORMAT:" + errorMessage)
			}

			if (this.arnInfo.region && this.arnInfo.region !== this.options.awsRegion) {
				// Log  if there's a region mismatch between the ARN and the region selected by the user
				// We will use the ARNs region, so execution can continue, but log an info statement.
				// Log a warning if there's a region mismatch between the ARN and the region selected by the user
				// We will use the ARNs region, so execution can continue, but log an info statement.
				logger.info(this.arnInfo.errorMessage, {
					ctx: "bedrock",
					selectedRegion: this.options.awsRegion,
					arnRegion: this.arnInfo.region,
				})

				this.options.awsRegion = this.arnInfo.region
			}

			this.options.apiModelId = this.arnInfo.modelId
			if (this.arnInfo.awsUseCrossRegionInference) this.options.awsUseCrossRegionInference = true
		}

		if (!this.options.modelTemperature) {
			this.options.modelTemperature = BEDROCK_DEFAULT_TEMPERATURE
		}

		this.costModelConfig = this.getModel()

		const clientConfig: BedrockRuntimeClientConfig = {
			userAgentAppId: `ZooCode#${Package.version}`,
			region: this.options.awsRegion,
			// Add the endpoint configuration when specified and enabled
			...(this.options.awsBedrockEndpoint &&
				this.options.awsBedrockEndpointEnabled && { endpoint: this.options.awsBedrockEndpoint }),
		}

		if (this.options.awsUseApiKey && this.options.awsApiKey) {
			// Use API key/token-based authentication if enabled and API key is set
			clientConfig.token = { token: this.options.awsApiKey }
			clientConfig.authSchemePreference = ["httpBearerAuth"] // Otherwise there's no end of credential problems.
			clientConfig.requestHandler = {
				// This should be the default anyway, but without setting something
				// this provider fails to work with LiteLLM passthrough.
				requestTimeout: 0,
			}
		} else if (this.options.awsUseProfile && this.options.awsProfile) {
			// Use profile-based credentials if enabled and profile is set
			clientConfig.credentials = fromIni({
				profile: this.options.awsProfile,
				ignoreCache: true,
			})
		} else if (this.options.awsAccessKey && this.options.awsSecretKey) {
			// Use direct credentials if provided
			clientConfig.credentials = {
				accessKeyId: this.options.awsAccessKey,
				secretAccessKey: this.options.awsSecretKey,
				...(this.options.awsSessionToken ? { sessionToken: this.options.awsSessionToken } : {}),
			}
		}

		// When a corporate proxy is configured, Node resolves DNS locally before tunneling,
		// causing ENOTFOUND for endpoints that only the proxy can reach. HttpProxyAgent and
		// HttpsProxyAgent use CONNECT tunneling so the proxy handles DNS resolution instead.
		//
		// A custom endpoint (e.g. a VPC endpoint) is passed so NO_PROXY can bypass the proxy
		// for directly-reachable hosts. For the default managed endpoint we don't reconstruct
		// the hostname (the AWS SDK resolves it internally, and it varies by partition), so the
		// proxy always applies there.
		const proxyUrl = getSystemProxyUrl(
			typeof clientConfig.endpoint === "string" ? clientConfig.endpoint : undefined,
		)
		if (proxyUrl) {
			clientConfig.requestHandler = new NodeHttpHandler({
				httpAgent: new HttpProxyAgent(proxyUrl),
				httpsAgent: new HttpsProxyAgent(proxyUrl),
				requestTimeout: 0,
			})
		}

		this.client = new BedrockRuntimeClient(clientConfig)

		// Kick off (but don't await) discovery of which cross-region inference profile
		// ids AWS has actually published in this region. The result gates the prefix
		// in `getModel()` so brand-new foundation models that don't yet have a regional
		// system profile (e.g. moonshotai.kimi-k2.5 in 2026) aren't rejected by Bedrock
		// as "the provided model identifier is invalid". The lookup is fire-and-forget
		// at construction time; createMessage() awaits the cached promise before the
		// first invocation so the cache is populated by the time the prefix decision
		// is made.
		this.crossRegionProfileIdsPromise = this.loadCrossRegionInferenceProfileIds()
			.then((ids) => {
				this.crossRegionProfileIdsResolved = ids
				// Force getModel() to recompute now that AWS-published ids are known.
				// The constructor seeded `costModelConfig` while the cache was still
				// `undefined`, so a buggy prefixed id may have been cached. Clearing
				// `id` here makes the next getModel() call take the full path and
				// re-derive the correct id under the new gating rules.
				this.costModelConfig = { id: "", info: this.costModelConfig.info }
				this.costModelConfig = this.getModel()
				return ids
			})
			.catch((error) => {
				// Silently fall back to legacy behavior (apply prefix unconditionally)
				// when discovery fails. The most common cause is the IAM principal not
				// being granted `bedrock:ListInferenceProfiles`; we don't want to break
				// users whose existing setups work today just because we added a new
				// API call.
				this.crossRegionProfileIdsResolved = null
				logger.info(
					"Bedrock cross-region inference profile discovery failed; preserving legacy prefix behavior",
					{
						ctx: "bedrock",
						errorMessage: error instanceof Error ? error.message : String(error),
					},
				)
				return null
			})
	}

	/**
	 * Lazily fetch the set of cross-region (system) inference-profile ids that AWS has
	 * published in the user's region, e.g. `us.anthropic.claude-...`, `us.moonshotai.kimi-k2.5`.
	 * Used by `getModel()` to decide whether prepending the regional prefix to a foundation-model
	 * id will route correctly. Returns `null` when discovery cannot be performed (no region,
	 * cross-region toggle disabled, missing IAM permission, or network error) so the caller
	 * can fall back to legacy unconditional-prefix behavior.
	 */
	private async loadCrossRegionInferenceProfileIds(): Promise<Set<string> | null> {
		if (!this.options.awsRegion) {
			return null
		}
		if (!this.options.awsUseCrossRegionInference) {
			// No reason to call AWS if the user hasn't even toggled cross-region inference.
			return null
		}

		const config: BedrockClientConfig = {
			userAgentAppId: `ZooCode#${Package.version}`,
			region: this.options.awsRegion,
		}
		if (this.options.awsUseApiKey && this.options.awsApiKey) {
			config.token = { token: this.options.awsApiKey }
			config.authSchemePreference = ["httpBearerAuth"]
		} else if (this.options.awsUseProfile && this.options.awsProfile) {
			config.credentials = fromIni({
				profile: this.options.awsProfile,
				ignoreCache: true,
			})
		} else if (this.options.awsAccessKey && this.options.awsSecretKey) {
			config.credentials = {
				accessKeyId: this.options.awsAccessKey,
				secretAccessKey: this.options.awsSecretKey,
				...(this.options.awsSessionToken ? { sessionToken: this.options.awsSessionToken } : {}),
			}
		}

		const controlClient = new BedrockClient(config)
		const ids = new Set<string>()
		let nextToken: string | undefined
		do {
			const response = await controlClient.send(new ListInferenceProfilesCommand({ nextToken, maxResults: 100 }))
			for (const summary of response.inferenceProfileSummaries ?? []) {
				if (summary.inferenceProfileId) {
					ids.add(summary.inferenceProfileId)
				}
			}
			nextToken = response.nextToken
		} while (nextToken)
		return ids
	}

	/**
	 * Detect models that require the adaptive-thinking API contract.
	 *
	 * Starting with Claude Opus 4.7 (and the matching Sonnet 4.7), and continuing
	 * in Opus 4.8 / Sonnet 4.8, Claude Fable 5/5.1, Claude Sonnet 5, and Claude Opus 5,
	 * Anthropic removed sampling parameters (temperature/top_p/top_k) and replaced
	 * budget_tokens-based thinking with `thinking.type: "adaptive"` plus
	 * `output_config.effort`. The migration guide from 4.7 → 4.8 confirms there
	 * are no further breaking API changes, and Fable 5+ / Sonnet 5 / Opus 5 keep the
	 * same adaptive-thinking contract, so a single guard matches all generations.
	 * Shared by createMessage and completePrompt so both request paths omit
	 * temperature for these models (sending it causes a 400).
	 *
	 * Accepts a model ID (with or without a cross-region/global prefix) and strips
	 * the prefix via parseBaseModelId before matching.
	 */
	private isAdaptiveThinkingModel(modelId: string): boolean {
		const baseModelId = this.parseBaseModelId(modelId)
		return (
			baseModelId.includes("opus-4-7") ||
			baseModelId.includes("opus-4-8") ||
			baseModelId.includes("opus-5") ||
			baseModelId.includes("fable-5") ||
			baseModelId.includes("mythos-5") ||
			baseModelId.includes("mythos-preview") ||
			baseModelId.includes("sonnet-4-7") ||
			baseModelId.includes("sonnet-4-8") ||
			baseModelId.includes("sonnet-5")
		)
	}

	override async *createMessage(
		systemPrompt: string,
		messages: Anthropic.Messages.MessageParam[],
		metadata?: ApiHandlerCreateMessageMetadata & {
			thinking?: {
				enabled: boolean
				maxTokens?: number
				maxThinkingTokens?: number
			}
		},
	): ApiStream {
		// Ensure the cross-region inference profile id allowlist (if a lookup was kicked
		// off in the constructor) has resolved before the first getModel() call below, so
		// the prefix-gating decision in getModel() uses AWS-confirmed data rather than the
		// `undefined` placeholder.
		if (this.crossRegionProfileIdsPromise) {
			await this.crossRegionProfileIdsPromise
		}

		const modelConfig = this.getModel()
		const usePromptCache = Boolean(
			(this.options.awsUsePromptCache ?? true) && this.supportsAwsPromptCache(modelConfig),
		)

		const conversationId =
			messages.length > 0
				? `conv_${messages[0].role}_${
						typeof messages[0].content === "string"
							? messages[0].content.substring(0, 20)
							: "complex_content"
					}`
				: "default_conversation"

		const formatted = this.convertToBedrockConverseMessages(
			messages,
			systemPrompt,
			usePromptCache,
			modelConfig.info,
			conversationId,
		)

		let additionalModelRequestFields: BedrockAdditionalModelFields | undefined
		let thinkingEnabled = false

		// Detect models that require the adaptive-thinking API contract (Opus/Sonnet
		// 4.7 and 4.8). See isAdaptiveThinkingModel for details. The same guard is
		// reused in completePrompt so both request paths stay consistent.
		const baseModelId = this.parseBaseModelId(modelConfig.id)
		const isAdaptiveThinkingModel = this.isAdaptiveThinkingModel(modelConfig.id)

		// Determine if thinking should be enabled
		// metadata?.thinking?.enabled: Explicitly enabled through API metadata (direct request)
		// shouldUseReasoningBudget(): Enabled through user settings (enableReasoningEffort = true)
		const isThinkingExplicitlyEnabled = metadata?.thinking?.enabled
		const isThinkingEnabledBySettings =
			shouldUseReasoningBudget({ model: modelConfig.info, settings: this.options }) &&
			modelConfig.reasoning &&
			modelConfig.reasoningBudget

		if ((isThinkingExplicitlyEnabled || isThinkingEnabledBySettings) && modelConfig.info.supportsReasoningBudget) {
			thinkingEnabled = true
			if (isAdaptiveThinkingModel) {
				// Claude 4.7+ (incl. 4.8, Fable 5/5.1, Sonnet 5, Opus 5) uses adaptive thinking
				// with effort levels — budget_tokens causes a 400 error.
				// display: "summarized" surfaces thinking content in Zoo Code UI.
				// Effort prefers the user's explicit reasoningEffort setting; when unset, it
				// falls back to mapping the legacy reasoning budget onto the nearest bucket
				// so existing budget-based configurations still produce sensible behaviour.
				const adaptiveThinkingEffort =
					normalizeReasoningEffortForBedrock(this.options.reasoningEffort) ??
					mapReasoningBudgetToBedrockEffort(modelConfig.reasoningBudget)
				additionalModelRequestFields = {
					thinking: { type: "adaptive", display: "summarized" },
					output_config: { effort: adaptiveThinkingEffort },
				}
			} else {
				additionalModelRequestFields = {
					thinking: {
						type: "enabled",
						budget_tokens: metadata?.thinking?.maxThinkingTokens || modelConfig.reasoningBudget || 4096,
					},
				}
			}
			logger.info("Extended thinking enabled for Bedrock request", {
				ctx: "bedrock",
				modelId: modelConfig.id,
				thinking: additionalModelRequestFields?.thinking,
			})
		} else if (isAdaptiveThinkingModel && isMemberOf(BEDROCK_DISABLEABLE_THINKING_MODEL_IDS, baseModelId)) {
			// Adaptive-thinking models reason by default and most reject an explicit
			// opt-out, but Claude Sonnet 5 accepts `thinking: { type: "disabled" }`.
			// Send it whenever the user hasn't enabled reasoning so Sonnet 5 actually
			// stops reasoning instead of silently ignoring the setting. Other adaptive
			// models (Opus 4.7+/5, Fable 5/5.1) are intentionally excluded from
			// BEDROCK_DISABLEABLE_THINKING_MODEL_IDS because they return a 400 for
			// this variant.
			additionalModelRequestFields = {
				thinking: { type: "disabled" },
			}
			logger.info("Extended thinking explicitly disabled for Bedrock request", {
				ctx: "bedrock",
				modelId: modelConfig.id,
			})
		} else if (isMemberOf(BEDROCK_OPENAI_EFFORT_MODEL_IDS, baseModelId)) {
			// GPT-6 Sol/Luna: OpenAI-style reasoning effort, sent as the nested
			// Converse shape `additionalModelRequestFields.reasoning.effort` (NOT
			// Claude's thinking/output_config, and NOT a flat reasoning_effort field -
			// both confirmed by scripts/probe-bedrock-reasoning.mjs against live AWS
			// credentials on 2026-09-30). This branch deliberately does not set
			// thinkingEnabled, so no anthropic_version is added for these ids.
			// modelConfig.reasoningEffort is already resolved by getModel() via the
			// generic shouldUseReasoningEffort()/getModelParams() pipeline (undefined
			// when reasoning is disabled, set to "disable", or set to a value outside
			// this model's allow-list). Always send an explicit effort value (falling
			// back to "none") rather than omitting the field entirely, so the request
			// never silently defaults to AWS's "medium".
			const openAiEffort = normalizeReasoningEffortForOpenAiBedrock(modelConfig.reasoningEffort)
			additionalModelRequestFields = {
				reasoning: { effort: openAiEffort },
			}
			logger.info("Reasoning effort set for Bedrock GPT request", {
				ctx: "bedrock",
				modelId: modelConfig.id,
				effort: openAiEffort,
			})
		}

		// Claude 4.7+ (including 4.8) removed sampling parameters entirely — sending
		// temperature causes a 400 error. The GPT-5.6/6 family also rejects
		// temperature (supportsTemperature: false in the catalog) - omit the key
		// entirely for both rather than relying on a `??` fallback, which would
		// otherwise reintroduce a value from this.options.modelTemperature even when
		// modelConfig.temperature was correctly left undefined upstream.
		const omitTemperature = isAdaptiveThinkingModel || modelConfig.info.supportsTemperature === false

		const inferenceConfig: BedrockInferenceConfig = {
			maxTokens: modelConfig.maxTokens || (modelConfig.info.maxTokens as number),
			...(omitTemperature
				? {}
				: { temperature: modelConfig.temperature ?? (this.options.modelTemperature as number) }),
		}

		// Check if 1M context is enabled for supported Claude 4 models
		// Use parseBaseModelId to handle cross-region inference prefixes (computed above)
		const is1MContextEnabled =
			BEDROCK_1M_CONTEXT_MODEL_IDS.includes(baseModelId as any) && this.options.awsBedrock1MContext

		// Determine if service tier should be applied (checked later when building payload)
		const useServiceTier =
			this.options.awsBedrockServiceTier && BEDROCK_SERVICE_TIER_MODEL_IDS.includes(baseModelId as any)
		if (useServiceTier) {
			logger.info("Service tier specified for Bedrock request", {
				ctx: "bedrock",
				modelId: modelConfig.id,
				serviceTier: this.options.awsBedrockServiceTier,
			})
		}

		// AWS Bedrock Converse validates anthropic_beta against a per-model allow list and
		// returns `invalid_request_error: invalid beta flag` for unknown values. Adaptive-
		// thinking models (Opus 4.7+, Sonnet 5, Fable 5/5.1, Mythos 5) have native 1M
		// context and reject BOTH the 1M beta and the fine-grained-tool-streaming beta, so
		// anthropic_beta must be omitted entirely for them — even when is1MContextEnabled
		// is true (e.g. Opus 4.7/4.8 are also listed in BEDROCK_1M_CONTEXT_MODEL_IDS for
		// pricing-tier purposes). Older Claudes silently accept (and effectively ignore)
		// these betas, so behaviour for them is unchanged.
		const skipAnthropicBetaFlags = isAdaptiveThinkingModel

		// Add anthropic_beta headers for various features
		// Start with an empty array and add betas as needed
		const anthropicBetas: string[] = []

		if (!skipAnthropicBetaFlags) {
			// Add 1M context beta if enabled
			if (is1MContextEnabled) {
				anthropicBetas.push("context-1m-2025-08-07")
			}

			// Add fine-grained tool streaming beta for Claude models
			// This enables proper tool use streaming for Anthropic models on Bedrock
			if (baseModelId.includes("claude")) {
				anthropicBetas.push("fine-grained-tool-streaming-2025-05-14")
			}
		}

		// Apply anthropic_beta to additionalModelRequestFields if any betas are needed
		if (anthropicBetas.length > 0) {
			if (!additionalModelRequestFields) {
				additionalModelRequestFields = {} as BedrockAdditionalModelFields
			}
			additionalModelRequestFields.anthropic_beta = anthropicBetas
		}

		// Decide whether to attempt strict structured output on this request. The profile
		// toggle defaults to ON (enabled when the setting is missing). Strict is only useful
		// when native tools are present, and we skip it for models we've cached as
		// unsupported (30-day TTL, see bedrock-structured-output-cache helper).
		const profileWantsStructuredOutput = this.options.awsBedrockStructuredOutput ?? true
		const haveNativeTools = (metadata?.tools?.length ?? 0) > 0
		const modelKnownUnsupported = metadata?.isModelStructuredOutputUnsupported?.(modelConfig.id) ?? false
		let useStrictStructuredOutput = profileWantsStructuredOutput && haveNativeTools && !modelKnownUnsupported

		const buildToolConfig = (strict: boolean): ToolConfiguration => ({
			tools: this.convertToolsForBedrock(metadata?.tools ?? [], { strict }),
			toolChoice: this.convertToolChoiceForBedrock(metadata?.tool_choice),
		})

		// Build payload with optional service_tier at top level
		// Service tier is a top-level parameter per AWS documentation, NOT inside additionalModelRequestFields
		// https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html
		const buildPayload = (strict: boolean): BedrockPayloadWithServiceTier => ({
			modelId: modelConfig.id,
			messages: formatted.messages,
			system: formatted.system,
			inferenceConfig,
			...(additionalModelRequestFields && { additionalModelRequestFields }),
			// Add anthropic_version at top level when using thinking features
			...(thinkingEnabled && { anthropic_version: "bedrock-2023-05-31" }),
			toolConfig: buildToolConfig(strict),
			// Add service_tier as a top-level parameter (not inside additionalModelRequestFields)
			...(useServiceTier && { [SERVICE_TIER_KEY]: this.options.awsBedrockServiceTier }),
		})

		let payload: BedrockPayloadWithServiceTier = buildPayload(useStrictStructuredOutput)

		// Schema-compile backoff parameters. AWS docs say first-time compilation can take
		// "up to a few minutes"; we cap total wait at 180s over at most 6 attempts.
		const COMPILE_INITIAL_DELAY_MS = 3000
		const COMPILE_GROWTH_FACTOR = 1.7
		const COMPILE_MAX_STEP_MS = 45_000
		const COMPILE_MAX_TOTAL_MS = 180_000
		const COMPILE_MAX_ATTEMPTS = 6
		let compileAttempts = 0
		let compileCumulativeMs = 0

		// Create a request-local AbortController with 10 minute timeout. Keeping it
		// request-local (and detaching the bridge listener in the finally block) means
		// a completed request can never leave a stale listener on the caller's signal.
		// A manual setTimeout (rather than AbortSignal.timeout()) is required here
		// because clearTimeout in the finally block needs a cancelable handle —
		// AbortSignal.timeout() self-manages its timer and cannot be cleared.
		const requestController = new AbortController()
		let timeoutId: NodeJS.Timeout | undefined

		// Bridge external abort signal to the request controller using the standard
		// abort bridge pattern:
		// - pre-aborted guard: a listener on an already-aborted signal may never fire,
		//   so abort the local controller directly in that case
		// - { once: true }: the listener auto-removes on first abort event
		let abortListener: (() => void) | undefined
		const externalAbortSignal = metadata?.abortSignal
		if (externalAbortSignal) {
			if (externalAbortSignal.aborted) {
				requestController.abort()
			} else {
				abortListener = () => requestController.abort()
				externalAbortSignal.addEventListener("abort", abortListener, { once: true })
			}
		}

		try {
			timeoutId = setTimeout(
				() => {
					requestController.abort()
				},
				10 * 60 * 1000,
			)

			// Retry wrapper for silent recovery from two Bedrock-specific failures at
			// command-send time (before any stream chunks are yielded):
			// 1. STRUCTURED_OUTPUT_UNSUPPORTED (400) - strip strict and retry once
			// 2. STRUCTURED_OUTPUT_COMPILING (400/503) - wait with backoff and retry
			// Other errors (and any error thrown once the stream has started) fall through
			// to the existing error handler below.
			let response: ConverseStreamCommandOutput | undefined
			while (true) {
				try {
					const command = new ConverseStreamCommand(payload)
					response = await this.client.send(command, {
						abortSignal: requestController.signal,
					})
					break
				} catch (innerError: unknown) {
					const innerType = this.getErrorType(innerError)

					// STRUCTURED_OUTPUT_UNSUPPORTED: cache the model as unsupported, emit a
					// user-visible notice containing the verbatim Bedrock error, and retry
					// once with strict mode stripped.
					if (innerType === "STRUCTURED_OUTPUT_UNSUPPORTED" && useStrictStructuredOutput) {
						metadata?.markModelStructuredOutputUnsupported?.(modelConfig.id)
						const notice = this.formatErrorMessage(innerError, innerType, true)
						logger.warn(notice, {
							ctx: "bedrock",
							modelId: modelConfig.id,
							errorType: innerType,
							errorMessage: innerError instanceof Error ? innerError.message : String(innerError),
						})
						yield { type: "text", text: notice + "\n" }
						useStrictStructuredOutput = false
						payload = buildPayload(false)
						continue // retry without strict
					}

					// STRUCTURED_OUTPUT_COMPILING: Bedrock is compiling the schema grammar
					// for first-time use. Wait with bounded exponential backoff and poll.
					if (
						innerType === "STRUCTURED_OUTPUT_COMPILING" &&
						compileAttempts < COMPILE_MAX_ATTEMPTS &&
						compileCumulativeMs < COMPILE_MAX_TOTAL_MS
					) {
						const delay = Math.min(
							COMPILE_INITIAL_DELAY_MS * Math.pow(COMPILE_GROWTH_FACTOR, compileAttempts),
							COMPILE_MAX_STEP_MS,
						)
						const waitSec = Math.round(delay / 1000)
						const notice = `Bedrock is compiling the tool schema for ${modelConfig.id}. First-time compilation can take a few minutes. Waiting ${waitSec}s before retry ${compileAttempts + 2}/${COMPILE_MAX_ATTEMPTS + 1}...`
						logger.info(notice, {
							ctx: "bedrock",
							modelId: modelConfig.id,
							errorType: innerType,
							attempt: compileAttempts + 1,
						})
						yield { type: "text", text: notice + "\n" }
						await new Promise<void>((resolve, reject) => {
							const handle = setTimeout(resolve, delay)
							const onAbort = () => {
								clearTimeout(handle)
								reject(new Error("Request aborted while waiting for Bedrock schema compile"))
							}
							if (requestController.signal.aborted) {
								clearTimeout(handle)
								reject(new Error("Request aborted before Bedrock schema compile wait"))
							} else {
								requestController.signal.addEventListener("abort", onAbort, { once: true })
							}
						})
						compileCumulativeMs += delay
						compileAttempts++
						continue // poll again
					}

					// Any other error - or exhausted retry budgets - propagate to the outer handler.
					throw innerError
				}
			}

			if (!response || !response.stream) {
				clearTimeout(timeoutId)
				throw new Error("No stream available in the response")
			}

			for await (const chunk of response.stream) {
				// Parse the chunk as JSON if it's a string (for tests)
				let streamEvent: StreamEvent
				try {
					streamEvent = typeof chunk === "string" ? JSON.parse(chunk) : (chunk as unknown as StreamEvent)
				} catch (e) {
					logger.error("Failed to parse stream event", {
						ctx: "bedrock",
						error: e instanceof Error ? e : String(e),
						chunk: typeof chunk === "string" ? chunk : "binary data",
					})
					continue
				}

				// Handle metadata events first
				if (streamEvent.metadata?.usage) {
					const usage = (streamEvent.metadata?.usage || {}) as UsageType

					// Check both field naming conventions for cache tokens
					const cacheReadTokens = usage.cacheReadInputTokens || usage.cacheReadInputTokenCount || 0
					const cacheWriteTokens = usage.cacheWriteInputTokens || usage.cacheWriteInputTokenCount || 0

					// Always include all available token information
					yield {
						type: "usage",
						inputTokens: usage.inputTokens || 0,
						outputTokens: usage.outputTokens || 0,
						cacheReadTokens: cacheReadTokens,
						cacheWriteTokens: cacheWriteTokens,
					}
					continue
				}

				if (streamEvent?.trace?.promptRouter?.invokedModelId) {
					try {
						//update the in-use model info to be based on the invoked Model Id for the router
						//so that pricing, context window, caching etc have values that can be used
						//However, we want to keep the id of the model to be the ID for the router for
						//subsequent requests so they are sent back through the router
						const invokedArnInfo = this.parseArn(streamEvent.trace.promptRouter.invokedModelId)
						const invokedModel = this.getModelById(
							invokedArnInfo.modelId as string,
							invokedArnInfo.modelType,
						)
						if (invokedModel) {
							invokedModel.id = modelConfig.id
							this.costModelConfig = invokedModel
						}

						// Handle metadata events for the promptRouter.
						if (streamEvent?.trace?.promptRouter?.usage) {
							const routerUsage = streamEvent.trace.promptRouter.usage

							// Check both field naming conventions for cache tokens
							const cacheReadTokens =
								routerUsage.cacheReadTokens || routerUsage.cacheReadInputTokenCount || 0
							const cacheWriteTokens =
								routerUsage.cacheWriteTokens || routerUsage.cacheWriteInputTokenCount || 0

							yield {
								type: "usage",
								inputTokens: routerUsage.inputTokens || 0,
								outputTokens: routerUsage.outputTokens || 0,
								cacheReadTokens: cacheReadTokens,
								cacheWriteTokens: cacheWriteTokens,
							}
						}
					} catch (error) {
						logger.error("Error handling Bedrock invokedModelId", {
							ctx: "bedrock",
							error: error instanceof Error ? error : String(error),
						})
					} finally {
						// eslint-disable-next-line no-unsafe-finally
						continue
					}
				}

				// Handle message start
				if (streamEvent.messageStart) {
					continue
				}

				// Handle content blocks
				if (streamEvent.contentBlockStart) {
					const cbStart = streamEvent.contentBlockStart

					// Check if this is a reasoning block (AWS SDK structure)
					if (cbStart.contentBlock?.reasoningContent) {
						if (cbStart.contentBlockIndex && cbStart.contentBlockIndex > 0) {
							yield { type: "reasoning", text: "\n" }
						}
						yield {
							type: "reasoning",
							text: cbStart.contentBlock.reasoningContent.text || "",
						}
					}
					// Check for thinking block - handle both possible AWS SDK structures
					// cbStart.contentBlock: newer structure
					// cbStart.content_block: alternative structure seen in some AWS SDK versions
					else if (cbStart.contentBlock?.type === "thinking" || cbStart.content_block?.type === "thinking") {
						const contentBlock = cbStart.contentBlock || cbStart.content_block
						if (cbStart.contentBlockIndex && cbStart.contentBlockIndex > 0) {
							yield { type: "reasoning", text: "\n" }
						}
						if (contentBlock?.thinking) {
							yield {
								type: "reasoning",
								text: contentBlock.thinking,
							}
						}
					}
					// Handle tool use block start
					else if (cbStart.start?.toolUse || cbStart.contentBlock?.toolUse) {
						const toolUse = cbStart.start?.toolUse || cbStart.contentBlock?.toolUse
						if (toolUse) {
							yield {
								type: "tool_call_partial",
								index: cbStart.contentBlockIndex ?? 0,
								id: toolUse.toolUseId,
								name: toolUse.name,
								arguments: undefined,
							}
						}
					} else if (cbStart.start?.text) {
						yield {
							type: "text",
							text: cbStart.start.text,
						}
					}
					continue
				}

				// Handle content deltas
				if (streamEvent.contentBlockDelta) {
					const cbDelta = streamEvent.contentBlockDelta
					const delta = cbDelta.delta

					// Process reasoning and text content deltas
					// Multiple structures are supported for AWS SDK compatibility:
					// - delta.reasoningContent.text: AWS docs structure for reasoning
					// - delta.thinking: alternative structure for thinking content
					// - delta.text: standard text content
					// - delta.toolUse.input: tool input arguments
					if (delta) {
						// Check for reasoningContent property (AWS SDK structure)
						if (delta.reasoningContent?.text) {
							yield {
								type: "reasoning",
								text: delta.reasoningContent.text,
							}
							continue
						}

						// Handle tool use input delta
						if (delta.toolUse?.input) {
							yield {
								type: "tool_call_partial",
								index: cbDelta.contentBlockIndex ?? 0,
								id: undefined,
								name: undefined,
								arguments: delta.toolUse.input,
							}
							continue
						}

						// Handle alternative thinking structure (fallback for older SDK versions)
						if (delta.type === "thinking_delta" && delta.thinking) {
							yield {
								type: "reasoning",
								text: delta.thinking,
							}
						} else if (delta.text) {
							yield {
								type: "text",
								text: delta.text,
							}
						}
					}
					continue
				}
				// Handle message stop
				if (streamEvent.messageStop) {
					continue
				}
			}
			// Clear timeout after stream completes
			clearTimeout(timeoutId)
		} catch (error: unknown) {
			// Clear timeout on error
			clearTimeout(timeoutId)

			// Capture error in telemetry before processing
			const errorMessage = error instanceof Error ? error.message : String(error)
			const apiError = new ApiProviderError(errorMessage, this.providerName, modelConfig.id, "createMessage")
			TelemetryService.instance.captureException(apiError)

			// Check if this is a throttling error that should trigger retry logic
			const errorType = this.getErrorType(error)

			// For throttling errors, throw immediately without yielding chunks
			// This allows the retry mechanism in attemptApiRequest() to catch and handle it
			// The retry logic in Task.ts (around line 1817) expects errors to be thrown
			// on the first chunk for proper exponential backoff behavior
			if (errorType === "THROTTLING") {
				if (error instanceof Error) {
					throw error
				} else {
					throw new Error("Throttling error occurred")
				}
			}

			// For non-throttling errors, use the standard error handling with chunks
			const errorChunks = this.handleBedrockError(error, true) // true for streaming context
			// Yield each chunk individually to ensure type compatibility
			for (const chunk of errorChunks) {
				yield chunk as any // Cast to any to bypass type checking since we know the structure is correct
			}

			// Re-throw with enhanced error message for retry system
			const enhancedErrorMessage = this.formatErrorMessage(error, this.getErrorType(error), true)
			if (error instanceof Error) {
				const enhancedError = new Error(enhancedErrorMessage)
				// Preserve important properties from the original error
				enhancedError.name = error.name
				// Validate and preserve status property
				if ("status" in error && typeof (error as any).status === "number") {
					;(enhancedError as any).status = (error as any).status
				}
				// Validate and preserve $metadata property
				if (
					"$metadata" in error &&
					typeof (error as any).$metadata === "object" &&
					(error as any).$metadata !== null
				) {
					;(enhancedError as any).$metadata = (error as any).$metadata
				}
				throw enhancedError
			} else {
				throw new Error("An unknown error occurred")
			}
		} finally {
			// Clear the request timeout as soon as the generator ends. This also covers
			// early termination by the caller (break/destroy), which bypasses the normal
			// timeout-clearing path after the stream completes.
			clearTimeout(timeoutId)

			// Detach the bridge listener once the request ends (success or error) so the
			// external signal keeps no reference to this request's controller.
			if (abortListener) {
				externalAbortSignal?.removeEventListener("abort", abortListener)
			}
		}
	}

	async completePrompt(prompt: string, options?: CompletePromptOptions): Promise<string> {
		try {
			const modelConfig = this.getModel()

			// For completePrompt, thinking is typically not used, but we should still check
			// if thinking was somehow enabled in the model config
			const thinkingEnabled =
				shouldUseReasoningBudget({ model: modelConfig.info, settings: this.options }) &&
				modelConfig.reasoning &&
				modelConfig.reasoningBudget

			const isAdaptiveThinkingModel = this.isAdaptiveThinkingModel(modelConfig.id)

			// Claude 4.7+ (including 4.8) removed sampling parameters entirely — sending
			// temperature causes a 400 error. The GPT-5.6/6 family also rejects
			// temperature (supportsTemperature: false in the catalog) - omit the key
			// entirely for both, guarding the non-stream path the same way createMessage
			// does so completePrompt also works for these models.
			const omitTemperature = isAdaptiveThinkingModel || modelConfig.info.supportsTemperature === false

			const inferenceConfig: BedrockInferenceConfig = {
				maxTokens: modelConfig.maxTokens || (modelConfig.info.maxTokens as number),
				...(omitTemperature
					? {}
					: { temperature: modelConfig.temperature ?? (this.options.modelTemperature as number) }),
			}

			// Adaptive-thinking models reason by default. completePrompt never enables
			// reasoning explicitly, so send an explicit disable for the models that accept
			// it (see BEDROCK_DISABLEABLE_THINKING_MODEL_IDS) to avoid unwanted thinking
			// cost/latency on one-shot calls. Other adaptive models reject this shape with
			// a 400 and are intentionally left out of the list — thinking stays on for them.
			const baseModelId = this.parseBaseModelId(modelConfig.id)
			let additionalModelRequestFields: BedrockAdditionalModelFields | undefined
			if (isAdaptiveThinkingModel && isMemberOf(BEDROCK_DISABLEABLE_THINKING_MODEL_IDS, baseModelId)) {
				additionalModelRequestFields = { thinking: { type: "disabled" } }
				logger.info("Extended thinking explicitly disabled for Bedrock completePrompt", {
					ctx: "bedrock",
					modelId: modelConfig.id,
				})
			} else if (isMemberOf(BEDROCK_OPENAI_EFFORT_MODEL_IDS, baseModelId)) {
				// GPT-6 Sol/Luna default to "medium" effort on AWS's side when no effort
				// is sent. completePrompt is used for one-shot, latency-sensitive calls,
				// so explicitly disable reasoning here (mirrors the adaptive-thinking
				// explicit-disable branch above) rather than paying for unwanted
				// reasoning tokens on every one-shot prompt.
				additionalModelRequestFields = { reasoning: { effort: "none" } }
				logger.info("Reasoning effort explicitly disabled for Bedrock GPT completePrompt", {
					ctx: "bedrock",
					modelId: modelConfig.id,
				})
			}

			// For completePrompt, use a unique conversation ID based on the prompt
			const conversationId = `prompt_${prompt.substring(0, 20)}`

			const payload = {
				modelId: modelConfig.id,
				messages: this.convertToBedrockConverseMessages(
					[
						{
							role: "user",
							content: prompt,
						},
					],
					undefined,
					false,
					modelConfig.info,
					conversationId,
				).messages,
				inferenceConfig,
				...(additionalModelRequestFields && { additionalModelRequestFields }),
			}

			const command = new ConverseCommand(payload)

			// Build request options with abortSignal and/or timeoutMs.
			// The shared helper keeps Bedrock aligned with other providers:
			// positive timeout values create request-local cancellation, while
			// zero/negative timeout values mean "no timeout".
			const mergedAbortSignal = mergeAbortSignalAndTimeout(options?.abortSignal, options?.timeoutMs)
			const sendOptions = mergedAbortSignal ? { abortSignal: mergedAbortSignal } : undefined
			const response = await this.client.send(command, sendOptions)

			// Models with always-on / on-by-default reasoning (e.g. Fable 5, Mythos 5)
			// return the reasoning content block before the text block, so content[0]
			// is not reliably the answer text. Scan for the first block that actually
			// carries a non-empty `text` property instead of assuming position 0.
			const textBlock = response?.output?.message?.content?.find(
				(block): block is ContentBlock.TextMember =>
					typeof (block as { text?: unknown })?.text === "string" &&
					(block as { text: string }).text.trim().length > 0,
			)

			if (textBlock) {
				try {
					return textBlock.text
				} catch (parseError) {
					logger.error("Failed to parse Bedrock response", {
						ctx: "bedrock",
						error: parseError instanceof Error ? parseError : String(parseError),
					})
				}
			}
			return ""
		} catch (error) {
			// Capture error in telemetry
			const model = this.getModel()
			const telemetryErrorMessage = error instanceof Error ? error.message : String(error)
			const apiError = new ApiProviderError(telemetryErrorMessage, this.providerName, model.id, "completePrompt")
			TelemetryService.instance.captureException(apiError)

			// Use the extracted error handling method for all errors
			const errorResult = this.handleBedrockError(error, false) // false for non-streaming context
			// Since we're in a non-streaming context, we know the result is a string
			const errorMessage = errorResult as string

			// Create enhanced error for retry system
			const enhancedError = new Error(errorMessage)
			if (error instanceof Error) {
				// Preserve important properties from the original error
				enhancedError.name = error.name
				// Validate and preserve status property
				if ("status" in error && typeof (error as any).status === "number") {
					;(enhancedError as any).status = (error as any).status
				}
				// Validate and preserve $metadata property
				if (
					"$metadata" in error &&
					typeof (error as any).$metadata === "object" &&
					(error as any).$metadata !== null
				) {
					;(enhancedError as any).$metadata = (error as any).$metadata
				}
			}
			throw enhancedError
		}
	}

	/**
	 * Convert Anthropic messages to Bedrock Converse format
	 */
	private convertToBedrockConverseMessages(
		anthropicMessages: Anthropic.Messages.MessageParam[] | { role: string; content: string }[],
		systemMessage?: string,
		usePromptCache: boolean = false,
		modelInfo?: any,
		conversationId?: string, // Optional conversation ID to track cache points across messages
	): { system: SystemContentBlock[]; messages: Message[] } {
		// First convert messages using shared converter for proper image handling
		const convertedMessages = sharedConverter(anthropicMessages as Anthropic.Messages.MessageParam[])

		// If prompt caching is disabled, return the converted messages directly
		if (!usePromptCache) {
			return {
				system: systemMessage ? [{ text: systemMessage } as SystemContentBlock] : [],
				messages: convertedMessages,
			}
		}

		// Convert model info to expected format for cache strategy
		const cacheModelInfo: CacheModelInfo = {
			maxTokens: modelInfo?.maxTokens || 8192,
			contextWindow: modelInfo?.contextWindow || 200_000,
			supportsPromptCache: modelInfo?.supportsPromptCache || false,
			maxCachePoints: modelInfo?.maxCachePoints || 0,
			minTokensPerCachePoint: modelInfo?.minTokensPerCachePoint || 50,
			cachableFields: modelInfo?.cachableFields || [],
		}

		// Get previous cache point placements for this conversation if available
		const previousPlacements =
			conversationId && this.previousCachePointPlacements[conversationId]
				? this.previousCachePointPlacements[conversationId]
				: undefined

		// Create config for cache strategy
		const config = {
			modelInfo: cacheModelInfo,
			systemPrompt: systemMessage,
			messages: anthropicMessages as Anthropic.Messages.MessageParam[],
			usePromptCache,
			previousCachePointPlacements: previousPlacements,
		}

		// Get cache point placements
		const strategy = new MultiPointStrategy(config)
		const cacheResult = strategy.determineOptimalCachePoints()

		// Store cache point placements for future use if conversation ID is provided
		if (conversationId && cacheResult.messageCachePointPlacements) {
			this.previousCachePointPlacements[conversationId] = cacheResult.messageCachePointPlacements
		}

		// Apply cache points to the properly converted messages
		const messagesWithCache = convertedMessages.map((msg, index) => {
			const placement = cacheResult.messageCachePointPlacements?.find((p) => p.index === index)
			if (placement) {
				return {
					...msg,
					content: [...(msg.content || []), { cachePoint: { type: "default" } } as ContentBlock],
				}
			}
			return msg
		})

		return {
			system: cacheResult.system,
			messages: messagesWithCache,
		}
	}

	/************************************************************************************
	 *
	 *     MODEL IDENTIFICATION
	 *
	 *************************************************************************************/

	private costModelConfig: { id: BedrockModelId | string; info: ModelInfo } = {
		id: "",
		info: { maxTokens: 0, contextWindow: 0, supportsPromptCache: false, supportsImages: false },
	}

	private parseArn(arn: string, region?: string) {
		/*
		 * VIA Roo analysis: platform-independent Regex. It's designed to parse Amazon Bedrock ARNs and doesn't rely on any platform-specific features
		 * like file path separators, line endings, or case sensitivity behaviors. The forward slashes in the regex are properly escaped and
		 * represent literal characters in the AWS ARN format, not filesystem paths. This regex will function consistently across Windows,
		 * macOS, Linux, and any other operating system where JavaScript runs.
		 *
		 * Supports any AWS partition (aws, aws-us-gov, aws-cn, or future partitions).
		 * The partition is not captured since we don't need to use it.
		 *
		 *  This matches ARNs like:
		 *  - Foundation Model: arn:aws:bedrock:us-west-2::foundation-model/anthropic.claude-v2
		 *  - GovCloud Inference Profile: arn:aws-us-gov:bedrock:us-gov-west-1:123456789012:inference-profile/us-gov.anthropic.claude-sonnet-4-5-20250929-v1:0
		 *  - Prompt Router: arn:aws:bedrock:us-west-2:123456789012:prompt-router/anthropic-claude
		 *  - Inference Profile: arn:aws:bedrock:us-west-2:123456789012:inference-profile/anthropic.claude-v2
		 *  - Cross Region Inference Profile: arn:aws:bedrock:us-west-2:123456789012:inference-profile/us.anthropic.claude-3-5-sonnet-20241022-v2:0
		 *  - Custom Model (Provisioned Throughput): arn:aws:bedrock:us-west-2:123456789012:provisioned-model/my-custom-model
		 *  - Imported Model: arn:aws:bedrock:us-west-2:123456789012:imported-model/my-imported-model
		 *
		 * match[0] - The entire matched string
		 * match[1] - The region (e.g., "us-east-1", "us-gov-west-1")
		 * match[2] - The account ID (can be empty string for AWS-managed resources)
		 * match[3] - The resource type (e.g., "foundation-model")
		 * match[4] - The resource ID (e.g., "anthropic.claude-3-sonnet-20240229-v1:0")
		 */

		const arnRegex = /^arn:[^:]+:(?:bedrock|sagemaker):([^:]+):([^:]*):(?:([^\/]+)\/([\w\.\-:]+)|([^\/]+))$/
		const match = arn.match(arnRegex)

		if (match && match[1] && match[3] && match[4]) {
			// Create the result object
			const result: {
				isValid: boolean
				region?: string
				modelType?: string
				modelId?: string
				errorMessage?: string
				crossRegionInference: boolean
			} = {
				isValid: true,
				crossRegionInference: false, // Default to false
			}

			result.modelType = match[3]
			const originalModelId = match[4]
			result.modelId = this.parseBaseModelId(originalModelId)

			// Extract the region from the first capture group
			const arnRegion = match[1]
			result.region = arnRegion

			// Check if the original model ID had a region prefix
			if (originalModelId && result.modelId !== originalModelId) {
				// If the model ID changed after parsing, it had a region prefix
				const prefix = originalModelId.replace(result.modelId, "")
				result.crossRegionInference = AwsBedrockHandler.isSystemInferenceProfile(prefix)
			}

			// Check if region in ARN matches provided region (if specified)
			if (region && arnRegion !== region) {
				result.errorMessage = `Region mismatch: The region in your ARN (${arnRegion}) does not match your selected region (${region}). This may cause access issues. The provider will use the region from the ARN.`
				result.region = arnRegion
			}

			return result
		}

		// If we get here, the regex didn't match
		return {
			isValid: false,
			region: undefined,
			modelType: undefined,
			modelId: undefined,
			errorMessage: "Invalid ARN format. ARN should follow the Amazon Bedrock ARN pattern.",
			crossRegionInference: false,
		}
	}

	//This strips any region prefix that used on cross-region model inference ARNs
	private parseBaseModelId(modelId: string): string {
		return parseBedrockBaseModelId(modelId)
	}

	//Prompt Router responses come back in a different sequence and the model used is in the response and must be fetched by name
	getModelById(modelId: string, modelType?: string): { id: BedrockModelId | string; info: ModelInfo } {
		let model
		const resolved = resolveBedrockModelInfo({
			baseModelId: this.parseBaseModelId(modelId),
			targetId: modelId,
			optIn1MContext: this.options.awsBedrock1MContext,
			modelMaxTokens: this.options.modelMaxTokens,
			contextWindowOverride: this.options.awsModelContextWindow,
			// T6: empirically-probed (or manually entered) static max-output-tokens cap.
			// Widens `info.maxTokens` above the static catalog value when set; the
			// request-time `modelMaxTokens` slider (above) still wins over this if set.
			maxOutputTokensOverride: this.options.awsModelMaxOutputTokens,
		})

		if (resolved.baseModelId in bedrockModels) {
			// resolveBedrockModelInfo already returns a fresh (non-shared) ModelInfo object,
			// so no additional deep-copy is required here.
			model = { id: resolved.baseModelId, info: resolved.info }
		} else if (modelType && modelType.includes("router")) {
			model = {
				id: bedrockDefaultPromptRouterModelId,
				info: JSON.parse(JSON.stringify(bedrockModels[bedrockDefaultPromptRouterModelId])),
			}
		} else {
			model = {
				id: resolved.baseModelId || bedrockDefaultModelId,
				info: resolved.info,
			}
		}

		return model
	}

	override getModel(): {
		id: BedrockModelId | string
		info: ModelInfo
		maxTokens?: number
		temperature?: number
		reasoning?: any
		reasoningBudget?: number
		reasoningEffort?: string
	} {
		if (this.costModelConfig?.id?.trim().length > 0) {
			// Get model params for cost model config
			const params = getModelParams({
				format: "anthropic",
				modelId: this.costModelConfig.id,
				model: this.costModelConfig.info,
				settings: this.options,
				defaultTemperature: BEDROCK_DEFAULT_TEMPERATURE,
			})
			return { ...this.costModelConfig, ...params }
		}

		let modelConfig = undefined
		const explicitTargetKind = this.options.awsCustomArn
			? "custom-arn"
			: inferBedrockInvokeTargetKind({
					targetId: this.options.awsBedrockInvokeTarget || (this.options.apiModelId as string),
					explicitKind: this.options.awsBedrockTargetKind,
				})

		// If custom ARN is provided, use it
		if (this.options.awsCustomArn) {
			modelConfig = this.getModelById(this.arnInfo.modelId, this.arnInfo.modelType)

			//If the user entered an ARN for a foundation-model they've done the same thing as picking from our list of options.
			//We leave the model data matching the same as if a drop-down input method was used by not overwriting the model ID with the user input ARN
			//Otherwise the ARN is not a foundation-model resource type that ARN should be used as the identifier in Bedrock interactions
			if (this.arnInfo.modelType !== "foundation-model") modelConfig.id = this.options.awsCustomArn
		} else {
			const configuredTargetId = this.options.awsBedrockInvokeTarget || (this.options.apiModelId as string)

			// A discovered/profile target was explicitly selected, so invoke it directly.
			if (
				explicitTargetKind === "system-profile" ||
				explicitTargetKind === "application-profile" ||
				explicitTargetKind === "prompt-router"
			) {
				modelConfig = this.getModelById(configuredTargetId)
				// Strip any synthetic `:1m` (or `[1m]`) suffix before sending to AWS.
				// The suffix is purely a UI marker for the 1M-context variant and is not
				// a real part of the AWS inference profile / foundation model id.
				// The 1M context-window and `context-1m-2025-08-07` beta header have
				// already been applied inside getModelById via resolveBedrockModelInfo.
				modelConfig.id = stripBedrock1MContextSuffix(configuredTargetId)
			} else {
				// A foundation model was selected, so optional routing toggles still apply.
				modelConfig = this.getModelById(configuredTargetId)

				// Apply Global Inference prefix if enabled and supported (takes precedence over cross-region)
				const baseIdForGlobal = this.parseBaseModelId(modelConfig.id)
				let profilePrefixApplied = false
				if (
					this.options.awsUseGlobalInference &&
					BEDROCK_GLOBAL_INFERENCE_MODEL_IDS.includes(baseIdForGlobal as any)
				) {
					modelConfig.id = `global.${baseIdForGlobal}`
					profilePrefixApplied = true
				}
				// Otherwise, add cross-region inference prefix if enabled.
				// Gate on the AWS-confirmed regional profile id set so we don't unconditionally
				// prepend a prefix that doesn't yet have a published system inference profile
				// (e.g. brand-new foundation models like moonshotai.kimi-k2.5 in 2026 - AWS
				// makes them invokable on-demand BEFORE the matching `us.<id>` profile exists,
				// and prepending the prefix anyway yields "the provided model identifier is
				// invalid"). When the discovery cache is unavailable (still loading, lookup
				// failed, or no IAM permission) we preserve legacy behavior and apply the
				// prefix as before so we don't regress users whose existing setups work today.
				else if (this.options.awsUseCrossRegionInference && this.options.awsRegion) {
					const prefix = AwsBedrockHandler.getPrefixForRegion(this.options.awsRegion)
					if (prefix) {
						const candidatePrefixedId = `${prefix}${modelConfig.id}`
						const profiles = this.crossRegionProfileIdsResolved
						if (profiles == null || profiles.has(candidatePrefixedId)) {
							modelConfig.id = candidatePrefixedId
							profilePrefixApplied = true
						}
						// else: AWS has NOT published this regional profile in the user's
						// region. Leave the bare id alone; on-demand invocation against the
						// foundation-model id is the correct routing in that case.
					}
				}

				// R1 (mandatory inference profile): some new models (GPT-5.6/6 family,
				// Kimi K3 - see BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS) cannot be
				// invoked at all via their base id on bedrock-runtime; AWS requires an
				// inference profile even when the user has opted into neither Global nor
				// cross-region inference. This is deliberately a separate `if`, not an
				// `else if`, so it also covers the case where cross-region inference was
				// enabled but the configured region has no entry in
				// AWS_INFERENCE_PROFILE_MAPPING (profilePrefixApplied stays false there
				// too) - those users would otherwise still send an unprefixed,
				// unusable id for these models.
				//
				// Prefix choice mirrors AwsBedrockHandler.getPrefixForRegion() - the same
				// region-to-prefix table the opt-in cross-region path above uses - rather
				// than introducing a second table. Only `us.` and `global.` are confirmed
				// by AWS for these models (research doc section 1); the other regional
				// prefixes (au./eu./apac./jp./ca./sa./ug.) are unverified for them, so
				// falling back to `global.` when the region isn't in the table (or isn't
				// set) picks the one AWS explicitly documents as broadly available.
				if (
					!profilePrefixApplied &&
					isMemberOf(BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS, baseIdForGlobal)
				) {
					const prefix =
						(this.options.awsRegion && AwsBedrockHandler.getPrefixForRegion(this.options.awsRegion)) ||
						"global."
					modelConfig.id = `${prefix}${modelConfig.id}`
				}
			}
		}

		// Check if 1M context is enabled for supported Claude 4 models
		// Use parseBaseModelId to handle cross-region inference prefixes
		const baseModelId = this.parseBaseModelId(modelConfig.id)
		if (BEDROCK_1M_CONTEXT_MODEL_IDS.includes(baseModelId as any) && this.options.awsBedrock1MContext) {
			// Update context window and pricing to 1M tier when 1M context beta is enabled
			const tier = modelConfig.info.tiers?.[0]
			modelConfig.info = {
				...modelConfig.info,
				contextWindow: tier?.contextWindow ?? 1_000_000,
				inputPrice: tier?.inputPrice ?? modelConfig.info.inputPrice,
				outputPrice: tier?.outputPrice ?? modelConfig.info.outputPrice,
				cacheWritesPrice: tier?.cacheWritesPrice ?? modelConfig.info.cacheWritesPrice,
				cacheReadsPrice: tier?.cacheReadsPrice ?? modelConfig.info.cacheReadsPrice,
			}
		}

		// Get model params including reasoning configuration
		const params = getModelParams({
			format: "anthropic",
			modelId: modelConfig.id,
			model: modelConfig.info,
			settings: this.options,
			defaultTemperature: BEDROCK_DEFAULT_TEMPERATURE,
		})

		// Apply service tier pricing if specified and model supports it
		const baseModelIdForTier = this.parseBaseModelId(modelConfig.id)
		if (this.options.awsBedrockServiceTier && BEDROCK_SERVICE_TIER_MODEL_IDS.includes(baseModelIdForTier as any)) {
			const pricingMultiplier = BEDROCK_SERVICE_TIER_PRICING[this.options.awsBedrockServiceTier]
			if (pricingMultiplier && pricingMultiplier !== 1.0) {
				// Apply pricing multiplier to all price fields
				modelConfig.info = {
					...modelConfig.info,
					inputPrice: modelConfig.info.inputPrice
						? modelConfig.info.inputPrice * pricingMultiplier
						: undefined,
					outputPrice: modelConfig.info.outputPrice
						? modelConfig.info.outputPrice * pricingMultiplier
						: undefined,
					cacheWritesPrice: modelConfig.info.cacheWritesPrice
						? modelConfig.info.cacheWritesPrice * pricingMultiplier
						: undefined,
					cacheReadsPrice: modelConfig.info.cacheReadsPrice
						? modelConfig.info.cacheReadsPrice * pricingMultiplier
						: undefined,
				}
			}
		}

		// Don't override maxTokens/contextWindow here; handled in getModelById (and includes user overrides)
		return { ...modelConfig, ...params } as {
			id: BedrockModelId | string
			info: ModelInfo
			maxTokens?: number
			temperature?: number
			reasoning?: any
			reasoningBudget?: number
			reasoningEffort?: string
		}
	}

	/************************************************************************************
	 *
	 *     CACHE
	 *
	 *************************************************************************************/

	// Store previous cache point placements for maintaining consistency across consecutive messages
	private previousCachePointPlacements: { [conversationId: string]: any[] } = {}

	private supportsAwsPromptCache(modelConfig: { id: BedrockModelId | string; info: ModelInfo }): boolean | undefined {
		// Check if the model supports prompt cache
		// The cachableFields property is not part of the ModelInfo type in schemas
		// but it's used in the bedrockModels object in shared/api.ts
		return (
			modelConfig?.info?.supportsPromptCache &&
			// Use optional chaining and type assertion to access cachableFields
			(modelConfig?.info as any)?.cachableFields &&
			(modelConfig?.info as any)?.cachableFields?.length > 0
		)
	}

	/**
	 * Removes any existing cachePoint nodes from content blocks
	 */
	private removeCachePoints(content: any): any {
		if (Array.isArray(content)) {
			return content.map((block) => {
				// Use destructuring to remove cachePoint property
				const { cachePoint: _, ...rest } = block
				return rest
			})
		}

		return content
	}

	/************************************************************************************
	 *
	 *     NATIVE TOOLS
	 *
	 *************************************************************************************/

	/**
	 * Convert OpenAI tool definitions to Bedrock Converse format
	 * Transforms JSON Schema to draft 2020-12 compliant format required by Claude models.
	 * When `opts.strict` is true, sets `strict: true` on each toolSpec so Bedrock enforces
	 * the tool input schema (structured output). Models that don't support strict return a
	 * 400 ValidationException; the caller is responsible for detecting that and retrying.
	 * @param tools Array of OpenAI ChatCompletionTool definitions
	 * @param opts Configuration options; `strict` enables Bedrock strict structured output.
	 * @returns Array of Bedrock Tool definitions
	 */
	private convertToolsForBedrock(
		tools: OpenAI.Chat.ChatCompletionTool[],
		opts: { strict: boolean } = { strict: false },
	): Tool[] {
		return tools
			.filter((tool) => tool.type === "function")
			.map((tool) => {
				// The AWS SDK's `ToolSpecification` type doesn't yet expose the `strict` field,
				// so we build it as a locally-typed object and cast. The field is supported by
				// the Converse API for models that advertise structured-output capability.
				// Normalize schema to JSON Schema draft 2020-12 compliant format.
				// Then, when strict is enabled, strip Bedrock-incompatible constraints
				// (numeric `minimum`/`maximum`/etc., array `maxItems`, array `minItems > 1`)
				// that Bedrock strict mode rejects even on supported models. Stripped values
				// are appended to the schema's description so the model still sees them as hints.
				let inputSchemaJson = normalizeToolSchema(tool.function.parameters as Record<string, unknown>)
				if (opts.strict) {
					inputSchemaJson = stripBedrockStrictIncompatibleConstraints(inputSchemaJson)
				}
				const toolSpec: {
					name: string
					description?: string
					inputSchema: { json: Record<string, unknown> }
					strict?: boolean
				} = {
					name: tool.function.name,
					description: tool.function.description,
					inputSchema: {
						json: inputSchemaJson,
					},
				}
				if (opts.strict) {
					toolSpec.strict = true
				}
				return { toolSpec } as unknown as Tool
			})
	}

	/**
	 * Convert OpenAI tool_choice to Bedrock ToolChoice format
	 * @param toolChoice OpenAI tool_choice parameter
	 * @returns Bedrock ToolChoice configuration
	 */
	private convertToolChoiceForBedrock(
		toolChoice: OpenAI.Chat.ChatCompletionCreateParams["tool_choice"],
	): ToolChoice | undefined {
		if (!toolChoice) {
			// Default to auto - model decides whether to use tools
			return { auto: {} } as ToolChoice
		}

		if (typeof toolChoice === "string") {
			switch (toolChoice) {
				case "none":
					return undefined // Bedrock doesn't have "none", just omit tools
				case "auto":
					return { auto: {} } as ToolChoice
				case "required":
					return { any: {} } as ToolChoice // Model must use at least one tool
				default:
					return { auto: {} } as ToolChoice
			}
		}

		// Handle object form { type: "function", function: { name: string } }
		if (typeof toolChoice === "object" && "function" in toolChoice) {
			return {
				tool: {
					name: toolChoice.function.name,
				},
			} as ToolChoice
		}

		return { auto: {} } as ToolChoice
	}

	/************************************************************************************
	 *
	 *     AMAZON REGIONS
	 *
	 *************************************************************************************/

	private static getPrefixForRegion(region: string): string | undefined {
		// Use AWS recommended inference profile prefixes
		// Array is pre-sorted by pattern length (descending) to ensure more specific patterns match first
		for (const [regionPattern, inferenceProfile] of AWS_INFERENCE_PROFILE_MAPPING) {
			if (region.startsWith(regionPattern)) {
				return inferenceProfile
			}
		}

		return undefined
	}

	private static isSystemInferenceProfile(prefix: string): boolean {
		// Check if the prefix is defined in AWS_INFERENCE_PROFILE_MAPPING
		for (const [_, inferenceProfile] of AWS_INFERENCE_PROFILE_MAPPING) {
			if (prefix === inferenceProfile) {
				return true
			}
		}
		return false
	}

	/************************************************************************************
	 *
	 *     ERROR HANDLING
	 *
	 *************************************************************************************/

	/**
	 * Error type definitions for Bedrock API errors
	 */
	private static readonly ERROR_TYPES: Record<
		string,
		{
			patterns: string[] // Strings to match in lowercase error message or name
			messageTemplate: string // Template with placeholders like {region}, {modelId}, etc.
			logLevel: "error" | "warn" | "info" // Log level for this error type
		}
	> = {
		ACCESS_DENIED: {
			patterns: ["access", "denied", "permission"],
			messageTemplate: `You don't have access to the model specified.

Please verify:
1. Try cross-region inference if you're using a foundation model
2. If using an ARN, verify the ARN is correct and points to a valid model
3. Your AWS credentials have permission to access this model (check IAM policies)
4. The region in the ARN matches the region where the model is deployed
5. If using a provisioned model, ensure it's active and not in a failed state`,
			logLevel: "error",
		},
		NOT_FOUND: {
			patterns: ["not found", "does not exist"],
			messageTemplate: `The specified ARN does not exist or is invalid. Please check:

1. The ARN format is correct (arn:aws:bedrock:region:account-id:resource-type/resource-name)
2. The model exists in the specified region
3. The account ID in the ARN is correct`,
			logLevel: "error",
		},
		THROTTLING: {
			patterns: [
				"throttl",
				"rate",
				"limit",
				"bedrock is unable to process your request", // Amazon Bedrock specific throttling message
				"please wait",
				"quota exceeded",
				"service unavailable",
				"busy",
				"overloaded",
				"too many requests",
				"request limit",
				"concurrent requests",
			],
			messageTemplate: `Request was throttled or rate limited. Please try:
1. Reducing the frequency of requests
2. If using a provisioned model, check its throughput settings
3. Contact AWS support to request a quota increase if needed

`,
			logLevel: "error",
		},
		TOO_MANY_TOKENS: {
			patterns: ["too many tokens", "token limit exceeded", "context length", "maximum context length"],
			messageTemplate: `"Too many tokens" error detected.
Possible Causes:
1. Input exceeds model's context window limit
2. Rate limiting (too many tokens per minute)
3. Quota exceeded for token usage
4. Other token-related service limitations

Suggestions:
1. Reduce the size of your input
2. Split your request into smaller chunks
3. Use a model with a larger context window
4. If rate limited, reduce request frequency
5. Check your Amazon Bedrock quotas and limits

`,
			logLevel: "error",
		},
		SERVICE_QUOTA_EXCEEDED: {
			patterns: ["service quota exceeded", "service quota", "quota exceeded for model"],
			messageTemplate: `Service quota exceeded. This error indicates you've reached AWS service limits.

Please try:
1. Contact AWS support to request a quota increase
2. Reduce request frequency temporarily
3. Check your Amazon Bedrock quotas in the AWS console
4. Consider using a different model or region with available capacity

`,
			logLevel: "error",
		},
		MODEL_NOT_READY: {
			patterns: ["model not ready", "model is not ready", "provisioned throughput not ready", "model loading"],
			messageTemplate: `Model is not ready or still loading. This can happen with:
1. Provisioned throughput models that are still initializing
2. Custom models that are being loaded
3. Models that are temporarily unavailable

Please try:
1. Wait a few minutes and retry
2. Check the model status in Amazon Bedrock console
3. Verify the model is properly provisioned

`,
			logLevel: "error",
		},
		INTERNAL_SERVER_ERROR: {
			patterns: ["internal server error", "internal error", "server error", "service error"],
			messageTemplate: `Amazon Bedrock internal server error. This is a temporary service issue.

Please try:
1. Retry the request after a brief delay
2. If the error persists, check AWS service health
3. Contact AWS support if the issue continues

`,
			logLevel: "error",
		},
		ON_DEMAND_NOT_SUPPORTED: {
			patterns: ["with on-demand throughput isn’t supported."],
			messageTemplate: `
1. Try enabling cross-region inference in settings.
2. Or, create an inference profile and then leverage the "Use custom ARN..." option of the model selector in settings.`,
			logLevel: "error",
		},
		ABORT: {
			patterns: ["aborterror"], // This will match error.name.toLowerCase() for AbortError
			messageTemplate: `Request was aborted: The operation timed out or was manually cancelled. Please try again or check your network connection.`,
			logLevel: "info",
		},
		INVALID_ARN_FORMAT: {
			patterns: ["invalid_arn_format:", "invalid arn format"],
			messageTemplate: `Invalid ARN format. ARN should follow the pattern: arn:aws:bedrock:region:account-id:resource-type/resource-name`,
			logLevel: "error",
		},
		VALIDATION_ERROR: {
			patterns: [
				"input tag",
				"does not match any of the expected tags",
				"field required",
				"validation",
				"invalid parameter",
			],
			messageTemplate: `Parameter validation error: {errorMessage}

This error indicates that the request parameters don't match Amazon Bedrock's expected format.

Common causes:
1. Extended thinking parameter format is incorrect
2. Model-specific parameters are not supported by this model
3. API parameter structure has changed

Please check:
- Model supports the requested features (extended thinking, etc.)
- Parameter format matches Amazon Bedrock specification
- Model ID is correct for the requested features`,
			logLevel: "error",
		},
		STRUCTURED_OUTPUT_UNSUPPORTED: {
			patterns: [
				"does not support strict",
				"strict is not supported",
				"strict schema is not supported",
				"structured output is not supported",
				"strict tool",
				"strict mode is not supported",
				"strict: true",
				"textformat is not supported",
				"output_config is not supported",
				"outputconfig.textformat",
			],
			messageTemplate: `Model {modelId} does not appear to support strict structured output. Bedrock returned: {errorMessage}. Disabling structured output for this model for 30 days; retrying without strict mode.`,
			logLevel: "warn",
		},
		STRUCTURED_OUTPUT_COMPILING: {
			patterns: [
				"schema is being compiled",
				"schema compilation in progress",
				"compiling schema",
				"compiling grammar",
				"grammar compilation",
				"schema is being prepared",
				"schema compile",
			],
			messageTemplate: `Bedrock is compiling the tool schema for {modelId}. First-time compilation can take a few minutes. Waiting and retrying...`,
			logLevel: "info",
		},
		// Default/generic error
		GENERIC: {
			patterns: [], // Empty patterns array means this is the default
			messageTemplate: `Unknown Error: {errorMessage}`,
			logLevel: "error",
		},
	}

	/**
	 * Determines the error type based on the error message or name
	 */
	private getErrorType(error: unknown): string {
		if (!(error instanceof Error)) {
			return "GENERIC"
		}

		// Check for HTTP 429 status code (Too Many Requests)
		if ((error as any).status === 429 || (error as any).$metadata?.httpStatusCode === 429) {
			return "THROTTLING"
		}

		// Check for Amazon Bedrock specific throttling exception names
		if ((error as any).name === "ThrottlingException" || (error as any).__type === "ThrottlingException") {
			return "THROTTLING"
		}

		const errorMessage = error.message.toLowerCase()
		const errorName = error.name.toLowerCase()
		const errorMetadata = error as Error & { status?: unknown; $metadata?: { httpStatusCode?: unknown } }
		const httpStatus =
			typeof errorMetadata.status === "number"
				? errorMetadata.status
				: typeof errorMetadata.$metadata?.httpStatusCode === "number"
					? errorMetadata.$metadata.httpStatusCode
					: undefined

		// Structured output errors are checked first so they don't get swallowed by the
		// broad VALIDATION_ERROR / INTERNAL_SERVER_ERROR patterns. Gated by HTTP status
		// to avoid misclassifying unrelated 4xx/5xx errors that happen to mention "schema".
		if (httpStatus === 400 || httpStatus === undefined) {
			const structuredUnsupported = AwsBedrockHandler.ERROR_TYPES.STRUCTURED_OUTPUT_UNSUPPORTED
			if (
				structuredUnsupported.patterns.some(
					(pattern) => errorMessage.includes(pattern) || errorName.includes(pattern),
				)
			) {
				return "STRUCTURED_OUTPUT_UNSUPPORTED"
			}
		}
		if (httpStatus === 400 || httpStatus === 503 || httpStatus === undefined) {
			const structuredCompiling = AwsBedrockHandler.ERROR_TYPES.STRUCTURED_OUTPUT_COMPILING
			if (
				structuredCompiling.patterns.some(
					(pattern) => errorMessage.includes(pattern) || errorName.includes(pattern),
				)
			) {
				return "STRUCTURED_OUTPUT_COMPILING"
			}
		}

		// Check each error type's patterns in order of specificity (most specific first)
		const errorTypeOrder = [
			"ABORT", // Classify cancellations (user abort or request timeout) before any other pattern
			"SERVICE_QUOTA_EXCEEDED", // Most specific - check before THROTTLING
			"MODEL_NOT_READY",
			"TOO_MANY_TOKENS",
			"INTERNAL_SERVER_ERROR",
			"ON_DEMAND_NOT_SUPPORTED",
			"NOT_FOUND",
			"ACCESS_DENIED",
			"THROTTLING", // Less specific - check after more specific patterns
		]

		for (const errorType of errorTypeOrder) {
			const definition = AwsBedrockHandler.ERROR_TYPES[errorType]
			if (!definition) continue

			// If any pattern matches in either message or name, return this error type
			if (definition.patterns.some((pattern) => errorMessage.includes(pattern) || errorName.includes(pattern))) {
				return errorType
			}
		}

		// Default to generic error
		return "GENERIC"
	}

	/**
	 * Formats an error message based on the error type and context
	 */
	private formatErrorMessage(error: unknown, errorType: string, _isStreamContext: boolean): string {
		const definition = AwsBedrockHandler.ERROR_TYPES[errorType] || AwsBedrockHandler.ERROR_TYPES.GENERIC
		let template = definition.messageTemplate

		// Prepare template variables
		const templateVars: Record<string, string> = {}

		if (error instanceof Error) {
			templateVars.errorMessage = error.message
			templateVars.errorName = error.name

			const modelConfig = this.getModel()
			templateVars.modelId = modelConfig.id
			templateVars.contextWindow = String(modelConfig.info.contextWindow || "unknown")
		}

		// Add context-specific template variables
		const region =
			typeof this?.client?.config?.region === "function"
				? this?.client?.config?.region()
				: this?.client?.config?.region
		templateVars.regionInfo = `(${region})`

		// Replace template variables
		for (const [key, value] of Object.entries(templateVars)) {
			template = template.replace(new RegExp(`{${key}}`, "g"), value || "")
		}

		return template
	}

	/**
	 * Handles Bedrock API errors and generates appropriate error messages
	 * @param error The error that occurred
	 * @param isStreamContext Whether the error occurred in a streaming context (true) or not (false)
	 * @returns Error message string for non-streaming context or array of stream chunks for streaming context
	 */
	private handleBedrockError(
		error: unknown,
		isStreamContext: boolean,
	): string | Array<{ type: string; text?: string; inputTokens?: number; outputTokens?: number }> {
		// Determine error type
		const errorType = this.getErrorType(error)

		// Format error message
		const errorMessage = this.formatErrorMessage(error, errorType, isStreamContext)

		// Log the error
		const definition = AwsBedrockHandler.ERROR_TYPES[errorType]
		const logMethod = definition.logLevel
		const contextName = isStreamContext ? "createMessage" : "completePrompt"
		logger[logMethod](`${errorType} error in ${contextName}`, {
			ctx: "bedrock",
			customArn: this.options.awsCustomArn,
			errorType,
			errorMessage: error instanceof Error ? error.message : String(error),
			...(error instanceof Error && error.stack ? { errorStack: error.stack } : {}),
			...(this.client?.config?.region ? { clientRegion: this.client.config.region } : {}),
		})

		// Return appropriate response based on isStreamContext
		if (isStreamContext) {
			return [
				{ type: "text", text: `Error: ${errorMessage}` },
				{ type: "usage", inputTokens: 0, outputTokens: 0 },
			]
		} else {
			// For non-streaming context, add the expected prefix
			return `Bedrock completion error: ${errorMessage}`
		}
	}
}
