import React, { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

interface TextToolCallFallbackSettingsControlProps {
	textToolCallFallback?: boolean
	onChange: (field: "textToolCallFallback", value: any) => void
}

export const TextToolCallFallbackSettingsControl: React.FC<TextToolCallFallbackSettingsControlProps> = ({
	textToolCallFallback = false,
	onChange,
}) => {
	const { t } = useAppTranslation()

	const handleTextToolCallFallbackChange = useCallback(
		(e: any) => {
			onChange("textToolCallFallback", e.target.checked)
		},
		[onChange],
	)

	return (
		<div className="flex flex-col gap-1">
			<div>
				<VSCodeCheckbox checked={textToolCallFallback} onChange={handleTextToolCallFallbackChange}>
					<span className="font-medium">{t("settings:advanced.textToolCallFallback.label")}</span>
				</VSCodeCheckbox>
				<div className="text-vscode-descriptionForeground text-sm">
					{t("settings:advanced.textToolCallFallback.description")}
				</div>
			</div>
		</div>
	)
}
