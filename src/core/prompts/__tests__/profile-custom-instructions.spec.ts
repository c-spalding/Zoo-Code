// npx vitest core/prompts/__tests__/profile-custom-instructions.spec.ts

vi.mock("os", () => ({
	default: {
		homedir: () => "/home/user",
		platform: () => "linux",
		arch: () => "x64",
		type: () => "Linux",
		release: () => "5.4.0",
		hostname: () => "test-host",
		tmpdir: () => "/tmp",
		endianness: () => "LE",
		loadavg: () => [0, 0, 0],
		totalmem: () => 8589934592,
		freemem: () => 4294967296,
		cpus: () => [],
		networkInterfaces: () => ({}),
		userInfo: () => ({ username: "test", uid: 1000, gid: 1000, shell: "/bin/bash", homedir: "/home/user" }),
	},
	homedir: () => "/home/user",
	platform: () => "linux",
	arch: () => "x64",
	type: () => "Linux",
	release: () => "5.4.0",
	hostname: () => "test-host",
	tmpdir: () => "/tmp",
	endianness: () => "LE",
	loadavg: () => [0, 0, 0],
	totalmem: () => 8589934592,
	freemem: () => 4294967296,
	cpus: () => [],
	networkInterfaces: () => ({}),
	userInfo: () => ({ username: "test", uid: 1000, gid: 1000, shell: "/bin/bash", homedir: "/home/user" }),
}))

vi.mock("os-name", () => ({
	default: () => "Linux",
}))

vi.mock("fs/promises", () => ({
	default: {
		readFile: vi.fn().mockResolvedValue(""),
		stat: vi.fn().mockRejectedValue(new Error("ENOENT")),
		readdir: vi.fn().mockResolvedValue([]),
	},
}))

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/path" } }],
	},
}))

import { addCustomInstructions } from "../sections/custom-instructions"

