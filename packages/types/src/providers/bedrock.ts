import { z } from "zod"

import type { ModelInfo } from "../model.js"

// https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html

// T4: Bedrock dynamic discovery - request/response message types exchanged between the
// extension host and the webview (see discoverBedrockTargets in
// src/api/providers/bedrock-discovery.ts and useBedrockDiscovery in the webview).
export const bedrockDiscoveryMessageTypes = ["requestBedrockDiscovery", "bedrockDiscovery"] as const

export const bedrockDiscoveryMessageTypeSchema = z.enum(bedrockDiscoveryMessageTypes)

export const BedrockDiscoveryMessageType = bedrockDiscoveryMessageTypeSchema.enum

export type BedrockDiscoveryMessageType = z.infer<typeof bedrockDiscoveryMessageTypeSchema>

// T6: Bedrock empirical max-output-tokens probe - request/response message types exchanged
// between the extension host and the webview (see probeBedrockMaxOutputTokens in
// src/api/providers/bedrock-discovery.ts and useBedrockMaxTokensProbe in the webview).
export const bedrockMaxTokensProbeMessageTypes = ["requestBedrockMaxTokensProbe", "bedrockMaxTokensProbe"] as const

export const bedrockMaxTokensProbeMessageTypeSchema = z.enum(bedrockMaxTokensProbeMessageTypes)

export const BedrockMaxTokensProbeMessageType = bedrockMaxTokensProbeMessageTypeSchema.enum

export type BedrockMaxTokensProbeMessageType = z.infer<typeof bedrockMaxTokensProbeMessageTypeSchema>

/**
 * Result payload for the T6 empirical max-output-tokens probe. Shared between the
 * extension host (`probeBedrockMaxOutputTokens` in src/api/providers/bedrock-discovery.ts,
 * which produces it) and the webview (`useBedrockMaxTokensProbe`, which consumes it via the
 * `bedrockMaxTokensProbe` extension message) -- defined here rather than in `src/` so both
 * sides can share one type without `packages/types` depending on `src/`.
 */
export interface BedrockMaxOutputProbeResult {
	maxOutputTokens: number
	source: "accepted" | "hint" | "binary-search"
	attempts: number
}

export type BedrockModelId = keyof typeof bedrockModels

export const bedrockDefaultModelId: BedrockModelId = "anthropic.claude-sonnet-4-5-20250929-v1:0"

export const bedrockDefaultPromptRouterModelId: BedrockModelId = "anthropic.claude-3-sonnet-20240229-v1:0"

