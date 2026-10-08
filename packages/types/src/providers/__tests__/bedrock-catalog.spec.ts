// T2 (fork/02-bedrock-catalog): regression coverage for the Kimi K2-thinking
// catalog-key premise check. See fork-docs/fork-feature-inventory.md section 5
// (T2) for the full decision trail. See the "Tranche A" describe block at the
// bottom of this file for the D4/D5/D6 smoke-test-triage.md fixes.
//
// Background: the archive fork (archive/zoo-base-3.56 commit d388efc12) renamed
// the catalog key from "moonshot.kimi-k2-thinking" to "moonshotai.kimi-k2-thinking",
// believing AWS published the model under the "moonshotai." prefix on every
// plane. That rename was never actually applied at this re-baseline's HEAD, and
// empirical verification (live AWS calls via the `bedrock` CLI profile,
// us-east-1, 2026-10-02) proved it would have been wrong:
//   - ListFoundationModelsCommand (control plane) returns this model as
//     "moonshot.kimi-k2-thinking".
//   - Converse (runtime/invocation plane) SUCCEEDS for "moonshot.kimi-k2-thinking"
//     and FAILS with ValidationException "The provided model identifier is
//     invalid." for "moonshotai.kimi-k2-thinking".
// HEAD's existing key is correct. These tests guard against ever reintroducing
// the archive's incorrect rename, and confirm the lookup path (parseBedrockBaseModelId
// -> resolveBedrockModelInfo) does not conflate the two Moonshot vendor prefixes
// (which genuinely differ for the sibling Kimi K3 entry, "moonshotai.kimi-k3").

import type { ModelInfo } from "../../model.js"
import {
	bedrockModels,
	parseBedrockBaseModelId,
	resolveBedrockModelInfo,
	isBedrockOpenAiFamily,
	isBedrockMoonshotFamily,
	BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS,
	BEDROCK_GLOBAL_INFERENCE_MODEL_IDS,
} from "../bedrock.js"

describe("Bedrock catalog: moonshot.kimi-k2-thinking key (T2 premise check)", () => {
	it("keeps the catalog key as moonshot.kimi-k2-thinking, not moonshotai.kimi-k2-thinking", () => {
		expect(bedrockModels).toHaveProperty("moonshot.kimi-k2-thinking")
		expect(bedrockModels).not.toHaveProperty("moonshotai.kimi-k2-thinking")
	})

	it("parseBedrockBaseModelId does not alter the moonshot.kimi-k2-thinking id (no prefix stripped)", () => {
		expect(parseBedrockBaseModelId("moonshot.kimi-k2-thinking")).toBe("moonshot.kimi-k2-thinking")
	})

	it("resolveBedrockModelInfo resolves moonshot.kimi-k2-thinking to its real catalog entry (256K context), not the 128K default guess", () => {
		const { baseModelId, info } = resolveBedrockModelInfo({
			baseModelId: "moonshot.kimi-k2-thinking",
			targetId: "moonshot.kimi-k2-thinking",
		})

		expect(baseModelId).toBe("moonshot.kimi-k2-thinking")
		expect(info.contextWindow).toBe(262_144)
		expect(info.maxTokens).toBe(32_000)
	})

	it("does NOT resolve the archive's proposed moonshotai.kimi-k2-thinking id to the same entry (no cross-prefix normalisation)", () => {
		const { baseModelId, info } = resolveBedrockModelInfo({
			baseModelId: "moonshotai.kimi-k2-thinking",
			targetId: "moonshotai.kimi-k2-thinking",
		})

		// Falls through to the generic default-model-id's catalog entry merged with the
		// heuristic guess (guessBedrockModelInfoFromId), i.e. this id is genuinely absent
		// from the catalog - confirming the two Moonshot prefixes are NOT normalised
		// together, matching the live-AWS evidence that only "moonshot." is invokable.
		expect(baseModelId).toBe("moonshotai.kimi-k2-thinking")
		expect(info.contextWindow).not.toBe(262_144)
	})

	it("keeps moonshotai.kimi-k3 as a distinct entry with its own (different) vendor prefix", () => {
		// Sanity check that the two Moonshot models on Bedrock genuinely use different
		// prefixes on the same endpoint - this is confirmed by AWS's own model cards
		// (see plans/new-bedrock-models-research.md section 2c) and must not be
		// "fixed" into matching one another.
		expect(bedrockModels).toHaveProperty("moonshotai.kimi-k3")
		expect(parseBedrockBaseModelId("moonshotai.kimi-k3")).toBe("moonshotai.kimi-k3")
	})
})

