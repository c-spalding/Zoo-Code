// npx vitest run src/core/assistant-message/__tests__/InlineThinkingStreamParser.spec.ts

import { describe, it, expect } from "vitest"

import { InlineThinkingStreamParser, type InlineThinkingEvent } from "../InlineThinkingStreamParser"

/** Push every chunk through the parser, then flush, collecting all events in order. */
function run(parser: InlineThinkingStreamParser, chunks: string[]): InlineThinkingEvent[] {
	const events: InlineThinkingEvent[] = []
	for (const chunk of chunks) {
		events.push(...parser.push(chunk))
	}
	events.push(...parser.flush())
	return events
}

/** Concatenate all "text" events into a single string. */
function reconstructText(events: InlineThinkingEvent[]): string {
	return events
		.filter((e): e is { type: "text"; text: string } => e.type === "text")
		.map((e) => e.text)
		.join("")
}

/**
 * Reconstruct one entry per completed reasoning "occurrence" (a run of reasoning events
 * ending in partial:false), using the final (cumulative) text for that occurrence.
 */
function reconstructReasoningBlocks(events: InlineThinkingEvent[]): string[] {
	const blocks: string[] = []
	let last: string | undefined

	for (const event of events) {
		if (event.type === "reasoning") {
			last = event.text
			if (!event.partial) {
				blocks.push(last)
				last = undefined
			}
		}
	}

	// An unclosed tag that never reaches partial:false (shouldn't happen once flush()
	// has run, but guard against test bugs that forget to flush).
	if (last !== undefined) {
		blocks.push(last)
	}

	return blocks
}