// March, 12 2025 - updated prices to match US-West-2 list price shown at
// https://aws.amazon.com/bedrock/pricing, including older models that are part
// of the default prompt routers AWS enabled for GA of the promot router
// feature.
export const bedrockModels = {
	"anthropic.claude-sonnet-4-5-20250929-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-sonnet-4-6": {
		maxTokens: 8192,
		contextWindow: 200_000, // Default 200K, extendable to 1M with beta flag 'context-1m-2025-08-07'
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 3.0, // $3 per million input tokens (≤200K context)
		outputPrice: 15.0, // $15 per million output tokens (≤200K context)
		cacheWritesPrice: 3.75, // $3.75 per million tokens
		cacheReadsPrice: 0.3, // $0.30 per million tokens
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		// Tiered pricing for extended context (requires beta flag 'context-1m-2025-08-07')
		tiers: [
			{
				contextWindow: 1_000_000, // 1M tokens with beta flag
				inputPrice: 6.0, // $6 per million input tokens (>200K context)
				outputPrice: 22.5, // $22.50 per million output tokens (>200K context)
				cacheWritesPrice: 7.5, // $7.50 per million tokens (>200K context)
				cacheReadsPrice: 0.6, // $0.60 per million tokens (>200K context)
			},
		],
	},
	"anthropic.claude-sonnet-5": {
		maxTokens: 8192,
		contextWindow: 1_000_000, // 1M context window native (no beta header required)
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		supportsReasoningBinary: true,
		supportsReasoningEffort: ["low", "medium", "high", "xhigh", "max"],
		supportsTemperature: false,
		inputPrice: 2.0, // $2 per million input tokens (introductory pricing through Aug 31, 2026)
		outputPrice: 10.0, // $10 per million output tokens (introductory pricing through Aug 31, 2026)
		cacheWritesPrice: 2.5, // $2.50 per million tokens (introductory pricing through Aug 31, 2026)
		cacheReadsPrice: 0.2, // $0.20 per million tokens (introductory pricing through Aug 31, 2026)
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		description:
			"Claude Sonnet 5 is the best combination of speed and intelligence, optimized for coding, tool use, and agentic workflows.",
	},
	"amazon.nova-pro-v1:0": {
		maxTokens: 5000,
		contextWindow: 300_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.8,
		outputPrice: 3.2,
		cacheWritesPrice: 0.8, // per million tokens
		cacheReadsPrice: 0.2, // per million tokens
		minTokensPerCachePoint: 1,
		maxCachePoints: 1,
		cachableFields: ["system"],
	},
	"amazon.nova-pro-latency-optimized-v1:0": {
		maxTokens: 5000,
		contextWindow: 300_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 1.0,
		outputPrice: 4.0,
		cacheWritesPrice: 1.0, // per million tokens
		cacheReadsPrice: 0.25, // per million tokens
		description: "Amazon Nova Pro with latency optimized inference",
	},
	"amazon.nova-lite-v1:0": {
		maxTokens: 5000,
		contextWindow: 300_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.06,
		outputPrice: 0.24,
		cacheWritesPrice: 0.06, // per million tokens
		cacheReadsPrice: 0.015, // per million tokens
		minTokensPerCachePoint: 1,
		maxCachePoints: 1,
		cachableFields: ["system"],
	},
	"amazon.nova-2-lite-v1:0": {
		maxTokens: 65_535,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 0.33,
		outputPrice: 2.75,
		cacheWritesPrice: 0,
		cacheReadsPrice: 0.0825, // 75% less than input price
		minTokensPerCachePoint: 1,
		maxCachePoints: 1,
		cachableFields: ["system"],
		description: "Amazon Nova 2 Lite - Comparable to Claude Haiku 4.5",
	},
	"amazon.nova-micro-v1:0": {
		maxTokens: 5000,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.035,
		outputPrice: 0.14,
		cacheWritesPrice: 0.035, // per million tokens
		cacheReadsPrice: 0.00875, // per million tokens
		minTokensPerCachePoint: 1,
		maxCachePoints: 1,
		cachableFields: ["system"],
	},
	"anthropic.claude-sonnet-4-20250514-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-opus-4-1-20250805-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 15.0,
		outputPrice: 75.0,
		cacheWritesPrice: 18.75,
		cacheReadsPrice: 1.5,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-opus-4-6-v1": {
		maxTokens: 8192,
		contextWindow: 200_000, // Default 200K, extendable to 1M with beta flag 'context-1m-2025-08-07'
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 5.0, // $5 per million input tokens (≤200K context)
		outputPrice: 25.0, // $25 per million output tokens (≤200K context)
		cacheWritesPrice: 6.25, // $6.25 per million tokens
		cacheReadsPrice: 0.5, // $0.50 per million tokens
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		// Tiered pricing for extended context (requires beta flag 'context-1m-2025-08-07')
		tiers: [
			{
				contextWindow: 1_000_000, // 1M tokens with beta flag
				inputPrice: 10.0, // $10 per million input tokens (>200K context)
				outputPrice: 37.5, // $37.50 per million output tokens (>200K context)
				cacheWritesPrice: 12.5, // $12.50 per million tokens (>200K context)
				cacheReadsPrice: 1.0, // $1.00 per million tokens (>200K context)
			},
		],
	},
	"anthropic.claude-opus-4-7": {
		maxTokens: 8192,
		contextWindow: 200_000, // Default 200K, extendable to 1M with beta flag 'context-1m-2025-08-07'
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		supportsReasoningEffort: ["low", "medium", "high", "xhigh", "max"],
		inputPrice: 5.0, // $5 per million input tokens (≤200K context) — verify against Bedrock console
		outputPrice: 25.0, // $25 per million output tokens (≤200K context) — verify against Bedrock console
		cacheWritesPrice: 6.25, // $6.25 per million tokens
		cacheReadsPrice: 0.5, // $0.50 per million tokens
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		// Tiered pricing for extended context (requires beta flag 'context-1m-2025-08-07')
		tiers: [
			{
				contextWindow: 1_000_000, // 1M tokens with beta flag
				inputPrice: 10.0, // $10 per million input tokens (>200K context)
				outputPrice: 37.5, // $37.50 per million output tokens (>200K context)
				cacheWritesPrice: 12.5, // $12.50 per million tokens (>200K context)
				cacheReadsPrice: 1.0, // $1.00 per million tokens (>200K context)
			},
		],
	},
	"anthropic.claude-opus-4-8": {
		maxTokens: 8192,
		contextWindow: 200_000, // Default 200K, extendable to 1M with beta flag 'context-1m-2025-08-07'
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		supportsReasoningEffort: ["low", "medium", "high", "xhigh", "max"],
		inputPrice: 5.0, // $5 per million input tokens (≤200K context) — verify against Bedrock console
		outputPrice: 25.0, // $25 per million output tokens (≤200K context) — verify against Bedrock console
		cacheWritesPrice: 6.25, // $6.25 per million tokens
		cacheReadsPrice: 0.5, // $0.50 per million tokens
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		// Tiered pricing for extended context (requires beta flag 'context-1m-2025-08-07')
		// 4.8 inherits the same Bedrock pricing structure as 4.7 — no API breaking changes.
		// Adaptive thinking is the only supported reasoning mode (same as 4.7).
		tiers: [
			{
				contextWindow: 1_000_000, // 1M tokens with beta flag
				inputPrice: 10.0, // $10 per million input tokens (>200K context)
				outputPrice: 37.5, // $37.50 per million output tokens (>200K context)
				cacheWritesPrice: 12.5, // $12.50 per million tokens (>200K context)
				cacheReadsPrice: 1.0, // $1.00 per million tokens (>200K context)
			},
		],
	},
	"anthropic.claude-opus-5": {
		maxTokens: 8192,
		contextWindow: 1_000_000, // 1M context window native (no beta header required)
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		supportsReasoningBinary: true,
		supportsReasoningEffort: ["low", "medium", "high", "xhigh", "max"],
		supportsTemperature: false,
		inputPrice: 5.0, // $5 per million input tokens
		outputPrice: 25.0, // $25 per million output tokens
		cacheWritesPrice: 6.25, // $6.25 per million tokens
		cacheReadsPrice: 0.5, // $0.50 per million tokens
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		description: "Claude Opus 5 is Anthropic's most capable model for complex agentic coding and enterprise work.",
	},
	"anthropic.claude-fable-5-1": {
		maxTokens: 128_000,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		supportsReasoningBinary: true,
		supportsReasoningEffort: ["low", "medium", "high", "xhigh", "max"],
		supportsTemperature: false,
		inputPrice: 10.0,
		outputPrice: 50.0,
		cacheWritesPrice: 12.5,
		cacheReadsPrice: 0.25,
		minTokensPerCachePoint: 512,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		description:
			"Claude Fable 5.1 extends Fable 5 with stronger long-running agentic coding, multistep research, and document work.",
	},
	"anthropic.claude-fable-5": {
		maxTokens: 8192,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		supportsReasoningBinary: true,
		supportsReasoningEffort: ["low", "medium", "high", "xhigh", "max"],
		supportsTemperature: false,
		inputPrice: 10.0,
		outputPrice: 50.0,
		cacheWritesPrice: 12.5,
		cacheReadsPrice: 1.0,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		description:
			"Claude Fable 5 is Anthropic's most capable widely released model for the most demanding reasoning and long-horizon agentic work.",
	},
	// UNVERIFIED: Neither Anthropic's docs nor the AWS Bedrock "Supported models" page
	// publishes a Bedrock model ID for Mythos 5 (or a -mythos-5-1 variant) as of this
	// writing. This entry mirrors Fable 5's Bedrock contract (identical adaptive-thinking
	// shape, 1M default context, 128k max output, same pricing tier) per the Anthropic
	// migration guide, ported from the pre-re-baseline fork catalog. Confirm the exact
	// model ID against the AWS console before relying on this entry in production.
	"anthropic.claude-mythos-5": {
		maxTokens: 128_000,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		supportsReasoningBinary: true,
		supportsReasoningEffort: ["low", "medium", "high", "xhigh", "max"],
		supportsTemperature: false,
		inputPrice: 10.0,
		outputPrice: 50.0,
		cacheWritesPrice: 12.5,
		cacheReadsPrice: 1.0,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
		description:
			"Claude Mythos 5 - access-gated frontier model (native 1M context, default). UNVERIFIED Bedrock model ID.",
	},
	"anthropic.claude-opus-4-5-20251101-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 5.0,
		outputPrice: 25.0,
		cacheWritesPrice: 6.25,
		cacheReadsPrice: 0.5,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-opus-4-20250514-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 15.0,
		outputPrice: 75.0,
		cacheWritesPrice: 18.75,
		cacheReadsPrice: 1.5,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-3-7-sonnet-20250219-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-3-5-sonnet-20241022-v2:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		inputPrice: 3.0,
		outputPrice: 15.0,
		cacheWritesPrice: 3.75,
		cacheReadsPrice: 0.3,
		minTokensPerCachePoint: 1024,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-3-5-haiku-20241022-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: false,
		supportsPromptCache: true,
		inputPrice: 0.8,
		outputPrice: 4.0,
		cacheWritesPrice: 1.0,
		cacheReadsPrice: 0.08,
		minTokensPerCachePoint: 2048,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-haiku-4-5-20251001-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: true,
		supportsReasoningBudget: true,
		inputPrice: 1.0,
		outputPrice: 5.0,
		cacheWritesPrice: 1.25, // 5m cache writes
		cacheReadsPrice: 0.1, // cache hits / refreshes
		minTokensPerCachePoint: 2048,
		maxCachePoints: 4,
		cachableFields: ["system", "messages", "tools"],
	},
	"anthropic.claude-3-5-sonnet-20240620-v1:0": {
		maxTokens: 8192,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3.0,
		outputPrice: 15.0,
	},
	"anthropic.claude-3-opus-20240229-v1:0": {
		maxTokens: 4096,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 15.0,
		outputPrice: 75.0,
	},
	"anthropic.claude-3-sonnet-20240229-v1:0": {
		maxTokens: 4096,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 3.0,
		outputPrice: 15.0,
	},
	"anthropic.claude-3-haiku-20240307-v1:0": {
		maxTokens: 4096,
		contextWindow: 200_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.25,
		outputPrice: 1.25,
	},
	"deepseek.r1-v1:0": {
		maxTokens: 32_768,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 1.35,
		outputPrice: 5.4,
	},
	"openai.gpt-oss-20b-1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.5,
		outputPrice: 1.5,
		description: "GPT-OSS 20B - Optimized for low latency and local/specialized use cases",
	},
	"openai.gpt-oss-120b-1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.0,
		outputPrice: 6.0,
		description: "GPT-OSS 120B - Production-ready, general-purpose, high-reasoning model",
	},
	// GPT-5.6 / GPT-6 family on Amazon Bedrock (bedrock-runtime, Converse API).
	// R1 (mandatory inference profile): AWS documents the base model id as NOT
	// invokable on-demand for any of these - an inference profile (us./global., plus
	// in. for Terra/Luna in India regions) is required even when the user has not
	// opted into cross-region inference. See BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS
	// and the mandatory-profile handling in src/api/providers/bedrock.ts getModel().
	// supportsPromptCache: false for every GPT entry - AWS marks prompt caching
	// "(Responses API only)" for this family, so the Converse path this extension
	// uses does not get it despite the pricing tables listing cache rates.
	// Reasoning-effort payload shape on Converse: CONFIRMED via
	// scripts/probe-bedrock-reasoning.mjs against live AWS credentials (2026-09-30) -
	// GPT-6 Sol accepts the nested `additionalModelRequestFields: { reasoning: { effort } }`
	// shape and rejects the flat `reasoning_effort` field with
	// `ValidationException: Unknown parameter: 'reasoning_effort'`. Phase B (see
	// BEDROCK_OPENAI_EFFORT_MODEL_IDS below and src/api/providers/bedrock.ts
	// createMessage()/completePrompt()) implements this nested shape for GPT-6
	// Sol/Luna specifically - the only two entries with an AWS-documented effort
	// allow-list. GPT-5.6 Sol/Terra/Luna and GPT-6 Astra still have no documented
	// effort contract (doc gap, see research Q2) and remain catalog-only.
	"openai.gpt-5.6-sol": {
		// maxTokens unverified - borrowed from upstream non-Bedrock openai.ts
		// gpt-5.6-sol entry; the AWS model card is silent on max output tokens.
		maxTokens: 128_000,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsTemperature: false,
		inputPrice: 4.0, // Global CRIS; in-Region/Geo CRIS is ~10% higher (not modelled)
		outputPrice: 20.0,
		longContextPricing: {
			thresholdTokens: 272_000,
			inputPriceMultiplier: 2,
			outputPriceMultiplier: 1.5,
		},
		// No supportsReasoningEffort yet - AWS's GPT-5.6 Sol card has no "reasoning
		// effort" section (doc gap, not confirmed unsupported - see research Q2).
		description:
			"GPT-5.6 Sol on Amazon Bedrock (Converse). Requires an inference profile (us./global.) - the base model id is not invokable on-demand.",
	},
	"openai.gpt-5.6-terra": {
		// maxTokens unverified - no upstream non-Bedrock entry exists for Terra to
		// borrow from; the AWS model card is silent on max output tokens.
		maxTokens: 128_000,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsTemperature: false,
		inputPrice: 2.0, // Global CRIS
		outputPrice: 12.0,
		longContextPricing: {
			thresholdTokens: 272_000,
			inputPriceMultiplier: 2,
			outputPriceMultiplier: 1.5,
		},
		description:
			"GPT-5.6 Terra on Amazon Bedrock (Converse). Requires an inference profile (us./global., plus in. in India regions) - the base model id is not invokable on-demand.",
	},
	"openai.gpt-5.6-luna": {
		// maxTokens unverified - no upstream non-Bedrock entry exists for Luna to
		// borrow from; the AWS model card is silent on max output tokens.
		maxTokens: 128_000,
		contextWindow: 1_000_000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsTemperature: false,
		inputPrice: 0.2, // Global CRIS
		outputPrice: 1.2,
		longContextPricing: {
			thresholdTokens: 272_000,
			inputPriceMultiplier: 2,
			outputPriceMultiplier: 1.5,
		},
		description:
			"GPT-5.6 Luna on Amazon Bedrock (Converse). Requires an inference profile (us./global., plus in. in India regions) - the base model id is not invokable on-demand.",
	},
	"openai.gpt-6-astra": {
		maxTokens: 128_000, // AWS-documented (model card states "128,000" directly)
		contextWindow: 1_050_000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsTemperature: false,
		inputPrice: 10.0, // Global CRIS
		outputPrice: 50.0,
		longContextPricing: {
			thresholdTokens: 272_000,
			inputPriceMultiplier: 2,
			outputPriceMultiplier: 1.5,
		},
		// No supportsReasoningEffort yet - AWS's GPT-6 Astra card has no "reasoning
		// effort" section (doc gap - see research Q2), unlike GPT-6 Sol/Luna below.
		description:
			"GPT-6 Astra on Amazon Bedrock (Converse). Requires an inference profile (us./global.) - the base model id is not invokable on-demand.",
	},
	"openai.gpt-6-sol": {
		// maxTokens unverified - no upstream non-Bedrock entry exists for GPT-6 Sol
		// to borrow from; the AWS model card is silent on max output tokens.
		maxTokens: 128_000,
		contextWindow: 1_050_000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsTemperature: false,
		// AWS-documented directly on this model's card: "Set reasoning effort to
		// none, low, medium, high, xhigh, or max. The default is medium." Phase B
		// (src/api/providers/bedrock.ts) sends this as the confirmed nested
		// `additionalModelRequestFields: { reasoning: { effort } }` shape - see
		// BEDROCK_OPENAI_EFFORT_MODEL_IDS below.
		supportsReasoningEffort: ["none", "low", "medium", "high", "xhigh", "max"],
		reasoningEffort: "medium",
		inputPrice: 2.0, // Global CRIS
		outputPrice: 10.0,
		longContextPricing: {
			thresholdTokens: 272_000,
			inputPriceMultiplier: 2,
			outputPriceMultiplier: 1.5,
		},
		description:
			"GPT-6 Sol on Amazon Bedrock (Converse). Requires an inference profile (us./global.) - the base model id is not invokable on-demand.",
	},
	"openai.gpt-6-luna": {
		// maxTokens unverified - no upstream non-Bedrock entry exists for GPT-6 Luna
		// to borrow from; the AWS model card is silent on max output tokens.
		maxTokens: 128_000,
		contextWindow: 1_050_000,
		supportsImages: true,
		supportsPromptCache: false,
		supportsTemperature: false,
		// AWS-documented directly on this model's card, identical wording to GPT-6 Sol.
		supportsReasoningEffort: ["none", "low", "medium", "high", "xhigh", "max"],
		reasoningEffort: "medium",
		inputPrice: 0.1, // Global CRIS
		outputPrice: 0.5,
		longContextPricing: {
			thresholdTokens: 272_000,
			inputPriceMultiplier: 2,
			outputPriceMultiplier: 1.5,
		},
		description:
			"GPT-6 Luna on Amazon Bedrock (Converse). Requires an inference profile (us./global.) - the base model id is not invokable on-demand.",
	},
	"meta.llama3-3-70b-instruct-v1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.72,
		outputPrice: 0.72,
		description: "Llama 3.3 Instruct (70B)",
	},
	"meta.llama3-2-90b-instruct-v1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.72,
		outputPrice: 0.72,
		description: "Llama 3.2 Instruct (90B)",
	},
	"meta.llama3-2-11b-instruct-v1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: true,
		supportsPromptCache: false,
		inputPrice: 0.16,
		outputPrice: 0.16,
		description: "Llama 3.2 Instruct (11B)",
	},
	"meta.llama3-2-3b-instruct-v1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.15,
		outputPrice: 0.15,
		description: "Llama 3.2 Instruct (3B)",
	},
	"meta.llama3-2-1b-instruct-v1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.1,
		outputPrice: 0.1,
		description: "Llama 3.2 Instruct (1B)",
	},
	"meta.llama3-1-405b-instruct-v1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.4,
		outputPrice: 2.4,
		description: "Llama 3.1 Instruct (405B)",
	},
	"meta.llama3-1-70b-instruct-v1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.72,
		outputPrice: 0.72,
		description: "Llama 3.1 Instruct (70B)",
	},
	"meta.llama3-1-70b-instruct-latency-optimized-v1:0": {
		maxTokens: 8192,
		contextWindow: 128_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.9,
		outputPrice: 0.9,
		description: "Llama 3.1 Instruct (70B) (w/ latency optimized inference)",
	},
	"meta.llama3-1-8b-instruct-v1:0": {
		maxTokens: 8192,
		contextWindow: 8_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.22,
		outputPrice: 0.22,
		description: "Llama 3.1 Instruct (8B)",
	},
	"meta.llama3-70b-instruct-v1:0": {
		maxTokens: 2048,
		contextWindow: 8_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 2.65,
		outputPrice: 3.5,
	},
	"meta.llama3-8b-instruct-v1:0": {
		maxTokens: 2048,
		contextWindow: 4_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.3,
		outputPrice: 0.6,
	},
	"amazon.titan-text-lite-v1:0": {
		maxTokens: 4096,
		contextWindow: 8_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.15,
		outputPrice: 0.2,
		description: "Amazon Titan Text Lite",
	},
	"amazon.titan-text-express-v1:0": {
		maxTokens: 4096,
		contextWindow: 8_000,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.2,
		outputPrice: 0.6,
		description: "Amazon Titan Text Express",
	},
	// T2 (fork/02-bedrock-catalog) premise check, 2026-10-02: the archive fork
	// (archive/zoo-base-3.56 commit d388efc12) renamed this key to
	// "moonshotai.kimi-k2-thinking", claiming AWS's control-plane id uses the
	// "moonshotai." prefix and that "moonshot." never matches. That rename was
	// NEVER actually applied at this re-baseline's HEAD (this entry has always
	// been "moonshot."), and empirical verification proved the rename would have
	// been WRONG. Live AWS calls via the `bedrock` CLI profile, us-east-1,
	// 2026-10-02:
	//   - `aws bedrock list-foundation-models` (control plane - the same API
	//     `discoverBedrockTargets`/ListFoundationModelsCommand calls) returns this
	//     model as modelId "moonshot.kimi-k2-thinking", inferenceTypesSupported
	//     ["ON_DEMAND"].
	//   - `aws bedrock-runtime converse --model-id moonshot.kimi-k2-thinking`
	//     (the actual invocation plane) SUCCEEDS.
	//   - `aws bedrock-runtime converse --model-id moonshotai.kimi-k2-thinking`
	//     FAILS: ValidationException "The provided model identifier is invalid."
	// Do NOT rename this key. See fork-docs/fork-feature-inventory.md T2 section
	// for the full decision trail; see also plans/new-bedrock-models-research.md,
	// which asserted (incorrectly, for this specific model) that AWS's
	// "bedrock-mantle" plane uses "moonshotai." - that claim does not hold on the
	// control-plane API this codebase actually queries, nor on the runtime plane.
	"moonshot.kimi-k2-thinking": {
		maxTokens: 32_000,
		contextWindow: 262_144,
		supportsImages: false,
		supportsPromptCache: false,
		preserveReasoning: true,
		inputPrice: 0.6,
		outputPrice: 2.5,
		description: "Kimi K2 Thinking (1T parameter MoE model with 32B active parameters)",
	},
	// Kimi K3 on Amazon Bedrock (bedrock-runtime, Converse API). Note the vendor
	// prefix differs from kimi-k2-thinking above ("moonshotai." vs "moonshot.") -
	// this is confirmed from AWS's own model card, not a typo; do not "normalise"
	// the two ids to match.
	// R1 (mandatory inference profile): AWS documents in-Region invocation as
	// unsupported for K3 in every listed Region - only us./global. inference
	// profiles work. See BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS.
	// Deliberately NOT setting preserveReasoning: AWS's K3 card documents an
	// InternalServerException when reasoning content from a prior turn is echoed
	// back in a multi-turn Converse request. preserveReasoning: true on
	// kimi-k2-thinking above is what re-sends that content, so K3 must omit it.
	// No supportsReasoningEffort: the K3 card has no "reasoning effort" section
	// and reasoning is always on; sending an unverified effort field on Converse
	// risks a 400 (research Q1/section 2b) - omitted until AWS documents a
	// Converse-specific contract for it.
	"moonshotai.kimi-k3": {
		// maxTokens unverified - borrowed from upstream non-Bedrock moonshot.ts
		// kimi-k3 entry; the AWS model card is silent on max output tokens.
		maxTokens: 131_072,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true, // implicit caching only; no API restriction documented for it
		inputPrice: 3.0, // Global CRIS
		outputPrice: 15.0,
		cacheWritesPrice: 3.75, // 30-min explicit-caching write rate (Responses/Chat Completions only; unused on Converse)
		cacheReadsPrice: 0.3,
		minTokensPerCachePoint: 1024,
		description:
			"Kimi K3 on Amazon Bedrock (Converse). Requires an inference profile (us./global.) - the base model id is not invokable on-demand. AWS recommends the OpenAI-compatible APIs over Converse for this model; Converse multi-turn requests must not echo prior-turn reasoning content back (InternalServerException risk).",
	},
	"minimax.minimax-m2": {
		maxTokens: 16_384,
		contextWindow: 196_608,
		supportsImages: false,
		supportsPromptCache: false,
		preserveReasoning: true,
		inputPrice: 0.3,
		outputPrice: 1.2,
		description: "MiniMax M2 (230B parameter MoE model with 10B active parameters)",
	},
	"qwen.qwen3-next-80b-a3b": {
		maxTokens: 8192,
		contextWindow: 262_144,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.15,
		outputPrice: 1.2,
		description: "Qwen3 Next 80B (MoE model with 3B active parameters)",
	},
	"qwen.qwen3-coder-480b-a35b-v1:0": {
		maxTokens: 8192,
		contextWindow: 262_144,
		supportsImages: false,
		supportsPromptCache: false,
		inputPrice: 0.45,
		outputPrice: 1.8,
		description: "Qwen3 Coder 480B (MoE model with 35B active parameters)",
	},
} as const satisfies Record<string, ModelInfo>

