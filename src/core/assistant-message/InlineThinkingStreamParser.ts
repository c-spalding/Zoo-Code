import { INLINE_THINKING_TAG_NAMES, THINKING_OPEN_TAG_REGEX } from "./thinking-tags"

/**
 * An event emitted by {@link InlineThinkingStreamParser} as it consumes streamed text.
 *
 * - `"text"` events carry a delta of plain, tag-stripped text that should be appended
 *   to the assistant's visible text output.
 * - `"reasoning"` events carry the full content accumulated so far for the *current*
 *   thinking-tag occurrence (not a delta - callers should replace, not append, matching
 *   `Task.say()`'s partial-message semantics). `partial: true` means more content for
 *   this occurrence may still follow; `partial: false` means this occurrence is complete
 *   (either its closing tag was found, or the stream ended while the tag was still open).
 */
export type InlineThinkingEvent = { type: "text"; text: string } | { type: "reasoning"; text: string; partial: boolean }

// Longest supported tag name, used to size the chunk-boundary lookahead below.
const LONGEST_TAG_NAME_LENGTH = Math.max(...INLINE_THINKING_TAG_NAMES.map((name) => name.length))

// How many trailing characters of "no complete opening tag found" text we treat as a
// potential partial tag start (and therefore buffer rather than emit immediately).
// Sized to the longest possible opening tag ("<reasoning>" = 11 chars) plus a small
// safety margin, so a tag split across a chunk boundary is never mistakenly flushed
// as plain text.
const PARTIAL_OPEN_TAG_LOOKAHEAD = LONGEST_TAG_NAME_LENGTH + 2 /* "<" + ">" */ + 4 /* safety margin */

/**
 * Pure, dependency-free streaming parser that extracts `<think>`, `<thinking>`, and
 * `<reasoning>` tags from a model's incrementally-streamed plain-text output.
 *
 * This is the extracted, directly-testable form of the inline-thinking state machine
 * (fork tranche T8). It has no VS Code imports, no timers, and no side effects - it is
 * fed raw text chunks via {@link push} and returns a list of events describing what
 * happened; callers (e.g. `Task.ts`) are responsible for routing those events to the UI
 * (text block updates vs `say("reasoning", ...)` calls).
 *
 * Usage:
 * ```ts
 * const parser = new InlineThinkingStreamParser()
 * for (const chunk of streamedChunks) {
 *   for (const event of parser.push(chunk)) {
 *     // route event.type === "text" | "reasoning"
 *   }
 * }
 * // At stream end, flush any buffered state (unclosed tag, trailing partial-tag text):
 * for (const event of parser.flush()) {
 *   // route remaining events
 * }
 * ```
 */
export class InlineThinkingStreamParser {
	private inTag = false
	private tagName = ""
	private tagContent = ""
	private pending = ""

	/**
	 * Feed the next chunk of streamed text through the parser.
	 *
	 * @returns Events describing the text/reasoning content extracted from this chunk,
	 *   in the order they occurred. May be empty (e.g. if the entire chunk was buffered
	 *   as a potential partial tag).
	 */
	push(chunk: string): InlineThinkingEvent[] {
		const events: InlineThinkingEvent[] = []
		let remaining = this.pending + chunk
		this.pending = ""

		while (remaining.length > 0) {
			if (!this.inTag) {
				remaining = this.consumeTextMode(remaining, events)
			} else {
				remaining = this.consumeTagMode(remaining, events)
			}
		}

		return events
	}

	/**
	 * Signal end-of-stream. Flushes any buffered state:
	 * - If a tag was left open (unclosed at stream end), its accumulated content
	 *   (including any trailing buffered text) is emitted as a final, non-partial
	 *   `"reasoning"` event.
	 * - Otherwise, any buffered text that turned out not to be the start of a tag is
	 *   emitted as a final `"text"` event.
	 *
	 * @returns Any final events produced by the flush. May be empty.
	 */
	flush(): InlineThinkingEvent[] {
		const events: InlineThinkingEvent[] = []

		if (this.inTag) {
			const finalContent = (this.tagContent + this.pending).trim()
			this.pending = ""
			this.inTag = false
			this.tagName = ""
			this.tagContent = ""

			if (finalContent) {
				events.push({ type: "reasoning", text: finalContent, partial: false })
			}
		} else if (this.pending) {
			const text = this.pending
			this.pending = ""
			events.push({ type: "text", text })
		}

		return events
	}

	// --- TEXT mode: scan for an opening thinking tag ---
	private consumeTextMode(remaining: string, events: InlineThinkingEvent[]): string {
		const openMatch = remaining.match(THINKING_OPEN_TAG_REGEX)

		if (openMatch && openMatch.index !== undefined) {
			// Text before the opening tag is plain output.
			const textPart = remaining.slice(0, openMatch.index)
			if (textPart) {
				events.push({ type: "text", text: textPart })
			}

			this.inTag = true
			this.tagName = openMatch[1].toLowerCase()
			this.tagContent = ""

			return remaining.slice(openMatch.index + openMatch[0].length)
		}

		// No complete opening tag found. Buffer any trailing `<` that could be the
		// start of a tag split across the next chunk boundary.
		const ltIdx = remaining.lastIndexOf("<")
		let safeText: string

		if (ltIdx !== -1 && ltIdx > remaining.length - PARTIAL_OPEN_TAG_LOOKAHEAD) {
			safeText = remaining.slice(0, ltIdx)
			this.pending = remaining.slice(ltIdx)
		} else {
			safeText = remaining
		}

		if (safeText) {
			events.push({ type: "text", text: safeText })
		}

		return ""
	}

	// --- TAG mode: scan for the matching closing tag ---
	private consumeTagMode(remaining: string, events: InlineThinkingEvent[]): string {
		const closeTag = `</${this.tagName}>`
		const closeIdx = remaining.toLowerCase().indexOf(closeTag)

		if (closeIdx !== -1) {
			this.tagContent += remaining.slice(0, closeIdx)
			events.push({ type: "reasoning", text: this.tagContent.trim(), partial: false })

			this.inTag = false
			this.tagName = ""
			this.tagContent = ""

			return remaining.slice(closeIdx + closeTag.length)
		}

		// Closing tag not found yet. Buffer any trailing `<` that could be the start of
		// a (possibly partial) closing tag split across the next chunk boundary.
		const ltIdx = remaining.lastIndexOf("<")
		let safeContent: string

		if (ltIdx !== -1 && ltIdx > remaining.length - (closeTag.length + 1)) {
			safeContent = remaining.slice(0, ltIdx)
			this.pending = remaining.slice(ltIdx)
		} else {
			safeContent = remaining
		}

		if (safeContent) {
			this.tagContent += safeContent
			events.push({ type: "reasoning", text: this.tagContent, partial: true })
		}

		return ""
	}
}
