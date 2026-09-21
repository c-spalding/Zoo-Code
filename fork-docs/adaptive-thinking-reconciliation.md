> Snapshot taken 2026-09-10 for the v3.82.0 re-baseline. Verbatim copy; the working copy
> lives at `plans/adaptive-thinking-reconciliation.md` (git-ignored scratch space) and
> may continue to evolve there -- this file is the version-controlled evidence record
> referenced by `fork-docs/fork-feature-inventory.md` (tranche T3).

# Adaptive Thinking Reconciliation (Bedrock Converse)

Date: 2026-09-10
Scope: reconcile upstream BASE (134923e15, v3.82.0) and the fork (feature/zoo-base,
ce7d6e5bc) adaptive-thinking implementations for Anthropic Claude on Amazon Bedrock
against Anthropic's official documentation. Read-only research; no code changed.

Confidence key: HIGH = official docs or source code; MEDIUM = official but indirect or
version-sensitive; LOW = observed behaviour or inference, not documented.

## 1. Official behaviour summary

Sources (all retrieved 2026-09-10):

- Migration index (index page only):
  https://platform.claude.com/docs/en/about-claude/models/migration-guide
- Per-model migration guides:
  https://platform.claude.com/docs/en/models/fable-5-1/migration-guide
  https://platform.claude.com/docs/en/models/fable-5/migration-guide
  https://platform.claude.com/docs/en/models/opus-5/migration-guide
  https://platform.claude.com/docs/en/models/sonnet-5/migration-guide
- Thinking overview: https://platform.claude.com/docs/en/build-with-claude/thinking
- Per-model thinking table (authoritative for defaults / rejected configs):
  https://platform.claude.com/docs/en/build-with-claude/thinking-troubleshooting
- Effort: https://platform.claude.com/docs/en/build-with-claude/effort
- Bedrock (Opus 4.7 and later):
  https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock
- Bedrock (Opus 4.6 and earlier, Converse/InvokeModel):
  https://platform.claude.com/docs/en/build-with-claude/claude-on-amazon-bedrock-legacy
- Model ID format: https://platform.claude.com/docs/en/about-claude/models/model-ids-and-versions
- AWS Converse API reference (additionalModelRequestFields):
  https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
- AWS Claude request/response (effort section is STALE, see 1.6):
  https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters-anthropic-claude-messages-request-response.html

### 1.1 Payload shape (HIGH)

- Adaptive thinking: `thinking: { type: "adaptive", display?: "summarized" | "omitted" | "updates" }`.
  `"updates"` is beta (header `thinking-display-updates-2026-08-18`); ignore for Bedrock.
  There is NO documented `display: "none"` value.
- Effort: `output_config: { effort: "low" | "medium" | "high" | "xhigh" | "max" }`.
  Effort page: setting `"high"` "produces exactly the same behavior as omitting the
  effort parameter entirely". API default is `high` on every current model.
