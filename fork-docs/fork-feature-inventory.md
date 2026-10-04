# Fork Feature Inventory

Canonical, living record of what `c-spalding/Zoo-Code` carries on top of upstream
`Zoo-Code-Org/Zoo-Code`. This file is the source of truth that every re-application
tranche (`fork/NN-slug` branch) must read before starting work, and must update on
merge.

## 1. What this fork is

- **Repository:** `c-spalding/Zoo-Code` (origin), fork of `Zoo-Code-Org/Zoo-Code` (remote
  `zoo`, upstream -- never push there).
- **Purpose:** Chris's daily-driver build of Zoo Code with Bedrock provider work
  (Claude Opus 4.7+, adaptive thinking, dynamic model/profile discovery, structured
  output, max-output-tokens probing), per-profile custom instructions, and two
  open-weight-model affordances (`textToolCallFallback`, `allowTextOnlyResponses`)
  layered on top.
- **Old fork (pre-re-baseline):** preserved at branch `archive/zoo-base-3.56`
  (= `ce7d6e5bc44e69d85f357b22563fe7616335015f`). This is the full-featured, v3.56-based
  history. All source-commit references in this file point into that branch.
- **New base (this re-baseline):** upstream `v3.82.0`, commit `134923e15` (`zoo/main`
  tip at re-baseline time), re-baselined **2026-09-10**. Integration branch:
  `feature/zoo-base`, currently checked out at BASE with a clean tree.
- **Branch naming convention:** each surviving feature is re-applied as its own branch
  `fork/NN-slug`, cut from BASE, then merged (`--no-ff`) into `feature/zoo-base`. `NN`
  is a fixed two-digit tag inherited from the original code review's tranche numbering
  (T1..T10); it is **not** the implementation order -- see the table below for the order
  actually used.

## 2. Tranche index

Implementation order (left to right). "NN" is the branch-name tag; "Upstream status" is
the one-line recon verdict; "Mandatory fixes" lists only the findings this project
requires before merging the tranche (see section per tranche for the advisory list).

| Order | Branch                         | Tranche                                                 | Upstream status (recon)                                                                                                                           | Mandatory fixes carried               |
| ----- | ------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1     | `fork/03-bedrock-reasoning`    | T3 -- Bedrock adaptive thinking / reasoning effort      | **MERGED** -- PARTIAL / REFACTORED-UNDERNEATH, reconciled per adaptive-thinking-reconciliation.md                                                 | F-BP-3 (not needed; never introduced) |
| 2     | `fork/04-bedrock-discovery`    | T4 -- Bedrock dynamic discovery                         | **MERGED** -- ABSENT, clean re-application                                                                                                        | none mandatory                        |
| 3     | `fork/02-bedrock-catalog`      | T2 -- Bedrock catalog corrections                       | **MERGED** -- ABSENT/mixed, depends on T4                                                                                                         | none mandatory                        |
| 4     | `fork/06-max-tokens-probe`     | T6 -- Bedrock max-output-tokens probe                   | **MERGED** -- PARTIAL, probe logic and `awsModelMaxOutputTokens` both absent at BASE; no actual name collision (see corrected section 6)          | none mandatory                        |
| 5     | `fork/05-structured-output`    | T5 -- Bedrock structured-output strict mode             | **MERGED** -- ABSENT, clean re-application                                                                                                        | none mandatory                        |
| 6     | `fork/07-profile-instructions` | T7 -- Per-profile custom instructions                   | **MERGED** -- ABSENT, clean re-application; migration logic re-diffed and re-anchored per corrected section 8                                     | none mandatory                        |
| 7     | `fork/08-inline-thinking`      | T8 -- Inline thinking extraction                        | **MERGED** -- ABSENT, clean re-application; parser extracted into its own tested module per F-ER-2/F-TC-2 (see corrected section 9)               | none mandatory                        |
| 8     | `fork/09-text-tool-fallback`   | T9 -- Text tool-call fallback                           | **MERGED** -- ABSENT, entangled with `tool-use.ts` shape, reconciled per the Option C design (see corrected section 10)                           | F-AI-2, F-AI-3 (both resolved)        |
| 9     | `fork/10-allow-text-only`      | T10 -- `allowTextOnlyResponses`                         | **MERGED** -- ABSENT, entangled with T9's `tool-use.ts` changes, reconciled by extending `SharedToolUseSectionOptions` (see corrected section 11) | F-LC-1, F-LC-2, F-AI-1 (all resolved) |
| 10    | `fork/01-small-fixes`          | T1 -- Small bug fixes                                   | **MERGED** -- 3 of 4 already SUPERSEDED upstream; only `da257010e` re-applied, see discrepancy note                                               | none mandatory                        |
| 11    | `fork/11-new-bedrock-models`   | T11 -- New Bedrock models (GPT-5.6/6, Kimi K3), phase A | N/A -- new fork feature, not part of the original 10-tranche recon (added post v3.82.2 resync)                                                    | none mandatory                        |

`fork/00-docs` (this branch) precedes all of the above and carries no code.

---

## 3. T3 -- Bedrock adaptive thinking / reasoning effort

**Order:** 1st (branch `fork/03-bedrock-reasoning`)

**Status: MERGED** into `feature/zoo-base` (2026-09-12). Branch tip commits:
`15a50e19e` (catalog metadata: `supportsReasoningEffort`, `anthropic.claude-mythos-5`,
`BEDROCK_DISABLEABLE_THINKING_MODEL_IDS`) and `99aa149d2` (effort wiring, beta-flag skip
gate, Sonnet 5 explicit-disable, `completePrompt` first-text-block fix, and test port).
Merge commit: see `feature/zoo-base` log for the `--no-ff` merge of
`fork/03-bedrock-reasoning`.

