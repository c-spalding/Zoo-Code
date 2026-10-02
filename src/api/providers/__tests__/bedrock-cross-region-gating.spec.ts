// npx vitest run src/api/providers/__tests__/bedrock-cross-region-gating.spec.ts
//
// T4 (fork/04-bedrock-discovery) Commit (e): covers the two code paths that were NOT
// exercised by the pre-existing bedrock*.spec.ts suites after the getModel()/getModelById()
// rework:
//
//   1. The cross-region inference profile id *allowlist gating* itself. Every pre-existing
//      test that enables `awsUseCrossRegionInference` relies on the fire-and-forget
//      `ListInferenceProfilesCommand` lookup being blocked by the test environment's Nock
//      network guard (no `@aws-sdk/client-bedrock` mock is registered in those files), which
//      makes `crossRegionProfileIdsResolved` resolve to `null` and therefore always takes the
//      `profiles == null` ("preserve legacy behavior, apply prefix unconditionally") branch.
//      That means the POSITIVE gating branch - where AWS has confirmed a regional profile
//      does or does not exist - has never been exercised. This file mocks
//      `@aws-sdk/client-bedrock` directly so both outcomes of that gate can be asserted.
//   2. The explicit `awsBedrockInvokeTarget` / `awsBedrockTargetKind` selection branches of
//      the reworked `getModel()` (system-profile / application-profile / prompt-router),
//      which bypass the Global/cross-region toggles entirely and invoke the configured
//      target id directly (stripping the synthetic `:1m` UI suffix).

const mockRuntimeSend = vitest.fn().mockResolvedValue({ stream: [] })

vitest.mock("@aws-sdk/client-bedrock-runtime", () => {
	return {
		BedrockRuntimeClient: vitest.fn().mockImplementation(function () {
			return { send: mockRuntimeSend }
		}),
		ConverseCommand: vitest.fn(),
		ConverseStreamCommand: vitest.fn(),
	}
})

const mockControlSend = vitest.fn()

vitest.mock("@aws-sdk/client-bedrock", () => {
	return {
		BedrockClient: vitest.fn().mockImplementation(function (config: unknown) {
			return { config, send: mockControlSend }
		}),
		ListInferenceProfilesCommand: vitest.fn().mockImplementation(function (input: unknown) {
			return { input, __type: "list-inference-profiles" }
		}),
	}
})

vitest.mock("@aws-sdk/credential-providers", () => ({
	fromIni: vitest.fn().mockReturnValue({
		accessKeyId: "profile-access-key",
		secretAccessKey: "profile-secret-key",
	}),
}))

import { BedrockClient } from "@aws-sdk/client-bedrock"
import { AwsBedrockHandler } from "../bedrock"
import { ApiHandlerOptions } from "../../../shared/api"

const mockBedrockClient = vitest.mocked(BedrockClient)

