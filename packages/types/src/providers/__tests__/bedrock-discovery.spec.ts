// T4: Bedrock dynamic discovery - unit tests for the shared pure helpers.
// Ported from the archive fork's packages/types/src/__tests__/bedrock.spec.ts,
// scoped to ONLY the describe blocks relevant to this tranche
// (resolveBedrockModelInfo, expandBedrockTargetsWith1MVariants). The archive's
// "Bedrock model catalog" describe block tested BEDROCK_ADAPTIVE_THINKING_MODEL_IDS,
// BEDROCK_NATIVE_1M_CONTEXT_MODEL_IDS, and catalog entries (opus-4-7/4-8, fable-5,
// mythos-5, sonnet-5) that are superseded by T3's catalog work and are NOT re-ported
// here; see fork-docs/fork-feature-inventory.md (T4) for the reconciliation notes.

import {
	resolveBedrockModelInfo,
	expandBedrockTargetsWith1MVariants,
	type BedrockDiscoveredTarget,
} from "../bedrock.js"

describe("resolveBedrockModelInfo", () => {
	it("prefers the static maxTokens when no override is set", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "anthropic.claude-opus-4-7",
			targetId: "anthropic.claude-opus-4-7",
		})
		expect(info.maxTokens).toBe(8192)
	})

	it("applies maxOutputTokensOverride above the static cap", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "anthropic.claude-opus-4-7",
			targetId: "anthropic.claude-opus-4-7",
			maxOutputTokensOverride: 256_000,
		})
		expect(info.maxTokens).toBe(256_000)
	})

	it("lets request-time modelMaxTokens still override (lowering for cost control)", () => {
		const { info } = resolveBedrockModelInfo({
			baseModelId: "anthropic.claude-opus-4-7",
			targetId: "anthropic.claude-opus-4-7",
			maxOutputTokensOverride: 256_000,
			modelMaxTokens: 32_000,
		})
		expect(info.maxTokens).toBe(32_000)
	})
})

describe("expandBedrockTargetsWith1MVariants", () => {
	const makeTarget = (overrides: Partial<BedrockDiscoveredTarget> = {}): BedrockDiscoveredTarget => ({
		id: "anthropic.claude-opus-4-6-v1",
		label: "Claude Opus 4.6",
		baseModelId: "anthropic.claude-opus-4-6-v1",
		targetKind: "foundation-model",
		contextWindow: 200_000,
		contextSource: "base",
		...overrides,
	})

	it("emits two entries for a 1M-capable base target: default + :1m variant", () => {
		const result = expandBedrockTargetsWith1MVariants([makeTarget()])

		expect(result).toHaveLength(2)
		expect(result[0]).toMatchObject({ id: "anthropic.claude-opus-4-6-v1", contextWindow: 200_000 })
		expect(result[1]).toMatchObject({
			id: "anthropic.claude-opus-4-6-v1:1m",
			contextWindow: 1_000_000,
			contextSource: "profile-id",
		})
		expect(result[1]!.label).toContain("(1M context)")
	})

	it("also emits two entries when AWS discovery returns a system profile id", () => {
		const result = expandBedrockTargetsWith1MVariants([
			makeTarget({
				id: "us.anthropic.claude-opus-4-6-v1",
				label: "Claude Opus 4.6 (US)",
				targetKind: "system-profile",
			}),
		])

		expect(result).toHaveLength(2)
		expect(result[0]!.id).toBe("us.anthropic.claude-opus-4-6-v1")
		expect(result[1]!.id).toBe("us.anthropic.claude-opus-4-6-v1:1m")
		expect(result[1]!.contextWindow).toBe(1_000_000)
	})

	it("leaves non-1M-capable targets untouched", () => {
		const result = expandBedrockTargetsWith1MVariants([
			makeTarget({
				id: "amazon.nova-lite-v1:0",
				label: "Amazon Nova Lite",
				baseModelId: "amazon.nova-lite-v1:0",
				contextWindow: 300_000,
			}),
		])

		expect(result).toHaveLength(1)
		expect(result[0]!.id).toBe("amazon.nova-lite-v1:0")
	})

	it("does not double-expand a target that already represents the 1M variant", () => {
		const result = expandBedrockTargetsWith1MVariants([
			makeTarget({
				id: "anthropic.claude-opus-4-6-v1:1m",
				label: "Claude Opus 4.6 (1M context)",
				contextWindow: 1_000_000,
				contextSource: "profile-id",
			}),
		])

		expect(result).toHaveLength(1)
		expect(result[0]!.id).toBe("anthropic.claude-opus-4-6-v1:1m")
	})
})
