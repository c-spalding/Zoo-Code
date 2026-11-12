// npx vitest src/components/settings/providers/__tests__/BedrockThinkingBudget.d6ui.spec.tsx
//
// D6-UI (smoke-test-triage.md tranche B, B3) integration regression guard: unlike
// BedrockThinkingBudget.spec.tsx, this file does NOT mock `ThinkingBudget` - it renders
// the real component tree (BedrockThinkingBudget -> ThinkingBudget -> MaxOutputTokensControl)
// so we can assert the "Detect max output tokens" probe button is actually reachable in the
// DOM for a flagless Bedrock model (e.g. Kimi K3: no binary/budget/effort flags at all).
// Before the D6-UI fix, `supportsMaxTokens` was unset for these catalog entries, so
// ThinkingBudget's standalone max-output branch never rendered and the probe slot nested
// inside it was unreachable.

import { screen } from "@testing-library/react"

import { providerIdentifiers, type ModelInfo, type ProviderSettings } from "@roo-code/types"

import { render } from "@/utils/test-utils"

import { BedrockThinkingBudget } from "../BedrockThinkingBudget"

vi.mock("@src/components/ui/hooks/useBedrockMaxTokensProbe", () => ({
	useBedrockMaxTokensProbe: () => ({
		probe: vi.fn(),
		isProbing: false,
		lastResult: undefined,
		lastError: undefined,
		reset: vi.fn(),
	}),
}))

vi.mock("@src/components/ui/hooks/useSelectedModel", () => ({
	useSelectedModel: (apiConfiguration: ProviderSettings) => ({
		id: apiConfiguration?.apiModelId || "moonshotai.kimi-k3",
		provider: apiConfiguration?.apiProvider || providerIdentifiers.bedrock,
		info: undefined,
	}),
}))

describe("BedrockThinkingBudget (D6-UI integration, unmocked ThinkingBudget)", () => {
	// Mirrors the Bedrock catalog's moonshotai.kimi-k3 entry after the D6-UI fix: no
	// reasoning flags whatsoever, only supportsMaxTokens + a real maxTokens cap.
	const k3ModelInfo: ModelInfo = {
		maxTokens: 128_000,
		contextWindow: 1_048_576,
		supportsImages: true,
		supportsPromptCache: true,
		supportsTemperature: false,
		supportsMaxTokens: true,
	}

	it("renders the max-output-tokens control for a flagless model (K3) once supportsMaxTokens is set", () => {
		render(
			<BedrockThinkingBudget
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock, apiModelId: "moonshotai.kimi-k3" }}
				setApiConfigurationField={vi.fn()}
				modelInfo={k3ModelInfo}
				modelId="moonshotai.kimi-k3"
			/>,
		)

		expect(screen.getByTestId("max-output-tokens")).toBeInTheDocument()
	})

	it("makes the 'Detect max output tokens' probe button reachable for a flagless model (K3)", () => {
		render(
			<BedrockThinkingBudget
				apiConfiguration={{
					apiProvider: providerIdentifiers.bedrock,
					apiModelId: "moonshotai.kimi-k3",
					awsRegion: "us-east-1",
				}}
				setApiConfigurationField={vi.fn()}
				modelInfo={k3ModelInfo}
				modelId="moonshotai.kimi-k3"
			/>,
		)

		expect(screen.getByTestId("bedrock-max-tokens-detect")).toBeInTheDocument()
	})

	it("renders nothing (no max-output control) when supportsMaxTokens is absent, confirming the fix is what unlocks the control", () => {
		const flaglessWithoutMaxTokensFlag: ModelInfo = {
			maxTokens: 128_000,
			contextWindow: 1_048_576,
			supportsImages: true,
			supportsPromptCache: true,
			supportsTemperature: false,
			// supportsMaxTokens intentionally omitted - this is the pre-fix catalog shape.
		}

		render(
			<BedrockThinkingBudget
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock, apiModelId: "moonshotai.kimi-k3" }}
				setApiConfigurationField={vi.fn()}
				modelInfo={flaglessWithoutMaxTokensFlag}
				modelId="moonshotai.kimi-k3"
			/>,
		)

		expect(screen.queryByTestId("max-output-tokens")).not.toBeInTheDocument()
		expect(screen.queryByTestId("bedrock-max-tokens-detect")).not.toBeInTheDocument()
	})
})
