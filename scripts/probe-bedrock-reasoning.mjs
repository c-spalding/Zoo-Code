#!/usr/bin/env node
// T11 phase A -> phase B gate: empirically probe Amazon Bedrock Converse for the
// still-unverified reasoning-effort payload contract on the new GPT-5.6/6 and
// Kimi K3 models (see plans/new-bedrock-models-research.md, Q1/Q2/Q4).
//
// This script makes REAL, BILLED calls to Amazon Bedrock. It is a manual,
// human-run diagnostic tool - it is not part of any test suite and is not run
// in CI. It requires no committed secrets: credentials are resolved through
// the standard AWS SDK v3 default provider chain (environment variables,
// AWS_PROFILE + shared credentials file, SSO, or IMDS). Nothing sensitive is
// written to stdout - foundation-model ids never carry an account id (unlike
// custom ARNs), so results are safe to paste into an issue or PR description.
//
// Test matrix:
//   a. baseline       - plain Converse call, no reasoning field at all.
//   b. flat-effort    - additionalModelRequestFields.reasoning_effort = <value>
//                       (the flat shape guessed in the T11 catalog research).
//   c. nested-effort  - additionalModelRequestFields.reasoning.effort = <value>
//                       (the alternative shape AWS might expect instead).
//   d. illegal-effort - flat shape with a deliberately invalid value, to read
//                       AWS's validation error text. If it echoes back a field
//                       name, that tells us the real contract even when a/b/c
//                       don't.
//   e. k3-multiturn   - Kimi K3 only (matched by "kimi-k3" in --model). Sends
//                       a first turn, then echoes the exact assistant message
//                       (including any reasoningContent block) back as history
//                       in a second turn, to check for the documented
//                       InternalServerException on reasoning-content echo.
//
// Usage (PowerShell):
//   $env:AWS_PROFILE = "my-profile"
//   $env:AWS_REGION  = "us-east-1"
//   node scripts/probe-bedrock-reasoning.mjs --model openai.gpt-6-sol --profile-prefix us. --yes
//
//   node scripts/probe-bedrock-reasoning.mjs --model moonshotai.kimi-k3 --profile-prefix global. --yes
//
// Run without --yes first to see the plan (models, tests, estimated cost)
// without spending anything; add --yes once you're happy to proceed.
//
// Flags:
//   --model <id>          Required. Base Bedrock model id, e.g. "openai.gpt-6-sol"
//                          or "moonshotai.kimi-k3" (no profile prefix - the
//                          script adds one itself, see --profile-prefix).
//   --region <region>     AWS region, e.g. "us-east-1". Falls back to
//                          $AWS_REGION / $AWS_DEFAULT_REGION if omitted.
//   --profile-prefix <p>  Inference-profile prefix to prepend to --model
//                          before invoking. Default: "global." (the one AWS
//                          documents as broadly available for these models -
//                          see BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS
//                          in packages/types/src/providers/bedrock.ts). Pass
//                          "us." to test the region-specific profile instead,
//                          or "" to deliberately test the unprefixed id (this
//                          is expected to fail for these models).
//   --effort <value>      Reasoning-effort value to send in tests b/c. Default
//                          "low" (cheapest valid value per the GPT-6 Sol/Luna
//                          card's documented enum).
//   --max-tokens <n>      Max output tokens per call. Default 200 (kept small
//                          to bound cost - this is a diagnostic probe, not a
//                          real workload).
//   --stream               Use ConverseStreamCommand instead of ConverseCommand
//                          for every test in the matrix.
//   --skip-k3-multiturn    Skip test (e) even when --model matches "kimi-k3".
//   --yes                  Actually place the calls. Without this flag the
//                          script only prints the plan and exits (no AWS
//                          calls, no cost).
//   --help                 Print this usage block and exit.

import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

// @aws-sdk/client-bedrock-runtime is a dependency of the `src` workspace
// package, not the repo root, so it only exists under src/node_modules.
// Node's ESM resolver walks up from THIS file's own directory (scripts/),
// never from process.cwd() or from sibling workspace directories, so a plain
// `import ... from "@aws-sdk/client-bedrock-runtime"` fails no matter which
// directory this script is invoked from. Anchoring a CJS `require` at
// src/package.json makes Node resolve the dependency the same way the
// extension itself does, without bundling or duplicating the dependency at
// the repo root.
const requireFromSrcWorkspace = createRequire(fileURLToPath(new URL("../src/package.json", import.meta.url)))
const { BedrockRuntimeClient, ConverseCommand, ConverseStreamCommand } = requireFromSrcWorkspace(
	"@aws-sdk/client-bedrock-runtime",
)