export const BEDROCK_DEFAULT_TEMPERATURE = 0.3

export const BEDROCK_MAX_TOKENS = 4096

export const BEDROCK_DEFAULT_CONTEXT = 128_000

// Amazon Bedrock Inference Profile mapping based on official documentation
// https://docs.aws.amazon.com/bedrock/latest/userguide/inference-profiles-support.html
// This mapping is pre-ordered by pattern length (descending) to ensure more specific patterns match first
export const AWS_INFERENCE_PROFILE_MAPPING: Array<[string, string]> = [
	// Australia regions (Sydney and Melbourne) → au. inference profile (most specific - 14 chars)
	["ap-southeast-2", "au."],
	["ap-southeast-4", "au."],
	// Japan regions (Tokyo and Osaka) → jp. inference profile (13 chars)
	["ap-northeast-", "jp."],
	// US Government Cloud → ug. inference profile (7 chars)
	["us-gov-", "ug."],
	// Americas regions → us. inference profile (3 chars)
	["us-", "us."],
	// Europe regions → eu. inference profile (3 chars)
	["eu-", "eu."],
	// Asia Pacific regions → apac. inference profile (3 chars)
	["ap-", "apac."],
	// Canada regions → ca. inference profile (3 chars)
	["ca-", "ca."],
	// South America regions → sa. inference profile (3 chars)
	["sa-", "sa."],
]