- On Bedrock Converse both `thinking` and `output_config` are model-specific fields and
  therefore belong inside `additionalModelRequestFields` (AWS Converse reference:
  "Additional inference parameters that the model supports, beyond the base set of
  inference parameters that Converse and ConverseStream support in the inferenceConfig
  field"). Neither is a top-level Converse field.
- No beta header is required for adaptive thinking or effort. Opus 5 guide, "Migrating
  from Claude Opus 4.5 or earlier": remove `effort-2025-11-24`,
  `fine-grained-tool-streaming-2025-05-14` and `interleaved-thinking-2025-05-14`; adaptive
  thinking enables interleaved thinking automatically. Opus 5 checklist: "Remove any
  context-window beta header. The 1M context window is the default on the Claude API,
  Amazon Bedrock, Google Cloud, and Microsoft Foundry."
- `display` is invalid together with `thinking.type: "disabled"`.

### 1.2 Per-model thinking support (HIGH, thinking-troubleshooting table)

| Model                             | Thinking types            | Default   | Rejected with 400                              |
| --------------------------------- | ------------------------- | --------- | ---------------------------------------------- |
| Fable 5.1                         | adaptive only             | always on | "enabled", "disabled"                          |
| Mythos 5.1                        | adaptive only             | always on | "enabled", "disabled"                          |
| Fable 5                           | adaptive only             | always on | "enabled", "disabled"                          |
| Mythos 5                          | adaptive only             | always on | "enabled", "disabled"                          |
| Mythos Preview                    | adaptive + extended       | always on | "disabled"                                     |
| Opus 5                            | adaptive only             | on        | "enabled"; "disabled" only at effort xhigh/max |
| Opus 4.8                          | adaptive only             | off       | "enabled"                                      |
| Opus 4.7                          | adaptive only             | off       | "enabled"                                      |
| Sonnet 5                          | adaptive only             | on        | "enabled"                                      |
| Opus 4.6                          | adaptive + extended (dep) | off       | none                                           |
| Sonnet 4.6                        | adaptive + extended (dep) | off       | none                                           |
| Opus 4.5 / Haiku 4.5 / Sonnet 4.5 | extended only             | off       | "adaptive"                                     |

"Always on" models cannot turn thinking off. "On" models default to thinking but accept
`thinking: {type: "disabled"}`. "Off" models (4.7, 4.8) run without thinking unless
`{type: "adaptive"}` is sent. Exact error text when sending `enabled` to a 4.7+ model:
`"thinking.type.enabled" is not supported for this model. Use "thinking.type.adaptive"
and "output_config.effort" to control thinking behavior.` (matches the fork's comment).

Sonnet 4.7 and Sonnet 4.8 do not exist in any Anthropic document; the Sonnet line is
4.5 -> 4.6 -> 5. Both codebases carry `sonnet-4-7` / `sonnet-4-8` matchers; they are
dead but harmless.

### 1.3 Effort level availability (HIGH, effort page table)

- `max`: Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Mythos Preview, Opus 5, Opus 4.8,
  Opus 4.7, Opus 4.6, Sonnet 5, Sonnet 4.6.
- `xhigh`: Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Opus 5, Opus 4.8, Opus 4.7, Sonnet 5.
- `low`/`medium`/`high`: all effort-capable models.
- Every model that REQUIRES adaptive thinking (Opus 4.7+, Sonnet 5, Fable, Mythos 5+)
  accepts all five levels. The only models lacking `xhigh` (Opus 4.6, Sonnet 4.6,
  Mythos Preview) are not adaptive-required, so within the adaptive set the vocabulary
  is uniform.
- Recommended defaults differ by model: Opus 4.7 and 4.8 "Start with xhigh for coding
  and agentic use cases"; Opus 5, Sonnet 5, Fable 5 and 5.1 "Start with high, the
  default" and reserve xhigh/max for capability-sensitive work. Opus 5 additionally
  caps thinking-disable at `high`: `disabled` + `xhigh|max` returns 400 on every request.
- At xhigh/max the docs recommend max_tokens of at least 64k.

### 1.4 Sampling parameters (HIGH, thinking page "Sampling parameters")

Non-default `temperature`, `top_p`, `top_k` return 400 on every request (thinking or not)
for: Fable 5.1, Mythos 5.1, Fable 5, Mythos 5, Mythos Preview, Opus 5, Opus 4.8,
Opus 4.7, Sonnet 5. Older models reject them only while thinking is on. So the set of
"omit temperature" models is exactly the adaptive-required set plus Mythos Preview. Both
codebases correctly key temperature omission off the same predicate as adaptive thinking.

### 1.5 Bedrock model IDs (HIGH for the list, MEDIUM for Converse reachability)

Bedrock page "Supported models": `anthropic.claude-fable-5-1`, `anthropic.claude-fable-5`,
`anthropic.claude-opus-5`, `anthropic.claude-opus-4-8`, `anthropic.claude-opus-4-7`,
`anthropic.claude-sonnet-5`, `anthropic.claude-haiku-4-5`, `anthropic.claude-mythos-preview`
(invitation only). No `anthropic.claude-mythos-5` or `-mythos-5-1` ID is published
anywhere in Anthropic's docs; the fork's own comment marks it UNVERIFIED. The ID format
page states 4.6+ IDs are `anthropic.claude-{name}-{major}[-{minor}]` (no date, no `-vN:0`;
Opus 4.6 `-v1` was the last suffix). Legacy page: these models "are reachable through
InvokeModel on bedrock-runtime ... They are omitted from the model table on this page
because they do not have ARN-versioned model IDs." Converse is not named for them, but
both codebases observe Converse reaching Opus 4.7 (the fork quotes the model's 400 text
received through ConverseStream), so Converse works in practice (MEDIUM).

### 1.6 AWS documentation is stale (HIGH that it is stale)

The AWS "Request and Response" page still documents effort as a beta for Opus 4.5 only,
with `low|medium|high` and a required `effort-2025-11-24` header. Candidate AWS pages for
adaptive thinking redirect to the user-guide root (no such page exists). Anthropic's docs
supersede this for the passthrough fields: no beta header on 4.7+, five levels. Treat
Anthropic as authoritative for `thinking` / `output_config`, AWS for the Converse envelope.

## 2. Upstream BASE implementation (134923e15)

File: `src/api/providers/bedrock.ts` (1550 lines). Types: `packages/types/src/providers/bedrock.ts`.

Matcher (private method, substring on prefix-stripped id):

    private isAdaptiveThinkingModel(modelId: string): boolean {
        const baseModelId = this.parseBaseModelId(modelId)
        return (
            baseModelId.includes("opus-4-7") ||
            baseModelId.includes("opus-4-8") ||
            baseModelId.includes("opus-5") ||
            baseModelId.includes("fable-5") ||
            baseModelId.includes("sonnet-4-7") ||
            baseModelId.includes("sonnet-4-8") ||
            baseModelId.includes("sonnet-5")
        )
    }

- `parseBaseModelId` (BASE) strips `AWS_INFERENCE_PROFILE_MAPPING` prefixes (`us.`, `eu.`,
  `apac.`, `au.`, `jp.`, `ug.`, `ca.`, `sa.`) and `global.`. No `:1m` handling (BASE has
  no 1M-variant concept). ARNs are reduced to their resource id by `parseArn` first.
  Because matching is substring, prefixes/suffixes never break it anyway.
- Covers: opus-4-7, opus-4-8, opus-5, fable-5 (and by substring fable-5-1), sonnet-5.
  Dead: sonnet-4-7, sonnet-4-8 (no such models). Missing: mythos-5 / mythos-5-1
  (unverified IDs), mythos-preview.
- Payload when thinking enabled (`shouldUseReasoningBudget` && `reasoning` &&
  `reasoningBudget` && `supportsReasoningBudget`):
  `additionalModelRequestFields = { thinking: { type: "adaptive", display: "summarized" },
output_config: { effort: "xhigh" } }` -- effort is a hardcoded literal; user setting
  `reasoningEffort` is ignored on the Bedrock path.
- When thinking is NOT enabled: no `thinking` field is sent. On Sonnet 5 / Opus 5 this
  means thinking runs anyway (on by default) with display omitted: billed, invisible.
- Temperature omitted for adaptive models in both `createMessage` and `completePrompt`.
- `anthropic_beta`: pushes `context-1m-2025-08-07` when `awsBedrock1MContext` is on and
  the id is in `BEDROCK_1M_CONTEXT_MODEL_IDS` (which at BASE INCLUDES opus-4-7 and
  opus-4-8); pushes `fine-grained-tool-streaming-2025-05-14` for EVERY id containing
  "claude", including all adaptive models. Both contradict the Opus 5 migration
  checklist ("Remove ... fine-grained-tool-streaming-2025-05-14"; "Remove any
  context-window beta header ... default on ... Amazon Bedrock").
- Type nit: `display?: "summarized" | "none"` -- `"none"` is not a documented value
  (should be `"omitted"`); never emitted, type-only.
- `anthropic_version: "bedrock-2023-05-31"` is placed at the TOP level of the Converse
  payload when thinking is enabled; not a Converse field, silently dropped by the SDK.
  Harmless, dead.
- `completePrompt` reads `response.output.message.content[0].text`. Docs (all 5-gen
  guides): with thinking on, thinking blocks arrive BEFORE the first text block; "select
  content blocks by their type field instead". On Sonnet 5 / Opus 5 (on by default) and
  Fable (always on) `content[0]` can be a reasoning block, so this returns "".
- Types at BASE: sonnet-5, opus-5, fable-5, fable-5-1 carry `supportsReasoningBudget: true`,
  `supportsReasoningBinary: true`, `supportsTemperature: false`; no `supportsReasoningEffort`
  on any Bedrock entry (so no effort dropdown). opus-4-7 / opus-4-8 have maxTokens 8192,
  contextWindow 200K with a 1M beta tier (docs: 128k output, 1M default, no header).
  `mythos-5` absent. The effect of `supportsReasoningBinary` on the Bedrock gate was not
  traced in this task (the handler reads only `supportsReasoningBudget`).

## 3. Fork implementation (working tree, ce7d6e5bc)

Files: `packages/types/src/providers/bedrock.ts:760-784`, `src/api/providers/bedrock.ts`.

Exported constants (exact-id lists, matched against the prefix-stripped base id):

    BEDROCK_ADAPTIVE_THINKING_MODEL_IDS = [
        "anthropic.claude-opus-4-7", "anthropic.claude-opus-4-8",
        "anthropic.claude-fable-5", "anthropic.claude-mythos-5", "anthropic.claude-sonnet-5" ]
    BEDROCK_DISABLEABLE_THINKING_MODEL_IDS = [ "anthropic.claude-sonnet-5" ]
    BEDROCK_NATIVE_1M_CONTEXT_MODEL_IDS = [ opus-4-7, opus-4-8, fable-5, mythos-5, sonnet-5 ]

Matcher `isAdaptiveThinkingModel` (`src/api/providers/bedrock.ts:560-582`): exact
`includes()` on the constant FIRST, then substring fallback on `opus-4-7`, `opus-4-8`,
`sonnet-4-7`, `sonnet-4-8`, `fable-5`, `mythos-5`, `sonnet-5`. So the fork's effective
semantics are ALSO substring (the exact list is redundant with the fallback except that it
is the "documented" surface). `parseBaseModelId` delegates to `parseBedrockBaseModelId`
in the types package, which strips the `:1m` / `[1m]` synthetic suffix, reduces ARNs to
their resource id, then strips profile prefixes.

- Covers: opus-4-7, opus-4-8, fable-5 (and fable-5-1 by substring), mythos-5 (and
  mythos-5-1), sonnet-5. Dead: sonnet-4-7, sonnet-4-8. Missing vs docs: opus-5 (the
  fork catalog has no Opus 5 entry, but a user-typed custom ARN for opus-5 would fall to
  the legacy `budget_tokens` shape and be rejected with 400), mythos-preview.
- Payload when thinking enabled: `{ thinking: { type: "adaptive", display: "summarized" },
output_config: { effort } }` where `effort = normalizeReasoningEffortForBedrock(
options.reasoningEffort) ?? mapReasoningBudgetToBedrockEffort(budget)`. Normaliser
  accepts low/medium/high/xhigh/max, maps `minimal` -> low, else undefined. Budget
  fallback: <=4096 low, <=16384 medium, else high (never xhigh/max).
- Payload when thinking NOT enabled and id in `BEDROCK_DISABLEABLE_THINKING_MODEL_IDS`
  (Sonnet 5): `{ thinking: { type: "disabled" } }` in both `createMessage` and
  `completePrompt`. Correct per docs; also correct that Fable/Mythos are excluded (400).
- Temperature omitted for adaptive models on both paths (same as BASE).
- `anthropic_beta`: `skipAnthropicBetaFlags = BEDROCK_NATIVE_1M_CONTEXT_MODEL_IDS.includes(
baseModelId)` -- omits BOTH `context-1m-2025-08-07` and
  `fine-grained-tool-streaming-2025-05-14` for adaptive models. Matches the Opus 5
  checklist. Comment cites a real Bedrock "invalid beta flag" rejection.
- Types: opus-4-7/4-8, sonnet-5, fable-5, mythos-5 carry `supportsReasoningBudget: true`,
  `supportsReasoningEffort: ["low","medium","high","xhigh","max"]`, `supportsTemperature:
false`, maxTokens 128_000. Sonnet 5 pricing is $3/$15 (docs: $2/$10 introductory to
  2026-08-31; BASE has $2/$10) -- out of scope here but note the discrepancy.
- Fork comment at types:763 says `payload.output_config` (top level) -- stale; the code
  and the handler comment both correctly place it inside `additionalModelRequestFields`.
- Fork lacks `opus-5`, `fable-5-1` catalog entries (BASE has both).

## 4. Three-way discrepancy table

| Item                           | Official docs                                                                                  | Upstream BASE                                                                          | Fork                                                                | Verdict                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Field nesting                  | thinking + output_config are model fields -> additionalModelRequestFields                      | inside AMRF                                                                            | inside AMRF                                                         | both correct                                                        |
| thinking shape                 | `{type:"adaptive", display?}`                                                                  | `{adaptive, display:"summarized"}`                                                     | same                                                                | both correct                                                        |
| display vocabulary             | summarized / omitted / updates(beta)                                                           | type allows `"none"` (undocumented)                                                    | summarized / omitted                                                | fork correct; BASE type nit only                                    |
| Effort vocabulary              | low, medium, high, xhigh, max                                                                  | `effort: string`, always sends "xhigh"                                                 | typed union, user-selectable, budget fallback                       | fork correct; BASE ignores user setting                             |
| Effort default                 | high (API default); 4.7/4.8 recommend xhigh; 5-gen recommend high                              | hardcoded xhigh for all                                                                | user/UI or budget-derived                                           | BASE over-spends on Sonnet 5 / Opus 5 / Fable per docs guidance     |
| Beta headers                   | none needed; 1M and fine-grained betas should be REMOVED on 4.7+                               | sends fine-grained for all claude; sends 1M beta when toggle on (opus-4-7/4-8 in list) | omits both for adaptive models                                      | fork correct; BASE risks "invalid beta flag" 400                    |
| Temperature                    | omit on 4.7+, Sonnet 5, Fable, Mythos                                                          | omitted                                                                                | omitted                                                             | both correct                                                        |
| Explicit disable on Sonnet 5   | accepted, thinking is on by default                                                            | never sent (thinking silently on, billed, hidden)                                      | sent when reasoning off                                             | fork correct                                                        |
| Explicit disable on Opus 5     | accepted only at effort <= high                                                                | n/a (never sent)                                                                       | n/a (not in list)                                                   | neither models Opus 5 disable; only matters if Opus 5 added         |
| Disable on Fable/Mythos        | 400                                                                                            | never sent                                                                             | never sent                                                          | both correct                                                        |
| Model coverage                 | 4.7, 4.8, opus-5, sonnet-5, fable-5, fable-5-1, mythos-preview, (mythos-5/5.1 IDs unpublished) | 4.7, 4.8, opus-5, fable-5(.1), sonnet-5 + dead sonnet-4-7/4-8                          | 4.7, 4.8, fable-5(.1), mythos-5(.1), sonnet-5 + dead sonnet-4-7/4-8 | union needed: add mythos-5 to BASE; opus-5 already there            |
| Matching semantics             | n/a                                                                                            | substring on prefix-stripped id                                                        | exact list then substring on prefix-stripped, :1m-stripped id       | equivalent in practice                                              |
| completePrompt content[0].text | select by type; thinking blocks precede text on on-by-default models                           | reads content[0]                                                                       | reads content[0] but sends disabled on Sonnet 5                     | BASE fragile on Sonnet 5/Opus 5/Fable; fork fragile on Fable/Mythos |
| anthropic_version top-level    | not a Converse field                                                                           | sent (dropped)                                                                         | sent (dropped)                                                      | harmless dead code both                                             |

## 5. Per-model variance findings

Variance EXISTS and a single boolean list flattens it. Three independent axes:

1. Requires adaptive shape (rejects `enabled`): Opus 4.7, 4.8, 5; Sonnet 5; Fable 5, 5.1;
   Mythos 5, 5.1, Preview*. (*Preview also accepts extended.) This is the axis both
   `isAdaptiveThinkingModel` functions model, and both model it adequately.
2. Thinking default and disable-ability:
    - off by default, `disabled` unnecessary: Opus 4.7, 4.8
    - on by default, `disabled` accepted at any effort: Sonnet 5
    - on by default, `disabled` accepted only at effort <= high: Opus 5
    - always on, `disabled` -> 400: Fable 5/5.1, Mythos 5/5.1/Preview
      The fork captures this with `BEDROCK_DISABLEABLE_THINKING_MODEL_IDS` (Sonnet 5 only);
      BASE does not capture it at all. If Opus 5 is added it needs the effort<=high guard
      (or simply never send `disabled` for Opus 5 and accept default-on thinking).
3. Effort vocabulary: uniform (all five) across the adaptive-required set. No per-model
   gating is needed today; the fork's `supportsReasoningEffort` arrays are all identical,
   which is fine and future-proof if a later model drops a level. Recommended default
   differs (xhigh for 4.7/4.8, high otherwise) -- a UI default concern, not a wire concern.

Also per-model: `display` default is omitted on all adaptive-required models, so sending
`display: "summarized"` unconditionally (both codebases) is correct and desirable.

## 6. Wildcard analysis and recommendation

Bedrock id shapes to handle: base `anthropic.claude-opus-4-8`; profile-prefixed
`us.`/`eu.`/`apac.`/`au.`/`jp.`/`global.` etc.; legacy `-YYYYMMDD-vN:0` (pre-4.6 only,
never adaptive); fork synthetic `:1m` / `[1m]`; inference-profile and application-profile
ARNs whose resource id may be an opaque name (custom ARNs cannot be classified by id at
all -- out of scope for any matcher).

Options:

A. Exact list (fork's constant). Zero false positives; every new model needs a code
change; `fable-5-1` was missed this way in the fork (rescued only by the substring
fallback). Highest recurring diff vs upstream because upstream does not have it.
B. Substring family matching (upstream's method). Prefix/suffix/ARN-agnostic; `fable-5`
already covers `fable-5-1`, `opus-5` covers a future `opus-5-1`, `sonnet-5` covers
`sonnet-5-1`. False-positive risk is confined to same-family point releases, and
Anthropic's stated direction is "adaptive only" for everything from 4.7 onward, so a
future 5.x point release reverting to `enabled` is very unlikely (LOW confidence on
the future, but every 4.7+ release so far has held). One line per new FAMILY, not
per model. Zero recurring diff for families upstream already lists.
C. Version-threshold parsing (e.g. parse `{name}-{major}[-{minor}]`, treat opus>=4.7,
sonnet>=5, any fable/mythos as adaptive). Most future-proof, but: must special-case
the legacy dated format, `-v1` on opus-4-6, and names without numeric versions
(`mythos-preview`); adds ~30 lines and tests that upstream will never have, so it is
a permanent merge-conflict magnet in the very function being reconciled. Also the
Opus 4.6 -> 4.7 boundary is the only place a threshold buys anything over B, and 4.6
is explicitly "adaptive + extended", so a wrong classification there is not fatal.

Recommendation: B, i.e. keep upstream's `isAdaptiveThinkingModel` substring method
verbatim and add exactly one `|| baseModelId.includes("mythos-5")` line (plus optionally
`"mythos-preview"`). Rationale: it is what upstream already does, so future re-syncs
carry a one-line delta; it already covers fable-5-1/opus-5 without listing them; the false
positive surface (an older model whose id contains "opus-5"/"sonnet-5"/"fable-5"/
"mythos-5") is empty given Anthropic's published id scheme. Drop the fork's exported
`BEDROCK_ADAPTIVE_THINKING_MODEL_IDS` constant and its tests, or keep it only as a
non-authoritative documentation list if other fork code imports it (check
`BEDROCK_NATIVE_1M_CONTEXT_MODEL_IDS` consumers separately -- that list has a different
job and should stay).

## 7. Recommended reconciliation changes for tranche T3

Ordered by importance; all in `src/api/providers/bedrock.ts` unless stated.

1. Matcher: add `baseModelId.includes("mythos-5")` (and `"mythos-preview"` if Chris
   wants Glasswing coverage) to upstream's `isAdaptiveThinkingModel`. Leave the dead
   `sonnet-4-7`/`sonnet-4-8` lines alone (removing them is a gratuitous upstream diff).
   Use the fork's `parseBedrockBaseModelId` (types package) so `:1m` is stripped -- the
   fork already replaces upstream's local `parseBaseModelId` body with that call, so no
   extra change.
2. Effort: replace upstream's hardcoded `output_config: { effort: "xhigh" }` with the
   fork's `normalizeReasoningEffortForBedrock(options.reasoningEffort) ??
mapReasoningBudgetToBedrockEffort(budget)` and carry the two helper functions and the
   `BedrockAdaptiveEffort` / `BedrockAdaptiveDisplay` types. Consider defaulting the
   budget fallback to `"high"` for 5-gen models per docs; keep `xhigh` only as an
   explicit user choice. Add `supportsReasoningEffort: ["low","medium","high","xhigh",
"max"]` to the Bedrock entries for opus-4-7, opus-4-8, opus-5, sonnet-5, fable-5,
   fable-5-1 (and mythos-5) in `packages/types/src/providers/bedrock.ts` so the UI shows
   the dropdown.
3. Beta flags: carry the fork's `skipAnthropicBetaFlags` gate so neither
   `context-1m-2025-08-07` nor `fine-grained-tool-streaming-2025-05-14` is sent for
   adaptive models. Simplest minimal-diff form: `const skipAnthropicBetaFlags =
isAdaptiveThinkingModel` (the sets are identical per 1.1/1.4), which avoids
   maintaining `BEDROCK_NATIVE_1M_CONTEXT_MODEL_IDS` as a parallel list for this purpose.
   Also remove opus-4-7/opus-4-8 from upstream's `BEDROCK_1M_CONTEXT_MODEL_IDS` or ensure
   the skip gate wins (fork's `:1m` dropdown logic is a separate tranche).
4. Explicit disable: carry `BEDROCK_DISABLEABLE_THINKING_MODEL_IDS` and the two
   `thinking: { type: "disabled" }` branches (createMessage and completePrompt). If
   Opus 5 is to be disableable too, gate it on resolved effort <= high; otherwise leave
   Opus 5 out of the list (thinking stays on by default, which is safe).
5. completePrompt robustness (optional, both codebases): select the first block with a
   `text` property instead of `content[0]`, because on-by-default / always-on models
   return reasoning blocks first. Low effort, prevents empty completions on Fable.
6. Type hygiene (optional): change upstream's `display?: "summarized" | "none"` to
   `"summarized" | "omitted"`; fix the stale `payload.output_config` comment at fork
   types:763. Consider adding `anthropic.claude-mythos-5` to the catalog only with the
   existing UNVERIFIED note, since no published Bedrock ID exists.
7. Tests to carry/adjust: fork's `isAdaptiveThinkingModel detection` suite (add opus-5
   and fable-5-1 positive cases, keep mythos cases), effort normalisation/budget-bucket
   tests, beta-flag omission tests, Sonnet 5 disable tests. Drop tests that assert on
   `BEDROCK_ADAPTIVE_THINKING_MODEL_IDS` if the constant is removed.

Open items (not resolvable from docs): exact Bedrock ID for Mythos 5/5.1 (none published);
whether Bedrock Converse honours `display: "updates"` (beta, skip); whether AWS validates
`output_config.effort` values server-side before forwarding (the fork's "let the API
reject" stance is fine either way).