describe("InlineThinkingStreamParser", () => {
	it("passes plain text through unchanged when no tags are present", () => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["Hello, ", "world! No thinking here."])

		expect(reconstructText(events)).toBe("Hello, world! No thinking here.")
		expect(reconstructReasoningBlocks(events)).toEqual([])
	})

	it("extracts a complete <think> tag delivered in a single chunk", () => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["before<think>hello</think>after"])

		expect(reconstructText(events)).toBe("beforeafter")
		expect(reconstructReasoningBlocks(events)).toEqual(["hello"])
	})

	it.each(["think", "thinking", "reasoning"])("extracts the <%s> tag", (tagName) => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, [`pre<${tagName}>content</${tagName}>post`])

		expect(reconstructText(events)).toBe("prepost")
		expect(reconstructReasoningBlocks(events)).toEqual(["content"])
	})

	it("is case-insensitive for both the opening and closing tag", () => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["<THINK>Shout</THINK>", "<Reasoning>Mix</rEaSoNiNg>"])

		expect(reconstructText(events)).toBe("")
		expect(reconstructReasoningBlocks(events)).toEqual(["Shout", "Mix"])
	})

	it("trims leading/trailing whitespace from the extracted reasoning content", () => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["<think>  deep thought  </think>"])

		expect(reconstructReasoningBlocks(events)).toEqual(["deep thought"])
	})

	it("treats a tag with attributes as plain text, not a thinking wrapper", () => {
		const original = '<think attribute="x">content</think>'
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, [original])

		expect(reconstructText(events)).toBe(original)
		expect(reconstructReasoningBlocks(events)).toEqual([])
	})

	it("treats unrelated angle-bracket content (inequalities, generic HTML-like tags) as plain text", () => {
		const original = "1 < 2 and <b>bold</b> text, 3 > 4"
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, [original])

		expect(reconstructText(events)).toBe(original)
		expect(reconstructReasoningBlocks(events)).toEqual([])
	})

	it("handles multiple distinct tag occurrences in sequence", () => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["<think>first</think> middle <reasoning>second</reasoning> end"])

		expect(reconstructText(events)).toBe(" middle  end")
		expect(reconstructReasoningBlocks(events)).toEqual(["first", "second"])
	})

	it("handles back-to-back occurrences of the same tag with no text between them", () => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["<think>one</think><think>two</think>"])

		expect(reconstructText(events)).toBe("")
		expect(reconstructReasoningBlocks(events)).toEqual(["one", "two"])
	})

	it("does not recurse into a same-named tag nested inside an open tag (documented limitation)", () => {
		// The first matching closing tag always ends the currently-open tag, matching
		// the ported archive behaviour. A literal nested "<think>" is swallowed as raw
		// content of the outer tag, and the orphaned trailing "</think>" (no matching
		// open tag in text mode) passes through as plain text.
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["<think>outer <think>inner</think> still outer</think>"])

		expect(reconstructReasoningBlocks(events)).toEqual(["outer <think>inner"])
		expect(reconstructText(events)).toBe(" still outer</think>")
	})

	it("splits an opening tag across a chunk boundary", () => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["before<thi", "nk>content</think>after"])

		expect(reconstructText(events)).toBe("beforeafter")
		expect(reconstructReasoningBlocks(events)).toEqual(["content"])
	})

	it("splits a closing tag across a chunk boundary", () => {
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, ["<think>partial</thi", "nk>rest"])

		expect(reconstructText(events)).toBe("rest")
		expect(reconstructReasoningBlocks(events)).toEqual(["partial"])
	})

	it("splits tag content itself across multiple chunks, streaming partial reasoning events", () => {
		const parser = new InlineThinkingStreamParser()

		const firstEvents = parser.push("<think>first ")
		expect(firstEvents).toEqual([{ type: "reasoning", text: "first ", partial: true }])

		const secondEvents = parser.push("second ")
		expect(secondEvents).toEqual([{ type: "reasoning", text: "first second ", partial: true }])

		const thirdEvents = parser.push("third</think>done")
		expect(thirdEvents).toEqual([
			{ type: "reasoning", text: "first second third", partial: false },
			{ type: "text", text: "done" },
		])

		expect(parser.flush()).toEqual([])
	})

	it("streams the input one character at a time and reconstructs the original content", () => {
		const original = "Hello <think>  deep thought  </think> World"
		const parser = new InlineThinkingStreamParser()
		const events = run(parser, Array.from(original))

		expect(reconstructText(events)).toBe("Hello  World")
		expect(reconstructReasoningBlocks(events)).toEqual(["deep thought"])
	})

	it("finalizes an unclosed tag gracefully at stream end", () => {
		const parser = new InlineThinkingStreamParser()

		const pushEvents = parser.push("<think>incomplete thought")
		expect(pushEvents).toEqual([{ type: "reasoning", text: "incomplete thought", partial: true }])

		const flushEvents = parser.flush()
		expect(flushEvents).toEqual([{ type: "reasoning", text: "incomplete thought", partial: false }])
	})

	it("finalizes an unclosed tag whose last fragment was buffered as a potential close tag", () => {
		const parser = new InlineThinkingStreamParser()

		// "</thi" looks like it could be the start of "</think>", so it gets buffered
		// rather than appended to tagContent immediately.
		const pushEvents = parser.push("<think>cut off</thi")
		expect(pushEvents).toEqual([{ type: "reasoning", text: "cut off", partial: true }])

		const flushEvents = parser.flush()
		expect(flushEvents).toEqual([{ type: "reasoning", text: "cut off</thi", partial: false }])
	})

	it("flushes buffered text that looked like a potential tag start but was not one", () => {
		const parser = new InlineThinkingStreamParser()

		// "<subtle" is not a recognised tag name, but the trailing "<" is close enough
		// to the end of the chunk to be buffered defensively.
		const pushEvents = parser.push("hello <subtle")
		expect(pushEvents).toEqual([{ type: "text", text: "hello " }])

		const flushEvents = parser.flush()
		expect(flushEvents).toEqual([{ type: "text", text: "<subtle" }])
	})

	it("does not buffer a lone '<' that is followed by enough text to rule out a tag start", () => {
		const parser = new InlineThinkingStreamParser()
		const events = parser.push("a < b and plenty of trailing text to push it out of range")

		// No buffering needed: the whole chunk should be emitted as a single text event.
		expect(events).toEqual([{ type: "text", text: "a < b and plenty of trailing text to push it out of range" }])
		expect(parser.flush()).toEqual([])
	})

	it("round-trips a realistic multi-paragraph alternating stream", () => {
		const original =
			"Let me think about this.\n\n" +
			"<think>\nStep 1: analyze the request.\nStep 2: form a plan.\n</think>\n\n" +
			"Here is my answer.\n\n" +
			"<reasoning>Double-checking the answer for correctness.</reasoning>\n" +
			"Done."

		// Deliver in small, uneven chunks to exercise multiple boundary conditions at once.
		const chunks: string[] = []
		for (let i = 0; i < original.length; i += 3) {
			chunks.push(original.slice(i, i + 3))
		}

		const parser = new InlineThinkingStreamParser()
		const events = run(parser, chunks)

		expect(reconstructText(events)).toBe(
			"Let me think about this.\n\n" + "\n\n" + "Here is my answer.\n\n" + "\n" + "Done.",
		)
		expect(reconstructReasoningBlocks(events)).toEqual([
			"Step 1: analyze the request.\nStep 2: form a plan.",
			"Double-checking the answer for correctness.",
		])
	})
})