// Amazon Bedrock supported regions for the regions dropdown
// Based on official AWS documentation
export const BEDROCK_REGIONS = [
	{ value: "us-east-1", label: "us-east-1" },
	{ value: "us-east-2", label: "us-east-2" },
	{ value: "us-west-1", label: "us-west-1" },
	{ value: "us-west-2", label: "us-west-2" },
	{ value: "ap-northeast-1", label: "ap-northeast-1" },
	{ value: "ap-northeast-2", label: "ap-northeast-2" },
	{ value: "ap-northeast-3", label: "ap-northeast-3" },
	{ value: "ap-south-1", label: "ap-south-1" },
	{ value: "ap-south-2", label: "ap-south-2" },
	{ value: "ap-southeast-1", label: "ap-southeast-1" },
	{ value: "ap-southeast-2", label: "ap-southeast-2" },
	{ value: "ap-east-1", label: "ap-east-1" },
	{ value: "eu-central-1", label: "eu-central-1" },
	{ value: "eu-central-2", label: "eu-central-2" },
	{ value: "eu-west-1", label: "eu-west-1" },
	{ value: "eu-west-2", label: "eu-west-2" },
	{ value: "eu-west-3", label: "eu-west-3" },
	{ value: "eu-north-1", label: "eu-north-1" },
	{ value: "eu-south-1", label: "eu-south-1" },
	{ value: "eu-south-2", label: "eu-south-2" },
	{ value: "ca-central-1", label: "ca-central-1" },
	{ value: "sa-east-1", label: "sa-east-1" },
	{ value: "us-gov-east-1", label: "us-gov-east-1" },
	{ value: "us-gov-west-1", label: "us-gov-west-1" },
].sort((a, b) => a.value.localeCompare(b.value))