// Tranche A (fork/14-payload-fixes): regression coverage for D4 (temperature
// leaks), D5 (GPT-6.1 Sol context window), and D6 (K3 max-tokens cap + clamp).
// See plans/smoke-test-triage.md for the full root-cause analysis and fix
// specification this block implements.
describe("Tranche A: D4 temperature leaks (family predicates + catalog flag)", () => {
	it("isBedrockOpenAiFamily matches openai.gpt-* but excludes openai.gpt-oss-*", () => {
		expect(isBedrockOpenAiFamily("openai.gpt-6.1-sol")).toBe(true)
		expect(isBedrockOpenAiFamily("openai.gpt-6-sol")).toBe(true)
		expect(isBedrockOpenAiFamily("openai.gpt-5.6-sol")).toBe(true)
		// Unknown future id in the family - must still match (D5-style forward compat).
		expect(isBedrockOpenAiFamily("openai.gpt-6.1-terra")).toBe(true)
		// gpt-oss-* explicitly excluded: these models DO accept temperature today.
		expect(isBedrockOpenAiFamily("openai.gpt-oss-20b-1:0")).toBe(false)
		expect(isBedrockOpenAiFamily("openai.gpt-oss-120b-1:0")).toBe(false)
		// Non-OpenAI ids never match.
		expect(isBedrockOpenAiFamily("anthropic.claude-sonnet-5")).toBe(false)
		expect(isBedrockOpenAiFamily("moonshotai.kimi-k3")).toBe(false)
	})

	it("isBedrockMoonshotFamily matches moonshotai.* but NOT the sibling moonshot.* prefix", () => {
		expect(isBedrockMoonshotFamily("moonshotai.kimi-k3")).toBe(true)
		// Unknown future moonshotai id - must still match.
		expect(isBedrockMoonshotFamily("moonshotai.kimi-k4")).toBe(true)
		// The distinct "moonshot." (no "ai") vendor prefix must NOT match - these are
		// genuinely different ids on Bedrock (see the moonshot.kimi-k2-thinking block
		// above), and K2-thinking's temperature contract is unverified.
		expect(isBedrockMoonshotFamily("moonshot.kimi-k2-thinking")).toBe(false)
		expect(isBedrockMoonshotFamily("anthropic.claude-sonnet-5")).toBe(false)
	})

	it("D4a: an unknown openai.gpt-* id (guess path) resolves with supportsTemperature: false", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "openai.gpt-6.1-sol-style-unknown-variant",
			targetId: "openai.gpt-6.1-sol-style-unknown-variant",
		})
		expect(info.supportsTemperature).toBe(false)
	})

	it("D4a: the family predicate is prefix-robust - us./global. prefixes and :1m suffix all resolve to supportsTemperature: false for an unknown GPT id", () => {
		for (const targetId of [
			"us.openai.gpt-6.1-sol-unknown",
			"global.openai.gpt-6.1-sol-unknown",
			"openai.gpt-6.1-sol-unknown:1m",
		]) {
			const { info } = resolveBedrockModelInfo({ baseModelId: targetId, targetId })
			expect(info.supportsTemperature).toBe(false)
		}
	})

	it("D4b: moonshotai.kimi-k3 (and prefixed variants) resolve with supportsTemperature: false", () => {
		for (const targetId of ["moonshotai.kimi-k3", "us.moonshotai.kimi-k3", "global.moonshotai.kimi-k3"]) {
			const { info } = resolveBedrockModelInfo({ baseModelId: targetId, targetId })
			expect(info.supportsTemperature).toBe(false)
		}
	})

	it("openai.gpt-oss-* ids are unaffected by the family predicate (supportsTemperature stays undefined/unset)", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "openai.gpt-oss-120b-1:0",
			targetId: "openai.gpt-oss-120b-1:0",
		})
		expect(info.supportsTemperature).toBeUndefined()
	})

	it("existing listed GPT/Moonshot models are unchanged (still supportsTemperature: false from their own catalog entry)", () => {
		for (const id of ["openai.gpt-6-sol", "openai.gpt-5.6-sol", "moonshotai.kimi-k3"]) {
			const { info } = resolveBedrockModelInfo({ baseModelId: id, targetId: id })
			expect(info.supportsTemperature).toBe(false)
		}
	})

	it("unknown non-OpenAI/non-Moonshot ids are unchanged (supportsTemperature stays undefined, not forced false)", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "anthropic.claude-foo-unknown",
			targetId: "anthropic.claude-foo-unknown",
		})
		expect(info.supportsTemperature).toBeUndefined()
	})
})

