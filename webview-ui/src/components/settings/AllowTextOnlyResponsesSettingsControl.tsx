import React, { useCallback } from "react"
import { useAppTranslation } from "@/i18n/TranslationContext"
import { VSCodeCheckbox } from "@vscode/webview-ui-toolkit/react"

interface AllowTextOnlyResponsesSettingsControlProps {
	allowTextOnlyResponses?: boolean
	onChange: (field: "allowTextOnlyResponses", value: any) => void
}

export const AllowTextOnlyResponsesSettingsControl: React.FC<AllowTextOnlyResponsesSettingsControlProps> = ({
	allowTextOnlyResponses = false,
	onChange,
}) => {
	const { t } = useAppTranslation()

	const handleAllowTextOnlyResponsesChange = useCallback(
		(e: any) => {
			onChange("allowTextOnlyResponses", e.target.checked)
		},
		[onChange],
	)

	return (
		<div className="flex flex-col gap-1">
			<div>
				<VSCodeCheckbox checked={allowTextOnlyResponses} onChange={handleAllowTextOnlyResponsesChange}>
					<span className="font-medium">{t("settings:advanced.allowTextOnlyResponses.label")}</span>
				</VSCodeCheckbox>
				<div className="text-vscode-descriptionForeground text-sm">
					{t("settings:advanced.allowTextOnlyResponses.description")}
				</div>
			</div>
		</div>
	)
}
