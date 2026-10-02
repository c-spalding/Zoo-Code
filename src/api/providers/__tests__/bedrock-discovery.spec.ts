// T4: Bedrock dynamic discovery - unit tests for discoverBedrockTargets and its
// AWS control-plane plumbing (ListFoundationModelsCommand / ListInferenceProfilesCommand).
// Mocks @aws-sdk/client-bedrock and @aws-sdk/credential-providers following the same
// pattern used in bedrock.spec.ts for the runtime client.

const mockSend = vi.fn()

vi.mock("@aws-sdk/client-bedrock", () => {
	return {
		BedrockClient: vi.fn().mockImplementation(function (config: unknown) {
			return {
				config,
				send: mockSend,
			}
		}),
		ListFoundationModelsCommand: vi.fn().mockImplementation(function (input: unknown) {
			return { input, __type: "list-fm" }
		}),
		ListInferenceProfilesCommand: vi.fn().mockImplementation(function (input: unknown) {
			return { input, __type: "list-ip" }
		}),
	}
})

vi.mock("@aws-sdk/credential-providers", () => {
	const mockFromIni = vi.fn().mockReturnValue({
		accessKeyId: "profile-access-key",
		secretAccessKey: "profile-secret-key",
	})
	return { fromIni: mockFromIni }
})

import { BedrockClient } from "@aws-sdk/client-bedrock"
import { fromIni } from "@aws-sdk/credential-providers"
import type { ProviderSettings } from "@roo-code/types"
import { providerIdentifiers } from "@roo-code/types/provider-identifiers"

import { discoverBedrockTargets } from "../bedrock-discovery"

const mockBedrockClient = vi.mocked(BedrockClient)
const mockFromIni = vi.mocked(fromIni)

const baseOptions: ProviderSettings = {
	apiProvider: providerIdentifiers.bedrock,
	awsRegion: "us-east-1",
	awsAccessKey: "test-access-key",
	awsSecretKey: "test-secret-key",
}

