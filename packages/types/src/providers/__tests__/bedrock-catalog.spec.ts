// T2 (fork/02-bedrock-catalog): regression coverage for the Kimi K2-thinking
// catalog-key premise check. See fork-docs/fork-feature-inventory.md section 5
// (T2) for the full decision trail.
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

import { bedrockModels, parseBedrockBaseModelId, resolveBedrockModelInfo } from "../bedrock.js"

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
