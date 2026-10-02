// T6: Bedrock empirical max-output-tokens probe tests.
//
// These exercise `probeBedrockMaxOutputTokens`'s three resolution strategies (accepted
// ceiling, parsed error hint, binary search) plus its error-propagation and input-validation
// behaviour, using the `runProbe` test-injection point so no real AWS SDK client is created.

import { describe, expect, it, vi } from "vitest"

import { BEDROCK_MAX_OUTPUT_PROBE_CEILING, probeBedrockMaxOutputTokens } from "../bedrock-discovery"
import type { BedrockMaxOutputProbeResult } from "@roo-code/types"

const baseOptions = {
	awsRegion: "us-west-2",
	awsAccessKey: "AKIA",
	awsSecretKey: "secret",
}

const buildValidationError = (message: string): Error => {
	const err = new Error(message)
	err.name = "ValidationException"
	;(err as Error & { $metadata?: { httpStatusCode?: number } }).$metadata = { httpStatusCode: 400 }
	return err
}

describe("probeBedrockMaxOutputTokens", () => {
	it("returns the ceiling when AWS accepts the first probe", async () => {
		const runProbe = vi.fn().mockResolvedValue(undefined)

		const result = await probeBedrockMaxOutputTokens({
			options: baseOptions,
			modelId: "anthropic.claude-opus-4-7",
			probeCeiling: 256_000,
			runProbe,
		})

		expect(result).toEqual<BedrockMaxOutputProbeResult>({
			maxOutputTokens: 256_000,
			source: "accepted",
			attempts: 1,
		})
		expect(runProbe).toHaveBeenCalledTimes(1)
		expect(runProbe).toHaveBeenCalledWith(256_000)
	})

	it("recovers the cap from a parsable AWS error message hint", async () => {
		const runProbe = vi
			.fn()
			.mockRejectedValueOnce(
				buildValidationError("max_tokens: 256000 must be less than or equal to 128000 for this model"),
			)
			.mockResolvedValueOnce(undefined)

		const result = await probeBedrockMaxOutputTokens({
			options: baseOptions,
			modelId: "anthropic.claude-opus-4-7",
			probeCeiling: 256_000,
			runProbe,
		})

		expect(result.maxOutputTokens).toBe(128_000)
		expect(result.source).toBe("hint")
		expect(result.attempts).toBe(2)
	})

	it("falls back to binary search when no hint is present", async () => {
		const cap = 65_536
		const runProbe = vi.fn().mockImplementation(async (maxTokens: number) => {
			if (maxTokens > cap) {
				throw buildValidationError("The model does not support the requested max_tokens value.")
			}
		})

		const result = await probeBedrockMaxOutputTokens({
			options: baseOptions,
			modelId: "anthropic.claude-opus-4-7",
			probeCeiling: 256_000,
			runProbe,
		})

		expect(result.source).toBe("binary-search")
		expect(result.maxOutputTokens).toBeLessThanOrEqual(cap)
		expect(result.maxOutputTokens).toBeGreaterThan(cap - 4)
		expect(result.attempts).toBeGreaterThan(2)
	})

	it("propagates non-validation errors immediately", async () => {
		const networkError = new Error("socket hang up")
		networkError.name = "TimeoutError"
		const runProbe = vi.fn().mockRejectedValue(networkError)

		await expect(
			probeBedrockMaxOutputTokens({
				options: baseOptions,
				modelId: "anthropic.claude-opus-4-7",
				probeCeiling: 256_000,
				runProbe,
			}),
		).rejects.toThrow("socket hang up")

		expect(runProbe).toHaveBeenCalledTimes(1)
	})

	it("rejects when AWS region is missing", async () => {
		await expect(
			probeBedrockMaxOutputTokens({
				options: { ...baseOptions, awsRegion: undefined },
				modelId: "anthropic.claude-opus-4-7",
				runProbe: vi.fn(),
			}),
		).rejects.toThrow(/region/i)
	})

	it("rejects when model id is missing", async () => {
		await expect(
			probeBedrockMaxOutputTokens({
				options: baseOptions,
				modelId: "",
				runProbe: vi.fn(),
			}),
		).rejects.toThrow(/model id/i)
	})

	it("respects the documented probe ceiling default", () => {
		expect(BEDROCK_MAX_OUTPUT_PROBE_CEILING).toBe(1_000_000)
	})
})
