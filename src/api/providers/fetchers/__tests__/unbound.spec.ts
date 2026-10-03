// npx vitest run api/providers/fetchers/__tests__/unbound.spec.ts

import axios from "axios"

import { getUnboundModels } from "../unbound"

vi.mock("axios")
const mockAxiosGet = vi.mocked(axios.get)

it("passes the caller's abort signal to the catalog request", async () => {
	const controller = new AbortController()
	mockAxiosGet.mockResolvedValueOnce({ data: [] })

	await getUnboundModels("test-api-key", { signal: controller.signal })

	expect(mockAxiosGet).toHaveBeenCalledWith("https://api.getunbound.ai/models", {
		headers: { Authorization: "Bearer test-api-key" },
		signal: controller.signal,
	})
})

it("rejects with an AbortError when the signal aborts the pending request", async () => {
	const controller = new AbortController()
	mockAxiosGet.mockImplementation((_url, config) => {
		// Mirror the HTTP client: a request rejects when its signal fires,
		// including when the signal was already aborted when the request started.
		return new Promise<never>((_resolve, reject) => {
			if (config?.signal?.aborted) {
				reject(new Error("canceled"))
				return
			}
			config?.signal?.addEventListener?.("abort", () => reject(new Error("canceled")), { once: true })
		})
	})

	const fetchPromise = getUnboundModels(undefined, { signal: controller.signal })
	controller.abort()

	await expect(fetchPromise).rejects.toMatchObject({ name: "AbortError" })
})

// Regression test: Unbound has been observed returning a non-array payload
// (e.g. an error envelope or keyed object map) from /models, which previously
// crashed the for...of loop with "rawModels is not iterable" and surfaced as
// an unhandled rejection that could restart the dev extension host.
it.each([
	["an error envelope object", { error: "rate limited" }],
	["a keyed object map", { "model-a": { id: "model-a" } }],
	["null", null],
	["a string", "unexpected"],
])("returns an empty model list without throwing when response.data.data is %s", async (_case, data) => {
	mockAxiosGet.mockResolvedValueOnce({ data: { data } })

	const result = await getUnboundModels("test-api-key")

	expect(result).toEqual({})
})

it("returns an empty model list without throwing when response.data itself is non-array", async () => {
	// Exercises the `response.data?.data ?? response.data` fallback branch,
	// where `data` is omitted entirely and `response.data` itself is the
	// unexpected non-array shape.
	mockAxiosGet.mockResolvedValueOnce({ data: { error: "unavailable" } })

	const result = await getUnboundModels("test-api-key")

	expect(result).toEqual({})
})

it("still parses a well-formed array response after the guard", async () => {
	mockAxiosGet.mockResolvedValueOnce({
		data: {
			data: [
				{
					id: "model-a",
					max_output_tokens: 4096,
					context_window: 100_000,
				},
			],
		},
	})

	const result = await getUnboundModels("test-api-key")

	expect(result).toEqual({
		"model-a": {
			maxTokens: 4096,
			contextWindow: 100_000,
			supportsPromptCache: false,
			supportsImages: false,
			inputPrice: undefined,
			outputPrice: undefined,
			description: undefined,
			cacheWritesPrice: undefined,
			cacheReadsPrice: undefined,
		},
	})
})
