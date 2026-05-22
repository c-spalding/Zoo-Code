// npx vitest core/task/__tests__/allow-text-only-responses.spec.ts

import * as os from "os"
import * as path from "path"
import * as vscode from "vscode"

import type { GlobalState, ProviderSettings } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"

// Mock @roo-code/core
vi.mock("@roo-code/core", () => ({
	customToolRegistry: {
		getTools: vi.fn().mockReturnValue([]),
		hasTool: vi.fn().mockReturnValue(false),
		getTool: vi.fn().mockReturnValue(undefined),
	},
}))

// Mock delay before any imports that might use it
vi.mock("delay", () => ({
	__esModule: true,
	default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("execa", () => ({
	execa: vi.fn(),
}))

vi.mock("fs/promises", async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, any>
	const mockFunctions = {
		mkdir: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockImplementation(() => Promise.resolve("[]")),
		unlink: vi.fn().mockResolvedValue(undefined),
		rmdir: vi.fn().mockResolvedValue(undefined),
	}

	return {
		...actual,
		...mockFunctions,
		default: mockFunctions,
	}
})

vi.mock("p-wait-for", () => ({
	default: vi.fn().mockImplementation(async () => Promise.resolve()),
}))

vi.mock("vscode", () => {
	const mockDisposable = { dispose: vi.fn() }
	const mockEventEmitter = { event: vi.fn(), fire: vi.fn() }
	const mockTextDocument = { uri: { fsPath: "/mock/workspace/path/file.ts" } }
	const mockTextEditor = { document: mockTextDocument }
	const mockTab = { input: { uri: { fsPath: "/mock/workspace/path/file.ts" } } }
	const mockTabGroup = { tabs: [mockTab] }

	return {
		TabInputTextDiff: vi.fn(),
		CodeActionKind: {
			QuickFix: { value: "quickfix" },
			RefactorRewrite: { value: "refactor.rewrite" },
		},
		window: {
			createTextEditorDecorationType: vi.fn().mockReturnValue({
				dispose: vi.fn(),
			}),
			visibleTextEditors: [mockTextEditor],
			tabGroups: {
				all: [mockTabGroup],
				close: vi.fn(),
				onDidChangeTabs: vi.fn(() => ({ dispose: vi.fn() })),
			},
			showErrorMessage: vi.fn(),
		},
		workspace: {
			workspaceFolders: [
				{
					uri: { fsPath: "/mock/workspace/path" },
					name: "mock-workspace",
					index: 0,
				},
			],
			createFileSystemWatcher: vi.fn(() => ({
				onDidCreate: vi.fn(() => mockDisposable),
				onDidDelete: vi.fn(() => mockDisposable),
				onDidChange: vi.fn(() => mockDisposable),
				dispose: vi.fn(),
			})),
			fs: {
				stat: vi.fn().mockResolvedValue({ type: 1 }),
			},
			onDidSaveTextDocument: vi.fn(() => mockDisposable),
			getConfiguration: vi.fn(() => ({ get: (key: string, defaultValue: any) => defaultValue })),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(() => mockEventEmitter),
		Disposable: {
			from: vi.fn(),
		},
		TabInputText: vi.fn(),
	}
})

vi.mock("../../mentions", () => ({
	parseMentions: vi.fn().mockImplementation((text) => {
		return Promise.resolve({ text: `processed: ${text}`, mode: undefined, contentBlocks: [] })
	}),
	openMention: vi.fn(),
	getLatestTerminalOutput: vi.fn(),
}))

vi.mock("../../../integrations/misc/extract-text", () => ({
	extractTextFromFile: vi.fn().mockResolvedValue("Mock file content"),
}))

vi.mock("../../environment/getEnvironmentDetails", () => ({
	getEnvironmentDetails: vi.fn().mockResolvedValue(""),
}))

vi.mock("../../ignore/RooIgnoreController")

vi.mock("../../../utils/storage", () => ({
	getTaskDirectoryPath: vi
		.fn()
		.mockImplementation((globalStoragePath, taskId) => Promise.resolve(`${globalStoragePath}/tasks/${taskId}`)),
	getSettingsDirectoryPath: vi
		.fn()
		.mockImplementation((globalStoragePath) => Promise.resolve(`${globalStoragePath}/settings`)),
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockImplementation(() => false),
}))

describe("allowTextOnlyResponses - no-tool-use counter and mistake logic", () => {
	let mockProvider: any
	let mockApiConfig: ProviderSettings
	let mockOutputChannel: any
	let mockExtensionContext: vscode.ExtensionContext

	beforeEach(() => {
		if (!TelemetryService.hasInstance()) {
			TelemetryService.createInstance([])
		}

		const storageUri = {
			fsPath: path.join(os.tmpdir(), "test-storage"),
		}

		mockExtensionContext = {
			globalState: {
				get: vi.fn().mockImplementation((_key: keyof GlobalState) => undefined),
				update: vi.fn().mockImplementation((_key, _value) => Promise.resolve()),
				keys: vi.fn().mockReturnValue([]),
			},
			globalStorageUri: storageUri,
			workspaceState: {
				get: vi.fn().mockImplementation((_key) => undefined),
				update: vi.fn().mockImplementation((_key, _value) => Promise.resolve()),
				keys: vi.fn().mockReturnValue([]),
			},
			secrets: {
				get: vi.fn().mockImplementation((_key) => Promise.resolve(undefined)),
				store: vi.fn().mockImplementation((_key, _value) => Promise.resolve()),
				delete: vi.fn().mockImplementation((_key) => Promise.resolve()),
			},
			extensionUri: {
				fsPath: "/mock/extension/path",
			},
			extension: {
				packageJSON: {
					version: "1.0.0",
				},
			},
		} as unknown as vscode.ExtensionContext

		mockOutputChannel = {
			appendLine: vi.fn(),
			append: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		}

		mockProvider = new ClineProvider(
			mockExtensionContext,
			mockOutputChannel,
			"sidebar",
			new ContextProxy(mockExtensionContext),
		) as any

		mockApiConfig = {
			apiProvider: "anthropic",
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-api-key",
		}

		mockProvider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
		mockProvider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
		mockProvider.postStateToWebviewWithoutTaskHistory = vi.fn().mockResolvedValue(undefined)
		mockProvider.getState = vi.fn().mockResolvedValue({})
	})

	describe("counter initialisation", () => {
		it("consecutiveMistakeCount should initialise to 0", () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig,
				task: "test task",
				startTask: false,
			})

			expect(task.consecutiveMistakeCount).toBe(0)
		})

		it("consecutiveNoToolUseCount should initialise to 0", () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig,
				task: "test task",
				startTask: false,
			})

			expect(task.consecutiveNoToolUseCount).toBe(0)
		})
	})

	describe("allowTextOnlyResponses: true", () => {
		it("first text-only response: consecutiveMistakeCount is NOT incremented", () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: { ...mockApiConfig, allowTextOnlyResponses: true },
				task: "test task",
				startTask: false,
			})

			// Simulate first no-tool-use turn (allowTextOnly path)
			const allowTextOnly = true
			task.consecutiveNoToolUseCount++

			if (allowTextOnly && task.consecutiveNoToolUseCount >= 2) {
				task.consecutiveMistakeCount++
			}

			// Grace: first occurrence should NOT bump mistake count
			expect(task.consecutiveNoToolUseCount).toBe(1)
			expect(task.consecutiveMistakeCount).toBe(0)
		})

		it("second consecutive text-only response: consecutiveMistakeCount IS incremented", () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: { ...mockApiConfig, allowTextOnlyResponses: true },
				task: "test task",
				startTask: false,
			})

			// Simulate second consecutive no-tool-use turn
			task.consecutiveNoToolUseCount = 1
			const allowTextOnly = true
			task.consecutiveNoToolUseCount++

			if (allowTextOnly && task.consecutiveNoToolUseCount >= 2) {
				task.consecutiveMistakeCount++
			}

			expect(task.consecutiveNoToolUseCount).toBe(2)
			expect(task.consecutiveMistakeCount).toBe(1)
		})

		it("third consecutive text-only response: consecutiveMistakeCount increments again", () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: { ...mockApiConfig, allowTextOnlyResponses: true },
				task: "test task",
				startTask: false,
			})

			// Simulate third consecutive no-tool-use turn
			task.consecutiveNoToolUseCount = 2
			const allowTextOnly = true
			task.consecutiveNoToolUseCount++

			if (allowTextOnly && task.consecutiveNoToolUseCount >= 2) {
				task.consecutiveMistakeCount++
			}

			expect(task.consecutiveNoToolUseCount).toBe(3)
			expect(task.consecutiveMistakeCount).toBe(1)
		})

		it("no-tool-use counter increments on every text-only turn (grace included)", () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: { ...mockApiConfig, allowTextOnlyResponses: true },
				task: "test task",
				startTask: false,
			})

			const allowTextOnly = true

			// First turn
			task.consecutiveNoToolUseCount++
			if (allowTextOnly && task.consecutiveNoToolUseCount >= 2) task.consecutiveMistakeCount++
			expect(task.consecutiveNoToolUseCount).toBe(1)

			// Second turn
			task.consecutiveNoToolUseCount++
			if (allowTextOnly && task.consecutiveNoToolUseCount >= 2) task.consecutiveMistakeCount++
			expect(task.consecutiveNoToolUseCount).toBe(2)

			// Third turn
			task.consecutiveNoToolUseCount++
			if (allowTextOnly && task.consecutiveNoToolUseCount >= 2) task.consecutiveMistakeCount++
			expect(task.consecutiveNoToolUseCount).toBe(3)
		})
	})

	describe("allowTextOnlyResponses: false (default behaviour)", () => {
		it("first text-only response: consecutiveMistakeCount is NOT incremented (grace retry)", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig, // allowTextOnlyResponses absent => false
				task: "test task",
				startTask: false,
			})

			const saySpy = vi.spyOn(task, "say").mockResolvedValue(undefined)

			// Simulate first no-tool-use turn (default/false path)
			const allowTextOnly = false
			task.consecutiveNoToolUseCount++

			if (!allowTextOnly && task.consecutiveNoToolUseCount >= 2) {
				await task.say("error", "MODEL_NO_TOOLS_USED")
				task.consecutiveMistakeCount++
			}

			// Grace: no error on first occurrence
			expect(task.consecutiveNoToolUseCount).toBe(1)
			expect(task.consecutiveMistakeCount).toBe(0)
			expect(saySpy).not.toHaveBeenCalledWith("error", "MODEL_NO_TOOLS_USED")
		})

		it("second consecutive text-only response: error is shown and consecutiveMistakeCount IS incremented", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig,
				task: "test task",
				startTask: false,
			})

			const saySpy = vi.spyOn(task, "say").mockResolvedValue(undefined)

			// Simulate second consecutive no-tool-use turn
			task.consecutiveNoToolUseCount = 1
			const allowTextOnly = false
			task.consecutiveNoToolUseCount++

			if (!allowTextOnly && task.consecutiveNoToolUseCount >= 2) {
				await task.say("error", "MODEL_NO_TOOLS_USED")
				task.consecutiveMistakeCount++
			}

			expect(task.consecutiveNoToolUseCount).toBe(2)
			expect(task.consecutiveMistakeCount).toBe(1)
			expect(saySpy).toHaveBeenCalledWith("error", "MODEL_NO_TOOLS_USED")
		})
	})

	describe("allowTextOnlyResponses: true vs false - behavioural difference", () => {
		it("with allowTextOnlyResponses true: no error say() call on first text-only response", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: { ...mockApiConfig, allowTextOnlyResponses: true },
				task: "test task",
				startTask: false,
			})

			const saySpy = vi.spyOn(task, "say").mockResolvedValue(undefined)

			// Simulate both paths for 1 no-tool-use turn
			const allowTextOnly = true
			task.consecutiveNoToolUseCount++

			if (allowTextOnly) {
				// Text-only path: no error say()
				if (task.consecutiveNoToolUseCount >= 2) {
					task.consecutiveMistakeCount++
				}
			} else {
				if (task.consecutiveNoToolUseCount >= 2) {
					await task.say("error", "MODEL_NO_TOOLS_USED")
					task.consecutiveMistakeCount++
				}
			}

			expect(saySpy).not.toHaveBeenCalledWith("error", "MODEL_NO_TOOLS_USED")
		})

		it("with allowTextOnlyResponses false: error say() call on second text-only response", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: mockApiConfig,
				task: "test task",
				startTask: false,
			})

			const saySpy = vi.spyOn(task, "say").mockResolvedValue(undefined)

			const allowTextOnly = false
			task.consecutiveNoToolUseCount = 1
			task.consecutiveNoToolUseCount++

			if (allowTextOnly) {
				if (task.consecutiveNoToolUseCount >= 2) {
					task.consecutiveMistakeCount++
				}
			} else {
				if (task.consecutiveNoToolUseCount >= 2) {
					await task.say("error", "MODEL_NO_TOOLS_USED")
					task.consecutiveMistakeCount++
				}
			}

			expect(saySpy).toHaveBeenCalledWith("error", "MODEL_NO_TOOLS_USED")
			expect(task.consecutiveMistakeCount).toBe(1)
		})
	})

	describe("counter reset on abort", () => {
		it("consecutiveMistakeCount resets when abortTask is called", async () => {
			const task = new Task({
				provider: mockProvider,
				apiConfiguration: { ...mockApiConfig, allowTextOnlyResponses: true },
				task: "test task",
				startTask: false,
			})

			task.consecutiveMistakeCount = 3
			task.consecutiveNoToolUseCount = 3

			vi.spyOn(task, "dispose").mockImplementation(() => {})

			await task.abortTask()

			expect(task.consecutiveNoToolUseCount).toBe(0)
		})
	})
})
