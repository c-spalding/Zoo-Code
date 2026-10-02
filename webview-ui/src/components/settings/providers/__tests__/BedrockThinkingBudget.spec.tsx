// npx vitest src/components/settings/providers/__tests__/BedrockThinkingBudget.spec.tsx

import { render, screen } from "@testing-library/react"

import { providerIdentifiers, type ModelInfo, type ProviderSettings } from "@roo-code/types"

import { BedrockThinkingBudget } from "../BedrockThinkingBudget"

const useBedrockMaxTokensProbeUiMock = vi.hoisted(() => vi.fn())

vi.mock("../BedrockMaxTokensProbeButton", () => ({
	useBedrockMaxTokensProbeUi: useBedrockMaxTokensProbeUiMock,
}))

vi.mock("../../ThinkingBudget", () => ({
	ThinkingBudget: (props: any) => (
		<div data-testid="thinking-budget">
			<span data-testid="enhanced-flag">{String(!!props.useEnhancedMaxOutputControl)}</span>
			<div data-testid="extra-slot">{props.maxOutputTokensExtraSlot}</div>
			<div data-testid="helper-text">{props.maxOutputTokensHelperText}</div>
		</div>
	),
}))

describe("BedrockThinkingBudget", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		useBedrockMaxTokensProbeUiMock.mockReturnValue({
			buttonSlot: <button>Detect</button>,
			helperText: "status text",
		})
	})

	it("mounts the probe hook with the given apiConfiguration/setApiConfigurationField/modelId", () => {
		const apiConfiguration: ProviderSettings = { apiProvider: providerIdentifiers.bedrock, awsRegion: "us-east-1" }
		const setApiConfigurationField = vi.fn()

		render(
			<BedrockThinkingBudget
				apiConfiguration={apiConfiguration}
				setApiConfigurationField={setApiConfigurationField}
				modelInfo={{ supportsReasoningBudget: true } as ModelInfo}
				modelId="anthropic.claude-opus-4-7"
			/>,
		)

		expect(useBedrockMaxTokensProbeUiMock).toHaveBeenCalledWith({
			apiConfiguration,
			setApiConfigurationField,
			modelId: "anthropic.claude-opus-4-7",
		})
	})

	it("renders ThinkingBudget with useEnhancedMaxOutputControl enabled", () => {
		render(
			<BedrockThinkingBudget
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock }}
				setApiConfigurationField={vi.fn()}
				modelInfo={{ supportsReasoningBudget: true } as ModelInfo}
			/>,
		)

		expect(screen.getByTestId("enhanced-flag")).toHaveTextContent("true")
	})

	it("passes the probe UI's buttonSlot through as maxOutputTokensExtraSlot", () => {
		render(
			<BedrockThinkingBudget
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock }}
				setApiConfigurationField={vi.fn()}
				modelInfo={{ supportsReasoningBudget: true } as ModelInfo}
			/>,
		)

		expect(screen.getByTestId("extra-slot")).toHaveTextContent("Detect")
	})

	it("passes the probe UI's helperText through as maxOutputTokensHelperText", () => {
		render(
			<BedrockThinkingBudget
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock }}
				setApiConfigurationField={vi.fn()}
				modelInfo={{ supportsReasoningBudget: true } as ModelInfo}
			/>,
		)

		expect(screen.getByTestId("helper-text")).toHaveTextContent("status text")
	})

	it("forwards apiConfiguration and modelInfo through to ThinkingBudget", () => {
		render(
			<BedrockThinkingBudget
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock }}
				setApiConfigurationField={vi.fn()}
				modelInfo={{ supportsReasoningBudget: true } as ModelInfo}
			/>,
		)

		expect(screen.getByTestId("thinking-budget")).toBeInTheDocument()
	})
})
