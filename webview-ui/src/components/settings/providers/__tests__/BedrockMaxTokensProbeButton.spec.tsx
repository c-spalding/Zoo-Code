// npx vitest src/components/settings/providers/__tests__/BedrockMaxTokensProbeButton.spec.tsx

import { render, screen, fireEvent, waitFor } from "@testing-library/react"

import { providerIdentifiers, type ProviderSettings } from "@roo-code/types"

import type { BedrockMaxTokensProbeResult } from "@src/components/ui/hooks/useBedrockMaxTokensProbe"

import { useBedrockMaxTokensProbeUi } from "../BedrockMaxTokensProbeButton"

interface UseBedrockMaxTokensProbeMockReturn {
	probe: (...args: unknown[]) => Promise<BedrockMaxTokensProbeResult>
	isProbing: boolean
	lastResult: BedrockMaxTokensProbeResult | undefined
	lastError: string | undefined
	reset: () => void
}

const probeMock = vi.hoisted(() => vi.fn())
const useBedrockMaxTokensProbeMock = vi.hoisted(() =>
	vi.fn(
		(): UseBedrockMaxTokensProbeMockReturn => ({
			probe: probeMock,
			isProbing: false,
			lastResult: undefined,
			lastError: undefined,
			reset: vi.fn(),
		}),
	),
)

vi.mock("@src/components/ui/hooks/useBedrockMaxTokensProbe", () => ({
	useBedrockMaxTokensProbe: useBedrockMaxTokensProbeMock,
}))

vi.mock("@src/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string, options?: Record<string, unknown>) => (options ? `${key} ${JSON.stringify(options)}` : key),
	}),
}))

vi.mock("@src/components/ui", () => ({
	Button: ({ children, onClick, disabled, "data-testid": testId }: any) => (
		<button data-testid={testId} onClick={onClick} disabled={disabled}>
			{children}
		</button>
	),
	StandardTooltip: ({ children }: any) => <>{children}</>,
}))

// Minimal harness so hooks (which must run inside a component) can be exercised and the
// returned `buttonSlot`/`helperText` render output asserted against.
function Harness({
	apiConfiguration,
	setApiConfigurationField,
	modelId,
}: {
	apiConfiguration: ProviderSettings
	setApiConfigurationField: (field: string, value: unknown) => void
	modelId?: string
}) {
	const { buttonSlot, helperText } = useBedrockMaxTokensProbeUi({
		apiConfiguration,
		setApiConfigurationField: setApiConfigurationField as any,
		modelId,
	})
	return (
		<div>
			{buttonSlot}
			{helperText}
		</div>
	)
}

