import React, { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

interface ExtractInlineThinkingSettingsControlProps {
	extractInlineThinking?: boolean
	onChange: (field: "extractInlineThinking", value: any) => void
}

export const ExtractInlineThinkingSettingsControl: React.FC<ExtractInlineThinkingSettingsControlProps> = ({
	extractInlineThinking = false,
	onChange,
}) => {
	const { t } = useAppTranslation()

	const handleExtractInlineThinkingChange = useCallback(
		(e: any) => {
			onChange("extractInlineThinking", e.target.checked)
		},
		[onChange],
	)

	return (
		<div className="flex flex-col gap-1">
			<div>
				<VSCodeCheckbox checked={extractInlineThinking} onChange={handleExtractInlineThinkingChange}>
					<span className="font-medium">{t("settings:advanced.extractInlineThinking.label")}</span>
				</VSCodeCheckbox>
				<div className="text-vscode-descriptionForeground text-sm">
					{t("settings:advanced.extractInlineThinking.description")}
				</div>
			</div>
		</div>
	)
}
