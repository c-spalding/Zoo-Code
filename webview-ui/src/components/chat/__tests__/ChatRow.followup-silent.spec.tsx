// npx vitest run src/components/chat/__tests__/ChatRow.followup-silent.spec.tsx
import React from "react"

import type { ClineMessage, FollowUpData } from "@roo-code/types"

import { renderWithExtensionState, screen } from "@/utils/test-utils"

import { ChatRowContent } from "../ChatRow"

// Mock i18n with the real keys this suite cares about so assertions read the
// production copy rather than opaque translation keys.
vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const map: Record<string, string> = {
				"chat:questions.hasQuestion": "Zoo has a question",
				"chat:questions.waitingForReply": "Zoo is waiting for your reply",
				"chat:followUpSuggest.silentPauseHint": "Zoo paused and is waiting for your input.",
			}
			return map[key] ?? key
		},
	}),
	Trans: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
	initReactI18next: { type: "3rdParty", init: () => {} },
}))

function buildFollowUpMessage(data: FollowUpData): ClineMessage {
	return {
		type: "ask",
		ask: "followup",
		ts: Date.now(),
		partial: false,
		text: JSON.stringify(data),
	}
}

function renderFollowUp(data: FollowUpData) {
	const onSuggestionClick = vi.fn()
	const onFollowUpUnmount = vi.fn()

	const result = renderWithExtensionState(
		<ChatRowContent
			message={buildFollowUpMessage(data)}
			isExpanded={false}
			isLast={true}
			isStreaming={false}
			onToggleExpand={() => {}}
			onSuggestionClick={onSuggestionClick}
			onBatchFileResponse={() => {}}
			onFollowUpUnmount={onFollowUpUnmount}
			isFollowUpAnswered={false}
			isFollowUpAutoApprovalPaused={false}
		/>,
	)

	return { ...result, onSuggestionClick, onFollowUpUnmount }
}

describe("ChatRow - followup (fork tranche T10 silent visible-cue, F-LC-2)", () => {
	it("F-LC-2: never renders nothing for a silent follow-up - shows a visible hint banner instead", () => {
		const { container } = renderFollowUp({
			question: "",
			silent: true,
			suggest: [{ answer: "Please continue." }],
		})

		// The archive's defective behavior returned null for silent follow-ups,
		// producing an invisible, indefinite pause. Assert a real, visible node
		// is rendered instead.
		expect(container.firstChild).not.toBeNull()
		expect(screen.getByText("Zoo paused and is waiting for your input.")).toBeInTheDocument()
	})

	it("suppresses the redundant internal soft-nudge suggestion button for a silent follow-up", () => {
		renderFollowUp({
			question: "",
			silent: true,
			suggest: [{ answer: "Please continue." }],
		})

		// The suggestion text itself must not appear as a clickable button -
		// clicking it would just replay what the auto-approval timeout already
		// sends, so it is redundant and would be confusing to show.
		expect(screen.queryByText("Please continue.")).not.toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "Please continue." })).not.toBeInTheDocument()
	})

	it("does not render the question/suggestion header (icon+title) for a silent follow-up", () => {
		renderFollowUp({
			question: "",
			silent: true,
			suggest: [{ answer: "Please continue." }],
		})

		expect(screen.queryByText("Zoo has a question")).not.toBeInTheDocument()
		expect(screen.queryByText("Zoo is waiting for your reply")).not.toBeInTheDocument()
	})

	it("renders the normal question + suggestion UI unaffected for a genuine (non-silent) follow-up", () => {
		const { onSuggestionClick } = renderFollowUp({
			question: "Which approach do you want?",
			suggest: [{ answer: "Option A" }, { answer: "Option B" }],
		})

		expect(screen.getByText("Zoo has a question")).toBeInTheDocument()
		expect(screen.getByText("Which approach do you want?")).toBeInTheDocument()

		const optionAButton = screen.getByRole("button", { name: "Option A" })
		expect(optionAButton).toBeInTheDocument()

		optionAButton.click()
		expect(onSuggestionClick).toHaveBeenCalled()

		// The silent-only hint banner must never appear for a genuine follow-up.
		expect(screen.queryByText("Zoo paused and is waiting for your input.")).not.toBeInTheDocument()
	})

	it("treats a missing `silent` field the same as `silent: false` (regression safety for pre-T10 payloads)", () => {
		renderFollowUp({
			question: "Legacy payload without a silent field",
			suggest: [{ answer: "OK" }],
		})

		expect(screen.getByText("Zoo has a question")).toBeInTheDocument()
		expect(screen.getByText("Legacy payload without a silent field")).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "OK" })).toBeInTheDocument()
	})
})
