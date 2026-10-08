// T11 phase A: catalog-sanity tests for the new Bedrock model entries
// (GPT-5.6 Sol/Terra/Luna, GPT-6 Astra/Sol/Luna, Kimi K3) and the
// mandatory-inference-profile id-list constants that gate them. See
// plans/new-bedrock-models-research.md and fork-docs/fork-feature-inventory.md
// (T11) for the design rationale. Handler-level (getModel()) behaviour for
// these ids is covered separately in src/api/providers/__tests__/bedrock.spec.ts.

import type { ModelInfo } from "../model.js"
import {
	bedrockModels,
	BEDROCK_GLOBAL_INFERENCE_MODEL_IDS,
	BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS,
} from "../providers/bedrock.js"

const T11_MODEL_IDS = [
	"openai.gpt-5.6-sol",
	"openai.gpt-5.6-terra",
	"openai.gpt-5.6-luna",
	"openai.gpt-6-astra",
	"openai.gpt-6-sol",
	"openai.gpt-6-luna",
	"moonshotai.kimi-k3",
] as const

const T11_GPT_MODEL_IDS = [
	"openai.gpt-5.6-sol",
	"openai.gpt-5.6-terra",
	"openai.gpt-5.6-luna",
	"openai.gpt-6-astra",
	"openai.gpt-6-sol",
	"openai.gpt-6-luna",
] as const