describe("useBedrockMaxTokensProbeUi", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		useBedrockMaxTokensProbeMock.mockReturnValue({
			probe: probeMock,
			isProbing: false,
			lastResult: undefined,
			lastError: undefined,
			reset: vi.fn(),
		})
	})

	it("disables Detect when no AWS region is configured", () => {
		render(
			<Harness
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock, apiModelId: "anthropic.claude-opus-4-7" }}
				setApiConfigurationField={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("bedrock-max-tokens-detect")).toBeDisabled()
	})

	it("enables Detect once a region and model id are present", () => {
		render(
			<Harness
				apiConfiguration={{
					apiProvider: providerIdentifiers.bedrock,
					apiModelId: "anthropic.claude-opus-4-7",
					awsRegion: "us-east-1",
				}}
				setApiConfigurationField={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("bedrock-max-tokens-detect")).not.toBeDisabled()
	})

	it("does not render the Reset button when no override is set", () => {
		render(
			<Harness
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock, awsRegion: "us-east-1" }}
				setApiConfigurationField={vi.fn()}
			/>,
		)

		expect(screen.queryByTestId("bedrock-max-tokens-reset")).not.toBeInTheDocument()
	})

	it("renders an enabled Reset button when awsModelMaxOutputTokens is set", () => {
		render(
			<Harness
				apiConfiguration={{
					apiProvider: providerIdentifiers.bedrock,
					awsRegion: "us-east-1",
					awsModelMaxOutputTokens: 8192,
				}}
				setApiConfigurationField={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("bedrock-max-tokens-reset")).not.toBeDisabled()
	})

	it("clicking Reset clears awsModelMaxOutputTokens", () => {
		const setApiConfigurationField = vi.fn()
		render(
			<Harness
				apiConfiguration={{
					apiProvider: providerIdentifiers.bedrock,
					awsRegion: "us-east-1",
					awsModelMaxOutputTokens: 8192,
				}}
				setApiConfigurationField={setApiConfigurationField}
			/>,
		)

		fireEvent.click(screen.getByTestId("bedrock-max-tokens-reset"))

		expect(setApiConfigurationField).toHaveBeenCalledWith("awsModelMaxOutputTokens", undefined)
	})

	it("clicking Detect resolves the invoke target id and persists the detected cap", async () => {
		const setApiConfigurationField = vi.fn()
		probeMock.mockResolvedValue({
			maxOutputTokens: 32000,
			source: "hint",
			attempts: 2,
			modelId: "us.anthropic.claude-opus-4-7",
		})

		render(
			<Harness
				apiConfiguration={{
					apiProvider: providerIdentifiers.bedrock,
					apiModelId: "anthropic.claude-opus-4-7",
					awsRegion: "us-east-1",
					awsUseCrossRegionInference: true,
				}}
				setApiConfigurationField={setApiConfigurationField}
			/>,
		)

		fireEvent.click(screen.getByTestId("bedrock-max-tokens-detect"))

		await waitFor(() => expect(setApiConfigurationField).toHaveBeenCalledWith("awsModelMaxOutputTokens", 32000))
	})

	it("lowers an existing modelMaxTokens value that now exceeds the detected cap", async () => {
		const setApiConfigurationField = vi.fn()
		probeMock.mockResolvedValue({
			maxOutputTokens: 4096,
			source: "binary-search",
			attempts: 5,
			modelId: "anthropic.claude-opus-4-7",
		})

		render(
			<Harness
				apiConfiguration={{
					apiProvider: providerIdentifiers.bedrock,
					apiModelId: "anthropic.claude-opus-4-7",
					awsRegion: "us-east-1",
					modelMaxTokens: 8192,
				}}
				setApiConfigurationField={setApiConfigurationField}
			/>,
		)

		fireEvent.click(screen.getByTestId("bedrock-max-tokens-detect"))

		await waitFor(() => expect(setApiConfigurationField).toHaveBeenCalledWith("awsModelMaxOutputTokens", 4096))
		expect(setApiConfigurationField).toHaveBeenCalledWith("modelMaxTokens", 4096)
	})

	it("does not raise an existing modelMaxTokens value that is already below the detected cap", async () => {
		const setApiConfigurationField = vi.fn()
		probeMock.mockResolvedValue({
			maxOutputTokens: 32000,
			source: "accepted",
			attempts: 1,
			modelId: "anthropic.claude-opus-4-7",
		})

		render(
			<Harness
				apiConfiguration={{
					apiProvider: providerIdentifiers.bedrock,
					apiModelId: "anthropic.claude-opus-4-7",
					awsRegion: "us-east-1",
					modelMaxTokens: 4096,
				}}
				setApiConfigurationField={setApiConfigurationField}
			/>,
		)

		fireEvent.click(screen.getByTestId("bedrock-max-tokens-detect"))

		await waitFor(() => expect(setApiConfigurationField).toHaveBeenCalledWith("awsModelMaxOutputTokens", 32000))
		expect(setApiConfigurationField).not.toHaveBeenCalledWith("modelMaxTokens", expect.anything())
	})

	it("shows the probing status text while isProbing is true", () => {
		useBedrockMaxTokensProbeMock.mockReturnValue({
			probe: probeMock,
			isProbing: true,
			lastResult: undefined,
			lastError: undefined,
			reset: vi.fn(),
		})

		render(
			<Harness
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock, awsRegion: "us-east-1" }}
				setApiConfigurationField={vi.fn()}
			/>,
		)

		// Both the Detect button label and the helper text read "...Probing" while probing;
		// assert there are at least two matches rather than requiring exactly one.
		expect(screen.getAllByText("settings:providers.bedrock.detectMaxTokensProbing").length).toBeGreaterThanOrEqual(
			2,
		)
		expect(screen.getByTestId("bedrock-max-tokens-detect")).toBeDisabled()
	})

	it("shows an error message when lastError is set", () => {
		useBedrockMaxTokensProbeMock.mockReturnValue({
			probe: probeMock,
			isProbing: false,
			lastResult: undefined,
			lastError: "boom",
			reset: vi.fn(),
		})

		render(
			<Harness
				apiConfiguration={{ apiProvider: providerIdentifiers.bedrock, awsRegion: "us-east-1" }}
				setApiConfigurationField={vi.fn()}
			/>,
		)

		expect(screen.getByText(/settings:providers\.bedrock\.detectMaxTokensError/)).toBeInTheDocument()
	})

	it("shows the override-active helper text when a stored override exists and no fresh result/error", () => {
		render(
			<Harness
				apiConfiguration={{
					apiProvider: providerIdentifiers.bedrock,
					awsRegion: "us-east-1",
					awsModelMaxOutputTokens: 16384,
				}}
				setApiConfigurationField={vi.fn()}
			/>,
		)

		expect(screen.getByText(/settings:providers\.bedrock\.detectMaxTokensOverrideActive/)).toBeInTheDocument()
	})
})
