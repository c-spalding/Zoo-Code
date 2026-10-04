import { render, screen, fireEvent } from "@testing-library/react"

import { AllowTextOnlyResponsesSettingsControl } from "../AllowTextOnlyResponsesSettingsControl"

// Mock the translation hook
vi.mock("@/i18n/TranslationContext", () => ({
	useAppTranslation: () => ({
		t: (key: string) => {
			const translations: Record<string, string> = {
				"settings:advanced.allowTextOnlyResponses.label": "Allow text-only responses",
				"settings:advanced.allowTextOnlyResponses.description":
					"When enabled, if the model responds with plain text and no tool call (and no fallback tool call was found), Zoo presents the text as a follow-up question instead of showing a tool-use error. If auto-approval and auto-approve follow-up questions are both on, Zoo waits briefly for your reply, then automatically nudges the model to continue. When this setting is off, a text-only response is always treated as an error, exactly as before.",
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

describe("AllowTextOnlyResponsesSettingsControl", () => {
	it("renders with default props", () => {
		const onChange = vi.fn()
		render(<AllowTextOnlyResponsesSettingsControl onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		const label = screen.getByText("Allow text-only responses")
		const description = screen.getByText(/When enabled, if the model responds with plain text/)

		expect(checkbox).toBeInTheDocument()
		expect(checkbox).not.toBeChecked() // Default is false
		expect(label).toBeInTheDocument()
		expect(description).toBeInTheDocument()
	})

	it("renders with allowTextOnlyResponses set to true", () => {
		const onChange = vi.fn()
		render(<AllowTextOnlyResponsesSettingsControl allowTextOnlyResponses={true} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		expect(checkbox).toBeChecked()
	})

	it("calls onChange when checkbox is clicked", () => {
		const onChange = vi.fn()
		render(<AllowTextOnlyResponsesSettingsControl allowTextOnlyResponses={false} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		fireEvent.click(checkbox)

		expect(onChange).toHaveBeenCalledWith("allowTextOnlyResponses", true)
	})

	it("toggles from checked to unchecked", () => {
		const onChange = vi.fn()
		render(<AllowTextOnlyResponsesSettingsControl allowTextOnlyResponses={true} onChange={onChange} />)

		const checkbox = screen.getByRole("checkbox")
		fireEvent.click(checkbox)

		expect(onChange).toHaveBeenCalledWith("allowTextOnlyResponses", false)
	})
})