describe("Tranche A: D5 GPT-6.1 Sol catalog entry", () => {
	it("exists in the catalog with the live-verified contract", () => {
		expect(bedrockModels).toHaveProperty("openai.gpt-6.1-sol")
		const info = bedrockModels["openai.gpt-6.1-sol"]
		expect(info.contextWindow).toBe(1_000_000)
		expect(info.maxTokens).toBe(131_072)
		expect(info.supportsTemperature).toBe(false)
		expect(info.supportsPromptCache).toBe(false)
		expect(info.supportsImages).toBe(true)
	})

	it("is a member of BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS and BEDROCK_GLOBAL_INFERENCE_MODEL_IDS", () => {
		expect(BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS as readonly string[]).toContain("openai.gpt-6.1-sol")
		expect(BEDROCK_GLOBAL_INFERENCE_MODEL_IDS as readonly string[]).toContain("openai.gpt-6.1-sol")
	})

	it("does NOT declare supportsReasoningEffort - the 'none' value is rejected by AWS for this model, unlike GPT-6 Sol/Luna, so effort metadata is deliberately deferred", () => {
		const info = bedrockModels["openai.gpt-6.1-sol"]
		expect((info as ModelInfo).supportsReasoningEffort).toBeUndefined()
	})

	it("resolves via resolveBedrockModelInfo with its catalog values intact for prefixed targets", () => {
		for (const targetId of ["us.openai.gpt-6.1-sol", "global.openai.gpt-6.1-sol"]) {
			const { info } = resolveBedrockModelInfo({ baseModelId: targetId, targetId })
			expect(info.contextWindow).toBe(1_000_000)
			expect(info.maxTokens).toBe(131_072)
			expect(info.supportsTemperature).toBe(false)
		}
	})
})

describe("Tranche A: D6 Kimi K3 max-tokens cap + clamp", () => {
	it("catalog maxTokens corrected to 128_000 (was 131_072, AWS rejects above 128_000)", () => {
		expect(bedrockModels["moonshotai.kimi-k3"].maxTokens).toBe(128_000)
	})

	it("clamps a modelMaxTokens override above the catalog cap down to the cap", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "moonshotai.kimi-k3",
			targetId: "moonshotai.kimi-k3",
			modelMaxTokens: 200_000,
		})
		expect(info.maxTokens).toBe(128_000)
	})

	it("honours a modelMaxTokens override below the catalog cap", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "moonshotai.kimi-k3",
			targetId: "moonshotai.kimi-k3",
			modelMaxTokens: 50_000,
		})
		expect(info.maxTokens).toBe(50_000)
	})

	it("honours a probe-sourced maxOutputTokensOverride even when it exceeds the catalog cap", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "moonshotai.kimi-k3",
			targetId: "moonshotai.kimi-k3",
			maxOutputTokensOverride: 160_000,
		})
		expect(info.maxTokens).toBe(160_000)
	})

	it("clamps modelMaxTokens to the probe-confirmed cap (not the lower static catalog cap) when both are present", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "moonshotai.kimi-k3",
			targetId: "moonshotai.kimi-k3",
			maxOutputTokensOverride: 160_000,
			modelMaxTokens: 200_000,
		})
		// 200_000 exceeds even the probe-confirmed 160_000, so it must clamp to 160_000,
		// not fall back to the lower static catalog value (128_000).
		expect(info.maxTokens).toBe(160_000)
	})

	it("still lets modelMaxTokens lower below a probe-confirmed cap for cost control", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "moonshotai.kimi-k3",
			targetId: "moonshotai.kimi-k3",
			maxOutputTokensOverride: 160_000,
			modelMaxTokens: 20_000,
		})
		expect(info.maxTokens).toBe(20_000)
	})
})