export const BEDROCK_1M_CONTEXT_MODEL_IDS = [
	"anthropic.claude-sonnet-4-20250514-v1:0",
	"anthropic.claude-sonnet-4-5-20250929-v1:0",
	"anthropic.claude-sonnet-4-6",
	"anthropic.claude-opus-4-6-v1",
	"anthropic.claude-opus-4-7",
	"anthropic.claude-opus-4-8",
] as const

// Amazon Bedrock models that support Global Inference profiles
// As of Nov 2025, AWS supports Global Inference for:
// - Claude Sonnet 4
// - Claude Sonnet 4.5
// - Claude Sonnet 4.6
// - Claude Sonnet 5
// - Claude Haiku 4.5
// - Claude Opus 4.5
// - Claude Opus 4.6
// - Claude Opus 4.7
// - Claude Opus 5
// - Claude Fable 5 and 5.1 (cross-region inference only - can only be used through an inference profile)
// - GPT-5.6 Sol/Terra/Luna, GPT-6 Astra/Sol/Luna, Kimi K3 (T11: every one of these
//   also REQUIRES a profile - see BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS
//   below. Listing them here too means the existing opt-in "Use Global Inference"
//   toggle produces the expected `global.` id for them without any new logic;
//   the mandatory-profile fallback only has to cover the case where the user has
//   opted into neither Global nor cross-region inference.)
export const BEDROCK_GLOBAL_INFERENCE_MODEL_IDS = [
	"anthropic.claude-sonnet-4-20250514-v1:0",
	"anthropic.claude-sonnet-4-5-20250929-v1:0",
	"anthropic.claude-sonnet-4-6",
	"anthropic.claude-sonnet-5",
	"anthropic.claude-haiku-4-5-20251001-v1:0",
	"anthropic.claude-opus-4-5-20251101-v1:0",
	"anthropic.claude-opus-4-6-v1",
	"anthropic.claude-opus-4-7",
	"anthropic.claude-opus-4-8",
	"anthropic.claude-opus-5",
	"anthropic.claude-fable-5-1",
	"anthropic.claude-fable-5",
	"openai.gpt-5.6-sol",
	"openai.gpt-5.6-terra",
	"openai.gpt-5.6-luna",
	"openai.gpt-6-astra",
	"openai.gpt-6-sol",
	"openai.gpt-6-luna",
	"moonshotai.kimi-k3",
] as const

// Adaptive-thinking models that accept an explicit `thinking: { type: "disabled" }`
// request to turn reasoning off entirely. Anthropic's adaptive-thinking contract
// otherwise always reasons; only Claude Sonnet 5 currently accepts the disabled
// variant on Bedrock. Sending it to other adaptive models (Opus 4.7/4.8/5, Fable
// 5/5.1) returns a 400 error, so this list must stay narrow and explicit.
export const BEDROCK_DISABLEABLE_THINKING_MODEL_IDS = ["anthropic.claude-sonnet-5"] as const