describe("addCustomInstructions - profileCustomInstructions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	describe("profileCustomInstructions rendering", () => {
		it("should render Profile Instructions section when settings.profileCustomInstructions is set", async () => {
			const instructions = await addCustomInstructions(
				"", // modeCustomInstructions
				"", // globalCustomInstructions
				"/test/path",
				"code",
				{
					settings: {
						profileCustomInstructions: "These are the profile-specific instructions",
						todoListEnabled: true,
						useAgentRules: false,
						newTaskRequireTodos: false,
					},
				},
			)

			expect(instructions).toContain("Profile Instructions:")
			expect(instructions).toContain("These are the profile-specific instructions")
		})

		it("should NOT render Profile Instructions section when settings.profileCustomInstructions is undefined", async () => {
			const instructions = await addCustomInstructions("", "", "/test/path", "code", {
				settings: {
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			expect(instructions).not.toContain("Profile Instructions:")
		})

		it("should NOT render Profile Instructions section when settings.profileCustomInstructions is empty string", async () => {
			const instructions = await addCustomInstructions("", "", "/test/path", "code", {
				settings: {
					profileCustomInstructions: "",
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			expect(instructions).not.toContain("Profile Instructions:")
		})

		it("should NOT render Profile Instructions section when settings.profileCustomInstructions is whitespace only", async () => {
			const instructions = await addCustomInstructions("", "", "/test/path", "code", {
				settings: {
					profileCustomInstructions: "   \n\t  ",
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			expect(instructions).not.toContain("Profile Instructions:")
		})

		it("should trim profileCustomInstructions", async () => {
			const instructions = await addCustomInstructions("", "", "/test/path", "code", {
				settings: {
					profileCustomInstructions: "  Trimmed profile instructions  ",
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			expect(instructions).toContain("Profile Instructions:")
			expect(instructions).toContain("Trimmed profile instructions")
			expect(instructions).not.toContain("  Trimmed profile instructions  ")
		})
	})

	describe("ordering of instruction sections", () => {
		it("should place Global Instructions before Profile Instructions before Mode-specific Instructions", async () => {
			const instructions = await addCustomInstructions(
				"Mode-specific instructions here",
				"Global instructions here",
				"/test/path",
				"code",
				{
					settings: {
						profileCustomInstructions: "Profile instructions here",
						todoListEnabled: true,
						useAgentRules: false,
						newTaskRequireTodos: false,
					},
				},
			)

			const globalIndex = instructions.indexOf("Global Instructions:")
			const profileIndex = instructions.indexOf("Profile Instructions:")
			const modeIndex = instructions.indexOf("Mode-specific Instructions:")

			expect(globalIndex).toBeGreaterThanOrEqual(0)
			expect(profileIndex).toBeGreaterThanOrEqual(0)
			expect(modeIndex).toBeGreaterThanOrEqual(0)

			expect(globalIndex).toBeLessThan(profileIndex)
			expect(profileIndex).toBeLessThan(modeIndex)
		})

		it("should place Global Instructions before Profile Instructions when no mode-specific instructions", async () => {
			const instructions = await addCustomInstructions("", "Global instructions here", "/test/path", "code", {
				settings: {
					profileCustomInstructions: "Profile instructions here",
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			const globalIndex = instructions.indexOf("Global Instructions:")
			const profileIndex = instructions.indexOf("Profile Instructions:")

			expect(globalIndex).toBeGreaterThanOrEqual(0)
			expect(profileIndex).toBeGreaterThanOrEqual(0)
			expect(globalIndex).toBeLessThan(profileIndex)
		})

		it("should place Profile Instructions before Mode-specific Instructions when no global instructions", async () => {
			const instructions = await addCustomInstructions(
				"Mode-specific instructions here",
				"",
				"/test/path",
				"code",
				{
					settings: {
						profileCustomInstructions: "Profile instructions here",
						todoListEnabled: true,
						useAgentRules: false,
						newTaskRequireTodos: false,
					},
				},
			)

			const profileIndex = instructions.indexOf("Profile Instructions:")
			const modeIndex = instructions.indexOf("Mode-specific Instructions:")

			expect(profileIndex).toBeGreaterThanOrEqual(0)
			expect(modeIndex).toBeGreaterThanOrEqual(0)
			expect(profileIndex).toBeLessThan(modeIndex)
		})
	})

	describe("regression: no self-duplication", () => {
		it("should NOT duplicate profileCustomInstructions when same text is passed as globalCustomInstructions", async () => {
			const sharedText = "Shared instruction text that should not be duplicated"
			const instructions = await addCustomInstructions(
				"", // modeCustomInstructions
				sharedText, // globalCustomInstructions - same text
				"/test/path",
				"code",
				{
					settings: {
						profileCustomInstructions: sharedText, // same text as global
						todoListEnabled: true,
						useAgentRules: false,
						newTaskRequireTodos: false,
					},
				},
			)

			// Both headings should appear
			expect(instructions).toContain("Global Instructions:")
			expect(instructions).toContain("Profile Instructions:")

			// The shared text should appear once under each heading, not duplicated within a single heading
			// Extract the content under each heading
			const globalSection = instructions.split("Global Instructions:")[1]?.split("Profile Instructions:")[0] || ""
			const profileSection =
				instructions.split("Profile Instructions:")[1]?.split("Mode-specific Instructions:")[0] || ""

			// Each section should contain the text exactly once
			const globalMatches = (globalSection.match(new RegExp(sharedText, "g")) || []).length
			const profileMatches = (profileSection.match(new RegExp(sharedText, "g")) || []).length

			expect(globalMatches).toBe(1)
			expect(profileMatches).toBe(1)
		})

		it("should NOT duplicate profileCustomInstructions within the Profile Instructions section", async () => {
			const profileText = "Profile specific text"
			const instructions = await addCustomInstructions("", "Global text", "/test/path", "code", {
				settings: {
					profileCustomInstructions: profileText,
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			// Find the Profile Instructions section - split by the section header and get content until next section
			const afterProfile = instructions.split("Profile Instructions:")[1]
			expect(afterProfile).toBeTruthy()
			const profileSection = afterProfile.split("Mode-specific Instructions:")[0]

			// The profile text should appear exactly once inside the Profile Instructions section
			const occurrences = (profileSection.match(new RegExp(profileText, "g")) || []).length
			expect(occurrences).toBe(1)
		})

		it("should handle different global and profile instructions correctly", async () => {
			const globalText = "Global custom instructions"
			const profileText = "Profile custom instructions"
			const modeText = "Mode specific instructions"

			const instructions = await addCustomInstructions(modeText, globalText, "/test/path", "code", {
				settings: {
					profileCustomInstructions: profileText,
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			// Each should appear exactly once in its respective section
			const globalSection = instructions.split("Global Instructions:")[1]?.split("Profile Instructions:")[0] || ""
			const profileSection =
				instructions.split("Profile Instructions:")[1]?.split("Mode-specific Instructions:")[0] || ""
			const modeSection = instructions.split("Mode-specific Instructions:")[1] || ""

			expect((globalSection.match(new RegExp(globalText, "g")) || []).length).toBe(1)
			expect((profileSection.match(new RegExp(profileText, "g")) || []).length).toBe(1)
			expect((modeSection.match(new RegExp(modeText, "g")) || []).length).toBe(1)
		})
	})

	describe("edge cases", () => {
		it("should handle all three instruction types being the same string", async () => {
			const sameText = "Same instruction text"
			const instructions = await addCustomInstructions(sameText, sameText, "/test/path", "code", {
				settings: {
					profileCustomInstructions: sameText,
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			// Each section should contain the text exactly once
			expect((instructions.match(new RegExp(sameText, "g")) || []).length).toBe(3)

			// Should have three distinct sections
			expect(instructions).toContain("Global Instructions:")
			expect(instructions).toContain("Profile Instructions:")
			expect(instructions).toContain("Mode-specific Instructions:")
		})

		it("should work with only profile instructions (no global or mode-specific)", async () => {
			const instructions = await addCustomInstructions("", "", "/test/path", "code", {
				settings: {
					profileCustomInstructions: "Only profile instructions",
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			expect(instructions).toContain("Profile Instructions:")
			expect(instructions).not.toContain("Global Instructions:")
			expect(instructions).not.toContain("Mode-specific Instructions:")
		})

		it("should work with global and profile but no mode-specific", async () => {
			const instructions = await addCustomInstructions("", "Global instructions", "/test/path", "code", {
				settings: {
					profileCustomInstructions: "Profile instructions",
					todoListEnabled: true,
					useAgentRules: false,
					newTaskRequireTodos: false,
				},
			})

			expect(instructions).toContain("Global Instructions:")
			expect(instructions).toContain("Profile Instructions:")
			expect(instructions).not.toContain("Mode-specific Instructions:")
		})
	})
})
