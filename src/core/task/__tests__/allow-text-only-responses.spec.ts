// npx vitest run core/task/__tests__/allow-text-only-responses.spec.ts
//
// Fork tranche T10 (allowTextOnlyResponses). These are REAL Task integration
// tests (per the archive's F-AI-1 defect: the archive's own test file for this
// feature re-implemented pauseForTextOnlyResponse's/checkAutoApproval's logic
// inside the test bodies instead of exercising the production code - do not
// repeat that mistake here). Every test below either calls the real, private
// `pauseForTextOnlyResponse` method directly on a real `Task` instance (via a
// TaskTestAccess cast, the same established pattern Task.spec.ts uses for
// `getFilesReadByRooSafely`/`buildCleanConversationHistory`/etc.), or drives
// the real `recursivelyMakeClineRequests` loop end-to-end with only
// `attemptApiRequest` mocked (same convention as T8/T9's own tests).
//
// IMPORTANT: unlike Task.spec.ts, this file intentionally does NOT mock
// "p-wait-for". Task.spec.ts's global `vi.mock("p-wait-for", ...)` always
// resolves immediately regardless of condition, which is fine for T8/T9 (they
// never exercise `Task#ask`'s own blocking wait) but is fundamentally
// incompatible with proving F-LC-1: a mocked always-resolve pWaitFor would
// make a genuine deadlock indistinguishable from a correctly-gated visible
// wait, since both would just resolve instantly either way. Using the real
// p-wait-for module (polling every 100ms, as `Task#ask` requests) lets these
// tests tell the difference: the F-LC-1 test proves `ask()` genuinely blocks
// until a human (or test) responds, and does NOT resolve on its own.

import * as os from "os"
import * as path from "path"

import * as vscode from "vscode"

import { providerIdentifiers, type GlobalState, type ModelInfo, type ProviderSettings } from "@roo-code/types"
import { TelemetryService } from "@roo-code/telemetry"

import { Task } from "../Task"
import { ClineProvider } from "../../webview/ClineProvider"
import { ContextProxy } from "../../config/ContextProxy"
import { ApiStreamChunk } from "../../../api/transform/stream"
import { asyncStreamFrom } from "../../../test-utils/stream"
import { formatResponse } from "../../prompts/responses"

type ProviderState = Awaited<ReturnType<ClineProvider["getState"]>>

type TaskTestAccess = {
	pauseForTextOnlyResponse: () => Promise<{
		blocks: Array<{ type: string; text?: string }>
		wasTimeout: boolean
	}>
	presentAssistantMessageSafe: () => void
	safeEnsureModelFetched: () => Promise<ModelInfo>
}

function getTaskTestAccess(task: Task): TaskTestAccess {
	return task as unknown as TaskTestAccess
}

