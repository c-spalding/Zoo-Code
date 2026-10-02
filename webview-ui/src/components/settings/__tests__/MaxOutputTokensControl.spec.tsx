// npx vitest src/components/settings/__tests__/MaxOutputTokensControl.spec.tsx

import { render, screen, fireEvent } from "@testing-library/react"

import { MaxOutputTokensControl } from "../MaxOutputTokensControl"

// Mock the shared Slider so we can drive it like a plain range input.
vi.mock("@src/components/ui", () => ({
	Slider: ({ value, min, max, step, onValueChange, disabled, "data-testid": dataTestId }: any) => (
		<input
			type="range"
			data-testid={dataTestId}
			min={min}
			max={max}
			step={step}
			value={value[0]}
			disabled={disabled}
			onChange={(e) => onValueChange([parseInt(e.target.value, 10)])}
		/>
	),
}))

// Mock VSCodeTextField so FormattedTextField renders as a plain HTML input (mirrors
// FormattedTextField.spec.tsx's own mocking strategy for the same underlying component).
vi.mock("@vscode/webview-ui-toolkit/react", () => ({
	VSCodeTextField: ({
		value,
		onInput,
		onBlur,
		placeholder,
		disabled,
		"aria-label": ariaLabel,
		"data-testid": dataTestId,
	}: any) => (
		<input
			type="text"
			value={value}
			onChange={(e) => onInput({ target: { value: e.target.value } })}
			onBlur={onBlur}
			placeholder={placeholder}
			disabled={disabled}
			aria-label={ariaLabel}
			data-testid={dataTestId}
		/>
	),
}))

describe("MaxOutputTokensControl", () => {
	it("renders the slider and numeric input with the current value", () => {
		render(<MaxOutputTokensControl value={8192} min={1024} max={16384} onChange={vi.fn()} />)

		expect(screen.getByTestId("max-output-tokens-slider")).toHaveValue("8192")
		expect(screen.getByTestId("max-output-tokens-input")).toHaveValue("8192")
	})

	it("falls back to min when value is 0 and no defaultValue is given", () => {
		render(<MaxOutputTokensControl value={0} min={1024} max={16384} onChange={vi.fn()} />)

		expect(screen.getByTestId("max-output-tokens-input")).toHaveValue("1024")
	})

	it("falls back to defaultValue when value is 0 and a defaultValue is given", () => {
		render(<MaxOutputTokensControl value={0} min={1024} max={16384} defaultValue={4096} onChange={vi.fn()} />)

		expect(screen.getByTestId("max-output-tokens-input")).toHaveValue("4096")
	})

	it("expands the slider max to accommodate a value above the declared max", () => {
		render(<MaxOutputTokensControl value={64000} min={1024} max={16384} onChange={vi.fn()} />)

		const slider = screen.getByTestId("max-output-tokens-slider")
		expect(slider).toHaveValue("64000")
		expect(slider.getAttribute("max")).toBe("64000")
	})

	it("calls onChange with the slider's value when moved", () => {
		const onChange = vi.fn()
		render(<MaxOutputTokensControl value={8192} min={1024} max={16384} onChange={onChange} />)

		fireEvent.change(screen.getByTestId("max-output-tokens-slider"), { target: { value: "12000" } })

		expect(onChange).toHaveBeenCalledWith(12000)
	})

	it("calls onChange with the parsed numeric input value", () => {
		const onChange = vi.fn()
		render(<MaxOutputTokensControl value={8192} min={1024} max={16384} onChange={onChange} />)

		fireEvent.change(screen.getByTestId("max-output-tokens-input"), { target: { value: "9500" } })

		expect(onChange).toHaveBeenCalledWith(9500)
	})

	it("clamps a typed value below min up to min", () => {
		const onChange = vi.fn()
		render(<MaxOutputTokensControl value={8192} min={1024} max={16384} onChange={onChange} />)

		fireEvent.change(screen.getByTestId("max-output-tokens-input"), { target: { value: "10" } })

		expect(onChange).toHaveBeenCalledWith(1024)
	})

	it("reverts to min when the numeric input is cleared", () => {
		const onChange = vi.fn()
		render(<MaxOutputTokensControl value={8192} min={1024} max={16384} onChange={onChange} />)

		fireEvent.change(screen.getByTestId("max-output-tokens-input"), { target: { value: "" } })

		expect(onChange).toHaveBeenCalledWith(1024)
	})

	it("computes a coarser slider step for large max values (~128 stops, rounded to 1024)", () => {
		render(<MaxOutputTokensControl value={100000} min={1024} max={1000000} onChange={vi.fn()} />)

		expect(screen.getByTestId("max-output-tokens-slider").getAttribute("step")).toBe("8192")
	})

	it("uses the minimum step of 1024 for small max values", () => {
		render(<MaxOutputTokensControl value={2048} min={1024} max={4096} onChange={vi.fn()} />)

		expect(screen.getByTestId("max-output-tokens-slider").getAttribute("step")).toBe("1024")
	})

	it("renders extraSlot and helperText when provided", () => {
		render(
			<MaxOutputTokensControl
				value={8192}
				min={1024}
				max={16384}
				onChange={vi.fn()}
				extraSlot={<button>Detect</button>}
				helperText="Detected cap: 8192 tokens"
			/>,
		)

		expect(screen.getByRole("button", { name: "Detect" })).toBeInTheDocument()
		expect(screen.getByText("Detected cap: 8192 tokens")).toBeInTheDocument()
	})

	it("omits extraSlot and helperText rows when not provided", () => {
		render(<MaxOutputTokensControl value={8192} min={1024} max={16384} onChange={vi.fn()} />)

		expect(screen.queryByRole("button")).not.toBeInTheDocument()
	})
})