// GPT models on Bedrock that accept an OpenAI-style `effort` field, sent as the
// nested `additionalModelRequestFields: { reasoning: { effort } }` shape on
// Converse (NOT Anthropic's `thinking` block, and NOT a flat `reasoning_effort`
// field - both confirmed by scripts/probe-bedrock-reasoning.mjs against live AWS
// credentials on 2026-09-30: the flat field is rejected with `ValidationException:
// Unknown parameter: 'reasoning_effort'`). Scoped to exactly the two entries with
// an AWS-documented effort allow-list (see supportsReasoningEffort above) - GPT-5.6
// Sol/Terra/Luna and GPT-6 Astra have no documented effort contract (doc gap) and
// are deliberately excluded until AWS documents one. When the user disables
// reasoning for one of these ids, send an explicit `effort: "none"` rather than
// omitting the field, so the request doesn't silently fall back to AWS's "medium"
// default (mirrors the BEDROCK_DISABLEABLE_THINKING_MODEL_IDS explicit-disable
// pattern above, for the same reason).
export const BEDROCK_OPENAI_EFFORT_MODEL_IDS = ["openai.gpt-6-sol", "openai.gpt-6-luna"] as const

// Amazon Bedrock Service Tier types
export type BedrockServiceTier = "STANDARD" | "FLEX" | "PRIORITY"

// Models that support service tiers based on AWS documentation
// https://docs.aws.amazon.com/bedrock/latest/userguide/service-tiers-inference.html
export const BEDROCK_SERVICE_TIER_MODEL_IDS = [
	// Amazon Nova models
	"amazon.nova-lite-v1:0",
	"amazon.nova-2-lite-v1:0",
	"amazon.nova-pro-v1:0",
	"amazon.nova-pro-latency-optimized-v1:0",
	// DeepSeek models
	"deepseek.r1-v1:0",
	// Qwen models
	"qwen.qwen3-next-80b-a3b",
	"qwen.qwen3-coder-480b-a35b-v1:0",
	// OpenAI GPT-OSS models
	"openai.gpt-oss-20b-1:0",
	"openai.gpt-oss-120b-1:0",
] as const

// Service tier pricing multipliers
export const BEDROCK_SERVICE_TIER_PRICING = {
	STANDARD: 1.0, // Base price
	FLEX: 0.5, // 50% discount from standard
	PRIORITY: 1.75, // 75% premium over standard
} as const

// Models whose base (unprefixed) model id is documented by AWS as NOT invokable
// on-demand on bedrock-runtime - an inference profile prefix (regional or global)
// is mandatory, not opt-in, unlike BEDROCK_GLOBAL_INFERENCE_MODEL_IDS above (which
// only widens what's *available*, never requires it). See T11 research doc risk
// R1 (plans/new-bedrock-models-research.md) for the AWS model-card citations.
//
// Confirmed profile prefixes per AWS's model cards: `us.` and `global.` for every
// entry below, plus `in.` for GPT-5.6 Terra/Luna specifically in India Regions.
// No `eu.`/`apac.`/`au.`/`jp.`/`ca.`/`sa.`/`ug.` profile is documented for ANY of
// these models - AWS's docs only ever show `us.` and `global.` (research section 1).
//
// Fallback-prefix decision (explicit, not a guess): when the mandatory-profile
// handler needs a prefix and the user has not opted into cross-region inference,
// it reuses AwsBedrockHandler.getPrefixForRegion() - the SAME region-to-prefix
// table the opt-in cross-region path already uses (au./eu./apac./jp./ca./sa./ug./us.)
// - rather than inventing a second table. This is a deliberate choice by the
// project owner to keep one source of truth for region-to-prefix mapping, accepting
// that prefixes other than us./global. are unverified for these specific models
// and may 400 until confirmed. Users who hit that can switch to Global Inference
// (awsUseGlobalInference) or cross-region inference explicitly, both of which
// still work normally for these ids.
export const BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS = [
	"openai.gpt-5.6-sol",
	"openai.gpt-5.6-terra",
	"openai.gpt-5.6-luna",
	"openai.gpt-6-astra",
	"openai.gpt-6-sol",
	"openai.gpt-6-luna",
	"moonshotai.kimi-k3",
] as const

// -----------------------------------------------------------------------------------
// T4: Bedrock dynamic discovery - shared pure helpers
//
// None of the models in BEDROCK_1M_CONTEXT_MODEL_IDS above default into their 1M tier;
// every one of them ships at a 200K contextWindow and requires either the opt-in
// `awsBedrock1MContext` toggle or a `:1m`-suffixed discovery target id to reach 1M. Models
// that are natively 1M by default (e.g. Claude Sonnet 5, Opus 5, Fable 5/5.1) already carry
// contextWindow: 1_000_000 directly in their bedrockModels catalog entry and never appear in
// BEDROCK_1M_CONTEXT_MODEL_IDS, so this default list stays empty. It exists (rather than being
// inlined as `[]`) so the "opt-in" derivation below reads as intentional, and so a future model
// that ships 1M-by-default-but-still-needs-a-catalog-entry-in-this-list has an obvious place to
// be added without touching every call site that filters on "is this opt-in".
export const BEDROCK_1M_CONTEXT_DEFAULT_MODEL_IDS = [] as const

export const BEDROCK_1M_CONTEXT_OPT_IN_MODEL_IDS = BEDROCK_1M_CONTEXT_MODEL_IDS.filter(
	(modelId) => !(BEDROCK_1M_CONTEXT_DEFAULT_MODEL_IDS as readonly string[]).includes(modelId),
)

export type BedrockInvokeTargetKind =
	| "foundation-model"
	| "system-profile"
	| "application-profile"
	| "custom-arn"
	| "prompt-router"
	| "unknown"

export type BedrockContextSource = "default-1m" | "profile-id" | "toggle" | "base"

export interface BedrockDiscoveredTarget {
	id: string
	label: string
	baseModelId: string
	targetKind: Extract<BedrockInvokeTargetKind, "foundation-model" | "system-profile" | "application-profile">
	contextWindow: number
	contextSource: BedrockContextSource
	description?: string
	arn?: string
	region?: string
	status?: string
	isGlobal?: boolean
	isCrossRegion?: boolean
	supportsImages?: boolean
	supportsPromptCache?: boolean
}

type ParsedBedrockArn = {
	isArn: boolean
	region?: string
	modelType?: string
	resourceId?: string
}

const BEDROCK_PROFILE_PREFIXES = Array.from(
	new Set(["global.", ...AWS_INFERENCE_PROFILE_MAPPING.map(([, prefix]) => prefix)]),
)

const BEDROCK_1M_SUFFIX_PATTERNS = [/\[1m\]$/i, /:1m(?::fast)?$/i]

const cloneModelInfo = (info: ModelInfo): ModelInfo => ({
	...info,
	cachableFields: info.cachableFields ? [...info.cachableFields] : undefined,
	excludedTools: info.excludedTools ? [...info.excludedTools] : undefined,
	includedTools: info.includedTools ? [...info.includedTools] : undefined,
	supportedParameters: info.supportedParameters ? [...info.supportedParameters] : undefined,
	tiers: info.tiers?.map((tier) => ({ ...tier })),
	longContextPricing: info.longContextPricing ? { ...info.longContextPricing } : undefined,
})