vi.mock("delay", () => ({
	__esModule: true,
	default: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("execa", () => ({
	execa: vi.fn(),
}))

vi.mock("fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs/promises")>()
	const mockFunctions = {
		mkdir: vi.fn().mockResolvedValue(undefined),
		writeFile: vi.fn().mockResolvedValue(undefined),
		readFile: vi.fn().mockResolvedValue("[]"),
		unlink: vi.fn().mockResolvedValue(undefined),
		rmdir: vi.fn().mockResolvedValue(undefined),
		stat: vi.fn().mockRejectedValue({ code: "ENOENT" }),
		readdir: vi.fn().mockResolvedValue([]),
	}

	return {
		...actual,
		...mockFunctions,
		default: mockFunctions,
	}
})

// This suite does not exercise code indexing; keep workspace resolution and
// its cache out of scope (same rationale as Task.spec.ts).
vi.mock("../../../services/code-index/code-index-manager-registry", () => ({
	CodeIndexManagerRegistry: {
		getOrCreate: vi.fn().mockReturnValue(undefined),
		getAllInstances: vi.fn().mockReturnValue([]),
		disposeAll: vi.fn(),
	},
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
				stat: vi.fn().mockResolvedValue({ type: 1 }), // FileType.File = 1
			},
			onDidSaveTextDocument: vi.fn(() => mockDisposable),
			getConfiguration: vi.fn(() => ({ get: (_key: string, defaultValue: unknown) => defaultValue })),
		},
		env: {
			uriScheme: "vscode",
			language: "en",
		},
		EventEmitter: vi.fn().mockImplementation(function () {
			return mockEventEmitter
		}),
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

vi.mock("../../../i18n", () => ({
	t: (key: string) => key,
}))

vi.mock("../../../utils/storage", () => ({
	getTaskDirectoryPath: vi
		.fn()
		.mockImplementation((globalStoragePath, taskId) => Promise.resolve(`${globalStoragePath}/tasks/${taskId}`)),
	getSettingsDirectoryPath: vi
		.fn()
		.mockImplementation((globalStoragePath) => Promise.resolve(`${globalStoragePath}/settings`)),
}))

vi.mock("../../../utils/fs", () => ({
	fileExistsAtPath: vi.fn().mockResolvedValue(false),
}))

const stubModelInfo: ModelInfo = {
	contextWindow: 200_000,
	maxTokens: 4096,
	supportsPromptCache: true,
}

describe("allowTextOnlyResponses (fork tranche T10)", () => {
	let mockProvider: ClineProvider
	let mockApiConfig: ProviderSettings
	let mockOutputChannel: vscode.OutputChannel
	let mockExtensionContext: vscode.ExtensionContext

	beforeEach(async () => {
		if (!TelemetryService.hasInstance()) {
			TelemetryService.createInstance([])
		}

		const storageUri = {
			fsPath: path.join(os.tmpdir(), "test-storage-t10"),
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
			name: "test-output",
			appendLine: vi.fn(),
			append: vi.fn(),
			replace: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		} as unknown as vscode.OutputChannel

		mockProvider = new ClineProvider(
			mockExtensionContext,
			mockOutputChannel,
			"sidebar",
			new ContextProxy(mockExtensionContext),
		)

		mockApiConfig = {
			apiProvider: providerIdentifiers.anthropic,
			apiModelId: "claude-3-5-sonnet-20241022",
			apiKey: "test-api-key",
		}

		mockProvider.postMessageToWebview = vi.fn().mockResolvedValue(undefined)
		mockProvider.postStateToWebview = vi.fn().mockResolvedValue(undefined)
		mockProvider.postStateToWebviewWithoutTaskHistory = vi.fn().mockResolvedValue(undefined)
		mockProvider.postStateToWebviewThrottled = vi.fn().mockResolvedValue(undefined)
		mockProvider.flushPostStateToWebviewThrottled = vi.fn().mockResolvedValue(undefined)
	})

	// Builds a real Task with allowTextOnlyResponses on by default (overridable),
	// and a provider.getState() stubbed with mcpEnabled:false (skip the MCP-hub
	// wait) plus the caller's auto-approval overrides. Mirrors T8/T9's own
	// createXTask helpers in Task.spec.ts.
	async function createTask(
		apiConfigOverrides: Partial<ProviderSettings> = {},
		stateOverrides: Partial<ProviderState> = {},
	) {
		const state = await mockProvider.getState()
		vi.spyOn(mockProvider, "getState").mockResolvedValue({
			...state,
			mcpEnabled: false,
			...stateOverrides,
		})

		const task = new Task({
			provider: mockProvider,
			apiConfiguration: { ...mockApiConfig, allowTextOnlyResponses: true, ...apiConfigOverrides },
			task: "allow-text-only-responses test",
			startTask: false,
		})
		vi.spyOn(task.diffViewProvider, "reset").mockResolvedValue(undefined)
		vi.spyOn(getTaskTestAccess(task), "safeEnsureModelFetched").mockResolvedValue(stubModelInfo)
		return task
	}

	function textChunks(...texts: string[]): ApiStreamChunk[] {
		return texts.map((text) => ({ type: "text", text }))
	}

	// Same stop-after-first-request convention as T8/T9: a second
	// attemptApiRequest call only happens because the no-tool-use branch pushed
	// new content onto the recursion stack, and these tests only care about the
	// first turn's resulting state.
	function mockSingleAttemptApiRequest(task: Task, chunks: ApiStreamChunk[]) {
		return vi
			.spyOn(task, "attemptApiRequest")
			.mockImplementationOnce(() => asyncStreamFrom<ApiStreamChunk>(chunks))
			.mockImplementation(() => {
				throw new Error("stop after first allow-text-only-responses request (test helper)")
			})
	}

	describe("pauseForTextOnlyResponse (direct)", () => {
		it("F-LC-1: presents a genuine, visible, blocking ask when autoApprovalEnabled is on but alwaysAllowFollowupQuestions is off", async () => {
			const task = await createTask({}, { autoApprovalEnabled: true, alwaysAllowFollowupQuestions: false })

			const pausePromise = getTaskTestAccess(task).pauseForTextOnlyResponse()

			// The archive's defect fired the auto-approval timer whenever
			// autoApprovalEnabled was true, regardless of alwaysAllowFollowupQuestions,
			// silently resolving this promise with no human interaction at all. The
			// fixed gate (checkAutoApproval) requires both flags, so decision stays
			// "ask": a real, visible, blocking prompt that only resolves when
			// something answers it. Prove that by answering it ourselves, after a
			// short delay, and confirming the promise was actually still pending.
			await new Promise((resolve) => setTimeout(resolve, 30))
			// Still unresolved after 30ms with nobody answering: not an unconditional
			// auto-approval timer firing on its own.
			const stillPending = await Promise.race([pausePromise.then(() => false), Promise.resolve(true)])
			expect(stillPending).toBe(true)

			task.handleWebviewAskResponse("messageResponse", "I am here")

			const result = await pausePromise

			expect(result.wasTimeout).toBe(false)
			expect(result.blocks[0]).toMatchObject({
				type: "text",
				text: "<user_message>\nI am here\n</user_message>",
			})

			// F-LC-2's data foundation: the ask message itself is a real, visible
			// clineMessage (never silently dropped), carrying `silent:true` only so
			// the webview can suppress the redundant internal-only suggestion button.
			const followupAsk = task.clineMessages.find((m) => m.type === "ask" && m.ask === "followup")
			expect(followupAsk).toBeDefined()
			expect(JSON.parse(followupAsk!.text!)).toMatchObject({ silent: true })
		})

		it("auto-approves via the soft nudge only when BOTH autoApprovalEnabled and alwaysAllowFollowupQuestions are on", async () => {
			const task = await createTask(
				{},
				{
					autoApprovalEnabled: true,
					alwaysAllowFollowupQuestions: true,
					followupAutoApproveTimeoutMs: 10,
				},
			)

			const result = await getTaskTestAccess(task).pauseForTextOnlyResponse()

			expect(result.wasTimeout).toBe(true)
			expect(result.blocks).toEqual([{ type: "text", text: formatResponse.softNudge() }])
		})

		it("does not auto-approve when alwaysAllowFollowupQuestions is on but autoApprovalEnabled is off (global gate)", async () => {
			const task = await createTask(
				{},
				{
					autoApprovalEnabled: false,
					alwaysAllowFollowupQuestions: true,
					followupAutoApproveTimeoutMs: 10,
				},
			)

			const pausePromise = getTaskTestAccess(task).pauseForTextOnlyResponse()

			// Defer the reply via a macrotask (same convention as
			// ask-clear-approval-buttons.spec.ts): ask() runs several awaited steps
			// (state/auto-approval resolution, addToClineMessages, saveClineMessages)
			// before it starts blocking on askResponse. Calling
			// handleWebviewAskResponse synchronously right after invoking ask() would
			// race ask()'s own `this.askResponse = undefined` reset for a new,
			// non-partial message, overwriting our reply and hanging the wait. A
			// setTimeout(0) callback runs only after all of ask()'s pending
			// microtasks have settled, after which the reset has already happened
			// and it is safe to set the response.
			setTimeout(() => {
				task.handleWebviewAskResponse("messageResponse", "manual reply")
			}, 0)

			const result = await pausePromise
			expect(result.wasTimeout).toBe(false)
		})

		it("treats a genuine human reply as real course-correction: say(user_feedback) and <user_message> wrapping", async () => {
			const task = await createTask({}, { autoApprovalEnabled: false })

			const saySpy = vi.spyOn(task, "say")

			const pausePromise = getTaskTestAccess(task).pauseForTextOnlyResponse()

			// See the timing comment in the previous test for why this must be deferred.
			setTimeout(() => {
				task.handleWebviewAskResponse("messageResponse", "please keep going")
			}, 0)

			const result = await pausePromise

			expect(result.wasTimeout).toBe(false)
			expect(saySpy).toHaveBeenCalledWith("user_feedback", "please keep going", undefined)
			expect(result.blocks[0]).toMatchObject({
				type: "text",
				text: "<user_message>\nplease keep going\n</user_message>",
			})
		})
	})

	describe("recursivelyMakeClineRequests integration", () => {
		it("off-state: byte-identical to current noToolsUsed retry behavior when allowTextOnlyResponses is false", async () => {
			const task = await createTask({ allowTextOnlyResponses: false })

			mockSingleAttemptApiRequest(task, textChunks("just thinking out loud, no tool"))

			await task.recursivelyMakeClineRequests([{ type: "text", text: "hello" }])

			// First occurrence is a grace retry: no error say(), no mistake count yet.
			expect(task.clineMessages.some((m) => m.type === "say" && m.say === "error")).toBe(false)
			expect(task.consecutiveNoToolUseCount).toBe(1)
			expect(task.consecutiveMistakeCount).toBe(0)

			// Assert via API history rather than task.userMessageContent: a second
			// recursion iteration (pushed by the no-tool-use branch) resets
			// userMessageContent to [] at the top of the next loop pass before the
			// mocked attemptApiRequest throws, so by the time
			// recursivelyMakeClineRequests returns, the field reflects the *next*
			// turn's reset state, not the content this test cares about. The
			// no-tool-use text is instead captured durably in the user message this
			// same next iteration added to API history (shouldAddUserMessageToHistory
			// returns true: retryAttempt 0, non-empty content).
			const lastUserMessage = task.apiConversationHistory.filter((m) => m.role === "user").at(-1)
			expect(lastUserMessage?.content).toEqual([
				{ type: "text", text: formatResponse.noToolsUsed() },
				{ type: "text", text: "" },
			])

			// No implicit follow-up was ever presented in the off-state.
			expect(task.clineMessages.some((m) => m.type === "ask" && m.ask === "followup")).toBe(false)
		})

		it("on-state: a timed-out text-only turn is a grace retry (no mistake count on first occurrence) and presents a real followup ask", async () => {
			const task = await createTask(
				{},
				{
					autoApprovalEnabled: true,
					alwaysAllowFollowupQuestions: true,
					followupAutoApproveTimeoutMs: 10,
				},
			)

			mockSingleAttemptApiRequest(task, textChunks("no tool this turn"))

			await task.recursivelyMakeClineRequests([{ type: "text", text: "hello" }])

			expect(task.consecutiveNoToolUseCount).toBe(1)
			expect(task.consecutiveMistakeCount).toBe(0)

			const followupAsks = task.clineMessages.filter((m) => m.type === "ask" && m.ask === "followup")
			expect(followupAsks).toHaveLength(1)
		})

		it("accumulates the mistake counter starting from the second consecutive soft-nudge timeout", async () => {
			const task = await createTask(
				{},
				{
					autoApprovalEnabled: true,
					alwaysAllowFollowupQuestions: true,
					followupAutoApproveTimeoutMs: 10,
				},
			)

			// Two consecutive text-only turns, each auto-timed-out via the soft
			// nudge, then stop. Mirrors mockSingleAttemptApiRequest's
			// stop-after-Nth-request convention but for N=2, since this test
			// specifically needs to observe the SECOND consecutive occurrence.
			vi.spyOn(task, "attemptApiRequest")
				.mockImplementationOnce(() => asyncStreamFrom<ApiStreamChunk>(textChunks("no tool, turn one")))
				.mockImplementationOnce(() => asyncStreamFrom<ApiStreamChunk>(textChunks("no tool, turn two")))
				.mockImplementation(() => {
					throw new Error("stop after second allow-text-only-responses request (test helper)")
				})

			await task.recursivelyMakeClineRequests([{ type: "text", text: "hello" }])

			// Turn one: consecutiveNoToolUseCount becomes 1 (< 2), so the first
			// soft-nudge timeout is still a grace retry - no mistake counted.
			// Turn two: consecutiveNoToolUseCount becomes 2 (>= 2), so this
			// second consecutive timeout is the first one to count as a mistake.
			expect(task.consecutiveNoToolUseCount).toBe(2)
			expect(task.consecutiveMistakeCount).toBe(1)

			const followupAsks = task.clineMessages.filter((m) => m.type === "ask" && m.ask === "followup")
			expect(followupAsks).toHaveLength(2)
		})
	})

	describe("interplay with T9's text tool-call fallback", () => {
		it("never pauses for a text-only response when T9's extractor already injected a tool call this turn", async () => {
			const task = await createTask({ textToolCallFallback: true })
			// Unlike Task.spec.ts, this file does not mock p-wait-for, so a pure
			// no-op stub would starve the real pWaitFor(() => userMessageContentReady
			// || abort || abandoned) call inside the injected-tool-use branch,
			// hanging forever. Simulate the real presenter's completion signal.
			vi.spyOn(getTaskTestAccess(task), "presentAssistantMessageSafe").mockImplementation(() => {
				task.userMessageContentReady = true
			})

			const rawText = "I'll finish now.\n\n<attempt_completion><result>All done</result></attempt_completion>"
			mockSingleAttemptApiRequest(task, textChunks(rawText))

			await task.recursivelyMakeClineRequests([{ type: "text", text: "hello" }])

			// T9 extracted a tool call, so T10's pause-for-text-only branch must never
			// trigger: no followup ask is ever presented for this turn, and the
			// no-tool-use counter is reset exactly like the native-tool-use path.
			expect(task.clineMessages.some((m) => m.type === "ask" && m.ask === "followup")).toBe(false)
			expect(task.consecutiveNoToolUseCount).toBe(0)
		})
	})
})
