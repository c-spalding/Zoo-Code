/**
 * Shared source of truth for the inline-thinking tag names and regexes used to detect
 * and extract `<think>`, `<thinking>`, and `<reasoning>` tags from a model's plain-text
 * output.
 *
 * Some models (particularly open-weight models without a dedicated reasoning-content
 * channel) emit their chain-of-thought inline, wrapped in one of these tags, as part of
 * their regular text output. Extracting that content lets the UI render it as a
 * collapsible reasoning block instead of showing it as raw text.
 *
 * Consumers:
 * - `InlineThinkingStreamParser` (fork tranche T8): real-time streaming extraction used
 *   by `Task.ts`'s `case "text"` chunk handler.
 * - `TextToolCallExtractor` (fork tranche T9, future): post-hoc extraction/removal used
 *   by the text-based tool-call fallback path. T9 should import `THINKING_TAG_REGEX`
 *   from here rather than redefining it, to avoid two copies of the same tag list
 *   drifting apart (see fork-docs/fork-feature-inventory.md, defect F-DC-1).
 */

/** The tag names recognised as inline-thinking wrappers. */
export const INLINE_THINKING_TAG_NAMES = ["think", "thinking", "reasoning"] as const

export type InlineThinkingTagName = (typeof INLINE_THINKING_TAG_NAMES)[number]

/**
 * Matches a complete `<think>...</think>` / `<thinking>...</thinking>` /
 * `<reasoning>...</reasoning>` pair, including its inner content, as a single match.
 *
 * Group 1 is the tag name; group 2 is the inner content. Global + case-insensitive so
 * callers can find/replace all occurrences in a complete (non-streaming) string.
 *
 * Only matches bare tags with no attributes, by design - a tag like
 * `<think attribute="x">` is treated as plain text, not as a thinking wrapper.
 */
export const THINKING_TAG_REGEX = /<(think|thinking|reasoning)>([\s\S]*?)<\/\1>/gi

/**
 * Matches a bare opening tag, e.g. `<think>`. Case-insensitive, not global (callers
 * that need to scan incrementally should use `.exec`/`.match` and slice past the match).
 *
 * Only matches bare tags with no attributes - see `THINKING_TAG_REGEX` above.
 */
export const THINKING_OPEN_TAG_REGEX = /<(think|thinking|reasoning)>/i