const HELP_TEXT = `probe-bedrock-reasoning.mjs - empirically test the Bedrock Converse
reasoning-effort payload contract for the T11 GPT-5.6/6 and Kimi K3 models.

See the file header for full usage details. Quick start:

  node scripts/probe-bedrock-reasoning.mjs --model openai.gpt-6-sol --profile-prefix us. --yes
  node scripts/probe-bedrock-reasoning.mjs --model moonshotai.kimi-k3 --profile-prefix global. --yes

Flags:
  --model <id>          Required. Base model id (no profile prefix).
  --region <region>     AWS region. Falls back to $AWS_REGION / $AWS_DEFAULT_REGION.
  --profile-prefix <p>  Prefix to prepend to --model. Default: "global."
  --effort <value>      Effort value for tests b/c. Default: "low".
  --max-tokens <n>      Max output tokens per call. Default: 200.
  --stream               Use ConverseStreamCommand for every test.
  --skip-k3-multiturn    Skip test (e) even for Kimi K3.
  --yes                  Actually place calls (omit for a dry-run plan only).
  --help                 Print this text and exit.
`

function parseArgs(argv) {
	const args = {
		model: undefined,
		region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || undefined,
		profilePrefix: "global.",
		effort: "low",
		maxTokens: 200,
		stream: false,
		skipK3Multiturn: false,
		yes: false,
		help: false,
	}

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		const next = () => argv[++i]

		switch (arg) {
			case "--model":
				args.model = next()
				break
			case "--region":
				args.region = next()
				break
			case "--profile-prefix":
				args.profilePrefix = next()
				break
			case "--effort":
				args.effort = next()
				break
			case "--max-tokens":
				args.maxTokens = Number.parseInt(next(), 10)
				break
			case "--stream":
				args.stream = true
				break
			case "--skip-k3-multiturn":
				args.skipK3Multiturn = true
				break
			case "--yes":
				args.yes = true
				break
			case "--help":
			case "-h":
				args.help = true
				break
			default:
				if (arg.startsWith("--")) {
					const eq = arg.indexOf("=")
					if (eq !== -1) {
						const key = arg.slice(2, eq)
						const value = arg.slice(eq + 1)
						argv.splice(i, 1, `--${key}`, value)
						i--
						continue
					}
				}
				console.error(`Unknown argument: ${arg}`)
				process.exit(1)
		}
	}

	return args
}

function isKimiK3(modelId) {
	return modelId.toLowerCase().includes("kimi-k3")
}

// Scan a Bedrock Converse content-block array for the first non-empty text
// block and concatenate any reasoning-carrying blocks (reasoningContent.text
// or the legacy "thinking" field). Kept deliberately loose about exact SDK
// field names since this is a diagnostic script, not production code.
function extractContent(contentBlocks) {
	if (!Array.isArray(contentBlocks)) {
		return { text: "", reasoning: "" }
	}

	let text = ""
	let reasoning = ""

	for (const block of contentBlocks) {
		if (!text && typeof block?.text === "string" && block.text.trim().length > 0) {
			text = block.text
		}
		if (typeof block?.reasoningContent?.text === "string") {
			reasoning += block.reasoningContent.text
		}
		if (typeof block?.thinking === "string") {
			reasoning += block.thinking
		}
	}

	return { text, reasoning }
}

function describeError(error) {
	const name = error?.name || error?.constructor?.name || "UnknownError"
	const message = typeof error?.message === "string" ? error.message : String(error)
	const httpStatusCode = error?.$metadata?.httpStatusCode
	const requestId = error?.$metadata?.requestId
	return { name, message, httpStatusCode, requestId }
}

