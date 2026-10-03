import { render, screen, fireEvent } from "@testing-library/react"

import { ExtractInlineThinkingSettingsControl } from "../ExtractInlineThinkingSettingsControl"

// Mock the translation hook
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"settings:advanced.extractInlineThinking.label": "Extract inline thinking tags",
				"settings:advanced.extractInlineThinking.description":
					"When enabled, Zoo detects <think>, <thinking>, and <reasoning> tags in a model's plain-text output and displays their contents as a collapsible reasoning block, instead of showing the raw tags in the response.",
			}
			return translations[key] || key
		},
	}),
}))

// Mock VSCodeCheckbox
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeCheckbox: ({ children, onChange, checked, ...props }: any) => (
		<label>
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange({ target: { checked: e.target.checked } })}
				{...props}
			/>
			{children}
		</label>
	),
}))

describe("ExtractInlineThinkingSettingsControl", () => {
	it("renders with default props", () => {
		const onChange = vi.fn()
		render(<ExtractInlineThinkingSettingsControl onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		const label = screen.getByText("Extract inline thinking tags")
		const description = screen.getByText(/When enabled, Zoo detects/)

		expect(checkbox).toBeInTheDocument()
		expect(checkbox).not.toBeChecked() // Default is false
		expect(label).toBeInTheDocument()
		expect(description).toBeInTheDocument()
	})

	it("renders with extractInlineThinking set to true", () => {
		const onChange = vi.fn()
		render(<ExtractInlineThinkingSettingsControl extractInlineThinking={true} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).toBeChecked()
	})

	it("calls onChange when checkbox is clicked", () => {
		const onChange = vi.fn()
		render(<ExtractInlineThinkingSettingsControl extractInlineThinking={false} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		fireEvent.click(checkbox)

		expect(onChange).toHaveBeenCalledWith("extractInlineThinking", true)
	})

	it("toggles from checked to unchecked", () => {
		const onChange = vi.fn()
		render(<ExtractInlineThinkingSettingsControl extractInlineThinking={true} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		fireEvent.click(checkbox)

		expect(onChange).toHaveBeenCalledWith("extractInlineThinking", false)
	})
})