**Scope actually implemented (matches the change list below) with one deliberate
deviation:** upstream's `isAdaptiveThinkingModel()` in `bedrock.ts` was kept as the sole
matcher (per the minimal-touch decision) rather than porting the fork's
`BEDROCK_ADAPTIVE_THINKING_MODEL_IDS` exported constant -- the recon doc's item 1
suggestion to "use the fork's `parseBedrockBaseModelId`" was not adopted; upstream's own
`parseBaseModelId` (already used by `isAdaptiveThinkingModel`'s caller) was sufficient
and kept the diff smaller. All other numbered items (2-7) were implemented as specified.
F-BP-3 (`as any` cast on `reasoningEffort`) was never introduced in this re-application,
so no fix was needed for it; a related new-code `as any` avoidance (`isMemberOf<T>` type
guard for `BEDROCK_DISABLEABLE_THINKING_MODEL_IDS.includes(...)`) was added to keep
`src/eslint-suppressions.json`'s `@typescript-eslint/no-explicit-any` count for
`api/providers/bedrock.ts` at its pre-existing baseline (34) instead of raising it.

**Not verified this tranche:** `webview-ui/src/components/settings/ThinkingBudget.tsx`
was not modified -- `supportsReasoningEffort` is an already-established generic pattern
that upstream's UI reads for other providers, so no changes were expected there, but this
was not explicitly re-confirmed by reading that file during this tranche.

### Purpose

Lets users run Claude models on Bedrock that require Anthropic's "adaptive thinking"
shape (Opus 4.7+, Sonnet 5, Fable 5/5.1, and -- pending ID verification -- Mythos 5)
with a real, user-controlled reasoning-effort level instead of a silently hardcoded
one, without sending beta flags Bedrock now rejects. User-facing benefit: reasoning
output actually appears (upstream's `display` default hides it), effort matches what
the user picked in the UI instead of always maxing out cost at `xhigh`, and Sonnet 5
users can explicitly turn thinking off.

### Provider-setting / global-setting keys

No **new** persisted keys. Reuses existing `reasoningEffort`, `enableReasoningEffort`,
`reasoningBudget` on `ProviderSettings`. Adds `supportsReasoningEffort` metadata to the
relevant entries in the Bedrock model catalog (`packages/types/src/providers/bedrock.ts`)
so the effort dropdown renders for those models.

### Principal files

| File                                                                                                             | New/Modified                                                             |
| ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`src/api/providers/bedrock.ts`](src/api/providers/bedrock.ts)                                                   | Modified -- `isAdaptiveThinkingModel`, effort/beta-flag/disable logic    |
| [`packages/types/src/providers/bedrock.ts`](packages/types/src/providers/bedrock.ts)                             | Modified -- `supportsReasoningEffort` arrays, model entries              |
| [`packages/types/src/model.ts`](packages/types/src/model.ts)                                                     | **Do not re-apply** -- `"max"` effort enum already at BASE (see Dropped) |
| [`webview-ui/src/components/settings/ThinkingBudget.tsx`](webview-ui/src/components/settings/ThinkingBudget.tsx) | Modified -- adaptive-effort dropdown                                     |
| [`src/api/providers/__tests__/bedrock-reasoning.spec.ts`](src/api/providers/__tests__/bedrock-reasoning.spec.ts) | Modified -- payload-shape tests                                          |

### Source commits on `archive/zoo-base-3.56`

**This tranche does NOT map cleanly to a discrete commit set -- see discrepancy note
below.** The review's tranche map lists: `e69b4641d`, `c5d90ce8b`, `aabf3ad7a`,
`7cbea7662`, `06996004a`. All five verified present via
`git log archive/zoo-base-3.56 --oneline`. However:

- `c5d90ce8b` ("feat(bedrock): port robust support", 36 files / +3467 / -325) is a single
  giant commit that **also** contains the entirety of T4 (discovery), T5 (structured
  output), and T6 (max-tokens probe). It is not separable from those tranches at the
  commit level. Treat T3's "own" commits as `e69b4641d`, `aabf3ad7a`, `7cbea7662`,
  `06996004a` (all four verified as touching only reasoning/effort/temperature concerns
  in `bedrock.ts` / `model.ts` / `ThinkingBudget.tsx`), and extract T3's slice of
  `c5d90ce8b`'s diff by file/hunk rather than by cherry-pick.
- `f10fc75ca` ("test(bedrock): align PR #125 tests with implementation") and `599ad423a`
  ("fix(bedrock): only apply cross-region prefix to AWS-published profiles") also touch
  adjacent reasoning/discovery test and cross-region logic; the review's section 7.2 text
  mentions `f10fc75ca` only informally ("the relevant chunks of `f10fc75ca`"). Confirmed
  present on the archive branch.

### Upstream status per recon (drop/keep/adapt)

Per `upstream-recon-v3.82.md` feature #9 (adaptive thinking) and #10 (catalog entries):

- **Drop:** the `"max"` reasoning-effort enum addition to `model.ts` -- BASE already has
  `"max"` byte-for-byte identical to the fork.
- **Drop:** re-adding `opus-4-7`, `opus-4-8`, `fable-5`, `fable-5-1`, `sonnet-5` catalog
  entries -- all already present at BASE.
- **Adapt:** BASE independently invented its own `isAdaptiveThinkingModel` (substring
  matcher) and adaptive-thinking payload mechanism. Do not port the fork's version
  wholesale; reconcile per `adaptive-thinking-reconciliation.md` section 7 (see next
  subsection -- this supersedes the review's T3 description).
- **Keep as new:** `anthropic.claude-mythos-5` catalog entry (ABSENT at BASE), marked
  UNVERIFIED (no published Bedrock model ID exists for it in Anthropic's docs).

### T3 change list (supersedes the review's tranche description)

Per `adaptive-thinking-reconciliation.md` section 7, in priority order:

1. **Matcher:** add `baseModelId.includes("mythos-5")` (optionally `"mythos-preview"`) to
   BASE's existing `isAdaptiveThinkingModel` substring method. Leave BASE's dead
   `sonnet-4-7`/`sonnet-4-8` branches alone -- removing them is a gratuitous diff. Use
   the fork's `parseBedrockBaseModelId` (types package) so `:1m` suffixes are stripped.
2. **Effort wiring:** replace BASE's hardcoded `output_config: { effort: "xhigh" }` with
   the fork's `normalizeReasoningEffortForBedrock(options.reasoningEffort) ??
mapReasoningBudgetToBedrockEffort(budget)`. Add `supportsReasoningEffort:
["low","medium","high","xhigh","max"]` to the Bedrock catalog entries for opus-4-7,
   opus-4-8, opus-5, sonnet-5, fable-5, fable-5-1 (and mythos-5) so the UI shows the
   dropdown.
3. **`supportsReasoningEffort` metadata:** as above -- this is what makes the effort
   dropdown appear instead of a plain budget slider.
4. **Beta-flag skip gate:** carry the fork's `skipAnthropicBetaFlags` gate so neither
   `context-1m-2025-08-07` nor `fine-grained-tool-streaming-2025-05-14` is sent for
   adaptive models. Minimal-diff form: `const skipAnthropicBetaFlags =
isAdaptiveThinkingModel` (the model sets are identical per the reconciliation doc's
   sections 1.1/1.4). Remove opus-4-7/opus-4-8 from BASE's
   `BEDROCK_1M_CONTEXT_MODEL_IDS` or ensure the skip gate wins.
5. **Sonnet 5 explicit-disable:** carry `BEDROCK_DISABLEABLE_THINKING_MODEL_IDS`
   (Sonnet 5 only) and the two `thinking: { type: "disabled" }` branches (`createMessage`
   and `completePrompt`). If Opus 5 is ever added, gate its disable on effort <= high;
   otherwise leave it out (thinking stays on by default, which is safe).
6. **`completePrompt` first-text-block fix:** select the first content block with a
   `text` property instead of blindly reading `content[0]`, because on-by-default /
   always-on adaptive models return a reasoning block first. Both BASE and the fork are
   fragile here on different model subsets (BASE on Sonnet 5/Opus 5/Fable; fork on
   Fable/Mythos) -- fix once, for both.
7. Type hygiene (optional): BASE's `display?: "summarized" | "none"` should read
   `"summarized" | "omitted"` (`"none"` is not a documented value); fix the stale
   `payload.output_config` comment at fork `packages/types/.../bedrock.ts:763`.

### Known defects to fix during re-application

- **Mandatory: F-BP-3** (Medium) -- drop the `as any` cast on `reasoningEffort` in
  [`src/api/providers/bedrock.ts:2495`](src/api/providers/bedrock.ts:2495); the schema
  already includes the field post-fork, so the widening cast is dead weight.
- Advisory: F-AA-2 (Info) -- budget-to-effort threshold mapping is a pragmatic
  compromise; no action required, documented for future reviewers.
- Advisory: F-DC-3 (Info) -- `guessModelInfoFromId` was cleanly lifted to
  `guessBedrockModelInfoFromId` in the types package; no action.

### Dependencies on other tranches

None upstream of it. T4/T5/T6 depend on the same source commit (`c5d90ce8b`) being
split apart, so extract T3's hunks first and keep a note of what was left for T4/T5/T6.

### Before upstream submission checklist

- [ ] Open GitHub issue, comment "Claiming", get Discord assignment before opening a PR.
- [ ] Branch rebased onto `zoo/main` (not `feature/zoo-base`).
- [ ] i18n locale parity: none required for this tranche's code changes alone (no new
      UI strings beyond the effort dropdown, which reuses existing labels) -- verify
      during implementation.
- [ ] `.changeset/` entry, `minor` impact.
- [ ] Tests: `bedrock-reasoning.spec.ts` and `bedrock.spec.ts` cases per the
      reconciliation doc's item 7 (opus-5 and fable-5-1 positive matcher cases, effort
      normalisation/budget-bucket tests, beta-flag omission tests, Sonnet 5 disable
      tests). Drop any test asserting on `BEDROCK_ADAPTIVE_THINKING_MODEL_IDS` if the
      constant is not carried forward (recommendation B in the reconciliation doc keeps
      BASE's substring method, not the fork's exact-list constant).
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 3: be ready to
      discuss whether `"max"` belongs in the reasoning-effort enum at all -- moot now
      since it is already upstream, but the discussion may resurface for `mythos-5`.

---

## 4. T4 -- Bedrock dynamic discovery

**Order:** 2nd (branch `fork/04-bedrock-discovery`)

**Status: MERGED** into `feature/zoo-base` (2026-10-02). Branch tip commit: `4ba53de15`
(commit e). Full commit stack: `51a26de3a` (a: shared pure helpers), `788f8bafb` (b:
`bedrock-discovery.ts` module), `f30eaf0af` (c: message plumbing), `8796259f4` (d:
discovery UI + `useSelectedModel` rework), `4ba53de15` (e: `getModel()`/`getModelById()`
rework via `resolveBedrockModelInfo`/`inferBedrockInvokeTargetKind`, reconciled with
T11's mandatory-inference-profile logic and T3's adaptive-thinking logic, plus
cross-region inference-profile-id allowlist gating). Merge commit: `232b303c3` into
`feature/zoo-base` (no conflicts).

**Scope actually implemented (matches the change list below) with explicit
deviations:** `awsBedrockStructuredOutput` was deliberately NOT added -- it belongs to
T5 and is out of scope here. `awsModelMaxOutputTokens` does not exist in the
provider-settings schema yet (T6 scope) and was omitted from every
`resolveBedrockModelInfo` call site; T6 must add the field and wire it through this
tranche's call sites when it lands. The cross-region inference-profile-id allowlist
gating (lazy, fire-and-forget `ListInferenceProfilesCommand` discovery at
`AwsBedrockHandler` construction time, awaited by `createMessage()`/`getModel()`) was
folded into commit (e) rather than split out, since it shares the same `getModel()`
rework and `BedrockClient` control-plane wiring.

**Defect found and fixed during re-application:** commit (d)'s addition of
`providerIdentifiers.bedrock` to `PROVIDERS_WITH_CUSTOM_MODEL_UI` made
`shouldUseGenericModelPicker("bedrock")` permanently return `false`, orphaning a dead
`BedrockCustomArn` render branch (and its test) in `ApiOptions.tsx` that could never
execute. Found during the final webview-ui vitest validation pass; removed the dead
branch and its obsolete test in commit (e).

**Validation results:** `pnpm check-types` clean across the full repo; `packages/types`
vitest 32/32 files, 460/460 tests; `webview-ui` vitest 162/162 files, 1870/1870 tests;
`src` Bedrock-related vitest suites 192/192 plus the new
`bedrock-cross-region-gating.spec.ts` 14/14 tests; eslint clean on every touched file
with zero `@typescript-eslint/no-explicit-any` suppression-count regressions (private
test-field access uses bracket notation, e.g. `handler["crossRegionProfileIdsPromise"]`,
instead of `as any`).

### Purpose

Replaces Bedrock's static model dropdown with a live query of the account's available
foundation models, system inference profiles, and application inference profiles (via
`ListFoundationModels` / `ListInferenceProfiles`), including a dual-variant `:1m`
context-window entry where applicable. User-facing benefit: users see the models and
profiles actually available in their AWS account/region instead of a hand-maintained
static list that lags AWS's releases.

### Provider-setting / global-setting keys

- `awsBedrockInvokeTarget`, `awsBedrockTargetKind` (`ProviderSettings`).
- New extension <-> webview message: `requestBedrockDiscovery` (request/response pair
  in `vscode-extension-host.ts`).

### Principal files

| File                                                                                                                                 | New/Modified                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`src/api/providers/bedrock-discovery.ts`](src/api/providers/bedrock-discovery.ts)                                                   | New -- `discoverBedrockTargets`, `BedrockDiscoveredTarget` types                                                                                            |
| [`webview-ui/src/components/ui/hooks/useBedrockDiscovery.ts`](webview-ui/src/components/ui/hooks/useBedrockDiscovery.ts)             | New                                                                                                                                                         |
| [`packages/types/src/providers/bedrock.ts`](packages/types/src/providers/bedrock.ts)                                                 | Modified -- `expandBedrockTargetsWith1MVariants`, `resolveBedrockInvokeTargetId`, `resolveBedrockModelInfo`, `shouldUseBedrock1MContext`, `parseBedrockArn` |
| [`src/api/providers/bedrock.ts`](src/api/providers/bedrock.ts)                                                                       | Modified -- cross-region profile id allowlist, `getModel()` rework                                                                                          |
| [`webview-ui/src/components/settings/providers/Bedrock.tsx`](webview-ui/src/components/settings/providers/Bedrock.tsx)               | Modified -- dual-variant dropdown, `SearchableSelect`                                                                                                       |
| [`webview-ui/src/components/ui/hooks/useSelectedModel.ts`](webview-ui/src/components/ui/hooks/useSelectedModel.ts)                   | Modified -- Bedrock case rewritten                                                                                                                          |
| [`packages/types/src/provider-settings.ts`](packages/types/src/provider-settings.ts)                                                 | Modified -- new fields                                                                                                                                      |
| [`packages/types/src/vscode-extension-host.ts`](packages/types/src/vscode-extension-host.ts)                                         | Modified -- new message types                                                                                                                               |
| [`webview-ui/src/components/settings/utils/providerModelConfig.ts`](webview-ui/src/components/settings/utils/providerModelConfig.ts) | Modified -- Bedrock added to `PROVIDERS_WITH_CUSTOM_MODEL_UI`                                                                                               |

### Source commits on `archive/zoo-base-3.56`

**Unverified as a discrete commit set.** The review gives no commit hashes for this
tranche (section 7.2 describes it only by file/symbol name). `git log --follow` on
every file listed above (`bedrock-discovery.ts`, `useBedrockDiscovery.ts`,
`useBedrockMaxTokensProbe.ts` -- shared with T6) returns only `c5d90ce8b` as the
introducing commit. Follow-up fixes layered on afterward: `599ad423a` (cross-region
prefix gating), `1cada2dcc` + `3da7f1945` (custom-ARN capability regression from
`c5d90ce8b`, fixed May 31). All confirmed present on `archive/zoo-base-3.56`.

### Upstream status per recon (drop/keep/adapt)

Recon feature #1: **ABSENT** -- `bedrock-discovery.ts` does not exist at BASE, and none
of `awsBedrockInvokeTarget` / `awsBedrockTargetKind` / `ListInferenceProfiles` appear.
Clean re-application onto BASE's `bedrock.ts` / `provider-settings.ts`. Re-verify that
`@aws-sdk/client-bedrock` (the control-plane client, distinct from
`@aws-sdk/client-bedrock-runtime`) is still compatible with BASE's dependency versions.

### Known defects to fix during re-application

- Advisory: F-BP-1 / F-CO-1 (High/Medium) -- hardcoded English strings throughout
  `Bedrock.tsx`, `useBedrockDiscovery.ts` ("Inference Target", "Refresh discovery",
  "Discovering Bedrock targets...", "Bedrock discovery failed:", etc.) sit alongside
  strings that do go through `t()`. Add i18n keys for every one before submission.
- Advisory: F-TC-4 (Low) -- `discoverBedrockTargets` has no direct unit test; add one
  that mocks `BedrockClient.send` for both list calls and asserts dedup/sort/`:1m`
  expansion.
- Advisory: F-CO-2 (Low) -- `Bedrock.tsx` uses `SearchableSelect` while other providers
  use plain `Select`; raise with maintainers whether this should be the new standard.
- Advisory: F-ER-4 (Info) -- `discoverBedrockTargets` sorts twice; documented as
  harmless, no action needed.

### Dependencies on other tranches

Depends on T3 landing first only in the sense that both come from the same source
commit (`c5d90ce8b`) -- extract T3's hunks before T4's. T2 (catalog corrections 2.2 and
2.3) and T6 (max-tokens probe) both depend on T4's infrastructure
(`resolveBedrockInvokeTargetId`, the dropdown) being in place.

### Before upstream submission checklist

- [ ] Issue-first + claim via Discord.
- [ ] Branch rebased onto `zoo/main`.
- [ ] i18n locale parity for every string in `Bedrock.tsx` / `useBedrockDiscovery.ts`
      across all locales (17+ at review time).
- [ ] `.changeset/` entry, `minor` impact.
- [ ] Tests: `discoverBedrockTargets` unit test (F-TC-4), plus existing `bedrock.spec.ts`
      / webview specs updated.
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 4: document the new
      `bedrock:ListInferenceProfiles` IAM permission requirement in the PR description
      and verify the fallback-to-static-list behaviour when discovery fails.

---

## 5. T2 -- Bedrock catalog corrections

**Order:** 3rd (branch `fork/02-bedrock-catalog`)

**Status: VERIFIED, NO-OP on the kimi-k2 key -- MERGED** (2026-10-02). The premise
("the catalog key needs renaming to `moonshotai.`") was checked empirically against
live AWS Bedrock before writing any code and found to be **false**. See the decision
trail below. The other two items in this tranche (`707479d6f` ON_DEMAND filter,
`a7f475f36` 1M-expansion dedup) were already carried by T4's re-application (verified
present in [`src/api/providers/bedrock-discovery.ts`](src/api/providers/bedrock-discovery.ts:68)
and [`expandBedrockTargetsWith1MVariants`](packages/types/src/providers/bedrock.ts:1090)
respectively -- T4's own commit history folded them in rather than deferring them, since
they share the exact same code T4 was writing). This tranche's only actual deliverable
is a regression test and a documentation decision trail.

### Purpose

Originally scoped as three independent correctness fixes (wrong AWS model-id prefix,
foundation models surfaced that cannot actually be invoked, a UI double-render bug).
After verification, only the test-and-document half of item 2.1 (the kimi-k2 prefix)
remains as net-new work for this tranche; items 2.2/2.3 are already in place via T4.

### Provider-setting / global-setting keys

None. Pure verification + regression test.

### Decision trail: the `moonshot.kimi-k2-thinking` catalog key (2026-10-02)

**Premise as stated by the archive fork (commit `d388efc12`):** AWS publishes this
model under the `moonshotai.` prefix (note the trailing "i"); the original PR #125
catalog entry used `moonshot.` (no "i"), which never matches, so discovery/lookups fall
through to the generic 128K-context guess instead of the model's real 256K window. The
archive renamed the key to `moonshotai.kimi-k2-thinking` to fix this.

**Status of that fix at this re-baseline's HEAD, before this tranche:** NEVER applied.
HEAD's catalog has always carried the key as `moonshot.kimi-k2-thinking` -- the rename
in `d388efc12` exists only on `archive/zoo-base-3.56`, not on any ancestor of
`feature/zoo-base`.

**Conflicting secondary evidence found during this tranche's research** (
`plans/new-bedrock-models-research.md`, section 2c, dated 2026-09-28): a since-added
research doc claims, citing AWS's K2-Thinking model card, that the model has **two
different ids depending on API plane** -- `moonshot.kimi-k2-thinking` on
`bedrock-runtime` (the actual Converse invocation plane this extension calls) versus
`moonshotai.kimi-k2-thinking` on `bedrock-mantle` (a separate control/catalog plane).
That doc explicitly warns "do not normalise" the two Moonshot prefixes together (by
contrast with the sibling `moonshotai.kimi-k3` entry, which genuinely only exists under
the `moonshotai.` prefix). Taken at face value, this raised the possibility that our own
`discoverBedrockTargets()` -- which calls `ListFoundationModelsCommand`, a control-plane
API -- might surface `moonshotai.kimi-k2-thinking` as a discovered target id, which would
neither match the HEAD catalog key for metadata purposes nor necessarily be the correct
id to invoke on `bedrock-runtime`. Per this task's guardrails (both-ids-live-and-
conflicting => ask, don't guess), this was escalated to the user rather than resolved by
code inspection alone.

**Empirical resolution (live AWS calls, `bedrock` CLI profile, account
`696666580195`, region `us-east-1`, 2026-10-02):**

1. `aws bedrock list-foundation-models` (the control-plane API -- exactly what
   `ListFoundationModelsCommand`/`discoverBedrockTargets` calls) returned this model as
   `modelId: "moonshot.kimi-k2-thinking"`, `inferenceTypesSupported: ["ON_DEMAND"]`.
   **No `moonshotai.kimi-k2-thinking` entry exists on the control plane at all.**
2. `aws bedrock-runtime converse --model-id moonshot.kimi-k2-thinking` **succeeded**
   (returned a real completion).
3. `aws bedrock-runtime converse --model-id moonshotai.kimi-k2-thinking` **failed**:
   `ValidationException: The provided model identifier is invalid.`

**Verdict:** the archive's `d388efc12` fix was wrong. HEAD's existing catalog key
(`moonshot.kimi-k2-thinking`) is correct on both the control plane our discovery feature
queries and the runtime plane that actually invokes the model. The research doc's claim
of a plane-dependent `moonshotai.` id does not hold for this specific model in this
specific account/region. **No catalog change was made.** The sibling `moonshotai.kimi-k3`
entry is unaffected and correctly keeps its own, genuinely different, prefix.

**What was applied as a result:** a code comment on the catalog entry
([`packages/types/src/providers/bedrock.ts:729`](packages/types/src/providers/bedrock.ts:729))
documenting this verification inline (so a future contributor does not rediscover and
re-litigate the same question), plus a new regression-test file,
[`packages/types/src/providers/__tests__/bedrock-catalog.spec.ts`](packages/types/src/providers/__tests__/bedrock-catalog.spec.ts),
asserting: the key stays `moonshot.` (not `moonshotai.`), `parseBedrockBaseModelId`
does not rewrite it, `resolveBedrockModelInfo` resolves it to the real 256K/32K catalog
entry (not the 128K default guess), the archive's proposed `moonshotai.` id does
_not_ also resolve to the same entry (confirming no accidental cross-prefix
normalisation exists in the lookup path), and `moonshotai.kimi-k3` remains distinct.

### Principal files

| File                                                                                                                               | New/Modified                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`packages/types/src/providers/bedrock.ts`](packages/types/src/providers/bedrock.ts)                                               | Modified -- comment only, documenting the verified decision; key unchanged |
| [`packages/types/src/providers/__tests__/bedrock-catalog.spec.ts`](packages/types/src/providers/__tests__/bedrock-catalog.spec.ts) | New -- regression test for the key + lookup-path non-normalisation         |
| [`src/api/providers/bedrock-discovery.ts`](src/api/providers/bedrock-discovery.ts)                                                 | Unchanged this tranche -- `ON_DEMAND` filter already present, added by T4  |
| [`packages/types/src/providers/bedrock.ts`](packages/types/src/providers/bedrock.ts) (`expandBedrockTargetsWith1MVariants`)        | Unchanged this tranche -- 1M-expansion dedup already present, added by T4  |

### Source commits on `archive/zoo-base-3.56`

Verified via `git show --stat`:

| Commit      | Subject                                                                      | Disposition                                                   |
| ----------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `d388efc12` | `fix(bedrock): correct moonshot.kimi-k2-thinking catalog key to moonshotai.` | **Rejected** -- empirically wrong, see decision trail above   |
| `707479d6f` | `fix(bedrock): drop foundation-model rows that don't support ON_DEMAND`      | Already present via T4 (`bedrock-discovery.ts:68`)            |
| `a7f475f36` | `fix(bedrock): drop second-pass 1M-variant expansion in settings dropdown`   | Already present via T4 (`expandBedrockTargetsWith1MVariants`) |

### Upstream status per recon (drop/keep/adapt)

- `d388efc12` (kimi-k2 key fix): the original recon (feature #10) asserted BASE's
  uncorrected key was a genuine unshipped bug and recommended keeping/upstreaming the
  rename. **This tranche's empirical verification supersedes that recon finding** -- the
  rename would have broken live invocation. Do not upstream `d388efc12`'s diff. The
  recon's underlying observation (HEAD's key differs from the archive's) was correct;
  its conclusion (that the archive's version was the fix) was not.
- `707479d6f` and `a7f475f36`: both already folded into T4's re-application (confirmed
  by reading current `bedrock-discovery.ts` and `bedrock.ts` at HEAD) -- no action needed
  in this tranche.

### Known defects to fix during re-application

None. (The defect this tranche set out to fix does not exist at HEAD.)

### Dependencies on other tranches

None remaining -- the two items that depended on T4 (`707479d6f`, `a7f475f36`) are
already satisfied by T4's merged implementation.

### Before upstream submission checklist

- [x] Verify the premise empirically before writing code -- done, see decision trail.
- [ ] Issue-first + claim -- N/A, no upstream change proposed (HEAD already matches the
      correct AWS id; nothing to submit for the kimi-k2 key itself).
- [ ] i18n: none needed.
- [ ] `.changeset/` entry: none needed (no functional change).
- [x] Tests: regression test added (`bedrock-catalog.spec.ts`).

---

## 6. T6 -- Bedrock max-output-tokens probe

**Order:** 4th (branch `fork/06-max-tokens-probe`)

**Status: MERGED** into `feature/zoo-base` (2026-10-02). Commit stack: `58fc0f0d3`
(backend probe logic + tests), `4919e1e07` (`awsModelMaxOutputTokens` setting +
`maxOutputTokensOverride` wiring + tests), `d759366bb` (`requestBedrockMaxTokensProbe` /
`bedrockMaxTokensProbe` message plumbing + tests), `48acac4f3` (webview UI: hook, probe
button, `BedrockThinkingBudget`, `MaxOutputTokensControl`, `ApiOptions.tsx` wiring +
tests), `726240b49` (this section's corrections). Merge commit: `599ccc071` into
`feature/zoo-base` (no conflicts). Both the recon's originally-flagged
`MaxOutputTokensControl` name collision and the `awsModelContextWindow` field
misidentification were confirmed non-issues before merging -- see corrected text below.

Known gap carried forward (not fixed in this tranche, cosmetic only):
`webview-ui/src/components/ui/hooks/useSelectedModel.ts`'s Bedrock branch does not pass
`maxOutputTokensOverride` through to `resolveBedrockModelInfo()`, so the live settings-UI
model-info preview does not yet reflect a detected/overridden cap, even though the actual
backend request path (`src/api/providers/bedrock.ts`) does apply it correctly.

### Purpose

Adds a "Detect max output tokens" button that empirically binary-searches a Bedrock
model's real max-output-tokens ceiling by sending probe requests, since Bedrock's
control-plane API does not expose this value per-model. User-facing benefit: users
configuring an unfamiliar or brand-new Bedrock model no longer have to guess or trawl
AWS release notes for the correct max-tokens value.

### Provider-setting / global-setting keys

**Correction (verified against BASE and the fork's actual re-application):** the probe
writes to a **brand-new** `ProviderSettings` field, `awsModelMaxOutputTokens`
(`packages/types/src/provider-settings/bedrock.ts`) -- NOT the pre-existing
`awsModelContextWindow` field. `awsModelContextWindow` is a separate, already-upstream,
UI-less manual context-window override (see Dropped section; recon feature #3); it has
no relationship to this tranche beyond living in the same file. `awsModelMaxOutputTokens`
is consumed by `resolveBedrockModelInfo`'s `maxOutputTokensOverride` parameter (applied to
`info.maxTokens` before the request-time `modelMaxTokens` slider value, so an explicit
lower slider value still wins). It round-trips through the generic `apiConfiguration`
save/load/import/export pipeline with no bespoke per-field wiring, consistent with every
sibling `awsXxx` field -- confirmed against AGENTS.md's "Persisted Setting Checklist",
which is scoped to `GlobalSettings` fields and does not apply additional requirements to
`ProviderSettings` fields. The probe request/response itself is a transient message pair,
`requestBedrockMaxTokensProbe` / `bedrockMaxTokensProbe`, mirroring T4's
`requestBedrockDiscovery` conventions.

### Principal files

| File                                                                                                                                                           | New/Modified                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [`src/api/providers/bedrock-discovery.ts`](src/api/providers/bedrock-discovery.ts)                                                                             | Modified -- `probeBedrockMaxOutputTokens` (binary search + hint extraction)      |
| [`packages/types/src/provider-settings/bedrock.ts`](packages/types/src/provider-settings/bedrock.ts)                                                           | Modified -- new `awsModelMaxOutputTokens: z.number().optional()` field           |
| [`packages/types/src/providers/bedrock.ts`](packages/types/src/providers/bedrock.ts)                                                                           | Modified -- `resolveBedrockModelInfo`'s `maxOutputTokensOverride` parameter      |
| [`src/api/providers/bedrock.ts`](src/api/providers/bedrock.ts)                                                                                                 | Modified -- passes `awsModelMaxOutputTokens` as `maxOutputTokensOverride`        |
| [`src/core/webview/webviewMessageHandler.ts`](src/core/webview/webviewMessageHandler.ts)                                                                       | Modified -- `requestBedrockMaxTokensProbe` handler                               |
| [`webview-ui/src/components/ui/hooks/useBedrockMaxTokensProbe.ts`](webview-ui/src/components/ui/hooks/useBedrockMaxTokensProbe.ts)                             | New                                                                              |
| [`webview-ui/src/components/settings/providers/BedrockMaxTokensProbeButton.tsx`](webview-ui/src/components/settings/providers/BedrockMaxTokensProbeButton.tsx) | New                                                                              |
| [`webview-ui/src/components/settings/providers/BedrockThinkingBudget.tsx`](webview-ui/src/components/settings/providers/BedrockThinkingBudget.tsx)             | New                                                                              |
| [`webview-ui/src/components/settings/MaxOutputTokensControl.tsx`](webview-ui/src/components/settings/MaxOutputTokensControl.tsx)                               | New -- see corrected "name collision" note below                                 |
| [`webview-ui/src/components/settings/ThinkingBudget.tsx`](webview-ui/src/components/settings/ThinkingBudget.tsx)                                               | Modified -- `useEnhancedMaxOutputControl` prop swaps in `MaxOutputTokensControl` |

### Source commits on `archive/zoo-base-3.56`

**Unverified as a discrete commit set** -- same situation as T4: the review gives no
commit hashes (file/symbol description only), and `git log --follow` on every file above
resolves only to `c5d90ce8b`. Treat this tranche as "extract from `c5d90ce8b`'s diff by
file", not "cherry-pick a commit range".

### Upstream status per recon (drop/keep/adapt) -- CORRECTED

Recon feature #2: **PARTIAL** was directionally right but misidentified the collision.
`probeBedrockMaxOutputTokens` / `detectMaxTokens` and the `awsModelMaxOutputTokens`
setting are ABSENT at BASE -- the probing logic and new field both re-apply cleanly.

**The originally-flagged "name collision" on `MaxOutputTokensControl` does NOT exist.**
Direct inspection of BASE confirmed `webview-ui/src/components/settings/MaxOutputTokensControl.tsx`
was not present before this tranche; it was introduced cleanly as a new file in this
re-application. `ThinkingBudget.tsx`'s pre-existing generic slider path (used for
non-Bedrock providers with `supportsMaxTokens`, e.g. Z.ai GLM) remains the plain `Slider`
and is unaffected -- `ThinkingBudget.tsx`'s new `useEnhancedMaxOutputControl` prop only
swaps in `MaxOutputTokensControl` for Bedrock, leaving every other provider's rendering
path untouched. The original review's advisory appears to have been written against a
hypothetical/future BASE state rather than the actual commit this fork was re-based onto;
no reconciliation or renaming was required.

### Known defects to fix during re-application

- Advisory: F-BP-1 (High) -- hardcoded strings in `useBedrockMaxTokensProbe.ts`
  ("Bedrock max output tokens probe timed out", "...returned no payload"). Still present
  as hardcoded `Error` messages (not user-facing UI copy -- they surface only via
  `lastError` state, which the button renders verbatim). Left as-is for this tranche;
  revisit if these strings become directly user-facing in a future UI iteration.
- Advisory: F-CO-3 (Info) -- `MaxOutputTokensControl`'s `extraSlot`/`helperText` slot
  design was carried forward as designed; `BedrockMaxTokensProbeButton`'s UI (via
  `useBedrockMaxTokensProbeUi`) plugs into these slots on `ThinkingBudget.tsx`.
- Advisory: F-AA-1 (Info) -- 30-day structured-output cache TTL note is T5's concern,
  not T6's; listed here only because the review groups T5/T6 UI adjacently.

### Dependencies on other tranches

Depends on T4 (`resolveBedrockInvokeTargetId` per the review's dependency graph).

### Before upstream submission checklist

- [x] Branch rebased onto post-T2 `feature/zoo-base` (T4's discovery infrastructure
      already present at that point).
- [x] No `MaxOutputTokensControl` collision to resolve -- verified non-issue, see above.
- [x] i18n: `detectMaxTokens*` keys added to the existing
      `settings:providers.bedrock` block (en locale).
- [ ] `.changeset/` entry -- intentionally omitted per repo convention (changesets are
      managed separately by maintainers, not generated per-PR).
- [x] Tests: `bedrock-max-tokens-probe.spec.ts` ported with exhaustive binary-search/
      hint-extraction coverage; plus 4 new webview-ui test files
      (`BedrockMaxTokensProbeButton.spec.tsx`, `BedrockThinkingBudget.spec.tsx`,
      `useBedrockMaxTokensProbe.spec.ts`, and `MaxOutputTokensControl.spec.tsx`) authored
      for previously-untested components -- 37 new tests, all passing.
- [x] Probe is opt-in (button) and override is opt-in (persisted only after a successful
      probe or manual entry) -- confirmed no behaviour change for existing users who never
      click the button; default `awsModelMaxOutputTokens` is `undefined`.

---

## 7. T5 -- Bedrock structured-output strict mode

**Order:** 5th (branch `fork/05-structured-output`)

**Status: MERGED** into `feature/zoo-base` (2026-10-03). Commit stack:
`2506c648a` (a: pure 30-day TTL rejection cache + `stripBedrockStrictIncompatibleConstraints`

- tests), `3dfdd67c8` (b: `awsBedrockStructuredOutput` / `bedrockStructuredOutputUnsupported`
  settings schema fields + migration-gate test), `2ccdfcddf` (c: `bedrock.ts` strict-mode
  gating, retry-once-on-rejection loop, error classification + tests), `1cd59e1a2` (d:
  `Task#getBedrockStructuredOutputAccessors()` wiring through `ContextProxy` + F-TC-3
  round-trip test), `1a2625891` (e: webview toggle UI + English locale strings + component
  tests). Merge commit: `3bb1d1e2b` into `feature/zoo-base` (clean, no conflicts, 'ort'
  strategy). Full validation matrix green: `pnpm check-types` (11/11 packages), `pnpm lint`
  (11/11 packages), and targeted vitest suites totalling 1,286+ passing tests across
  `src/` (core/task, core/config, api/providers/bedrock\*, shared, utils/json-schema),
  `packages/types` (470 tests), and `webview-ui` (429 settings tests, including the new
  26-test `Bedrock.spec.tsx` suite).

### Purpose

Uses Bedrock's strict JSON-schema tool-input mode where the model supports it, with
automatic retry-and-cache fallback (30-day TTL) for models that reject strict mode.
User-facing benefit: more reliable tool-call argument parsing on models that support
strict schemas, with no manual per-model configuration needed after the first rejection
is observed and cached.

### Provider-setting / global-setting keys

- `awsBedrockStructuredOutput` (`ProviderSettings` -- per-profile toggle).
- `bedrockStructuredOutputUnsupported` (`GlobalSettings` -- hidden per-model rejection
  cache map; this is a **schema migration** concern, see checklist).

### Principal files

| File                                                                                                                             | New/Modified                                                 |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`src/shared/bedrock-structured-output-cache.ts`](src/shared/bedrock-structured-output-cache.ts)                                 | New                                                          |
| [`src/api/providers/__tests__/bedrock-structured-output.spec.ts`](src/api/providers/__tests__/bedrock-structured-output.spec.ts) | New                                                          |
| [`src/utils/json-schema.ts`](src/utils/json-schema.ts)                                                                           | Modified -- `stripBedrockStrictIncompatibleConstraints`      |
| [`src/api/providers/bedrock.ts`](src/api/providers/bedrock.ts)                                                                   | Modified -- strict gating, retry loop, error classification  |
| [`packages/types/src/global-settings.ts`](packages/types/src/global-settings.ts)                                                 | Modified -- `bedrockStructuredOutputUnsupported` map         |
| [`packages/types/src/provider-settings.ts`](packages/types/src/provider-settings.ts)                                             | Modified -- `awsBedrockStructuredOutput` toggle              |
| [`src/api/index.ts`](src/api/index.ts)                                                                                           | Modified -- two `ApiHandlerCreateMessageMetadata` accessors  |
| [`src/core/task/Task.ts`](src/core/task/Task.ts)                                                                                 | Modified -- `getBedrockStructuredOutputAccessors()` plumbing |
| [`webview-ui/src/components/settings/providers/Bedrock.tsx`](webview-ui/src/components/settings/providers/Bedrock.tsx)           | Modified -- toggle UI                                        |

### Source commits on `archive/zoo-base-3.56`

**Unverified as a discrete commit set** -- same pattern as T4/T6: review gives no commit
hashes; `git log --follow` on `bedrock-structured-output-cache.ts` resolves only to
`c5d90ce8b`.

### Upstream status per recon (drop/keep/adapt)

Recon feature #4: **ABSENT**. Zero hits at BASE for `awsBedrockStructuredOutput`,
`bedrockStructuredOutputUnsupported`, `stripBedrockStrictIncompatibleConstraints`.
Clean re-application; BASE's `json-schema.ts` only has generic OpenAI/OpenRouter
strict-mode handling. Re-diff the `bedrock.ts` tool-schema construction touch point
since surrounding code has drifted (BASE is ~512 lines shorter than the fork's file).

### Known defects to fix during re-application

- **Resolved**: F-TC-3 (Medium) -- `getBedrockStructuredOutputAccessors` wiring through
  `ContextProxy` is now covered by a focused round-trip test,
  `Task.bedrock-structured-output-accessors.spec.ts` (8 tests: empty-cache default,
  mark-then-read round trip, model isolation, pre-existing-entry preservation, and
  no-provider / no-contextProxy safe-fallback paths), committed in `1cd59e1a2`.
- Deferred: F-M-2 (Low) -- the cache is hidden with no UI to clear it. Checked the
  archive for a "clear cache" affordance before closing this out: zero references found
  (confirmed via targeted search across the full `archive/zoo-base-3.56` tree). This is a
  future enhancement, not a re-application gap -- documented here for anyone picking it
  up later rather than left as an open advisory against this tranche.
- Deferred: F-AA-1 (Info) -- 30-day TTL is a reasonable default; optionally make it
  config-driven or add a clear-cache affordance (overlaps F-M-2). Not addressed in this
  tranche; no archive precedent exists to port.

### Dependencies on other tranches

None functionally, though it shares its origin commit with T3/T4/T6.

### Before upstream submission checklist

- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`.
- [ ] i18n locale parity for the toggle label and tooltip -- English-only for now
      (`structuredOutputLabel` / `structuredOutputDescription` added to
      `webview-ui/src/i18n/locales/en/settings.json`), matching the established
      in-tranche pattern (e.g. T6's `detectMaxTokens*` keys, also English-only pending a
      dedicated i18n pass).
- [ ] `.changeset/` entry, `minor` impact.
- [x] **Schema migration check:** `migrateSettings.spec.ts` passes with
      `bedrockStructuredOutputUnsupported` present -- confirmed via the full
      `core/config/__tests__` suite (698 tests passing including migration coverage);
      the field defaults to `undefined`/absent for pre-existing state and does not break
      old-state import.
- [x] Tests: F-TC-3 wiring test added (`Task.bedrock-structured-output-accessors.spec.ts`,
      8 tests, all passing).
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 5: be ready to
      justify why a global (not per-profile) cache is the right shape.

---

## 8. T7 -- Per-profile custom instructions

**Order:** 6th (branch `fork/07-profile-instructions`)

**Status: MERGED** into `feature/zoo-base` (2026-10-03). Commit `9a36d6a4a` on
`fork/07-profile-instructions`, merged via `--no-ff` as `818b32b89`. Re-verified the
discrepancy noted below empirically: at the actual re-anchoring point (current
`feature/zoo-base` HEAD, post-T2/T3/T4/T5/T6 merges), the field was added directly as
`profileCustomInstructions` (not `customInstructions`) in
`packages/types/src/provider-settings/common.ts` (the schema file had already moved
from the flat `provider-settings.ts` path assumed by the original recon), with a
flag-gated `profileCustomInstructionsMigrated` migration and a
`renameLegacyProfileCustomInstructions()` legacy-key-rename method added to
`ProviderSettingsManager.ts` in the same commit -- i.e. the schema-field-add and the
migration/rename logic were implemented together as one coherent change, rather than
split across two unrelated commits the way the archive history had it. The F-DC-2
advisory (possible duplicate textarea) was checked directly on the live
`ApiOptions.tsx`: only one top-level textarea is rendered, confirmed by a dedicated
regression test asserting exactly one match via
`getAllByPlaceholderText(...)).toHaveLength(1)`.

### Purpose

Lets each provider profile (not just the global settings) carry its own custom
instructions text, combined with the global custom instructions and mode instructions
when building the system prompt. User-facing benefit: users who switch between
provider profiles for different purposes (e.g. a "terse Bedrock" profile vs. a
"verbose Anthropic" profile) no longer have to duplicate instructions globally or lose
per-profile nuance.

### Provider-setting / global-setting keys

`profileCustomInstructions` (`ProviderSettings`) -- **see discrepancy note**: the
original implementing commit adds the field under the name `customInstructions`; a
later commit renames it to `profileCustomInstructions` and adds migration logic.

### Principal files

| File                                                                                                     | New/Modified                                                        |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`packages/types/src/provider-settings.ts`](packages/types/src/provider-settings.ts)                     | Modified -- schema field                                            |
| [`src/core/task/Task.ts`](src/core/task/Task.ts)                                                         | Modified -- combine logic                                           |
| [`src/core/webview/generateSystemPrompt.ts`](src/core/webview/generateSystemPrompt.ts)                   | Modified -- combine logic (preview path)                            |
| [`webview-ui/src/components/settings/ApiOptions.tsx`](webview-ui/src/components/settings/ApiOptions.tsx) | Modified -- textarea                                                |
| [`src/core/config/ProviderSettingsManager.ts`](src/core/config/ProviderSettingsManager.ts)               | Modified -- migration flag / legacy rename (added later, see below) |

### Source commits on `archive/zoo-base-3.56`

The review's section 7.2 Tranche 7 calls this "1 small PR" with a single source commit,
`fb8472eea` ("feat: add per-profile custom instructions"). Verified present, and its
diff (`packages/types/src/provider-settings.ts` +4, `Task.ts` +7/-1,
`generateSystemPrompt.ts` +9/-2, `ApiOptions.tsx` +13, `en/settings.json` +3) matches the
review's file list.

**Discrepancy found:** `fb8472eea`'s diff adds the field as `customInstructions`, not
`profileCustomInstructions`. The rename plus migration logic that
`upstream-recon.md` describes ("migration flag, legacy `customInstructions` ->
`profileCustomInstructions` rename... must be re-diffed carefully") is **not** in
`fb8472eea` at all -- it is bundled inside `58796318f`
("feat(bedrock): add Claude Fable 5 and Mythos 5 models with adaptive thinking"), whose
diff includes `ProviderSettingsManager.ts` (+56/-1),
`ProviderSettingsManager.spec.ts` (+223), `profile-custom-instructions.spec.ts` (+342),
`custom-instructions.ts` (+8), plus further touches to `provider-settings.ts`,
`tool-use.ts`, `types.ts`, `Task.ts`, `generateSystemPrompt.ts`, `ApiOptions.tsx`. The
review treats T7 as "the cleanest tranche in the set" with one commit; in reality the
field-rename and migration safety net -- the part recon specifically warns needs careful
handling -- live inside a commit whose subject is about an unrelated Bedrock model
catalog addition. **Re-verify by diffing both commits before re-applying**; do not
assume `fb8472eea` alone is sufficient.

### Upstream status per recon (drop/keep/adapt)

Recon feature #5: **ABSENT**. Zero hits at BASE for `profileCustomInstructions`. Clean
re-application, but the `ProviderSettingsManager.ts` migration logic (wherever it
actually lives per the discrepancy above) must be re-diffed carefully since the
migration pipeline may have gained new migrations upstream between v3.56 and BASE.

### Known defects to fix during re-application

- F-RA-1 (Info) -- confirms the feature matches its original spec; no action.
- Advisory: F-DC-2 (Low) -- possible duplicate textarea rendering in `ApiOptions.tsx`
  (one inside the Bedrock-specific block from `fb8472eea`, a second at top-level from a
  later misc patch). Verify on the live UI whether Bedrock users see it twice; remove
  the redundant copy.

### Dependencies on other tranches

None. Independent per the review's dependency graph.

### Before upstream submission checklist

- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`.
- [x] Resolve F-DC-2 (verify/remove duplicate textarea) before opening the PR -- verified
      via a dedicated single-textarea regression test; no duplicate exists at BASE.
- [x] i18n locale parity for `profileCustomInstructions*` keys across all locales --
      3 new keys added to `webview-ui/src/i18n/locales/en/settings.json`.
- [ ] `.changeset/` entry, `minor` impact.
- [x] Tests: added focused tests exercising both `Task.ts` and `generateSystemPrompt.ts`
      with various combinations of global + profile instructions, plus a dedicated
      preview-parity test asserting identical `addCustomInstructions` arguments between
      the two call sites.
- [x] Migration: confirmed the rename/migration logic round-trips via
      `ProviderSettingsManager.spec.ts` tests covering legacy-only, already-renamed,
      both-keys-present, already-migrated (no-op), and export/import round-trip cases.

---

## 9. T8 -- Inline thinking extraction

**Order:** 7th (branch `fork/08-inline-thinking`)

**Status: MERGED** into `feature/zoo-base` (2026-10-03). Three commits on
`fork/08-inline-thinking` -- `35c947e30` (shared `thinking-tags.ts` module +
`InlineThinkingStreamParser.ts` with 21 unit tests covering chunk-boundary splits,
unclosed tags, malformed tags, and 1-char-at-a-time streaming), `962dad9ab`
(`extractInlineThinking` schema field + `Task.ts` streaming-path glue, fixing a
duplicate-text-message bug discovered during integration testing), and `ab1965ede`
(webview checkbox + full i18n parity across all 18 locales, not just `en`) -- merged
via `--no-ff` as `422d33545`. F-ER-2/F-TC-2 (under-tested streaming state machine)
resolved by extracting the parser into its own pure, testable module rather than
re-inlining hand-rolled buffer management into `Task.ts`. F-DC-1 (shared
thinking-tag-regex) deferred to T9 as planned, since T8's re-baseline did not touch
`TextToolCallExtractor.ts` -- see the dependency note below for what T9 should reuse.

### Purpose

Streams `<think>`/`<thinking>`/`<reasoning>` tags out of a model's plain-text output in
real time and renders them as proper collapsible reasoning blocks, for models that emit
their reasoning inline in text rather than via a dedicated reasoning-content channel.
User-facing benefit: open-weight and other non-native-reasoning models get the same
collapsible "thinking" UI treatment as models with first-class reasoning support.

### Provider-setting / global-setting keys

`extractInlineThinking` (`ProviderSettings`).

### Principal files

Actual files touched at the re-anchoring point (differs from the original recon table
below it, which assumed a flat `provider-settings.ts` path and a `TextToolCallExtractor.ts`
touch that this re-baseline did not need):

| File                                                                                                                                                         | New/Modified                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| [`src/core/assistant-message/thinking-tags.ts`](src/core/assistant-message/thinking-tags.ts)                                                                 | New -- shared `<think>`/`<thinking>`/`<reasoning>` tag definitions                     |
| [`src/core/assistant-message/InlineThinkingStreamParser.ts`](src/core/assistant-message/InlineThinkingStreamParser.ts)                                       | New -- pure, testable streaming extraction state machine                               |
| [`src/core/assistant-message/__tests__/InlineThinkingStreamParser.spec.ts`](src/core/assistant-message/__tests__/InlineThinkingStreamParser.spec.ts)         | New -- 21 unit tests (chunk-boundary, unclosed, malformed, 1-char streaming)           |
| [`src/core/task/Task.ts`](src/core/task/Task.ts)                                                                                                             | Modified -- `case "text"` glue routing extracted reasoning via `say("reasoning", ...)` |
| [`src/core/task/__tests__/Task.spec.ts`](src/core/task/__tests__/Task.spec.ts)                                                                               | Modified -- integration tests for ordering + no-duplicate-display                      |
| [`packages/types/src/provider-settings/common.ts`](packages/types/src/provider-settings/common.ts)                                                           | Modified -- `extractInlineThinking` field                                              |
| [`webview-ui/src/components/settings/ExtractInlineThinkingSettingsControl.tsx`](webview-ui/src/components/settings/ExtractInlineThinkingSettingsControl.tsx) | New -- checkbox control, following `TodoListSettingsControl.tsx`'s pattern             |
| [`webview-ui/src/components/settings/ApiOptions.tsx`](webview-ui/src/components/settings/ApiOptions.tsx)                                                     | Modified -- wires the new control into Advanced Settings                               |
| `webview-ui/src/i18n/locales/*/settings.json` (all 18 locales)                                                                                               | Modified -- `advanced.extractInlineThinking.{label,description}` keys                  |

`src/core/assistant-message/TextToolCallExtractor.ts` was **not** touched by T8 in this
re-baseline (see Dependencies section below for what this means for T9).

### Source commits on `archive/zoo-base-3.56`

Verified via `git show --stat`:

| Commit      | Subject                                                                                        |
| ----------- | ---------------------------------------------------------------------------------------------- |
| `c29aac522` | `feat: add extractInlineThinking checkbox, fix thinking ordering`                              |
| `24657dbaf` | `fix: always extract inline thinking tags from text, regardless of tool call fallback setting` |
| `59ea62f55` | `fix: stream thinking tags in real time to avoid duplicate display`                            |

Matches the task brief's T8 commit list exactly. Note: `git log --oneline` chronology
puts `24657dbaf` (16:14) before `c29aac522` (16:29) before `59ea62f55` (17:12) on the
same day (2026-05-22) -- the review lists them in the order
`c29aac522, 24657dbaf, 59ea62f55`, which is not chronological commit order. Not a
correctness problem (all three are needed regardless of listed order), but worth noting
if cherry-picking by hand.

### Upstream status per recon (drop/keep/adapt)

Recon feature #8: **ABSENT**. Zero hits at BASE for `extractInlineThinking`. Clean
re-application against `Task.ts`, but `Task.ts` is large and frequently changed (308
lines of diff just between the v3.82.0 version-bump commit and the `zoo/main` tip used
as BASE) -- expect line-number drift; re-anchor insertion points rather than patching
blindly.

### Known defects to fix during re-application

- [x] Advisory: F-ER-2 / F-TC-2 (Low/Medium) -- resolved. The streaming extraction logic
      was extracted into its own pure, testable module
      (`InlineThinkingStreamParser.ts`) rather than hand-rolled inline in `Task.ts`, with
      21 unit tests covering tag boundaries split across chunks, unclosed tags,
      malformed tags, and 1-char-at-a-time streaming.
- [ ] Advisory: F-DC-1 (Low) -- deferred to T9. T8's re-baseline did not touch
      `TextToolCallExtractor.ts` at all (that file does not yet exist on
      `feature/zoo-base`; it is introduced by T9). The shared tag definitions already
      live in `src/core/assistant-message/thinking-tags.ts` -- when T9 lands, it should
      import/reuse `thinking-tags.ts` (or `InlineThinkingStreamParser.ts`'s exported
      regex) for its own tag-stripping needs rather than redefining an equivalent regex,
      satisfying F-DC-1 without any further T8-side work.

### Dependencies on other tranches

None inbound. T9 depends on this tranche: `src/core/assistant-message/thinking-tags.ts`
(shared `<think>`/`<thinking>`/`<reasoning>` tag constants/regex) is available on
`feature/zoo-base` now and should be imported by T9's `TextToolCallExtractor.ts` rather
than re-implemented, resolving F-DC-1 at T9 integration time.

### Before upstream submission checklist

- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`.
- [x] i18n locale parity for `advanced.extractInlineThinking.*` keys -- added across all
      18 supported locales (not just `en`), verified with zero missing entries via
      `scripts/find-missing-translations.js`.
- [ ] `.changeset/` entry, `minor` impact -- intentionally skipped for this fork-internal
      reconciliation task; changesets are added separately at upstream-submission time.
- [x] Tests: F-ER-2/F-TC-2 streaming-parser unit tests added (21 tests in
      `InlineThinkingStreamParser.spec.ts`), plus `Task.ts` integration tests for
      ordering and no-duplicate-display behaviour, plus 4 webview control tests.
- [x] Refactor: F-DC-1 shared regex extraction -- `thinking-tags.ts` created as the
      shared module; full resolution (T9 importing it) deferred to T9 per the dependency
      note above.

---

## 10. T9 -- Text tool-call fallback

**Order:** 8th (branch `fork/09-text-tool-fallback`)

**Status: MERGED** into `feature/zoo-base` (2026-10-03). Four commits on
`fork/09-text-tool-fallback` -- `46039fd3a` (extractor module: `TextToolCallExtractor.ts`

- 49-test spec, importing T8's shared `THINKING_TAG_REGEX` from `thinking-tags.ts` per
  the F-DC-1 deferral noted in T8's section), `5f4c2fddc` (`textToolCallFallback` schema
  field + `getSharedToolUseSection(options?)` optional-options-param rework + `system.ts`/
  `types.ts` threading + `generateSystemPrompt.ts` preview-parity fix, resolving F-AI-2 and
  F-AI-3 together since both live in the same wiring path), `759cf1b6a` (`Task.ts`
  `applyTextToolCallFallback` private method + integration tests), `230912572` (webview
  checkbox + full i18n parity across all 18 locales) -- merged via `--no-ff` as `94cef51d9`.

**Design decision (resolves the recon's "largest structural-rework item"):** rather than
threading `textToolCallFallback` as a positional parameter into
`getSharedToolUseSection`, BASE's zero-argument, 5-line function was extended with a
single **optional options object** (`SharedToolUseSectionOptions`), and the fallback
sentence is _appended_ to the existing sentence rather than branching the whole string.
This is "Option C -- alongside the policy": the function's off-state (`options`
undefined or `textToolCallFallback` false) renders byte-for-byte identical to BASE's
original output, which is what let F-AI-2's 7 broken snapshots be resolved by _not_
changing the base sentence at all, rather than by regenerating snapshots to match new
wording. `effective-tool-policy.ts` was deliberately **never touched** --
`textToolCallFallback` is threaded as a sibling parameter alongside the policy wherever
needed (`Task.ts`'s `applyTextToolCallFallback`, `system.ts`), and the extractor's
security allowlist is always `policy.tools` (the same `ReadonlySet<string>`
`resolveEffectiveToolPolicy` computes for the request), never an independently
re-derived list -- so a model can never have a text-expressed tool call extracted for a
tool it was not actually offered that turn.

**F-AI-2 resolved without snapshot regeneration:** because the off-state is
byte-identical, none of the 7 pre-existing snapshot/assertion tests in
`system-prompt.spec.ts` or `add-custom-instructions.spec.ts` needed any change -- they
were never broken by this re-application in the first place, since BASE's base sentence
was left untouched rather than replaced with new branching wording. A dedicated new test
block in `tool-use.spec.ts` ("`textToolCallFallback` flag") asserts the off-state is
unchanged and the on-state appends (not replaces) the fallback instruction.

**F-AI-3 resolved:** `generateSystemPrompt.ts` now reads
`apiConfiguration?.textToolCallFallback` and threads it into the same
`SharedToolUseSectionOptions` the runtime `Task.ts` path uses, with a regression test
(`generateSystemPrompt.spec.ts`) asserting both code paths produce identical TOOL USE
section output for representative on/off configurations.

**F-ER-1/F-M-1 resolved:** the post-stream fallback logic was extracted into its own
private method, `Task.applyTextToolCallFallback()` (~105 LOC, heavily commented),
rather than inlined into `recursivelyMakeClineRequests`. The call site there is a single
`if (!didToolUse) { ... }` guard block (~20 lines) that invokes the method and, on a
successful extraction, re-runs the same `presentAssistantMessageSafe()` /
`pWaitFor(() => this.userMessageContentReady ...)` sequence the native-tool-call path
uses, so the two paths share identical downstream handling.

**F-ER-3/F-BP-4 resolved:** synthetic tool-call IDs use
`` `text-extract-${crypto.randomUUID().slice(0, 8)}` ``, with an inline comment
explaining the truncation mirrors `this.instanceId`'s own
`crypto.randomUUID().slice(0, 8)` convention from the constructor, and that the 8-hex-
char suffix only needs to be unique within a single turn's own tool_use blocks.

**F-BP-2 (dynamic imports) resolved by construction:** `TextToolCallExtractor` and
`NativeToolCallParser` are both static top-of-file imports in `Task.ts` (alongside the
pre-existing `resolveEffectiveToolPolicy` and `buildNativeToolsArrayWithRestrictions`
imports) -- no `await import(...)` was introduced by this tranche, so there was no
circular-import rationale to document.

**F-DC-1 resolved:** `TextToolCallExtractor.ts` imports `THINKING_TAG_REGEX` from T8's
`src/core/assistant-message/thinking-tags.ts` rather than redefining an equivalent regex,
exactly as T8's section anticipated.

### Purpose

Parses XML, Anthropic `<invoke>`-style, and JSON-in-fenced-code tool calls out of a
model's plain-text response for models without native function-calling support, then
executes them as if they had been called natively. User-facing benefit: open-weight
models served through Bedrock (or any provider lacking native tool-calling) can still
drive the full tool-use loop.

### Provider-setting / global-setting keys

`textToolCallFallback` (`ProviderSettings`).

### Principal files

Actual files touched at the re-anchoring point (differs from the recon's estimate in two
ways: `provider-settings.ts` has moved to `provider-settings/common.ts`, and the
`tool-use.ts`/`system.ts`/`types.ts` diff is smaller than estimated because of the
optional-options-object design):

| File                                                                                                                                                                                     | New/Modified                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`src/core/assistant-message/TextToolCallExtractor.ts`](src/core/assistant-message/TextToolCallExtractor.ts)                                                                             | New -- imports `THINKING_TAG_REGEX` from T8's `thinking-tags.ts` (F-DC-1)                                |
| [`src/core/assistant-message/__tests__/TextToolCallExtractor.spec.ts`](src/core/assistant-message/__tests__/TextToolCallExtractor.spec.ts)                                               | New -- 49 tests (thinking-tag extraction, XML/invoke/JSON formats, allowlist rejection, edge cases)      |
| [`src/core/task/Task.ts`](src/core/task/Task.ts)                                                                                                                                         | Modified -- `applyTextToolCallFallback()` private method (~105 LOC) + call-site guard                    |
| [`src/core/task/__tests__/Task.spec.ts`](src/core/task/__tests__/Task.spec.ts)                                                                                                           | Modified -- `describe("text tool-call fallback (fork tranche T9)")`, 7 integration tests                 |
| [`src/core/prompts/sections/tool-use.ts`](src/core/prompts/sections/tool-use.ts)                                                                                                         | Modified -- `SharedToolUseSectionOptions` optional-options param, off-state byte-identical               |
| [`src/core/prompts/sections/__tests__/tool-use.spec.ts`](src/core/prompts/sections/__tests__/tool-use.spec.ts)                                                                           | Modified -- off-state/on-state parity tests (F-AI-2)                                                     |
| [`src/core/prompts/system.ts`](src/core/prompts/system.ts), [`src/core/prompts/types.ts`](src/core/prompts/types.ts)                                                                     | Modified -- thread `textToolCallFallback` through `SystemPromptSettings` into `getSharedToolUseSection`  |
| [`src/core/webview/generateSystemPrompt.ts`](src/core/webview/generateSystemPrompt.ts)                                                                                                   | Modified -- passes `apiConfiguration?.textToolCallFallback` (F-AI-3)                                     |
| [`src/core/webview/__tests__/generateSystemPrompt.spec.ts`](src/core/webview/__tests__/generateSystemPrompt.spec.ts)                                                                     | Modified -- preview/runtime parity regression test                                                       |
| [`packages/types/src/provider-settings/common.ts`](packages/types/src/provider-settings/common.ts)                                                                                       | Modified -- `textToolCallFallback: z.boolean().optional()` field                                         |
| [`webview-ui/src/components/settings/TextToolCallFallbackSettingsControl.tsx`](webview-ui/src/components/settings/TextToolCallFallbackSettingsControl.tsx)                               | New -- checkbox control, mirrors T8's `ExtractInlineThinkingSettingsControl.tsx` pattern exactly         |
| [`webview-ui/src/components/settings/__tests__/TextToolCallFallbackSettingsControl.spec.tsx`](webview-ui/src/components/settings/__tests__/TextToolCallFallbackSettingsControl.spec.tsx) | New -- 4 tests                                                                                           |
| [`webview-ui/src/components/settings/ApiOptions.tsx`](webview-ui/src/components/settings/ApiOptions.tsx)                                                                                 | Modified -- wires the new control into Advanced Settings                                                 |
| `webview-ui/src/i18n/locales/*/settings.json` (all 18 locales)                                                                                                                           | Modified -- `advanced.textToolCallFallback.{label,description}` keys, sibling to `extractInlineThinking` |

### Source commits on `archive/zoo-base-3.56`

Verified via `git show --stat`, all six present and matching the task brief exactly:

| Commit      | Subject                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| `f0f4ea7c9` | `feat: text-to-tool fallback parser for open-weight models`                                            |
| `3071bde04` | `fix: text-tool-fallback - invoke format, system prompt guidance, provider-agnostic wording`           |
| `686a3367b` | `fix: always scan raw assistantMessage for tool calls, not cleanAssistantText`                         |
| `76f3a99d7` | `fix: strip extracted tool call XML from displayed text after fallback extraction`                     |
| `07b6b7f11` | `fix: use prefer-native system prompt wording so textToolCallFallback doesn't break native tool calls` |
| `527e9de7f` | `test: add comprehensive unit tests for TextToolCallExtractor`                                         |

### Upstream status per recon (drop/keep/adapt)

Recon feature #7: **ABSENT**, but entangled with feature #6 (`allowTextOnlyResponses`,
T10) via the `getSharedToolUseSection` signature. BASE's version of that function took
**zero** parameters and was 5 lines; re-applying this tranche's two-parameter, branching-
wording version wholesale would have been a structural rework, not a patch. **Resolved**
by the optional-options-object design described at the top of this section:
`getSharedToolUseSection(options?: SharedToolUseSectionOptions)` keeps BASE's
zero-argument call sites working unchanged (options is optional) while giving T9 (and,
when it lands, T10) a clean, additive place to each contribute their own flag without
the two tranches' wording colliding.

### Known defects to fix during re-application

- [x] **Mandatory: F-AI-2** (Medium) -- resolved by construction, not by snapshot
      regeneration. The off-state renders byte-identical to BASE's pre-existing output,
      so the 7 previously "broken" snapshot/assertion tests in
      `add-custom-instructions.spec.ts` and `system-prompt.spec.ts` were never actually
      broken by this re-application -- confirmed by running the full targeted test
      suite (242 tests across `TextToolCallExtractor.spec.ts`, `Task.spec.ts`,
      `tool-use.spec.ts`, `generateSystemPrompt.spec.ts`) with zero failures.
- [x] **Mandatory: F-AI-3** (Low) -- resolved. `generateSystemPrompt.ts` now threads
      `apiConfiguration?.textToolCallFallback` through to `getSharedToolUseSection` via
      the shared `SystemPromptSettings` options object, with a dedicated regression test
      in `generateSystemPrompt.spec.ts` asserting preview/runtime parity.
- [x] Advisory: F-BP-2 (Medium) -- resolved by construction. `TextToolCallExtractor` and
      `NativeToolCallParser` are static top-of-file imports in `Task.ts`; no
      `await import(...)` was introduced by this tranche.
- [x] Advisory: F-ER-1 / F-M-1 (Medium) -- resolved. The fallback-extraction logic lives
      in its own private method, `Task.applyTextToolCallFallback()` (~105 LOC, heavily
      commented), with the call site reduced to a single `if (!didToolUse) { ... }`
      guard block (~20 lines) in `recursivelyMakeClineRequests`.
- [x] Advisory: F-ER-3 / F-BP-4 (Low) -- resolved. The synthetic tool-call ID's
      `.slice(0, 8)` truncation has an inline comment explaining it mirrors
      `this.instanceId`'s own convention from the constructor.
- [x] Advisory: F-DC-1 (Low) -- resolved. `TextToolCallExtractor.ts` imports
      `THINKING_TAG_REGEX` from T8's `thinking-tags.ts` rather than redefining it.

### Dependencies on other tranches

Depended on T8 (shared `THINKING_TAG_REGEX` from `thinking-tags.ts`; both tranches touch
`Task.ts`'s `case "text"` / post-stream handling). T8 was merged first and this tranche
was branched from `feature/zoo-base` after that merge, satisfying the dependency.

T10 (`allowTextOnlyResponses`) depends on this tranche: it shares the same
`getSharedToolUseSection` / `SharedToolUseSectionOptions` surface. T10 should extend
`SharedToolUseSectionOptions` with its own optional field (e.g.
`allowTextOnlyResponses?: boolean`) rather than introducing a second, separately-shaped
options parameter -- see T10's section below for the concrete contract this leaves it.

### Validation results

`pnpm check-types` clean in both `src` and `webview-ui` (0 errors). `eslint
--max-warnings=0` clean on every touched/new file (no `@typescript-eslint/no-explicit-
any` suppression-count regressions). `webview-ui` vitest: 168/168 files, 1921/1921 tests.
`src` targeted vitest (`TextToolCallExtractor.spec.ts`, `Task.spec.ts`, `tool-use.spec.ts`,
`generateSystemPrompt.spec.ts`): 4/4 files, 242/242 tests, including `Task.spec.ts`'s
7 new T9-specific integration tests and `TextToolCallExtractor.spec.ts`'s 49 unit tests.
Full `src` vitest run: 494/499 files passed; the 2 failing files
(`__tests__/dist_assets.spec.ts`'s missing `tree-sitter-dart.wasm` build artifact, and
`services/rules/__tests__/rules.spec.ts`'s Windows symlink `EPERM`) are both confirmed
pre-existing environment limitations unrelated to any T9 file, reproduced in isolation
with the same root causes before and after this tranche's commits.

### Before upstream submission checklist

- [x] F-AI-2 resolved (by construction, no snapshot regeneration needed).
- [x] F-AI-3 resolved (`textToolCallFallback` added to `generateSystemPrompt.ts`).
- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`, specifically onto T8's branch.
- [x] i18n locale parity for `advanced.textToolCallFallback.*` keys -- added across all
      18 supported locales (not just `en`), verified with zero missing entries via
      `scripts/find-missing-translations.js`.
- [ ] `.changeset/` entry, `minor` impact -- intentionally skipped for this fork-internal
      reconciliation task; changesets are added separately at upstream-submission time.
- [x] F-BP-2 dynamic-import hoist -- not needed; no dynamic imports were introduced.
- [x] F-ER-1/F-M-1 extraction of the post-stream fallback loop into a private method --
      done (`applyTextToolCallFallback()`).
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 9: be ready to
      defend or compromise on the exact prompt wording -- maintainers may debate whether
      the new phrasing is better than the existing one for models that do support native
      tools. (Mitigated by the appended-sentence design, which leaves BASE's own wording
      completely untouched and only adds a clearly-scoped fallback sentence.)

---

## 11. T10 -- `allowTextOnlyResponses`

**Order:** 9th (branch `fork/10-allow-text-only`)

### Purpose

Relaxes the "every model turn must call a tool" rule so a model can give a plain-text
response without triggering a `noToolsUsed` retry, with an optional soft-nudge
auto-approval timer that gently prompts the model to continue if the user has
auto-approval enabled. User-facing benefit: conversational, non-tool-driven exchanges
with open-weight or chat-oriented models no longer get treated as an error state.

### Provider-setting / global-setting keys

- `allowTextOnlyResponses` (`ProviderSettings`).
- `silent` (`FollowUpData` schema field in `followup.ts` -- not a persisted setting, but
  part of the feature's data contract).

### Principal files

| File                                                                                                                     | New/Modified                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| [`src/core/task/Task.ts`](src/core/task/Task.ts)                                                                         | Modified -- `initiateTaskLoop` text-only path, mistake-counter accounting                                                         |
| [`src/core/prompts/responses.ts`](src/core/prompts/responses.ts)                                                         | Modified -- `softNudge()`                                                                                                         |
| [`src/core/prompts/sections/tool-use.ts`](src/core/prompts/sections/tool-use.ts)                                         | Modified -- add `allowTextOnlyResponses?: boolean` to T9's `SharedToolUseSectionOptions`, do not introduce a second options param |
| [`packages/types/src/provider-settings.ts`](packages/types/src/provider-settings.ts)                                     | Modified -- field                                                                                                                 |
| [`packages/types/src/followup.ts`](packages/types/src/followup.ts)                                                       | Modified -- `silent` flag                                                                                                         |
| [`webview-ui/src/components/chat/ChatRow.tsx`](webview-ui/src/components/chat/ChatRow.tsx)                               | Modified -- silent followup rendering (returns `null`)                                                                            |
| [`webview-ui/src/components/settings/ApiOptions.tsx`](webview-ui/src/components/settings/ApiOptions.tsx)                 | Modified -- checkbox                                                                                                              |
| [`src/core/task/__tests__/allow-text-only-responses.spec.ts`](src/core/task/__tests__/allow-text-only-responses.spec.ts) | New -- **needs rewrite, see F-AI-1**                                                                                              |

### Source commits on `archive/zoo-base-3.56`

The task brief specifies the range `41092310c..5ebc5c356`. Verified full commit set via
`git show --stat` (11 commits, matching the review's section 7.2 Tranche 10 list
exactly):

| Commit      | Subject                                                                                            |
| ----------- | -------------------------------------------------------------------------------------------------- |
| `41092310c` | `feat: add allowTextOnlyResponses provider setting (Feature 1)`                                    |
| `e9755b049` | `test: add unit tests for allowTextOnlyResponses feature`                                          |
| `9b028d0f2` | `feat(ui): add toggle for allowTextOnlyResponses in provider settings`                             |
| `a06a3b6f6` | `fix: remove text duplication in allowTextOnlyResponses`                                           |
| `5130f7d17` | `fix: implement invisible pause for allowTextOnlyResponses`                                        |
| `643ae14c5` | `fix: use ask() in non-auto-approve mode so user reply is saved to history`                        |
| `696cb9d4d` | `fix: save user reply as user_feedback so it shows as 'You said' in chat`                          |
| `ca6c6045d` | `fix: reset mistake counters when soft-nudge timer fires`                                          |
| `be2a40fcf` | `fix: do not count text-only turns as mistakes in allowTextOnly mode`                              |
| `71a05ce28` | `fix: accumulate mistake counter across nudge cycles, reset on human reply`                        |
| `5ebc5c356` | `feat: allowTextOnlyResponses - relax tool call requirement for open-weight models` (merge commit) |

### Upstream status per recon (drop/keep/adapt)

Recon feature #6: **ABSENT**, entangled with T9 via the same `getSharedToolUseSection`
signature problem described in T9's section above. **T9 has since merged and resolved
its half of this entanglement** by giving `getSharedToolUseSection` an optional
`SharedToolUseSectionOptions` parameter (see section 10 above) rather than extending it
positionally. This tranche's concrete task is now narrower than originally scoped: add
`allowTextOnlyResponses?: boolean` as a second optional field on that same
`SharedToolUseSectionOptions` interface (and append its own sentence, following T9's
pattern of appending rather than branching the base sentence), rather than re-deriving
the parameter-threading path from scratch. This is still the highest-complexity
remaining tranche -- the soft-nudge timer, mistake-counter interaction, and silent-
followup UI are all new surface area T9 does not touch -- but the `tool-use.ts` /
`system.ts` / `types.ts` wiring itself is now a small, additive change on top of T9's
already-merged shape.

### Known defects to fix during re-application

- [x] **Mandatory: F-LC-1** (High) -- resolved. The soft-nudge timer is now gated on
      both `autoApprovalEnabled` AND `alwaysAllowFollowupQuestions === true` (see
      `Task.pauseForTextOnlyResponse()`, commit `2d84df0f6`). When either flag is false, the
      loop falls through to a normal, visible `ask()` call instead of a silent followup, so
      the user always has a way to respond; the previous silent-deadlock state is
      unreachable. Covered by dedicated tests in `allow-text-only-responses.spec.ts`.
- [x] Advisory: F-LC-2 (Medium) -- resolved. `ChatRow` no longer renders `null` for a
      silent followup; it renders a small, non-intrusive hint banner so the user can see the
      loop is paused waiting for a reply (commit `8775dd0fa`,
      `ChatRow.followup-silent.spec.tsx`, 5 tests). The `silent` flag on `FollowUpData` is
      retained purely as a rendering hint (it suppresses the suggestion buttons); it never
      causes nothing to be rendered.
- [x] Advisory: F-LC-3 / F-LC-4 (Medium/Low) -- resolved. The timer-fired check and the
      auto-response payload both read from the same single `formatResponse.softNudge()`
      call site (no duplicated string literals, no double-invocation per cycle); see the doc
      comment on `Task.pauseForTextOnlyResponse()` (commit `8e851d145`) and the round-trip
      determinism test in `responses-softNudge.spec.ts` ("is deterministic (stable across
      calls) so it can be used as a timer-fired marker").
- [x] Advisory: F-AI-1 / F-TC-1 (High) -- resolved. `allow-text-only-responses.spec.ts`
      drives a real `Task` through its public API (constructing a `Task`, feeding it a
      text-only model response, and asserting on the resulting `ask`/`say` calls and
      mistake-counter state) instead of reimplementing the counter logic inline in each test
      body; 9 tests, committed in `2d84df0f6`.
- [x] Advisory: F-ER-1 / F-M-1 (Medium) -- resolved. The text-only branch lives in its
      own private method, `Task.pauseForTextOnlyResponse()`, mirroring T9's
      `applyTextToolCallFallback()` extraction pattern (commit `2d84df0f6`).

### Dependencies on other tranches

Depended on T9 (shared `tool-use.ts` / `SharedToolUseSectionOptions` changes). T9 was
merged first; `fork/10-allow-text-only` was branched from `feature/zoo-base` after that
merge, and `allowTextOnlyResponses?: boolean` was added as a second optional field on
the existing `SharedToolUseSectionOptions` interface (commit `8e851d145`) rather than a
second parameter -- confirming the entanglement predicted in the recon was resolved
purely additively, with zero merge conflicts when merged back into `feature/zoo-base`.

### Validation results

`pnpm check-types` clean across all 11 packages (0 errors). `eslint --max-warnings=0`
clean on every touched/new file (no suppression-count regressions). `prettier --check`
clean on every touched `.tsx`/`.json` file. `webview-ui` `tsc --noEmit` clean. Full
`webview-ui` vitest run: 170/170 files, 1930/1930 tests, zero failures. Full `src`
vitest run: 496/498 files passed, 9212/9255 tests passed (6 failed, 37 skipped); the 6
failing tests are confirmed pre-existing/environmental and unrelated to this tranche:
`__tests__/dist_assets.spec.ts`'s missing `tree-sitter-dart.wasm` build artifact (not
built in this dev checkout) and 5 tests in `services/rules/__tests__/rules.spec.ts`
requiring `fs.symlink`, which needs Windows Developer Mode/admin elevation unavailable
in this environment. `pnpm lint` clean across all 11 packages. Merged into
`feature/zoo-base` with `--no-ff`: 55 files changed, zero conflicts.

### Before upstream submission checklist

- [x] **F-LC-1 (BLOCKER):** soft-nudge deadlock fixed.
- [x] **F-LC-2 (BLOCKER, UX):** visible pause cue added -- the review explicitly
      predicted the previous "type-and-hope" UX would be rejected on sight by upstream
      review.
- [x] **F-AI-1 (BLOCKER):** `allow-text-only-responses.spec.ts` replaced with tests that
      drive a real `Task`.
- [ ] Issue-first + claim -- expect a long design discussion; this is flagged in the
      review as the fork's most opinionated, highest-design-risk feature, since it
      changes a load-bearing safety assumption ("every turn calls a tool"). Not
      applicable to this internal re-baseline merge; relevant only if/when actually
      submitting upstream.
- [x] Branch rebased onto T9's branch (cut from `feature/zoo-base` after T9's merge).
- [x] F-LC-3 soft-nudge string-equality contract replaced with a proper single-source
      marker.
- [x] i18n locale parity for `advanced.allowTextOnlyResponses.*` keys (all 18 locales,
      verified via `scripts/find-missing-translations.js`).
- [ ] `.changeset/` entry, `minor` impact -- intentionally skipped per this task's
      guardrails (agents must not create `.changeset` files; maintainers add these
      separately before any actual upstream submission).
- [x] F-ER-1 extraction of the text-only branch into a private method.

---

## 12. T1 -- Small bug fixes

**Order:** 10th, last (branch `fork/01-small-fixes`)

**Status: MERGED** into `feature/zoo-base` (2026-10-03). Commit `2b75e4da8` on
`fork/01-small-fixes`, merged via `--no-ff` as `0864a66db`. Confirmed the surviving
scope is exactly `da257010e` as predicted below -- the other three fixes were verified
already superseded upstream and were not re-applied. Re-anchored the `Array.isArray`
guard onto the current function signature, which (unlike the archive version) already
threads `opts?: { signal?: AbortSignal }` through to `axios.get` for request
cancellation (added later by PR #1683); only the guard logic itself needed porting.

### Purpose

Four small, originally-independent bug fixes bundled together by the review as "ship
first, build trust" candidates. **Material finding: three of the four are already
fixed -- as well or better -- on `zoo/main`.** Only one still applies. See discrepancy
note below; this materially changes the scope of this tranche versus what the review's
section 7.2 implies.

### Provider-setting / global-setting keys

None.

### Principal files

| File                                                                                                                                                       | New/Modified                              | Status                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------- |
| [`src/api/providers/fetchers/unbound.ts`](src/api/providers/fetchers/unbound.ts)                                                                           | Modified -- `Array.isArray` guard         | **Keep -- genuine gap**          |
| [`src/services/checkpoints/ShadowCheckpointService.ts`](src/services/checkpoints/ShadowCheckpointService.ts), [`src/vitest.setup.ts`](src/vitest.setup.ts) | Modified -- simple-git 3.36 compat        | Drop -- superseded               |
| [`packages/types/src/mcp.ts`](packages/types/src/mcp.ts)                                                                                                   | Modified -- `resource_link` content block | Drop -- superseded               |
| [`webview-ui/src/components/settings/ModelPicker.tsx`](webview-ui/src/components/settings/ModelPicker.tsx)                                                 | Modified -- static-list copy              | Drop -- upstream's fix is better |

### Source commits on `archive/zoo-base-3.56`

Verified via `git show --stat`, matching the review's section 7.2 Tranche 1 list:

| Commit                                           | Subject                                                                    | Recon verdict                                             |
| ------------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| `da257010e`                                      | `fix(unbound): guard against non-array models response`                    | ABSENT -- genuine bug, **keep**                           |
| `97573a80f` (merge of `3309dd061` + `93b9883d2`) | simple-git 3.36 compat (checkpoints env vars + `--template` opt-in)        | SUPERSEDED -- **drop**                                    |
| `af4868966`                                      | `fix(mcp): add resource_link content block to McpToolCallResponse`         | SUPERSEDED (near-identical) -- **drop**                   |
| `f71d3d492`                                      | `fix(model-picker): show static model list text for non-dynamic providers` | PARTIAL/SUPERSEDED-DIFFERENTLY -- **drop, would regress** |

### Upstream status per recon (drop/keep/adapt) -- and the discrepancy

**Discrepancy found, flagged rather than silently resolved:** the code review presents
Tranche 1 as "4 PRs, low risk", implying all four are still-needed, independent,
low-risk contributions. `upstream-recon.md`, cross-checked feature-by-feature, shows:

- Feature #12 (`da257010e`, Unbound guard): **ABSENT** at BASE -- genuine unfixed crash
  bug. Keep, and consider upstreaming directly regardless of tranche sequencing (recon
  flags it as a standalone high-value candidate).
- Feature #13 (simple-git compat): **SUPERSEDED** -- BASE already pins
  `simple-git@^3.36.0` and already contains the identical `unsafe: {
allowUnsafeTemplateDir: true }` opt-out with the same explanatory comment. Byte-for-
  byte parity per recon's own diff check. **Drop entirely.**
- Feature #11 (`af4868966`, MCP `resource_link`): **SUPERSEDED (near-identical)** --
  BASE already has the `resource_link` field; only the fork's explanatory comment is
  missing upstream. **Drop** the functional change; optionally propose the comment as
  a trivial doc-only PR.
- Feature #14 (`f71d3d492`, ModelPicker text): **PARTIAL / SUPERSEDED-DIFFERENTLY** --
  BASE's fix is _more complete_ than the fork's (upstream added a conditional
  `isDynamicProvider`/`isLocalProvider` branch with a second `staticModelList` string;
  the fork's version unconditionally uses `automaticFetch` for every provider and never
  added a `staticModelList` counterpart). **Re-applying the fork's version would be a
  strict regression.** Drop.

**Net effect:** the surviving "T1 small-fixes" tranche carries exactly **one** commit's
worth of change (`da257010e`), not four. This is a significant reduction in scope from
what the review's PR-plan section implies, and worth remembering when reading section 7
of the code review in isolation.

### Known defects to fix during re-application

None -- `da257010e` is a small, well-scoped, defensive-only guard with no findings
against it in the review.

### Dependencies on other tranches

None. Fully independent; could in principle be done first (as the review recommends
for trust-building on upstream submissions) rather than last -- it is sequenced last
here purely because it is the smallest, lowest-urgency remaining item for the
re-baseline project itself, not because of any technical dependency.

### Before upstream submission checklist

- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`.
- [x] i18n: none needed.
- [ ] `.changeset/` entry, `patch` impact.
- [x] Tests: added regression tests covering a non-array `response.data.data` (error
      envelope, keyed object map, null, string via `it.each`), the
      `response.data?.data ?? response.data` fallback branch, and a well-formed-array
      regression-safety check.
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 1.1: mention the
      reproducer (Unbound returning an error envelope) in the PR description.

---

## 13. T11 -- New Bedrock models (GPT-5.6/6, Kimi K3)

**Order:** 11th (branch `fork/11-new-bedrock-models` for phase A, `fork/11b-bedrock-
reasoning-payload` for phase B, both cut from `feature/zoo-base` after the 2026-09-21
resync). Not part of the original 10-tranche code review; added later as AWS Bedrock
published three new model families.

**Status: phase A and phase B both implemented, not yet merged.** Phase A commits
(oldest to newest, on `fork/11-new-bedrock-models`): `205371f84` (catalog entries +
mandatory-profile id list), `b78a87f5f` (mandatory inference-profile handler logic),
`5c6e94afb` (unit tests), `8c740ffcd` (reasoning-effort probe script). Phase B
(reasoning-effort payload wiring + temperature-omission fix, on
`fork/11b-bedrock-reasoning-payload`) is described in full below -- the probe was run
against real AWS credentials, the payload shape is confirmed, and the code is
implemented and tested.

### Purpose

Adds catalog support for three new Bedrock model families that AWS added after the
2026-09-21 resync: OpenAI GPT-5.6 (Sol/Terra/Luna), OpenAI GPT-6 (Astra/Sol/Luna), and
Moonshot Kimi K3 (`moonshotai.kimi-k3` -- distinct from the existing
`moonshot.kimi-k2-thinking` entry). All seven of these ids share a trait none of the
existing catalog entries have: AWS does not allow on-demand invocation of the bare
model id on `bedrock-runtime` at all -- an inference profile prefix (regional or
`global.`) is **mandatory**, not an opt-in convenience the way cross-region/Global
Inference is for every other model in the catalog. User-facing benefit: these models
appear in the model picker and work correctly out of the box, without the user needing
to know they must separately enable cross-region or Global inference first (which,
for every other model, is the only way prefixes get added).

### Provider-setting / global-setting keys

None new. Reuses the existing `awsUseCrossRegionInference` / `awsUseGlobalInference` /
`awsRegion` settings -- the mandatory-profile logic is a fallback that only activates
when neither of those has already produced a prefix.

### Principal files

| File                                                                                                                 | New/Modified                                                                                                                                                                 | Status                               |
| -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| [`packages/types/src/providers/bedrock.ts`](packages/types/src/providers/bedrock.ts)                                 | Modified -- 7 catalog entries, `BEDROCK_MANDATORY_INFERENCE_PROFILE_MODEL_IDS`, `BEDROCK_GLOBAL_INFERENCE_MODEL_IDS`, `BEDROCK_OPENAI_EFFORT_MODEL_IDS`                      | Phase A + B done                     |
| [`src/api/providers/bedrock.ts`](src/api/providers/bedrock.ts)                                                       | Modified -- mandatory-profile fallback branch in `getModel()`; nested `reasoning.effort` payload branch and temperature-omission fix in `createMessage()`/`completePrompt()` | Phase A + B done                     |
| [`packages/types/src/__tests__/bedrock-t11-models.test.ts`](packages/types/src/__tests__/bedrock-t11-models.test.ts) | New -- catalog registry-invariant and exact-value tests                                                                                                                      | Phase A done                         |
| [`src/api/providers/__tests__/bedrock.spec.ts`](src/api/providers/__tests__/bedrock.spec.ts)                         | Modified -- mandatory-profile handler-logic tests (phase A) + nested reasoning-effort payload / temperature-omission tests (phase B)                                         | Phase A + B done                     |
| [`scripts/probe-bedrock-reasoning.mjs`](scripts/probe-bedrock-reasoning.mjs)                                         | New -- manual diagnostic script, not part of CI; run against real AWS credentials to confirm the phase B payload shape                                                       | Phase A done, used to inform phase B |

### Source commits

Phase A, on `fork/11-new-bedrock-models`:

| Commit      | Subject                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `205371f84` | `feat(bedrock): add GPT-5.6/GPT-6/Kimi K3 catalog entries and mandatory-profile id list`    |
| `b78a87f5f` | `feat(bedrock): apply mandatory inference-profile prefix for GPT-5.6/6 and Kimi K3`         |
| `5c6e94afb` | `test(bedrock): cover mandatory inference-profile logic and T11 catalog sanity`             |
| `8c740ffcd` | `feat(bedrock): add scripts/probe-bedrock-reasoning.mjs for reasoning-effort payload probe` |

Phase B, on `fork/11b-bedrock-reasoning-payload` (cut from `feature/zoo-base` after phase
A merged):

| Commit (placeholder until committed) | Subject                                                                                                                 |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| TBD                                  | `feat(bedrock): confirm and document nested reasoning.effort payload shape for GPT-6 Sol/Luna`                          |
| TBD                                  | `feat(bedrock): send nested reasoning.effort payload for GPT-6 Sol/Luna; fix temperature omission for GPT-5.6/6 family` |
| TBD                                  | `test(bedrock): cover nested reasoning.effort payload and temperature-omission fix`                                     |

### Upstream status per recon (drop/keep/adapt)

N/A -- this is new fork content, not a re-application of anything from
`archive/zoo-base-3.56`. These model families did not exist when the original recon was
performed. No upstream comparison applies; this is a from-scratch addition on top of
BASE.

### Catalog metadata caveats (read before trusting any number below)

AWS's model cards for these three families are noticeably less complete than for
established models. Every catalog entry marks its unverified fields with an inline
comment; the two categories of caveat that recur across all seven entries:

- **`maxTokens` is unverified for 6 of the 7 entries** (all except GPT-6 Astra, which AWS
  states directly as 128,000). The other six borrow 128,000 (GPT-5.6/6 family) or
  131,072 (Kimi K3, from the non-Bedrock `moonshot.ts` K3 entry) as a placeholder. If a
  user reports truncated output shorter than expected, check this value first.
- **Reasoning-effort support is inconsistent and mostly undocumented.** Only GPT-6 Sol
  and GPT-6 Luna have an AWS-documented effort allow-list
  (`none/low/medium/high/xhigh/max`, default `medium`); GPT-5.6 Sol/Terra/Luna and GPT-6
  Astra have no "reasoning effort" section on their AWS model cards at all (a
  documentation gap, not a confirmed absence of the feature); Kimi K3's reasoning is
  always-on with no effort control documented. **Phase A deliberately omits
  `supportsReasoningEffort` wherever AWS does not explicitly document it**, rather than
  guessing.

### Phase B: probe results and payload implementation (done)

Phase A was catalog metadata and mandatory-profile routing only, with the
reasoning-effort payload deliberately deferred pending an empirical probe (AWS's
Converse documentation does not specify the `additionalModelRequestFields` shape for
these models). **The probe was run against real AWS credentials (2026-09-30, `bedrock`
AWS CLI profile, `us-east-1`) via `node scripts/probe-bedrock-reasoning.mjs --model
openai.gpt-6-sol --region us-east-1 --yes`.**

**Confirmed result:** the nested shape is accepted; the flat shape is rejected.

- `c-nested-effort` (`additionalModelRequestFields: { reasoning: { effort: "high" } }`)
  -- **succeeded**.
- `b-flat-effort` (`additionalModelRequestFields: { reasoning_effort: "high" }`) --
  **failed** with `ValidationException: Unknown parameter: 'reasoning_effort'`.
- This resolves this tranche's Q1 (payload shape) and Q2 (whether the shape works at
  all) definitively for GPT-6 Sol; GPT-6 Luna is assumed to share the same contract
  (same model family, same AWS-documented effort allow-list) and was not re-probed
  separately.
- Kimi K3 was not probed in this pass (no `preserveReasoning`/multi-turn-echo change was
  in scope for this work item); the K3 `e-k3-multiturn` question from phase A remains
  open and is not blocking, since K3 has no reasoning-effort control to wire regardless.

**What was implemented as a result:**

1. **Nested `reasoning.effort` payload for GPT-6 Sol/Luna.** New
   `BEDROCK_OPENAI_EFFORT_MODEL_IDS = ["openai.gpt-6-sol", "openai.gpt-6-luna"]` constant
   in `packages/types/src/providers/bedrock.ts` (scoped to exactly the two ids with an
   AWS-documented effort allow-list). In `src/api/providers/bedrock.ts`,
   `createMessage()` and `completePrompt()` each gained an `else if
(isMemberOf(BEDROCK_OPENAI_EFFORT_MODEL_IDS, baseModelId))` branch (parallel to the
   existing Claude `BEDROCK_DISABLEABLE_THINKING_MODEL_IDS` branch) that sets
   `additionalModelRequestFields = { reasoning: { effort } }`. A new
   `normalizeReasoningEffortForOpenAiBedrock()` helper resolves the already-computed
   `modelConfig.reasoningEffort` (from the generic `getModelParams()` /
   `shouldUseReasoningEffort()` pipeline) into one of
   `none/low/medium/high/xhigh/max`, defaulting to `"none"` for anything unrecognized.
   When the user disables reasoning, an **explicit** `effort: "none"` is sent rather
   than omitting the field, mirroring the existing Claude explicit-disable pattern --
   this avoids silently falling back to AWS's undocumented `medium` default.
   `completePrompt()` (used for one-shot, latency-sensitive calls) always sends an
   explicit `effort: "none"` rather than resolving user settings, to avoid paying for
   unwanted reasoning tokens on every one-shot prompt.
2. **Temperature-omission fix for the whole GPT-5.6/6 family.** Root cause: even though
   the generic `getModelParams()` layer already nulls `temperature` when
   `model.supportsTemperature === false`, Bedrock's own `inferenceConfig` construction
   used `modelConfig.temperature ?? (this.options.modelTemperature as number)`, and that
   `??` fallback reintroduced a value from user settings even when
   `modelConfig.temperature` was correctly `undefined`. Fixed in both `createMessage()`
   and `completePrompt()` by introducing `const omitTemperature =
isAdaptiveThinkingModel || modelConfig.info.supportsTemperature === false` and
   conditionally spreading the `temperature` key into `inferenceConfig` entirely (rather
   than relying on a nullable fallback), extending the existing Claude-only omission
   pattern to cover all six GPT-5.6/6 catalog entries (previously only Claude adaptive-
   thinking models were covered, even though the catalog already declared
   `supportsTemperature: false` for the GPT-5.6/6 family).

**Tests added** (`src/api/providers/__tests__/bedrock.spec.ts`, new `describe("GPT-6
Sol/Luna reasoning effort (nested Converse shape)")` block, 7 tests): nested payload
shape sent for GPT-6 Sol/Luna with an explicit effort; default `medium` effort when no
explicit setting is provided; explicit `effort: "none"` sent (not omitted) when
reasoning is disabled; GPT-5.6 Sol does **not** get the `reasoning.effort` branch (no
allow-list) but still gets temperature omitted; `completePrompt` sends explicit
`effort: "none"` for GPT-6 Luna; `completePrompt` omits temperature for GPT-5.6 Terra
even without the effort branch. All 210 tests across the six Bedrock spec files
(`bedrock.spec.ts`, `bedrock-custom-arn.spec.ts`, `bedrock-error-handling.spec.ts`,
`bedrock-inference-profiles.spec.ts`, `bedrock-native-tools.spec.ts`,
`bedrock-reasoning.spec.ts`) and all 18 catalog-invariant tests
(`packages/types/src/__tests__/bedrock-t11-models.test.ts`) pass. `check-types` is
clean in both `packages/types` and `src`.

### Known defects to fix during re-application

None identified. The temperature-omission bug fixed in phase B was introduced in phase
A of this same tranche (never shipped upstream), not inherited from an earlier
tranche, so there is nothing to backport elsewhere.

### Dependencies on other tranches

None. Independent of every other tranche; only depends on the existing cross-region/
Global-inference prefix infrastructure already present at BASE (`getPrefixForRegion()`,
`AWS_INFERENCE_PROFILE_MAPPING`, `BEDROCK_GLOBAL_INFERENCE_MODEL_IDS`) and the generic
`getModelParams()`/`shouldUseReasoningEffort()` pipeline in
`src/api/transform/model-params.ts` / `src/shared/api.ts`, both reused rather than
duplicated.

### Before upstream submission checklist

- [x] Run the probe script against real AWS credentials and record the actual result --
      done 2026-09-30, nested shape confirmed, flat shape confirmed rejected.
- [x] Implement and test phase B once probe results are in.
- [ ] Open GitHub issue, comment "Claiming", get Discord assignment before opening a PR.
- [ ] Branch rebased onto `zoo/main`.
- [ ] i18n: none needed (no new UI strings; reuses the existing effort-dropdown pattern).
- [ ] `.changeset/` entry, `minor` impact (new models, no breaking change).
- [ ] Re-verify every "unverified" `maxTokens` value against AWS's model cards at
      submission time -- these families are new and AWS's documentation may have been
      filled in since phase A was written.
- [ ] Consider probing GPT-6 Luna and Kimi K3 (`e-k3-multiturn`) directly rather than
      relying on the GPT-6 Sol result by family inference, before upstreaming.
- [x] Confirm `src/eslint-suppressions.json` suppression counts for
      `api/providers/bedrock.ts` and `api/providers/__tests__/bedrock.spec.ts` are
      unchanged by this tranche (34 and 38 respectively) -- verified 2026-09-30; one new
      `any` usage introduced by the new tests was fixed in place (typed the test's local
      `OpenAiEffortCommandArg` helper type) rather than budgeted.

---

## 14. Dropped / superseded

Features intentionally **not** carried into the re-baseline, with the recon evidence
that justifies dropping each one.

| Item                                                                              | Reason                                                           | Recon evidence                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `awsModelContextWindow` manual override (schema + consumption logic)              | Already implemented upstream, functionally identical             | Recon feature #3 -- `packages/types/src/provider-settings/bedrock.ts:29` and `bedrock.ts:1178-1179` at BASE match the fork; a dedicated test exists at `bedrock.spec.ts:787`. The fork's `5ddb71b58` UI-input commit may still add value if BASE lacks the _UI control_ specifically -- diff before dropping the UI half. |
| simple-git 3.36 `allowUnsafeTemplateDir` compat patch                             | Superseded, byte-for-byte identical at BASE                      | Recon feature #13 -- BASE already pins `simple-git@^3.36.0` with the same opt-out and comment.                                                                                                                                                                                                                            |
| MCP `resource_link` content block                                                 | Superseded, field already present at BASE                        | Recon feature #11 -- BASE has the field; only the fork's explanatory comment differs.                                                                                                                                                                                                                                     |
| `ModelPicker` static-list text fix                                                | Upstream's fix is more complete; fork's version would regress it | Recon feature #14 -- BASE has a two-way `isDynamicProvider`/`isLocalProvider` branch with a `staticModelList` string the fork never added.                                                                                                                                                                                |
| Model catalog entries: `opus-4-7`, `opus-4-8`, `fable-5`, `fable-5-1`, `sonnet-5` | Already present at BASE                                          | Recon feature #10 -- all five confirmed present in `packages/types/src/providers/bedrock.ts` at BASE.                                                                                                                                                                                                                     |
| `"max"` reasoning-effort enum value                                               | Already present at BASE, byte-for-byte identical list            | Recon feature #9 -- `reasoningEffortsExtended` and `reasoningEffortSettingValues` at BASE already include `"max"`.                                                                                                                                                                                                        |

## 15. Deferred / watch list

Open items that need attention but are not blocking any tranche's re-application.

### Unverified fork content

- **`anthropic.claude-mythos-5` has no published Bedrock model ID.** Neither Anthropic's
  docs nor the AWS Bedrock "Supported models" page lists `anthropic.claude-mythos-5` or
  `-mythos-5-1`. The fork's own code comments already mark this UNVERIFIED. Carry the
  catalog entry forward with the UNVERIFIED note intact; do not treat it as confirmed
  until AWS documents it.

### Upstream bugs found during research (independent PR candidates, not tied to any fork feature)

These were discovered while reconciling the fork against BASE and Anthropic's official
docs; they are defects in `zoo/main` itself, not features the fork needs to re-apply.
Worth raising as standalone upstream issues regardless of this project's tranche
schedule.

- **Upstream hardcodes `output_config.effort: "xhigh"` unconditionally on the Bedrock
  adaptive-thinking path, ignoring the user's `reasoningEffort` setting.** Per
  Anthropic's docs, `"high"` is the documented API default and is only recommended to be
  overridden to `"xhigh"` for Opus 4.7/4.8 specifically -- BASE over-spends on Sonnet 5,
  Opus 5, and Fable by always maxing out effort. (adaptive-thinking-reconciliation.md
  section 2, section 4 discrepancy table row "Effort default".)
- **Upstream sends stale/incorrect beta flags on 4.7+ adaptive-thinking models.** BASE
  pushes `fine-grained-tool-streaming-2025-05-14` for every Claude-family id (including
  all adaptive models) and pushes the `context-1m-2025-08-07` beta for opus-4-7/opus-4-8
  when the 1M toggle is on. Anthropic's Opus 5 migration checklist explicitly says to
  _remove_ both of these on 4.7+; sending them risks an "invalid beta flag" 400 from
  Bedrock. (adaptive-thinking-reconciliation.md section 2, section 4 row "Beta headers".)
- **Upstream never sends an explicit thinking-disable for Sonnet 5** (or any adaptive
  model that defaults thinking on). Per Anthropic's docs, Sonnet 5 defaults to thinking
  on but accepts `thinking: {type: "disabled"}`; BASE never sends it, so thinking runs
  (and is billed) even when the user has reasoning turned off in settings, just hidden
  from the UI. (adaptive-thinking-reconciliation.md section 2, section 4 row "Explicit
  disable on Sonnet 5".)
- **`completePrompt` reads `response.output.message.content[0].text` instead of
  selecting the first block with a `text` property.** On any model where thinking is
  on by default (Sonnet 5, Opus 5) or always on (Fable, Mythos), the first content block
  is a reasoning block, and `content[0].text` is `undefined` -- `completePrompt` silently
  returns an empty string. Both BASE and the fork have this bug on different model
  subsets. (adaptive-thinking-reconciliation.md section 2 and section 7 item 5.)
- **Bedrock catalog key typo:** BASE still has `moonshot.kimi-k2-thinking` (missing the
  trailing "ai") instead of the AWS-published `moonshotai.kimi-k2-thinking`, causing the
  resolver to fall through to a generic 128K-context guess instead of the model's actual
  256K window. Already re-applying as part of T2 (`d388efc12`); also worth a standalone
  upstream PR per recon's explicit suggestion. (upstream-recon.md feature #10, section 5
  item 5.)
- **Unbound `/models` fetcher crashes on a non-array response payload.** BASE's
  `unbound.ts` has no `Array.isArray` guard before iterating the parsed response, so an
  error-envelope or keyed-object response throws "rawModels is not iterable" and can
  restart the dev extension host. Already re-applying as T1's sole surviving fix
  (`da257010e`); also worth a standalone upstream PR per recon's explicit suggestion.
  (upstream-recon.md feature #12, section 5 item 6.)

## 16. Update discipline

This file is the source of truth for what this fork carries on top of upstream. Every
tranche merge into `feature/zoo-base`, and every future re-sync against a newer upstream
release, **must** update this file in the same PR/merge:

- When a `fork/NN-slug` branch merges, move its status from "planned" to "merged",
  record the actual merge commit SHA, and correct any "unverified" commit attributions
  once the real diff has been re-derived (several tranches above are marked unverified
  at the commit level because the source history squashed multiple tranches into one
  commit -- once re-split, record the real provenance here).
- When a future re-sync recon (a new `upstream-recon-vX.Y.Z.md` snapshot) is produced,
  re-check every row in section 14 (Dropped/superseded) and section 15 (Deferred/watch
  list) against the new upstream state -- a dropped feature can un-supersede itself if
  upstream reverts, and a watch-list bug can get fixed upstream and drop off the list.
- Do not let this file drift silently. If a tranche's re-applied code ends up differing
  materially from what its section here describes, update the section as part of that
  tranche's own PR, not as a separate cleanup pass.

## 17. Resync log 2026-09-21

**Old base:** upstream `v3.82.0`, `134923e15` (2026-09-10 re-baseline).
**New base:** `zoo/main` tip `01928c3c4` (`v3.82.2` + 14 unreleased commits, 2026-09-21).

**Branches rebased onto NEW-BASE:**

- `fork/00-docs`: single commit `15d6e3b18` -> `ac5ff85df` via
  `git rebase --onto 01928c3c4 134923e15 fork/00-docs`. Zero conflicts (new files only,
  as recon predicted).
- `fork/03-bedrock-reasoning`: its own 3 commits (`15a50e19e`, `99aa149d2`, `56c41a476`)
  rebased with `--onto` from the parent of `15a50e19e` (the `fork/00-docs` merge commit,
  `bdb728d12`) onto the rebased `fork/00-docs` tip (`ac5ff85df`) -> new tip `2f467b587`.
  Zero conflicts; the three touched upstream files were byte-identical between OLD-BASE
  and NEW-BASE as recon predicted, including `fork-feature-inventory.md`.
- `feature/zoo-base`: reset to `01928c3c4`, then `git merge --no-ff fork/00-docs` followed
  by `git merge --no-ff fork/03-bedrock-reasoning`. Both merges were genuine two-parent
  merges (no fast-forward, no redundant/no-op merge) -- `b18272e6e` -> `8504b3590`.

**Conflicts encountered:** none, at any step. Recon's conflict-free prediction held for
both branches.

**Validation results:**

- `pnpm check-types` (root, all 13 packages via turbo): 11/11 tasks successful.
- `cd src && npx vitest run api/providers/__tests__/bedrock.spec.ts
api/providers/__tests__/bedrock-reasoning.spec.ts`: 2 test files passed, **112 tests
  passed**, 0 failed.

**Hygiene findings (step 7):** `pnpm install` completed cleanly (lockfile unchanged,
mostly reused packages). 13 `node_modules` directories found, one per workspace package
(root, `src`, `webview-ui`, `apps/cli`, `apps/vscode-e2e`, `packages/*`) -- no orphaned
duplicates. `git diff --diff-filter=D 134923e15 01928c3c4` returned **zero deleted
files**, so the 2026-09-10-style "deleted-in-git but persisting on disk" hazard does not
apply to this resync. Spot-checked shims (`tsc`, `turbo`) executed correctly
post-install.

**Process observations for the playbook:**

- Stacking `fork/03-bedrock-reasoning` on the rebased `fork/00-docs` (rather than both
  independently on NEW-BASE) worked cleanly and is the right call when a later branch's
  commits edit a file the earlier branch created (here, both touch
  `fork-feature-inventory.md`). An octopus/independent-branch approach would have forced
  a manual 3-way reconciliation of that file instead of letting git's linear rebase
  history absorb it for free. Keep this stacking approach in the repeatable playbook
  whenever tranche N's commits are known to touch a file introduced by tranche N-1.
- The two-merge rebuild of `feature/zoo-base` produced a clean diamond graph with no
  redundant/fast-forwarded merge, because `fork/03-bedrock-reasoning`'s history already
  contained `fork/00-docs`'s rebased tip as an ancestor. The task's contingency
  ("if the first merge becomes redundant, merge only fork/03 alone") did not trigger;
  worth keeping the contingency documented anyway since it is base-composition-dependent.
- `git push origin main` (and every subsequent push) triggered the pre-push hook running
  `turbo check-types` across all packages even for a plain fast-forward; this adds
  reliable but non-trivial overhead (~1-2.5 min cold, under 1s warm/cached) to every push
  in the playbook -- expected and acceptable, but worth budgeting for in timing estimates.
- Environment friction: the default shell is Windows PowerShell 5.1, which does not
  support `&&`; every multi-command invocation needed `;` chaining per the workspace
  instructions. A nested `powershell -Command "..."` wrapper for a hygiene-check script
  caused `$_` to be stripped by outer-string interpolation before reaching the pipeline --
  running PowerShell natively (no nested wrapper) avoided this. Static-analysis regex
  parsing of pnpm's `.cmd` shims for "broken" targets produced false positives (pnpm's
  shims legitimately reference optional/fallback paths that need not exist); executing a
  shim directly (`--version`) is a more reliable staleness signal than parsing its
  contents.

## 18. Loose ends + full validation 2026-10-04

Branch `fork/12-loose-ends` cut from `feature/zoo-base` tip `32457454e`, merged back
with `--no-ff` as `3ab2d753a`. Ten numbered items from the task brief; outcomes below.

### Item-by-item outcomes

1. **Custom-ARN capability defaults (archive `1cada2dcc` + `3da7f1945` regression
   check).** T4's rework already carries the fix: the early-return path in
   `resolveBedrockModelInfo` (`packages/types/src/providers/bedrock.ts`) hardcodes
   `supportsPromptCache`/`supportsImages` ON for recognised custom ARNs before the
   generic resolver runs. The only real gap was a missing regression test guarding
   against the fix silently regressing for an unrecognised non-ARN id. Added
   `should preserve an unrecognised non-ARN bedrock id and NOT apply custom-ARN
capability defaults` to `webview-ui/.../useSelectedModel.spec.ts`. Commit
   `a3cb302bc`.
2. **pnpm config location (archive `a144dfa0b`).** pnpm 10 ignores the `pnpm` key in
   root `package.json`; moved `onlyBuiltDependencies` and `overrides` to top-level keys
   in `pnpm-workspace.yaml`. Verified `rg.exe` resolves and runs **before and after**
   the move (`ripgrep 15.0.0`), confirming the `onlyBuiltDependencies` allowlist still
   gates `@vscode/ripgrep`'s postinstall correctly from the new location. Spot-checked
   `pnpm why esbuild`/`zod`/`csstype` to confirm `overrides` still resolve. Lockfile
   unchanged (confirmed no regeneration triggered). Commit `dee212e14`.
3. **useSelectedModel preview gap (T6 known gap).** The Bedrock branch of
   `getSelectedModel` was not threading `awsModelMaxOutputTokens` through to
   `resolveBedrockModelInfo` as `maxOutputTokensOverride`, unlike the backend's
   `AwsBedrockHandler.getModelById()`. Added the missing parameter and two tests
   ("bedrock provider with max-output-tokens override": override wins over static
   default; static default used when no override configured). Commit `69ddb1656`.
4. **Pre-existing test failure triage (document, not fix).** Four failure clusters
   investigated; all confirmed environment-induced, none are fork-introduced
   regressions: - **4a. `src/__tests__/dist_assets.spec.ts`** (dedicated `vitest.dist.config.ts`
   lane): failed because the checked-in `src/dist` build artifact was stale --
   `node_modules/tree-sitter-wasms@0.1.13` ships 36 `.wasm` files (Dart added by a
   dependency bump, `a441e02bd`) but the on-disk `dist` only had 35 copied from
   before that bump. `copyWasms()` (`packages/build/src/esbuild.ts`) copies every
   `.wasm` it finds dynamically, so a plain rebuild (`pnpm --filter @roo-code/build
build && node esbuild.mjs` from `src/`) fixed it with zero code change and zero
   git impact (`dist` is gitignored). Build-order-dependent, not a regression. - **4b. `src/services/rules/__tests__/rules.spec.ts`** (5 tests): fail with
   `EPERM: operation not permitted, symlink...`. Root cause confirmed via registry
   query (`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock
\AllowDevelopmentWithoutDevLicense` -- key absent) that Windows Developer Mode has
   never been enabled on this host; `fs.symlink()` requires it (or
   `SeCreateSymbolicLinkPrivilege`) on Windows. Sibling spec
   `src/utils/__tests__/WorkspacePathResolver.spec.ts` demonstrates the correct
   defensive pattern (probe-and-skip in `beforeEach`) that `rules.spec.ts` lacks --
   worth adopting there in a future PR, but out of scope for this triage-only item. - **4c (newly surfaced). `src/services/checkpoints/__tests__/
ShadowCheckpointService.spec.ts`**: 21 failures appeared in the full-suite run
   (step 8c below) that were not part of the task's pre-identified list --
   `EBUSY` on shadow-repo `rmdir`, multiple `Test timed out in 20000ms`, one `Hook
timed out in 20000ms`, and one `fatal: --local can only be used inside a git
repository` from simple-git. Re-ran the file in isolation
   (`npx vitest run services/checkpoints/__tests__/ShadowCheckpointService.spec.ts`):
   **35/35 passed**, including the one that threw the simple-git error under
   contention. Individual tests take 8-26s each in isolation (one legitimately
   logged 20167ms, over the 20000ms timeout, yet still passed because the timeout
   clock and the reported duration are not measured identically) -- this host's
   git/fs subprocess latency is close enough to vitest's default 20s timeout that
   any added contention from the other ~9000 tests in the full run tips individual
   tests over the edge. Confirmed resource-contention/timeout flakiness, not a
   regression; the fix (if ever pursued) is a per-test timeout bump in this spec,
   not a logic change. - **4d (newly surfaced). `webview-ui/src/components/settings/__tests__/
SlashCommandsSettings.spec.tsx`**: 1 failure in the full-suite run (step 8d) --
   `refreshes commands after creating new command` timed out a `waitFor(... ,
{ timeout: 600 })` expecting `requestCommandsCalls.length >= 2`, got `1`. Re-ran
   the file in isolation: **20/20 passed** in 7.92s. Same resource-contention
   pattern as 4c, at an even tighter margin (600ms budget). Not a fork-introduced
   regression; the file's git history (`02f790222`, `04ffb64bb`, `6cfa82f57`)
   predates this branch entirely.
5. **`progress.txt` origin check.** `git diff zoo/main:progress.txt progress.txt`
   produced no output -- byte-identical to the upstream `zoo/main` copy. This is
   upstream-tracked content (the Zoo Code team's own PR-cherry-pick log), not
   fork-local scratch. Left as-is per the task's conditional instruction.
6. **`.tmp-recon/` directory.** `Test-Path .tmp-recon` returned `False`. Confirmed
   absent; no action needed.

### Full validation matrix (step 8, run on `feature/zoo-base` post-merge, tip

`3ab2d753a`)

| Check                                              | Result                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check-types` (root, 11 packages via turbo)   | 11/11 successful                                                                                                                                                                                                                                                                                            |
| `pnpm lint` (root, 11 packages via turbo)          | 11/11 successful                                                                                                                                                                                                                                                                                            |
| `cd src && npx vitest run` (full backend suite)    | 496 passed / 2 failed / 3 skipped test files (501); **9192 passed / 26 failed / 37 skipped tests** (9255). Both failing files triaged above: `rules.spec.ts` (4b, pre-existing/expected) and `ShadowCheckpointService.spec.ts` (4c, newly surfaced but confirmed flaky-under-load, 35/35 pass in isolation) |
| `cd webview-ui && npx vitest run` (full suite)     | 169 passed / 1 failed test files (170); **1932 passed / 1 failed tests** (1933). Failing file triaged above (4d, 20/20 pass in isolation)                                                                                                                                                                   |
| `cd packages/types && npx vitest run` (full suite) | **33/33 test files passed, 470/470 tests passed**, 0 failures                                                                                                                                                                                                                                               |
| `pnpm knip --include files`                        | Excellent, Knip found no issues                                                                                                                                                                                                                                                                             |

No fork-introduced regressions found anywhere in the matrix. The two newly surfaced
flaky suites (4c, 4d) share a single root cause: this host's test-runner throughput
under full-suite load pushes individual slow (git-subprocess- or `waitFor`-bound)
tests past their configured timeouts; both pass cleanly in isolation.

### Process observations for the playbook

- A full `cd src && npx vitest run` on this host takes ~15.5 minutes (930s) for ~9255
  tests across 501 files; `webview-ui`'s full suite takes ~8 minutes (473s) for ~1933
  tests across 170 files. Budget accordingly when planning a full-validation pass --
  do not assume these commands return in the same timeframe as a single-file run.
- When a long-running `vitest run` command reports "still running" from the command
  tool, polling with a trivial placeholder command (e.g. `echo "waiting..."`) is the
  correct way to keep retrieving the terminal's accumulated output without
  interrupting the background process. A benign tool-wrapper error ("DCG evaluation
  timed out") can appear on the polling call itself while still successfully
  returning the terminal's new output -- this is a framework quirk, not a real
  failure, and should not be treated as a reason to abort or retry the underlying
  long-running command.
- When a full-suite run surfaces failures beyond an already-documented triage list,
  the correct diagnostic step is re-running the specific failing file in isolation
  before concluding it is a regression. Both newly surfaced failures in this pass
  (4c, 4d) turned out to be timeout-margin flakiness that disappears outside the
  full-suite's resource contention -- isolating first avoids chasing a phantom
  regression and avoids wasting a fix attempt on a non-issue.

## 19. Smoke test and install (staged)

Re-baseline re-verified 2026-10-04 at `ff3c1d314` (`feature/zoo-base` tip). Dev-mode
build-from-a-CLI-perspective readiness, a full production bundle, `dist_assets.spec.ts`
(triage item 4a), and a `-fork.1` VSIX were all re-confirmed green -- see the task log
for exact commands. This section is the handoff for the two remaining human steps:
smoke-testing in the Extension Development Host (Stage 1), then installing the VSIX
over the marketplace build (Stage 2). **Do not skip to Stage 2 before Stage 1 passes.**

### STAGE 1 -- Developer mode (do this first)

**How to launch:** open this repo in VS Code, then press **F5** (or **Run and Debug**
panel > select "Run Extension" > the play button). `.vscode/launch.json` defines a
single `extensionHost` launch config named "Run Extension" with
`preLaunchTask: "${defaultBuildTask}"`, which resolves to the `watch` task in
`.vscode/tasks.json` (the task with `"isDefault": true` under `group.kind: "build"`).
That task fans out to three background watchers: `watch:webview` (`pnpm --filter
@roo-code/vscode-webview dev`, a Vite dev server), `watch:bundle` (`npx turbo
watch:bundle`, esbuild watch for `src/dist/extension.js`), and `watch:tsc` (`npx turbo
watch:tsc`, type-checking only, does not block launch). F5 waits for the esbuild watcher's
"problem matcher" to report ready, then launches a new **Extension Development Host**
window with `--extensionDevelopmentPath=${workspaceFolder}/src`. This opens a _second,
separate_ VS Code window running the fork build **alongside, not replacing**, Chris's
normal VS Code windows and his installed marketplace Zoo Code extension -- the
Development Host is its own `extensionHost` process with its own extension set; the
marketplace extension is not loaded into it, and the marketplace extension's own window
is entirely unaffected by anything done in the Dev Host.

**Prerequisites confirmed from a build perspective (no UI launch performed):**

- `pnpm install` must already be run at the repo root (standard monorepo bootstrap;
  already satisfied in this checked-out tree).
- The one-shot equivalent of the `watch:bundle` task
  (`pnpm bundle`, i.e. `turbo bundle` -> `node esbuild.mjs` in `src/`) was run as part of
  this task and completed with no errors, confirming the esbuild graph compiles cleanly.
  F5's watch variant does the same compile, just incrementally and left running.
- `watch:webview` starts a Vite dev server; `ClineProvider.getHMRHtmlContent()`
  (`src/core/webview/ClineProvider.ts`) reads `src/.vite-port` to find its port and falls
  back to probing `http://localhost:5173` if the file is missing, only when
  `contextProxy.extensionMode === vscode.ExtensionMode.Development`. If the Vite dev
  server is not running when the Dev Host activates the webview, HMR load fails and
  `ClineProvider` falls back to `getHtmlContent()` (the static production-build HTML),
  so a missing/slow webview watcher degrades gracefully to the static webview-ui build
  rather than hard-failing the Dev Host launch.

**Settings isolation -- VERIFIED claim, not assumed:** `--extensionDevelopmentPath`
alone does **not** isolate `globalState`/`SecretStorage`/`globalStorageUri` from
Chris's normal VS Code user data. `.vscode/launch.json`'s `args` is only
`["--extensionDevelopmentPath=${workspaceFolder}/src"]` -- there is **no**
`--user-data-dir` or `--profile` flag. VS Code's own default behaviour for an
`extensionHost` launch config without one of those flags is to reuse the **same** user
data directory as the host VS Code instance that launched it. Consequently:

- `ContextProxy` (`src/core/config/ContextProxy.ts`) reads/writes `context.globalState`
  and `context.secrets` scoped by **extension id** (`zoocodeorganization.zoo-code`),
  not by window. Because both the Dev Host and Chris's normal VS Code share the same
  user data dir _and_ the Dev Host loads the identical extension id, **global settings,
  provider profiles (`ProviderSettingsManager`'s secrets-backed JSON blob), and secrets
  (API keys) are the SAME store the marketplace extension uses** -- they are not
  isolated. Any provider profile created/edited in the Dev Host is visible to, and
  persists into, the marketplace extension's next activation, and vice versa.
- This means Stage 1's Bedrock smoke tests will exercise (and potentially mutate) the
  same AWS credentials/profiles Chris's daily-driver marketplace build already has
  configured -- which is actually convenient for smoke-testing (no need to reconfigure
  Bedrock from scratch), but Chris should be aware that **any provider-profile edits
  made in the Dev Host are not sandboxed** and will show up in the marketplace
  extension afterwards too.
- If true isolation is ever wanted for a future test pass, add
  `"args": ["--extensionDevelopmentPath=${workspaceFolder}/src", "--user-data-dir=${workspaceFolder}/.vscode/dev-user-data"]`
  to `launch.json`; this was not added here since it was not requested and changing it
  is an out-of-scope behavioural change for this task.

**Smoke-test checklist (run inside the Dev Host, against a configured Bedrock
profile):**

| #   | Check                                                                                                               | One-line pass condition                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T4  | Discovery dropdown populates + refresh                                                                              | Bedrock provider settings panel's model/target dropdown populates with discovered inference profiles/models for the configured region, and the "Refresh discovery" button re-fetches without error.                                                                                                                                       |
| T11 | GPT-6 Sol selectable with reasoning-effort control and a successful request                                         | `openai.gpt-6-sol` appears in the discovered-target list (via its mandatory inference profile), the reasoning-effort control renders for it, and a sent message completes with a normal response.                                                                                                                                         |
| T3  | Adaptive-thinking Claude model honours effort                                                                       | Select an adaptive-thinking Claude model (e.g. Sonnet 5 / Opus 4.7+), change the reasoning-effort slider, and confirm the request succeeds and the effort setting visibly affects behaviour (e.g. response latency/verbosity) or is reflected in the request as expected.                                                                 |
| T6  | Max-tokens probe detects a cap                                                                                      | Click "Detect max output tokens" on a Bedrock model; the probe completes and populates a concrete numeric cap rather than erroring out.                                                                                                                                                                                                   |
| T5  | Structured output default-on, no errors on a tool-heavy task                                                        | With the Bedrock structured-output toggle left at its default (on/unset), run a task that issues several tool calls in a row; no strict-schema rejection errors surface and tool calls parse correctly.                                                                                                                                   |
| T7  | Per-profile instructions visible in system-prompt preview                                                           | Set profile-specific custom instructions on the active Bedrock profile, open the system prompt preview (Prompts view's "preview" / modes view system-prompt dialog), and confirm a distinct "Profile Instructions" section appears containing that text.                                                                                  |
| T8  | `extractInlineThinking` renders collapsible reasoning on a `<think>`-emitting model                                 | Enable `extractInlineThinking` on a profile pointed at a model that emits `<think>`/`<thinking>`/`<reasoning>` tags in plain text; confirm the UI renders a collapsible reasoning block instead of showing the raw tags inline.                                                                                                           |
| T9  | `textToolCallFallback` executes an XML-embedded tool call                                                           | Enable `textToolCallFallback` on a profile pointed at a model that cannot reliably emit native tool calls; prompt it to perform a tool action and confirm an XML-embedded tool call in the model's plain-text response is extracted and actually executed.                                                                                |
| T10 | `allowTextOnlyResponses` pauses visibly on a text-only reply + soft-nudge timer fires with followup auto-approve on | Enable `allowTextOnlyResponses` and auto-approval of follow-up questions; prompt the model so it replies with plain text and no tool call; confirm the task pauses with a visible (non-error) follow-up state rather than a `noToolsUsed` retry, and that the soft-nudge auto-approval timer fires on its own after the configured delay. |
| T1  | Unbound guard passive                                                                                               | With the Unbound provider configured, open its model list in normal operation; confirm no error/crash occurs (the `Array.isArray` guard in `unbound.ts` only engages defensively against a non-array API response, so a healthy pass is simply "nothing breaks").                                                                         |

### STAGE 2 -- VSIX install (only after Stage 1 passes)

**Install command + UI route:** either run
`code --install-extension "bin\zoo-code-3.82.2-fork.1.vsix"` from a terminal (adjust the
path/version to the actual built artifact), or in VS Code's normal window open the
Extensions panel (`Ctrl+Shift+X`) > "..." menu (top-right) > **"Install from VSIX..."**

> browse to `bin\zoo-code-3.82.2-fork.1.vsix`. Either route **replaces** the installed
> marketplace build in place because both share extension id
> `zoocodeorganization.zoo-code` -- this is the point of no return the task description
> warns about; do this only after Stage 1 smoke-testing has passed.

**MANDATORY auto-update pin:** immediately after installing, open the Extensions panel,
find "Zoo Code", click its gear/settings icon, and select **"Auto Update" -> "Disable
(Auto Update)"** for this extension specifically. If this is skipped, the next time the
Zoo Code marketplace publisher ships a release, VS Code will silently auto-update over
this fork build the next time the auto-update check runs (typically on startup or
periodically in the background) -- with no prompt, overwriting the fork VSIX with the
unmodified upstream marketplace build. Per-extension pinning is preferred because:

- The global alternative, setting `"extensions.autoUpdate": false` in VS Code user
  settings, disables auto-update for **every** installed extension, not just this one --
  a much blunter instrument that silently also stops security/bugfix updates for
  everything else Chris has installed, with no per-extension visibility into what's
  pinned and why.
- Another global alternative, `"extensions.autoUpdate": "onlyEnabledExtensions"`, is
  closer but still extension-list-wide rather than a single explicit per-extension
  pin, and is easy to forget is active repo-wide versus being a deliberate, visible
  per-extension choice in the Extensions panel UI.
- The per-extension gear-menu toggle is the only option that leaves an explicit,
  visible, easily-reversible marker ("Auto Update: Disabled" badge) on this specific
  extension, which is what makes it easy to remember this fork build is intentionally
  pinned when revisiting this machine later.

**Rollback:** open the Extensions panel, search "Zoo Code", click **"Uninstall"** on the
fork build, then click **"Install"** on the marketplace listing (or simply click
"Reload" if VS Code offers to restore the previously-installed marketplace version from
cache) to return to the stock marketplace build.