// Places one Converse (or ConverseStream) call and normalises the result,
// regardless of streaming mode, into { text, reasoning, stopReason, usage, message }.
// `message` is the full assistant message object when available (non-streaming
// only) - used by test (e) to echo the exact content blocks back on turn two.
async function invokeConverse(client, { modelId, messages, additionalModelRequestFields, maxTokens, stream }) {
	const basePayload = {
		modelId,
		messages,
		inferenceConfig: { maxTokens },
		...(additionalModelRequestFields ? { additionalModelRequestFields } : {}),
	}

	if (!stream) {
		const response = await client.send(new ConverseCommand(basePayload))
		const content = response?.output?.message?.content ?? []
		const { text, reasoning } = extractContent(content)
		return {
			text,
			reasoning,
			stopReason: response?.stopReason,
			usage: response?.usage,
			message: response?.output?.message,
		}
	}

	const response = await client.send(new ConverseStreamCommand(basePayload))
	let text = ""
	let reasoning = ""
	let stopReason
	let usage

	for await (const event of response.stream ?? []) {
		const delta = event?.contentBlockDelta?.delta
		if (typeof delta?.text === "string") {
			text += delta.text
		}
		if (typeof delta?.reasoningContent?.text === "string") {
			reasoning += delta.reasoningContent.text
		}
		if (typeof delta?.thinking === "string") {
			reasoning += delta.thinking
		}
		if (event?.messageStop?.stopReason) {
			stopReason = event.messageStop.stopReason
		}
		if (event?.metadata?.usage) {
			usage = event.metadata.usage
		}
	}

	// Streaming mode cannot cheaply reconstruct the exact content-block array
	// AWS would have returned (it only ever sees deltas), so test (e) falls
	// back to a synthesised approximation when --stream is set. This is a
	// documented limitation of the probe, not of the real extension code path
	// (which uses the non-streaming shape faithfully; see completePrompt in
	// src/api/providers/bedrock.ts).
	const message = {
		role: "assistant",
		content: [...(reasoning ? [{ reasoningContent: { text: reasoning } }] : []), ...(text ? [{ text }] : [])],
	}

	return { text, reasoning, stopReason, usage, message }
}

function truncate(value, maxLength) {
	if (typeof value !== "string") {
		return value
	}
	return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value
}

async function runTest(results, id, description, fn) {
	const startedAt = Date.now()
	let outcome

	try {
		const result = await fn()
		outcome = {
			id,
			description,
			ok: true,
			durationMs: Date.now() - startedAt,
			text: truncate(result.text, 200),
			reasoning: truncate(result.reasoning, 200),
			stopReason: result.stopReason,
			usage: result.usage,
		}
	} catch (error) {
		const described = describeError(error)
		outcome = {
			id,
			description,
			ok: false,
			durationMs: Date.now() - startedAt,
			errorName: described.name,
			errorMessage: truncate(described.message, 400),
			httpStatusCode: described.httpStatusCode,
			requestId: described.requestId,
		}
	}

	results.push(outcome)
	console.log(JSON.stringify(outcome))
	return outcome
}

function printSummaryTable(results) {
	console.log("")
	console.log("=== Summary ===")
	const rows = results.map((r) => ({
		test: r.id,
		result: r.ok ? "OK" : "ERROR",
		detail: r.ok
			? `stopReason=${r.stopReason ?? "n/a"} text="${truncate(r.text, 60)}"`
			: `${r.errorName}: ${truncate(r.errorMessage, 80)}`,
	}))

	const testWidth = Math.max(...rows.map((r) => r.test.length), "test".length)
	const resultWidth = Math.max(...rows.map((r) => r.result.length), "result".length)

	const pad = (s, w) => s + " ".repeat(Math.max(0, w - s.length))

	console.log(`${pad("test", testWidth)} | ${pad("result", resultWidth)} | detail`)
	console.log(`${"-".repeat(testWidth)} | ${"-".repeat(resultWidth)} | ${"-".repeat(40)}`)
	for (const row of rows) {
		console.log(`${pad(row.test, testWidth)} | ${pad(row.result, resultWidth)} | ${row.detail}`)
	}
	console.log("")
}

