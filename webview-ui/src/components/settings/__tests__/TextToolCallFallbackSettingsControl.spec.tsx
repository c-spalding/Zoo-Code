import { render, screen, fireEvent } from "@testing-library/react"

import { TextToolCallFallbackSettingsControl } from "../TextToolCallFallbackSettingsControl"

// Mock the translation hook
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"settings:advanced.textToolCallFallback.label": "Fall back to text-based tool calls",
				"settings:advanced.textToolCallFallback.description":
					"When enabled, if the model responds with plain text instead of using a native tool call, Zoo scans the text for an XML, Anthropic-invoke, or JSON-in-fenced-code tool call and executes it. Useful for models without native function-calling support (e.g. many open-weight models served via Bedrock or local inference servers). Models that do support native function-calling are instructed to prefer it, so their behavior is unchanged.",
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

describe("TextToolCallFallbackSettingsControl", () => {
	it("renders with default props", () => {
		const onChange = vi.fn()
		render(<TextToolCallFallbackSettingsControl onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		const label = screen.getByText("Fall back to text-based tool calls")
		const description = screen.getByText(/When enabled, if the model responds with plain text/)

		expect(checkbox).toBeInTheDocument()
		expect(checkbox).not.toBeChecked() // Default is false
		expect(label).toBeInTheDocument()
		expect(description).toBeInTheDocument()
	})

	it("renders with textToolCallFallback set to true", () => {
		const onChange = vi.fn()
		render(<TextToolCallFallbackSettingsControl textToolCallFallback={true} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).toBeChecked()
	})

	it("calls onChange when checkbox is clicked", () => {
		const onChange = vi.fn()
		render(<TextToolCallFallbackSettingsControl textToolCallFallback={false} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		fireEvent.click(checkbox)

		expect(onChange).toHaveBeenCalledWith("textToolCallFallback", true)
	})

	it("toggles from checked to unchecked", () => {
		const onChange = vi.fn()
		render(<TextToolCallFallbackSettingsControl textToolCallFallback={true} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		fireEvent.click(checkbox)

		expect(onChange).toHaveBeenCalledWith("textToolCallFallback", false)
	})
})
