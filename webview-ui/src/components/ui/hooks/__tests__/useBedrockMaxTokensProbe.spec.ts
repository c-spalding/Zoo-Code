// npx vitest src/components/ui/hooks/__tests__/useBedrockMaxTokensProbe.spec.ts

vi.mock("@src/utils/vscode", () => ({
	vscode: {
		postMessage: vi.fn(),
	},
}))

import { act, renderHook, waitFor } from "@testing-library/react"

import { providerIdentifiers, type ProviderSettings } from "@roo-code/types"

import { vscode } from "@src/utils/vscode"

import { useBedrockMaxTokensProbe } from "../useBedrockMaxTokensProbe"

const apiConfiguration: ProviderSettings = {
	apiProvider: providerIdentifiers.bedrock,
	awsRegion: "us-east-1",
}

describe("useBedrockMaxTokensProbe", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.useRealTimers()
	})

	it("posts requestBedrockMaxTokensProbe with the model id and resolves on a matching response", async () => {
		const { result } = renderHook(() => useBedrockMaxTokensProbe())

		let probePromise: Promise<unknown>
		act(() => {
			probePromise = result.current.probe(apiConfiguration, "anthropic.claude-opus-4-7")
		})

		expect(vscode.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				type: "requestBedrockMaxTokensProbe",
				apiConfiguration,
				text: "anthropic.claude-opus-4-7",
			}),
		)

		await waitFor(() => expect(result.current.isProbing).toBe(true))

		const requestId = (vscode.postMessage as any).mock.calls[0][0].requestId

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "bedrockMaxTokensProbe",
						requestId,
						bedrockMaxTokensProbe: {
							maxOutputTokens: 8192,
							source: "accepted",
							attempts: 1,
							modelId: "anthropic.claude-opus-4-7",
						},
					},
				}),
			)
		})

		const resolved = await probePromise!
		expect(resolved).toEqual({
			maxOutputTokens: 8192,
			source: "accepted",
			attempts: 1,
			modelId: "anthropic.claude-opus-4-7",
		})

		await waitFor(() => expect(result.current.isProbing).toBe(false))
		expect(result.current.lastResult).toEqual({
			maxOutputTokens: 8192,
			source: "accepted",
			attempts: 1,
			modelId: "anthropic.claude-opus-4-7",
		})
		expect(result.current.lastError).toBeUndefined()
	})

	it("ignores messages for a different requestId", async () => {
		const { result } = renderHook(() => useBedrockMaxTokensProbe())

		act(() => {
			void result.current.probe(apiConfiguration, "anthropic.claude-opus-4-7")
		})

		await waitFor(() => expect(result.current.isProbing).toBe(true))

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "bedrockMaxTokensProbe",
						requestId: "some-other-request-id",
						bedrockMaxTokensProbe: {
							maxOutputTokens: 1,
							source: "accepted",
							attempts: 1,
							modelId: "anthropic.claude-opus-4-7",
						},
					},
				}),
			)
		})

		// The unrelated message must not resolve/settle the in-flight probe.
		expect(result.current.isProbing).toBe(true)
	})

	it("rejects and surfaces lastError when the extension host responds with an error", async () => {
		const { result } = renderHook(() => useBedrockMaxTokensProbe())

		let probePromise: Promise<unknown>
		act(() => {
			probePromise = result.current.probe(apiConfiguration, "anthropic.claude-opus-4-7")
		})

		const requestId = (vscode.postMessage as any).mock.calls[0][0].requestId

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "bedrockMaxTokensProbe",
						requestId,
						error: "AWS region is required to probe Bedrock max output tokens",
					},
				}),
			)
		})

		await expect(probePromise!).rejects.toThrow("AWS region is required to probe Bedrock max output tokens")

		await waitFor(() =>
			expect(result.current.lastError).toBe("AWS region is required to probe Bedrock max output tokens"),
		)
		expect(result.current.isProbing).toBe(false)
	})

	it("rejects when the response carries no payload and no error", async () => {
		const { result } = renderHook(() => useBedrockMaxTokensProbe())

		let probePromise: Promise<unknown>
		act(() => {
			probePromise = result.current.probe(apiConfiguration, "anthropic.claude-opus-4-7")
		})

		const requestId = (vscode.postMessage as any).mock.calls[0][0].requestId

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "bedrockMaxTokensProbe",
						requestId,
					},
				}),
			)
		})

		await expect(probePromise!).rejects.toThrow("Bedrock max output tokens probe returned no payload")
	})

	it("times out after 90s when no response is received", async () => {
		vi.useFakeTimers()
		const { result } = renderHook(() => useBedrockMaxTokensProbe())

		let probePromise: Promise<unknown>
		act(() => {
			probePromise = result.current.probe(apiConfiguration, "anthropic.claude-opus-4-7")
		})

		act(() => {
			vi.advanceTimersByTime(90_000)
		})

		await expect(probePromise!).rejects.toThrow("Bedrock max output tokens probe timed out")
		vi.useRealTimers()
	})

	it("supersedes a prior in-flight probe when probe() is called again", async () => {
		const { result } = renderHook(() => useBedrockMaxTokensProbe())

		let firstProbePromise: Promise<unknown>
		act(() => {
			firstProbePromise = result.current.probe(apiConfiguration, "model-a")
		})
		const firstRequestId = (vscode.postMessage as any).mock.calls[0][0].requestId

		let secondProbePromise: Promise<unknown>
		act(() => {
			secondProbePromise = result.current.probe(apiConfiguration, "model-b")
		})
		const secondRequestId = (vscode.postMessage as any).mock.calls[1][0].requestId

		expect(firstRequestId).not.toBe(secondRequestId)

		// A late response for the superseded first request must not resolve anything,
		// since its listener was already removed when the second probe() call started.
		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "bedrockMaxTokensProbe",
						requestId: firstRequestId,
						bedrockMaxTokensProbe: {
							maxOutputTokens: 1,
							source: "accepted",
							attempts: 1,
							modelId: "model-a",
						},
					},
				}),
			)
		})

		act(() => {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "bedrockMaxTokensProbe",
						requestId: secondRequestId,
						bedrockMaxTokensProbe: {
							maxOutputTokens: 2,
							source: "accepted",
							attempts: 1,
							modelId: "model-b",
						},
					},
				}),
			)
		})

		const resolved = await secondProbePromise!
		expect(resolved).toEqual({ maxOutputTokens: 2, source: "accepted", attempts: 1, modelId: "model-b" })

		// The first probe's promise should remain pending forever (never resolved/rejected);
		// we only assert that the second one settled correctly without throwing.
		void firstProbePromise!
	})

	it("reset() clears state and removes any pending listener/timeout", async () => {
		const { result } = renderHook(() => useBedrockMaxTokensProbe())

		act(() => {
			void result.current.probe(apiConfiguration, "anthropic.claude-opus-4-7").catch(() => undefined)
		})

		await waitFor(() => expect(result.current.isProbing).toBe(true))

		act(() => {
			result.current.reset()
		})

		expect(result.current.isProbing).toBe(false)
		expect(result.current.lastResult).toBeUndefined()
		expect(result.current.lastError).toBeUndefined()
	})
})