describe("T11 Bedrock catalog entries", () => {
	describe("registry invariants for the new models", () => {
		it("every T11 entry exists in bedrockModels", () => {
			for (const id of T11_MODEL_IDS) {
				expect(bedrockModels[id as keyof typeof bedrockModels]).toBeDefined()
			}
		})

		it("every T11 entry has a positive maxTokens and contextWindow, with maxTokens <= contextWindow", () => {
			for (const id of T11_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(info.maxTokens).toBeGreaterThan(0)
				expect(info.contextWindow).toBeGreaterThan(0)
				expect(info.maxTokens as number).toBeLessThanOrEqual(info.contextWindow as number)
			}
		})

		it("every T11 entry declares supportsImages and supportsPromptCache as booleans", () => {
			for (const id of T11_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(typeof info.supportsImages).toBe("boolean")
				expect(typeof info.supportsPromptCache).toBe("boolean")
			}
		})

		it("every T11 entry declares a non-empty description mentioning the mandatory inference profile", () => {
			for (const id of T11_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(info.description).toBeTruthy()
				expect(info.description).toContain("inference profile")
			}
		})

		it("models with an array supportsReasoningEffort expose a non-empty allow-list", () => {
			for (const id of T11_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				if (Array.isArray(info.supportsReasoningEffort)) {
					expect(info.supportsReasoningEffort.length).toBeGreaterThan(0)
				}
			}
		})

		it("every T11 entry that declares a reasoningEffort has it covered by its own allow-list", () => {
			for (const id of T11_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				if (info.reasoningEffort !== undefined) {
					expect(Array.isArray(info.supportsReasoningEffort)).toBe(true)
					expect(info.supportsReasoningEffort as string[]).toContain(info.reasoningEffort)
				}
			}
		})
	})

	describe("GPT-5.6 / GPT-6 family (all six Bedrock entries)", () => {
		it("all six entries disable prompt caching (Responses API only per AWS docs, unavailable on Converse)", () => {
			for (const id of T11_GPT_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(info.supportsPromptCache).toBe(false)
			}
		})

		it("all six entries disable supportsTemperature", () => {
			for (const id of T11_GPT_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(info.supportsTemperature).toBe(false)
			}
		})

		it("all six entries support images", () => {
			for (const id of T11_GPT_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(info.supportsImages).toBe(true)
			}
		})

		it("all six entries declare longContextPricing with a 272K threshold", () => {
			for (const id of T11_GPT_MODEL_IDS) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(info.longContextPricing).toBeDefined()
				expect(info.longContextPricing?.thresholdTokens).toBe(272_000)
			}
		})

		it("only GPT-6 Sol and GPT-6 Luna declare supportsReasoningEffort (AWS-documented on those cards only)", () => {
			const withEffort = ["openai.gpt-6-sol", "openai.gpt-6-luna"]
			const withoutEffort = [
				"openai.gpt-5.6-sol",
				"openai.gpt-5.6-terra",
				"openai.gpt-5.6-luna",
				"openai.gpt-6-astra",
			]

			for (const id of withEffort) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(info.supportsReasoningEffort).toEqual(["none", "low", "medium", "high", "xhigh", "max"])
				expect(info.reasoningEffort).toBe("medium")
			}

			for (const id of withoutEffort) {
				const info = bedrockModels[id as keyof typeof bedrockModels] as ModelInfo
				expect(info.supportsReasoningEffort).toBeUndefined()
				expect(info.reasoningEffort).toBeUndefined()
			}
		})
	})

	describe("openai.gpt-6-astra", () => {
		it("matches the AWS-documented context window and pricing", () => {
			const info = bedrockModels["openai.gpt-6-astra"]
			expect(info).toMatchObject({
				maxTokens: 128_000,
				contextWindow: 1_050_000,
				supportsImages: true,
				supportsPromptCache: false,
				supportsTemperature: false,
				inputPrice: 10.0,
				outputPrice: 50.0,
			})
		})
	})

	describe("openai.gpt-6-sol", () => {
		it("matches the AWS-documented reasoning-effort allow-list and pricing", () => {
			const info = bedrockModels["openai.gpt-6-sol"]
			expect(info).toMatchObject({
				maxTokens: 128_000,
				contextWindow: 1_050_000,
				supportsImages: true,
				supportsPromptCache: false,
				supportsTemperature: false,
				supportsReasoningEffort: ["none", "low", "medium", "high", "xhigh", "max"],
				reasoningEffort: "medium",
				inputPrice: 2.0,
				outputPrice: 10.0,
			})
		})
	})

	describe("moonshotai.kimi-k3", () => {
		it("matches the Bedrock-specific K3 contract: no preserveReasoning, no supportsReasoningEffort", () => {
			const info = bedrockModels["moonshotai.kimi-k3"]
			expect(info).toMatchObject({
				// D6 (smoke-test-triage.md, fork/14-payload-fixes): corrected from the
				// empirically-wrong 131_072 to 128_000 after AWS's own Converse error
				// confirmed the real cap: "The maximum tokens you requested exceeds the
				// model limit of 128000."
				maxTokens: 128_000,
				contextWindow: 1_048_576,
				supportsImages: true,
				supportsPromptCache: true,
				// D4b (smoke-test-triage.md, fork/14-payload-fixes): K3 rejects the
				// `temperature` field on Converse, same as the rest of the GPT-5.6/6
				// family it shares a mandatory-inference-profile contract with.
				supportsTemperature: false,
				inputPrice: 3.0,
				outputPrice: 15.0,
				cacheWritesPrice: 3.75,
				cacheReadsPrice: 0.3,
				minTokensPerCachePoint: 1024,
			})
			// Deliberately absent: echoing reasoning content back on a Converse
			// multi-turn request risks an InternalServerException per AWS's K3
			// model card, so this catalog entry must never set preserveReasoning.
			expect((info as ModelInfo).preserveReasoning).toBeUndefined()
			// Deliberately absent: no AWS-documented Converse reasoning-effort
			// contract exists yet for K3 (see research doc Q1) - do not add this
			// until phase B/probe results confirm a payload shape.
			expect((info as ModelInfo).supportsReasoningEffort).toBeUndefined()
		})

		it("uses the moonshotai. vendor prefix, distinct from the moonshot.kimi-k2-thinking entry", () => {
			expect(bedrockModels).toHaveProperty("moonshotai.kimi-k3")
			expect(bedrockModels).toHaveProperty("moonshot.kimi-k2-thinking")
		})
	})

	describe("BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS", () => {
		it("contains at least the seven T11 model ids (later tranches, e.g. D5's openai.gpt-6.1-sol, may add more)", () => {
			const ids = BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS as readonly string[]
			for (const id of T11_MODEL_IDS) {
				expect(ids).toContain(id)
			}
		})

		it("every listed id exists as a bedrockModels catalog entry", () => {
			for (const id of BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS) {
				expect(bedrockModels[id as keyof typeof bedrockModels]).toBeDefined()
			}
		})
	})

	describe("BEDROCK_GLOBAL_INFERENCE_MODEL_IDS", () => {
		it("includes every mandatory-profile model id (so the opt-in Global toggle still works for them)", () => {
			for (const id of BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS) {
				expect(BEDROCK_GLOBAL_INFERENCE_MODEL_IDS as readonly string[]).toContain(id)
			}
		})
	})
})