export const stripBedrock1MContextSuffix = (targetId: string) =>
	BEDROCK_1M_SUFFIX_PATTERNS.reduce((value, pattern) => value.replace(pattern, ""), targetId.trim())

export const hasBedrock1MContextIndicator = (targetId?: string) => {
	if (!targetId) {
		return false
	}

	const normalized = targetId.trim().toLowerCase()
	return BEDROCK_1M_SUFFIX_PATTERNS.some((pattern) => pattern.test(normalized))
}

/**
 * Given a list of Bedrock targets, expand each 1M-capable entry into two dropdown
 * choices: the original (default context) and a synthetic twin with `:1m` appended
 * to its id, a (1M context) label suffix, and context-window/pricing from the 1M tier.
 *
 * The runtime recognizes `:1m` via {@link hasBedrock1MContextIndicator} and strips it
 * via {@link stripBedrock1MContextSuffix}, so the synthetic id round-trips correctly.
 *
 * Used by both the static fallback target list in the webview and by
 * `discoverBedrockTargets` on the extension side, so AWS discovery producing a single
 * profile still yields two dropdown choices (since the inference profile id is
 * identical for 128K/200K and 1M).
 */
export const expandBedrockTargetsWith1MVariants = (targets: BedrockDiscoveredTarget[]): BedrockDiscoveredTarget[] => {
	const oneMillionCapable = new Set<string>(BEDROCK_1M_CONTEXT_MODEL_IDS as readonly string[])
	const result: BedrockDiscoveredTarget[] = []

	for (const target of targets) {
		result.push(target)

		if (!oneMillionCapable.has(target.baseModelId)) {
			continue
		}

		// Skip if the incoming target ALREADY represents a 1M variant (avoid double-adding).
		if (hasBedrock1MContextIndicator(target.id) || target.contextWindow >= 1_000_000) {
			continue
		}

		const modelInfo = bedrockModels[target.baseModelId as keyof typeof bedrockModels] as ModelInfo | undefined
		const tier = modelInfo?.tiers?.[0]
		const oneMContextWindow = tier?.contextWindow ?? 1_000_000

		result.push({
			...target,
			id: `${target.id}:1m`,
			label: `${target.label} (1M context)`,
			contextWindow: oneMContextWindow,
			contextSource: "profile-id",
		})
	}

	return result
}

export const parseBedrockArn = (targetId?: string): ParsedBedrockArn => {
	if (!targetId?.startsWith("arn:")) {
		return { isArn: false }
	}

	const arnRegex = /^arn:[^:]+:(?:bedrock|sagemaker):([^:]+):([^:]*):(?:([^/]+)\/([\w.\-:]+)|([^/]+))$/
	const match = targetId.match(arnRegex)

	if (!match) {
		return { isArn: true }
	}

	return {
		isArn: true,
		region: match[1],
		modelType: match[3],
		resourceId: match[4],
	}
}

export const parseBedrockBaseModelId = (targetId: string): string => {
	if (!targetId) {
		return targetId
	}

	const normalizedTargetId = stripBedrock1MContextSuffix(targetId)
	const parsedArn = parseBedrockArn(normalizedTargetId)
	const value = parsedArn.resourceId ?? normalizedTargetId

	for (const prefix of BEDROCK_PROFILE_PREFIXES) {
		if (value.startsWith(prefix)) {
			return value.substring(prefix.length)
		}
	}

	return value
}

export const inferBedrockInvokeTargetKind = ({
	targetId,
	explicitKind,
}: {
	targetId?: string
	explicitKind?: BedrockInvokeTargetKind
}): BedrockInvokeTargetKind => {
	if (explicitKind) {
		return explicitKind
	}

	if (!targetId) {
		return "unknown"
	}

	if (targetId.startsWith("arn:")) {
		const parsedArn = parseBedrockArn(targetId)
		switch (parsedArn.modelType) {
			case "foundation-model":
				return "foundation-model"
			case "inference-profile":
				if (
					parsedArn.resourceId &&
					BEDROCK_PROFILE_PREFIXES.some((prefix) => parsedArn.resourceId!.startsWith(prefix))
				) {
					return "system-profile"
				}
				return "application-profile"
			case "application-inference-profile":
				return "application-profile"
			case "default-prompt-router":
			case "prompt-router":
				return "prompt-router"
			default:
				return "custom-arn"
		}
	}

	if (
		targetId.startsWith("global.") ||
		AWS_INFERENCE_PROFILE_MAPPING.some(([, prefix]) => targetId.startsWith(prefix))
	) {
		return "system-profile"
	}

	return "foundation-model"
}

export const usesBedrockDefault1MContext = (baseModelId?: string) =>
	!!baseModelId &&
	BEDROCK_1M_CONTEXT_DEFAULT_MODEL_IDS.includes(baseModelId as (typeof BEDROCK_1M_CONTEXT_DEFAULT_MODEL_IDS)[number])

const getBedrockRegionPrefix = (region?: string): string | undefined => {
	if (!region) return undefined
	for (const [pattern, prefix] of AWS_INFERENCE_PROFILE_MAPPING) {
		if (region.startsWith(pattern)) return prefix
	}
	return undefined
}

/**
 * Returns the AWS-side target id that the Bedrock runtime would invoke against, given a
 * provider-settings snapshot. Mirrors the resolution `AwsBedrockHandler.getModel()` does
 * before sending a Converse command, so that callers outside the runtime can compute the
 * exact same target the user's profile is configured to invoke.
 *
 * Resolution order:
 *  1. `awsCustomArn` wins if present (the user provided a literal ARN).
 *  2. If `awsBedrockTargetKind` (or the inferred kind) is an explicit profile / prompt
 *     router selection, use `awsBedrockInvokeTarget` verbatim, stripping the synthetic
 *     `:1m` UI suffix.
 *  3. Otherwise we have a foundation-model selection. Apply Global Inference (`global.`)
 *     when enabled and supported, else apply the regional cross-region inference prefix
 *     (`us.`, `eu.`, etc.) when enabled.
 */
export interface ResolveBedrockInvokeTargetIdOptions {
	awsCustomArn?: string
	awsBedrockInvokeTarget?: string
	awsBedrockTargetKind?: BedrockInvokeTargetKind
	apiModelId?: string
	awsUseGlobalInference?: boolean
	awsUseCrossRegionInference?: boolean
	awsRegion?: string
}

