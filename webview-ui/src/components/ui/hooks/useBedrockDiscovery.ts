import { useQuery } from "@tanstack/react-query"

import {
	type BedrockDiscoveredTarget,
	type ExtensionMessage,
	type ProviderSettings,
	BedrockDiscoveryMessageType,
} from "@roo-code/types"

import { vscode } from "@src/utils/vscode"

const BEDROCK_DISCOVERY_TIMEOUT_MS = 15000

const getBedrockDiscovery = async (apiConfiguration: ProviderSettings) =>
	new Promise<BedrockDiscoveredTarget[]>((resolve, reject) => {
		const requestId = `bedrock-discovery-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

		const cleanup = () => {
			window.removeEventListener("message", handler)
		}

		const timeout = setTimeout(() => {
			cleanup()
			reject(new Error("Bedrock discovery request timed out"))
		}, BEDROCK_DISCOVERY_TIMEOUT_MS)

		const handler = (event: MessageEvent) => {
			const message: ExtensionMessage = event.data

			if (message.type !== BedrockDiscoveryMessageType.bedrockDiscovery || message.requestId !== requestId) {
				return
			}

			clearTimeout(timeout)
			cleanup()

			if (message.error) {
				reject(new Error(message.error))
				return
			}

			resolve(message.bedrockDiscovery ?? [])
		}

		window.addEventListener("message", handler)
		vscode.postMessage({
			type: BedrockDiscoveryMessageType.requestBedrockDiscovery,
			requestId,
			apiConfiguration,
		})
	})

/**
 * Discovers Bedrock foundation models and inference profiles available to the configured
 * credentials/region so they can be presented in a searchable dropdown instead of a static list.
 */
export const useBedrockDiscovery = (apiConfiguration: ProviderSettings, enabled = true) =>
	useQuery({
		queryKey: [
			"bedrockDiscovery",
			apiConfiguration.awsRegion ?? "",
			apiConfiguration.awsUseProfile ?? false,
			apiConfiguration.awsProfile ?? "",
			apiConfiguration.awsUseApiKey ?? false,
			apiConfiguration.awsApiKey ?? "",
			apiConfiguration.awsAccessKey ?? "",
			apiConfiguration.awsSecretKey ?? "",
			apiConfiguration.awsSessionToken ?? "",
		],
		queryFn: () => getBedrockDiscovery(apiConfiguration),
		enabled: enabled && !!apiConfiguration.awsRegion,
		retry: false,
	})