describe("Bedrock cross-region inference profile id allowlist gating", () => {
	const createHandler = (options: Partial<ApiHandlerOptions> = {}) => {
		const defaultOptions: ApiHandlerOptions = {
			apiModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
			awsAccessKey: "test-access-key",
			awsSecretKey: "test-secret-key",
			awsRegion: "us-east-1",
			...options,
		}
		return new AwsBedrockHandler(defaultOptions)
	}

	beforeEach(() => {
		vitest.clearAllMocks()
		mockControlSend.mockReset()
		mockRuntimeSend.mockReset().mockResolvedValue({ stream: [] })
	})

	describe("positive/negative gating outcomes", () => {
		it("applies the cross-region prefix once AWS confirms the regional profile exists", async () => {
			mockControlSend.mockResolvedValue({
				inferenceProfileSummaries: [{ inferenceProfileId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0" }],
			})

			const handler = createHandler({ awsUseCrossRegionInference: true })
			await handler["crossRegionProfileIdsPromise"]

			expect(handler.getModel().id).toBe("us.anthropic.claude-3-5-sonnet-20241022-v2:0")
		})

		it("withholds the cross-region prefix when AWS has NOT published the regional profile, falling back to the bare foundation-model id", async () => {
			// A real profile is present, just not one that matches the candidate id - this is
			// the "brand-new foundation model, profile not published yet" scenario.
			mockControlSend.mockResolvedValue({
				inferenceProfileSummaries: [{ inferenceProfileId: "us.some-other-model-v1:0" }],
			})

			const handler = createHandler({ awsUseCrossRegionInference: true })
			await handler["crossRegionProfileIdsPromise"]

			expect(handler.getModel().id).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0")
		})

		it("merges multiple paginated ListInferenceProfiles pages before deciding", async () => {
			mockControlSend
				.mockResolvedValueOnce({
					inferenceProfileSummaries: [{ inferenceProfileId: "us.some-other-model-v1:0" }],
					nextToken: "page-2",
				})
				.mockResolvedValueOnce({
					inferenceProfileSummaries: [{ inferenceProfileId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0" }],
				})

			const handler = createHandler({ awsUseCrossRegionInference: true })
			await handler["crossRegionProfileIdsPromise"]

			expect(mockControlSend).toHaveBeenCalledTimes(2)
			expect(handler.getModel().id).toBe("us.anthropic.claude-3-5-sonnet-20241022-v2:0")
		})

		it("falls back to legacy unconditional-prefix behavior when discovery fails (e.g. missing bedrock:ListInferenceProfiles permission)", async () => {
			mockControlSend.mockRejectedValue(new Error("AccessDeniedException"))

			const handler = createHandler({ awsUseCrossRegionInference: true })
			await handler["crossRegionProfileIdsPromise"]

			// Discovery was attempted (not silently skipped) but failure must not break
			// existing users - the prefix is still applied as it always was pre-T4.
			expect(mockControlSend).toHaveBeenCalled()
			expect(handler.getModel().id).toBe("us.anthropic.claude-3-5-sonnet-20241022-v2:0")
		})

		it("does not call ListInferenceProfiles when cross-region inference is disabled", () => {
			const handler = createHandler({ awsUseCrossRegionInference: false })

			expect(mockBedrockClient).not.toHaveBeenCalled()
			expect(mockControlSend).not.toHaveBeenCalled()
			expect(handler.getModel().id).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0")
		})

		it("does not call ListInferenceProfiles when no region is configured", () => {
			createHandler({ awsRegion: undefined, awsUseCrossRegionInference: true })

			expect(mockBedrockClient).not.toHaveBeenCalled()
			expect(mockControlSend).not.toHaveBeenCalled()
		})

		it("configures API-key bearer auth on the control-plane client when awsUseApiKey is set", async () => {
			mockControlSend.mockResolvedValue({ inferenceProfileSummaries: [] })

			const handler = createHandler({
				awsUseCrossRegionInference: true,
				awsUseApiKey: true,
				awsApiKey: "test-api-key",
				awsAccessKey: undefined,
				awsSecretKey: undefined,
			})
			await handler["crossRegionProfileIdsPromise"]

			expect(mockBedrockClient).toHaveBeenCalledWith(
				expect.objectContaining({
					token: { token: "test-api-key" },
					authSchemePreference: ["httpBearerAuth"],
				}),
			)
		})
	})

	describe("createMessage awaits the discovery lookup before computing the model id", () => {
		it("gates the prefix using the AWS-confirmed result even though discovery was still pending at construction time", async () => {
			let resolveDiscovery: (value: unknown) => void = () => {}
			mockControlSend.mockImplementation(
				() =>
					new Promise((resolve) => {
						resolveDiscovery = resolve
					}),
			)

			const handler = createHandler({ awsUseCrossRegionInference: true })

			const generator = handler.createMessage("", [{ role: "user", content: "hi" }])
			const nextPromise = generator.next()

			// Resolve discovery with a set that EXCLUDES the candidate id, after createMessage
			// has already started (and is awaiting crossRegionProfileIdsPromise).
			resolveDiscovery({ inferenceProfileSummaries: [{ inferenceProfileId: "us.some-other-model-v1:0" }] })

			await nextPromise

			expect(handler.getModel().id).toBe("anthropic.claude-3-5-sonnet-20241022-v2:0")
		})
	})

	describe("explicit awsBedrockInvokeTarget / awsBedrockTargetKind selection", () => {
		it("invokes a system-profile target directly, bypassing the cross-region/global toggles", () => {
			const handler = createHandler({
				awsBedrockInvokeTarget: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsBedrockTargetKind: "system-profile",
				awsUseCrossRegionInference: false,
			})

			expect(handler.getModel().id).toBe("us.anthropic.claude-3-5-sonnet-20241022-v2:0")
			expect(mockBedrockClient).not.toHaveBeenCalled()
		})

		it("strips the synthetic :1m suffix from a selected profile target id and applies 1M-tier pricing", () => {
			const handler = createHandler({
				awsBedrockInvokeTarget: "us.anthropic.claude-sonnet-4-6:1m",
				awsBedrockTargetKind: "system-profile",
				awsUseCrossRegionInference: false,
				awsBedrock1MContext: true,
			})

			const model = handler.getModel()
			expect(model.id).toBe("us.anthropic.claude-sonnet-4-6")
			expect(model.info.contextWindow).toBe(1_000_000)
		})

		it("invokes an application-profile target directly", () => {
			const handler = createHandler({
				awsBedrockInvokeTarget:
					"arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-app-profile",
				awsBedrockTargetKind: "application-profile",
			})

			expect(handler.getModel().id).toBe(
				"arn:aws:bedrock:us-east-1:123456789012:application-inference-profile/my-app-profile",
			)
		})

		it("invokes a prompt-router target directly, keeping the full ARN as the model id", () => {
			const handler = createHandler({
				awsBedrockInvokeTarget: "arn:aws:bedrock:us-east-1:123456789012:prompt-router/my-router",
				awsBedrockTargetKind: "prompt-router",
			})

			expect(handler.getModel().id).toBe("arn:aws:bedrock:us-east-1:123456789012:prompt-router/my-router")
		})

		it("infers the system-profile kind automatically from a region-prefixed invoke target without an explicit awsBedrockTargetKind", () => {
			const handler = createHandler({
				awsBedrockInvokeTarget: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
				awsUseCrossRegionInference: false,
			})

			// No gating lookup should occur - the implicit "system-profile" kind routes
			// straight to getModelById(), bypassing the foundation-model/cross-region branch.
			expect(mockBedrockClient).not.toHaveBeenCalled()
			expect(handler.getModel().id).toBe("us.anthropic.claude-3-5-sonnet-20241022-v2:0")
		})

		it("infers the system-profile kind automatically from a global.-prefixed invoke target", () => {
			const handler = createHandler({
				awsBedrockInvokeTarget: "global.anthropic.claude-3-5-sonnet-20241022-v2:0",
			})

			expect(handler.getModel().id).toBe("global.anthropic.claude-3-5-sonnet-20241022-v2:0")
		})
	})
})