export const resolveBedrockInvokeTargetId = (options: ResolveBedrockInvokeTargetIdOptions): string => {
	if (options.awsCustomArn) {
		return options.awsCustomArn
	}

	const configuredTargetId = options.awsBedrockInvokeTarget || options.apiModelId || ""
	const explicitKind = options.awsBedrockTargetKind
	const targetKind = inferBedrockInvokeTargetKind({
		targetId: configuredTargetId,
		explicitKind,
	})

	if (
		targetKind === "system-profile" ||
		targetKind === "application-profile" ||
		targetKind === "prompt-router" ||
		targetKind === "custom-arn"
	) {
		return stripBedrock1MContextSuffix(configuredTargetId)
	}

	const baseModelId = parseBedrockBaseModelId(configuredTargetId)

	if (
		options.awsUseGlobalInference &&
		BEDROCK_GLOBAL_INFERENCE_MODEL_IDS.includes(baseModelId as (typeof BEDROCK_GLOBAL_INFERENCE_MODEL_IDS)[number])
	) {
		return `global.${baseModelId}`
	}

	if (options.awsUseCrossRegionInference) {
		const prefix = getBedrockRegionPrefix(options.awsRegion)
		if (prefix) {
			return `${prefix}${baseModelId}`
		}
	}

	return baseModelId
}

export const shouldUseBedrock1MContext = ({
	targetId,
	baseModelId,
	optIn1MContext,
}: {
	targetId?: string
	baseModelId?: string
	optIn1MContext?: boolean
}): { enabled: boolean; source: BedrockContextSource } => {
	if (hasBedrock1MContextIndicator(targetId)) {
		return { enabled: true, source: "profile-id" }
	}

	if (usesBedrockDefault1MContext(baseModelId)) {
		return { enabled: true, source: "default-1m" }
	}

	if (
		optIn1MContext &&
		baseModelId &&
		BEDROCK_1M_CONTEXT_MODEL_IDS.includes(baseModelId as (typeof BEDROCK_1M_CONTEXT_MODEL_IDS)[number])
	) {
		return { enabled: true, source: "toggle" }
	}

	return { enabled: false, source: "base" }
}

/**
 * Fallback heuristic used by {@link resolveBedrockModelInfo} when a target/base model id is
 * not present in the static `bedrockModels` catalog (e.g. a brand-new foundation model AWS
 * discovery surfaced before the catalog was updated). Mirrors the equivalent private
 * `guessModelInfoFromId` logic historically kept inline on `AwsBedrockHandler` so both the
 * runtime and any caller of the pure resolver (webview `useSelectedModel`, discovery module)
 * make the same guess.
 */
export const guessBedrockModelInfoFromId = (modelId: string): Partial<ModelInfo> => {
	const modelConfigMap: Record<string, Partial<ModelInfo>> = {
		"claude-4": {
			maxTokens: 8192,
			contextWindow: 200_000,
			supportsImages: true,
			supportsPromptCache: true,
		},
		"claude-3-7": {
			maxTokens: 8192,
			contextWindow: 200_000,
			supportsImages: true,
			supportsPromptCache: true,
		},
		"claude-3-5": {
			maxTokens: 8192,
			contextWindow: 200_000,
			supportsImages: true,
			supportsPromptCache: true,
		},
		"claude-4-opus": {
			maxTokens: 4096,
			contextWindow: 200_000,
			supportsImages: true,
			supportsPromptCache: true,
		},
		"claude-3-opus": {
			maxTokens: 4096,
			contextWindow: 200_000,
			supportsImages: true,
			supportsPromptCache: true,
		},
		"claude-3-haiku": {
			maxTokens: 4096,
			contextWindow: 200_000,
			supportsImages: true,
			supportsPromptCache: true,
		},
	}

	const normalizedId = modelId.toLowerCase()
	for (const [pattern, config] of Object.entries(modelConfigMap)) {
		if (normalizedId.includes(pattern)) {
			return config
		}
	}

	return {
		maxTokens: BEDROCK_MAX_TOKENS,
		contextWindow: BEDROCK_DEFAULT_CONTEXT,
		supportsImages: false,
		supportsPromptCache: false,
	}
}

/**
 * Resolves the effective {@link ModelInfo} for a Bedrock invocation target, applying (in
 * order): the static catalog entry (or the heuristic fallback for unknown ids), the 1M
 * context-window/pricing tier when applicable, a static max-output-tokens override (e.g. a
 * future empirically-probed cap), and finally the request-time `modelMaxTokens` slider value
 * (which always wins, so users can still request fewer tokens than the model's headroom).
 *
 * This is the single source of truth shared by `AwsBedrockHandler.getModelById()` (runtime),
 * `discoverBedrockTargets` (extension-side discovery), and `useSelectedModel` (webview), so
 * all three surfaces agree on context-window/pricing for a given target.
 */
export const resolveBedrockModelInfo = ({
	baseModelId,
	targetId,
	optIn1MContext,
	modelMaxTokens,
	contextWindowOverride,
	maxOutputTokensOverride,
}: {
	baseModelId?: string
	targetId?: string
	optIn1MContext?: boolean
	// Request-time "how many tokens to ask for" knob (slider value). Mirrors historic behaviour.
	modelMaxTokens?: number
	contextWindowOverride?: number
	// Static cap override (e.g. an empirically-detected max-output-tokens value, see
	// `awsModelMaxOutputTokens`). When set, this widens the effective `info.maxTokens`
	// ceiling that downstream UI and request builders see, even if the user has not
	// explicitly bumped the slider.
	maxOutputTokensOverride?: number
}): { baseModelId: string; info: ModelInfo; uses1MContext: boolean; contextSource: BedrockContextSource } => {
	const resolvedBaseModelId = parseBedrockBaseModelId(baseModelId || targetId || bedrockDefaultModelId)

	const baseInfo =
		resolvedBaseModelId in bedrockModels
			? cloneModelInfo(bedrockModels[resolvedBaseModelId as keyof typeof bedrockModels])
			: {
					...cloneModelInfo(bedrockModels[bedrockDefaultModelId]),
					...guessBedrockModelInfoFromId(resolvedBaseModelId),
				}

	const oneMillionContext = shouldUseBedrock1MContext({
		targetId,
		baseModelId: resolvedBaseModelId,
		optIn1MContext,
	})

	let info: ModelInfo = baseInfo
	if (oneMillionContext.enabled) {
		const tier = info.tiers?.[0]
		info = {
			...info,
			contextWindow: tier?.contextWindow ?? 1_000_000,
			inputPrice: tier?.inputPrice ?? info.inputPrice,
			outputPrice: tier?.outputPrice ?? info.outputPrice,
			cacheWritesPrice: tier?.cacheWritesPrice ?? info.cacheWritesPrice,
			cacheReadsPrice: tier?.cacheReadsPrice ?? info.cacheReadsPrice,
		}
	}

	// Apply the static-cap override BEFORE the request-time `modelMaxTokens` so users can
	// explicitly request fewer tokens than the model's headroom (e.g. cost control) without
	// having the override silently clobber their slider value.
	if (maxOutputTokensOverride && maxOutputTokensOverride > 0) {
		info.maxTokens = maxOutputTokensOverride
	}
	if (modelMaxTokens && modelMaxTokens > 0) {
		info.maxTokens = modelMaxTokens
	}
	if (contextWindowOverride && contextWindowOverride > 0) {
		info.contextWindow = contextWindowOverride
	}

	return {
		baseModelId: resolvedBaseModelId,
		info,
		uses1MContext: oneMillionContext.enabled,
		contextSource: oneMillionContext.source,
	}
}
