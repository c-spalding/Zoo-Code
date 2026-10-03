import {
	DEFAULT_DESTRUCTIVE_COMMAND_GUARD_ENABLED,
	GLOBAL_SETTINGS_KEYS,
	globalSettingsSchema,
} from "../global-settings.js"

describe("destructive command guard global setting", () => {
	it("is opt-in by default", () => {
		expect(DEFAULT_DESTRUCTIVE_COMMAND_GUARD_ENABLED).toBe(false)
	})

	it("accepts and exposes the persisted setting", () => {
		expect(globalSettingsSchema.parse({ destructiveCommandGuardEnabled: true })).toEqual({
			destructiveCommandGuardEnabled: true,
		})
		expect(GLOBAL_SETTINGS_KEYS).toContain("destructiveCommandGuardEnabled")
	})

	it("rejects non-boolean setting values", () => {
		expect(() => globalSettingsSchema.parse({ destructiveCommandGuardEnabled: "true" })).toThrow()
	})
})

describe("bedrockStructuredOutputUnsupported hidden global setting", () => {
	it("is included in GLOBAL_SETTINGS_KEYS", () => {
		expect(GLOBAL_SETTINGS_KEYS).toContain("bedrockStructuredOutputUnsupported")
	})

	it("accepts a map of modelId -> expiry epoch ms", () => {
		const now = Date.now()
		expect(
			globalSettingsSchema.parse({
				bedrockStructuredOutputUnsupported: { "anthropic.claude-sonnet-5": now + 1000 },
			}),
		).toEqual({
			bedrockStructuredOutputUnsupported: { "anthropic.claude-sonnet-5": now + 1000 },
		})
	})

	it("rejects non-numeric map values", () => {
		expect(() =>
			globalSettingsSchema.parse({
				bedrockStructuredOutputUnsupported: { "anthropic.claude-sonnet-5": "not-a-number" },
			}),
		).toThrow()
	})

	// Migration gate: settings blobs persisted before this key existed must still import
	// cleanly. Since the field is optional, parsing a blob that omits it entirely must
	// succeed and simply leave the key absent (not default to {} or throw).
	it("parses an old settings blob that predates this key without error", () => {
		const oldBlob = {
			mode: "code",
			autoApprovalEnabled: true,
			profileThresholds: { "some-profile": 10 },
		}
		const parsed = globalSettingsSchema.parse(oldBlob)
		expect(parsed.bedrockStructuredOutputUnsupported).toBeUndefined()
		expect(parsed.mode).toBe("code")
		expect(parsed.autoApprovalEnabled).toBe(true)
	})
})
