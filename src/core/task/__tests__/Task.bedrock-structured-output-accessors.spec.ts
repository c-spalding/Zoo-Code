import { Task } from "../Task"

type BedrockAccessors = {
	isModelStructuredOutputUnsupported: (modelId: string) => boolean
	markModelStructuredOutputUnsupported: (modelId: string) => void
}

type BedrockAccessorsAccess = {
	getBedrockStructuredOutputAccessors(): BedrockAccessors
}

const getAccessors = (task: Task): BedrockAccessors =>
	(task as unknown as BedrockAccessorsAccess).getBedrockStructuredOutputAccessors()

/**
 * Minimal stand-in for `ContextProxy`, backed by a plain in-memory record, exposing only the
 * `getValue`/`setValue` surface the accessors depend on.
 */
function createMockContextProxy(initial: Record<string, number> = {}) {
	const store: Record<string, unknown> = { bedrockStructuredOutputUnsupported: initial }
	return {
		getValue: vi.fn((key: string) => store[key]),
		setValue: vi.fn(async (key: string, value: unknown) => {
			store[key] = value
		}),
		store,
	}
}

function createTask(provider?: object) {
	const task = Object.create(Task.prototype) as Task
	Object.assign(task, {
		taskId: "task-1",
		providerRef: { deref: () => provider },
	})
	return task
}

describe("Task#getBedrockStructuredOutputAccessors", () => {
	it("reports a model as supported when the rejection cache is empty", () => {
		const contextProxy = createMockContextProxy()
		const task = createTask({ contextProxy })

		expect(getAccessors(task).isModelStructuredOutputUnsupported("some-model")).toBe(false)
	})

	it("round-trips through ContextProxy: marking a model unsupported makes it report as unsupported", () => {
		const contextProxy = createMockContextProxy()
		const task = createTask({ contextProxy })
		const accessors = getAccessors(task)

		accessors.markModelStructuredOutputUnsupported("model-a")

		expect(accessors.isModelStructuredOutputUnsupported("model-a")).toBe(true)
		expect(contextProxy.setValue).toHaveBeenCalledWith(
			"bedrockStructuredOutputUnsupported",
			expect.objectContaining({ "model-a": expect.any(Number) }),
		)
	})

	it("does not mark unrelated models as unsupported", () => {
		const contextProxy = createMockContextProxy()
		const task = createTask({ contextProxy })
		const accessors = getAccessors(task)

		accessors.markModelStructuredOutputUnsupported("model-a")

		expect(accessors.isModelStructuredOutputUnsupported("model-b")).toBe(false)
	})

	it("persists through the existing map, preserving previously-rejected models", () => {
		const contextProxy = createMockContextProxy({ "model-old": Date.now() + 1000 * 60 * 60 })
		const task = createTask({ contextProxy })
		const accessors = getAccessors(task)

		accessors.markModelStructuredOutputUnsupported("model-new")

		expect(accessors.isModelStructuredOutputUnsupported("model-old")).toBe(true)
		expect(accessors.isModelStructuredOutputUnsupported("model-new")).toBe(true)
	})

	it("safely reports supported (false) when the provider is unavailable", () => {
		const task = createTask(undefined)

		expect(getAccessors(task).isModelStructuredOutputUnsupported("model-a")).toBe(false)
	})

	it("safely no-ops when marking unsupported with no provider available", () => {
		const task = createTask(undefined)

		expect(() => getAccessors(task).markModelStructuredOutputUnsupported("model-a")).not.toThrow()
	})

	it("safely reports supported (false) when the provider has no contextProxy", () => {
		const task = createTask({})

		expect(getAccessors(task).isModelStructuredOutputUnsupported("model-a")).toBe(false)
	})

	it("safely no-ops when marking unsupported with no contextProxy available", () => {
		const task = createTask({})

		expect(() => getAccessors(task).markModelStructuredOutputUnsupported("model-a")).not.toThrow()
	})
})