describe("discoverBedrockTargets", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockSend.mockReset()
	})

	it("returns an empty array when no region is configured", async () => {
		const result = await discoverBedrockTargets({ apiProvider: providerIdentifiers.bedrock })
		expect(result).toEqual([])
		expect(mockBedrockClient).not.toHaveBeenCalled()
	})

	it("builds foundation-model targets from ListFoundationModelsCommand, filtering non-ON_DEMAND entries", async () => {
		mockSend.mockImplementation((command: { __type: string }) => {
			if (command.__type === "list-fm") {
				return Promise.resolve({
					modelSummaries: [
						{
							modelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
							modelName: "Claude 3.5 Sonnet",
							providerName: "Anthropic",
							modelArn:
								"arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
							inferenceTypesSupported: ["ON_DEMAND"],
						},
						{
							modelId: "moonshotai.kimi-k2-5",
							modelName: "Kimi K2.5",
							providerName: "Moonshot AI",
							inferenceTypesSupported: ["PROVISIONED"],
						},
					],
				})
			}
			return Promise.resolve({ inferenceProfileSummaries: [] })
		})

		const result = await discoverBedrockTargets(baseOptions)

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			id: "anthropic.claude-3-5-sonnet-20241022-v2:0",
			targetKind: "foundation-model",
			arn: "arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
		})
	})

	it("builds system-profile targets from ListInferenceProfilesCommand, filtering inactive entries and paginating", async () => {
		mockSend.mockImplementation((command: { __type: string; input?: { nextToken?: string } }) => {
			if (command.__type === "list-fm") {
				return Promise.resolve({ modelSummaries: [] })
			}
			if (!command.input?.nextToken) {
				return Promise.resolve({
					inferenceProfileSummaries: [
						{
							inferenceProfileId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
							inferenceProfileName: "US Claude 3.5 Sonnet",
							inferenceProfileArn:
								"arn:aws:bedrock:us-east-1::inference-profile/us.anthropic.claude-3-5-sonnet-20241022-v2:0",
							type: "SYSTEM_DEFINED",
							status: "ACTIVE",
							models: [
								{
									modelArn:
										"arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
								},
							],
						},
					],
					nextToken: "page-2",
				})
			}
			return Promise.resolve({
				inferenceProfileSummaries: [
					{
						inferenceProfileId: "inactive-profile",
						type: "SYSTEM_DEFINED",
						status: "DELETED",
						models: [],
					},
				],
			})
		})

		const result = await discoverBedrockTargets(baseOptions)

		expect(result).toHaveLength(1)
		expect(result[0]).toMatchObject({
			id: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
			targetKind: "system-profile",
			baseModelId: "anthropic.claude-3-5-sonnet-20241022-v2:0",
			isCrossRegion: true,
		})
	})

	it("dedupes targets sharing the same id and sorts foundation models before profiles", async () => {
		mockSend.mockImplementation((command: { __type: string }) => {
			if (command.__type === "list-fm") {
				return Promise.resolve({
					modelSummaries: [
						{
							modelId: "amazon.nova-lite-v1:0",
							modelName: "Nova Lite",
							inferenceTypesSupported: ["ON_DEMAND"],
						},
					],
				})
			}
			return Promise.resolve({
				inferenceProfileSummaries: [
					{
						inferenceProfileId: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
						type: "SYSTEM_DEFINED",
						status: "ACTIVE",
						models: [
							{
								modelArn:
									"arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-3-5-sonnet-20241022-v2:0",
							},
						],
					},
				],
			})
		})

		const result = await discoverBedrockTargets(baseOptions)

		expect(result.map((t) => t.targetKind)).toEqual(["foundation-model", "system-profile"])
	})

	it("expands 1M-capable targets into default + :1m variants", async () => {
		mockSend.mockImplementation((command: { __type: string }) => {
			if (command.__type === "list-fm") {
				return Promise.resolve({
					modelSummaries: [
						{
							modelId: "anthropic.claude-opus-4-6-v1",
							modelName: "Claude Opus 4.6",
							inferenceTypesSupported: ["ON_DEMAND"],
						},
					],
				})
			}
			return Promise.resolve({ inferenceProfileSummaries: [] })
		})

		const result = await discoverBedrockTargets(baseOptions)

		expect(result.map((t) => t.id)).toEqual(["anthropic.claude-opus-4-6-v1", "anthropic.claude-opus-4-6-v1:1m"])
	})

	it("configures direct access-key/secret-key credentials on the BedrockClient", async () => {
		mockSend.mockResolvedValue({ modelSummaries: [], inferenceProfileSummaries: [] })

		await discoverBedrockTargets(baseOptions)

		expect(mockBedrockClient).toHaveBeenCalledWith(
			expect.objectContaining({
				region: "us-east-1",
				credentials: expect.objectContaining({
					accessKeyId: "test-access-key",
					secretAccessKey: "test-secret-key",
				}),
			}),
		)
	})

	it("configures profile-based credentials via fromIni when awsUseProfile is set", async () => {
		mockSend.mockResolvedValue({ modelSummaries: [], inferenceProfileSummaries: [] })

		await discoverBedrockTargets({
			apiProvider: providerIdentifiers.bedrock,
			awsRegion: "us-east-1",
			awsUseProfile: true,
			awsProfile: "my-profile",
		})

		expect(mockFromIni).toHaveBeenCalledWith({ profile: "my-profile", ignoreCache: true })
	})

	it("configures API-key bearer auth when awsUseApiKey is set", async () => {
		mockSend.mockResolvedValue({ modelSummaries: [], inferenceProfileSummaries: [] })

		await discoverBedrockTargets({
			apiProvider: providerIdentifiers.bedrock,
			awsRegion: "us-east-1",
			awsUseApiKey: true,
			awsApiKey: "test-api-key",
		})

		expect(mockBedrockClient).toHaveBeenCalledWith(
			expect.objectContaining({
				token: { token: "test-api-key" },
				authSchemePreference: ["httpBearerAuth"],
			}),
		)
	})
})