async function main() {
	const args = parseArgs(process.argv.slice(2))

	if (args.help) {
		console.log(HELP_TEXT)
		return
	}

	if (!args.model) {
		console.error("Missing required --model <id>. Run with --help for usage.")
		process.exitCode = 1
		return
	}

	if (!args.region) {
		console.error(
			"Missing --region and no AWS_REGION/AWS_DEFAULT_REGION set in the environment. Run with --help for usage.",
		)
		process.exitCode = 1
		return
	}

	const modelId = `${args.profilePrefix}${args.model}`
	const runK3Test = isKimiK3(args.model) && !args.skipK3Multiturn

	const plannedTests = ["a-baseline", "b-flat-effort", "c-nested-effort", "d-illegal-effort"]
	if (runK3Test) {
		plannedTests.push("e-k3-multiturn")
	}

	console.log("=== Plan ===")
	console.log(`model id (with profile prefix): ${modelId}`)
	console.log(`region: ${args.region}`)
	console.log(`stream: ${args.stream}`)
	console.log(`effort value under test: ${args.effort}`)
	console.log(`max tokens per call: ${args.maxTokens}`)
	console.log(`tests to run: ${plannedTests.join(", ")}`)
	console.log(
		`estimated cost: a handful of short Converse calls with maxTokens=${args.maxTokens}; ` +
			"well under US$0.05 total at current Bedrock list prices for these models.",
	)
	console.log("")

	if (!args.yes) {
		console.log("Dry run only (no --yes passed). No AWS calls were made. Add --yes to actually run the probe.")
		return
	}

	const client = new BedrockRuntimeClient({ region: args.region })
	const results = []

	const question = "What is 2+2? Reply with just the number."
	const baseMessages = [{ role: "user", content: [{ text: question }] }]

	await runTest(results, "a-baseline", "Plain Converse call, no reasoning field", () =>
		invokeConverse(client, {
			modelId,
			messages: baseMessages,
			additionalModelRequestFields: undefined,
			maxTokens: args.maxTokens,
			stream: args.stream,
		}),
	)

	await runTest(results, "b-flat-effort", `additionalModelRequestFields.reasoning_effort = "${args.effort}"`, () =>
		invokeConverse(client, {
			modelId,
			messages: baseMessages,
			additionalModelRequestFields: { reasoning_effort: args.effort },
			maxTokens: args.maxTokens,
			stream: args.stream,
		}),
	)

	await runTest(
		results,
		"c-nested-effort",
		`additionalModelRequestFields.reasoning.effort = "${args.effort}"`,
		() =>
			invokeConverse(client, {
				modelId,
				messages: baseMessages,
				additionalModelRequestFields: { reasoning: { effort: args.effort } },
				maxTokens: args.maxTokens,
				stream: args.stream,
			}),
	)

	await runTest(
		results,
		"d-illegal-effort",
		'additionalModelRequestFields.reasoning_effort = "not-a-real-effort-value" (expect a validation error whose wording may confirm the real field name)',
		() =>
			invokeConverse(client, {
				modelId,
				messages: baseMessages,
				additionalModelRequestFields: { reasoning_effort: "not-a-real-effort-value" },
				maxTokens: args.maxTokens,
				stream: args.stream,
			}),
	)

	if (runK3Test) {
		const turnOneQuestion = "What is the capital of France? Answer in one word."
		const turnOneMessages = [{ role: "user", content: [{ text: turnOneQuestion }] }]

		const turnOne = await runTest(
			results,
			"e-k3-multiturn-turn1",
			"Kimi K3 turn 1 (establishes reasoning content to echo back on turn 2)",
			() =>
				invokeConverse(client, {
					modelId,
					messages: turnOneMessages,
					additionalModelRequestFields: undefined,
					maxTokens: args.maxTokens,
					stream: args.stream,
				}),
		)

		if (turnOne.ok) {
			// Echo the exact assistant message (including any reasoningContent
			// block) back as history, then ask a follow-up. This is the shape
			// documented by AWS as risking InternalServerException for K3.
			const assistantMessage =
				turnOne.message ??
				// Fallback reconstruction if the runner didn't retain the raw
				// message (should not normally happen - kept for robustness).
				{
					role: "assistant",
					content: [
						...(turnOne.reasoning ? [{ reasoningContent: { text: turnOne.reasoning } }] : []),
						...(turnOne.text ? [{ text: turnOne.text }] : []),
					],
				}

			const turnTwoMessages = [
				{ role: "user", content: [{ text: turnOneQuestion }] },
				assistantMessage,
				{ role: "user", content: [{ text: "And what is its approximate population? One sentence." }] },
			]

			await runTest(
				results,
				"e-k3-multiturn-turn2",
				"Kimi K3 turn 2 with turn-1 reasoning content echoed back (InternalServerException risk per AWS docs)",
				() =>
					invokeConverse(client, {
						modelId,
						messages: turnTwoMessages,
						additionalModelRequestFields: undefined,
						maxTokens: args.maxTokens,
						stream: args.stream,
					}),
			)
		} else {
			console.log("Skipping e-k3-multiturn-turn2: turn 1 failed, no assistant message to echo back.")
		}
	}

	printSummaryTable(results)
}

main().catch((error) => {
	console.error("Unhandled error while running probe:", error)
	process.exitCode = 1
})
