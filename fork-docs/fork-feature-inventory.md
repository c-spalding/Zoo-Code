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

| Order | Branch                         | Tranche                                            | Upstream status (recon)                                                                           | Mandatory fixes carried               |
| ----- | ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1     | `fork/03-bedrock-reasoning`    | T3 -- Bedrock adaptive thinking / reasoning effort | **MERGED** -- PARTIAL / REFACTORED-UNDERNEATH, reconciled per adaptive-thinking-reconciliation.md | F-BP-3 (not needed; never introduced) |
| 2     | `fork/04-bedrock-discovery`    | T4 -- Bedrock dynamic discovery                    | ABSENT -- clean re-application                                                                    | none mandatory                        |
| 3     | `fork/02-bedrock-catalog`      | T2 -- Bedrock catalog corrections                  | ABSENT/mixed -- depends on T4                                                                     | none mandatory                        |
| 4     | `fork/06-max-tokens-probe`     | T6 -- Bedrock max-output-tokens probe              | PARTIAL -- probe logic absent; UI component name collision with upstream                          | none mandatory                        |
| 5     | `fork/05-structured-output`    | T5 -- Bedrock structured-output strict mode        | ABSENT -- clean re-application                                                                    | none mandatory                        |
| 6     | `fork/07-profile-instructions` | T7 -- Per-profile custom instructions              | ABSENT -- clean, but migration logic needs re-diff                                                | none mandatory                        |
| 7     | `fork/08-inline-thinking`      | T8 -- Inline thinking extraction                   | ABSENT -- clean re-application                                                                    | none mandatory                        |
| 8     | `fork/09-text-tool-fallback`   | T9 -- Text tool-call fallback                      | ABSENT, entangled with `tool-use.ts` shape                                                        | F-AI-2, F-AI-3                        |
| 9     | `fork/10-allow-text-only`      | T10 -- `allowTextOnlyResponses`                    | ABSENT, entangled with T9's `tool-use.ts` changes                                                 | F-LC-1                                |
| 10    | `fork/01-small-fixes`          | T1 -- Small bug fixes                              | 3 of 4 already SUPERSEDED upstream -- see discrepancy note                                        | none mandatory                        |

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

### Purpose

Three small, independent correctness fixes to the Bedrock model catalog and discovery
filtering: a wrong AWS model-id prefix, foundation models surfaced that cannot actually
be invoked, and a UI double-render bug. User-facing benefit: fewer silent
misclassifications and no duplicate dropdown rows.

### Provider-setting / global-setting keys

None. Pure bug fixes.

### Principal files

| File                                                                                                                   | New/Modified                                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`packages/types/src/providers/bedrock.ts`](packages/types/src/providers/bedrock.ts)                                   | Modified -- `moonshot.` -> `moonshotai.` key rename                |
| [`src/api/providers/bedrock-discovery.ts`](src/api/providers/bedrock-discovery.ts)                                     | Modified -- `ON_DEMAND` inference-type filter                      |
| [`webview-ui/src/components/settings/providers/Bedrock.tsx`](webview-ui/src/components/settings/providers/Bedrock.tsx) | Modified -- `availableTargets` memo, drop second-pass 1M expansion |

### Source commits on `archive/zoo-base-3.56`

Verified via `git show --stat`:

| Commit      | Subject                                                                      |
| ----------- | ---------------------------------------------------------------------------- |
| `d388efc12` | `fix(bedrock): correct moonshot.kimi-k2-thinking catalog key to moonshotai.` |
| `707479d6f` | `fix(bedrock): drop foundation-model rows that don't support ON_DEMAND`      |
| `a7f475f36` | `fix(bedrock): drop second-pass 1M-variant expansion in settings dropdown`   |

All three match the review's section 7.2 Tranche 2 commit list exactly.

### Upstream status per recon (drop/keep/adapt)

- `d388efc12` (kimi-k2 key fix): recon feature #10 evidence confirms BASE still carries
  the **uncorrected** key `moonshot.kimi-k2-thinking` (no trailing "ai"). This is a
  genuine, unshipped upstream bug -- **keep**, and consider upstreaming it standalone
  regardless of the rest of this tranche (recon flags it explicitly as a PR candidate).
- `707479d6f` and `a7f475f36`: both patch code that is itself ABSENT at BASE
  (`bedrock-discovery.ts` and the discovery-backed `Bedrock.tsx` dropdown do not exist
  upstream). They are not "superseded" so much as **inseparable from T4** -- apply them
  as follow-up fixes on top of T4's re-application, not as standalone patches against
  BASE's current (static-list) Bedrock UI.

### Known defects to fix during re-application

None specific to this tranche beyond what T4 already carries.

### Dependencies on other tranches

Hard dependency on T4 (see above) for `707479d6f` and `a7f475f36`. `d388efc12` has no
dependency and can ship independently or even earlier if desired.

### Before upstream submission checklist

- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main` (for `d388efc12` this can be a trivial standalone
      rebase; for the other two, rebase onto the T4 PR's branch instead).
- [ ] i18n: none needed.
- [ ] `.changeset/` entry per fix (or one entry covering all three if submitted
      together), `patch` impact.
- [ ] Tests: existing coverage should suffice; add a regression test for the kimi-k2 key
      if none exists.
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 2: if submitting
      2.2/2.3 independently of Tranche 4, port the fixes against the legacy code paths
      and rewrite the rationale -- otherwise submit after T4 lands.

---

## 6. T6 -- Bedrock max-output-tokens probe

**Order:** 4th (branch `fork/06-max-tokens-probe`)

### Purpose

Adds a "Detect max output tokens" button that empirically binary-searches a Bedrock
model's real max-output-tokens ceiling by sending probe requests, since Bedrock's
control-plane API does not expose this value per-model. User-facing benefit: users
configuring an unfamiliar or brand-new Bedrock model no longer have to guess or trawl
AWS release notes for the correct max-tokens value.

### Provider-setting / global-setting keys

No new persisted setting. Writes its result into the existing `awsModelContextWindow`
manual-override field (already upstream, see Dropped section) via a UI button; the probe
itself is a transient request/response message, `requestBedrockMaxTokensProbe`.

### Principal files

| File                                                                                                                                                           | New/Modified                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`src/api/providers/bedrock-discovery.ts`](src/api/providers/bedrock-discovery.ts)                                                                             | Modified -- `probeBedrockMaxOutputTokens` (binary search + hint extraction) |
| [`webview-ui/src/components/ui/hooks/useBedrockMaxTokensProbe.ts`](webview-ui/src/components/ui/hooks/useBedrockMaxTokensProbe.ts)                             | New                                                                         |
| [`webview-ui/src/components/settings/providers/BedrockMaxTokensProbeButton.tsx`](webview-ui/src/components/settings/providers/BedrockMaxTokensProbeButton.tsx) | New                                                                         |
| [`webview-ui/src/components/settings/providers/BedrockThinkingBudget.tsx`](webview-ui/src/components/settings/providers/BedrockThinkingBudget.tsx)             | New                                                                         |
| [`webview-ui/src/components/settings/MaxOutputTokensControl.tsx`](webview-ui/src/components/settings/MaxOutputTokensControl.tsx)                               | New -- **name collision, see below**                                        |

### Source commits on `archive/zoo-base-3.56`

**Unverified as a discrete commit set** -- same situation as T4: the review gives no
commit hashes (file/symbol description only), and `git log --follow` on every file above
resolves only to `c5d90ce8b`. Treat this tranche as "extract from `c5d90ce8b`'s diff by
file", not "cherry-pick a commit range".

### Upstream status per recon (drop/keep/adapt)

Recon feature #2: **PARTIAL**. `probeBedrockMaxOutputTokens` / `detectMaxTokens` are
ABSENT at BASE -- the probing logic re-applies cleanly. BUT: BASE already has a
component literally named `MaxOutputTokensControl` in `webview-ui`, used generically by
`ThinkingBudget.tsx` for non-Bedrock providers with `supportsMaxTokens` (e.g. Z.ai GLM).
It is a plain slider renderer, functionally unrelated to the fork's Bedrock-probe-specific
component of the same name. **This is a name collision, not a feature collision** --
either rename the fork's component before porting it, or manually reconcile so the
upstream-native slider is not clobbered.

### Known defects to fix during re-application

- Advisory: F-BP-1 (High) -- hardcoded strings in `useBedrockMaxTokensProbe.ts`
  ("Bedrock max output tokens probe timed out", "...returned no payload"). Add i18n
  keys.
- Advisory: F-CO-3 (Info) -- `MaxOutputTokensControl`'s `extraSlot`/`helperText` slot
  design is good forward-looking design; no action, but keep it in mind while resolving
  the name collision (the slot mechanism may be the reconciliation path).
- Advisory: F-AA-1 (Info) -- 30-day structured-output cache TTL note is T5's concern,
  not T6's; listed here only because the review groups T5/T6 UI adjacently.

### Dependencies on other tranches

Depends on T4 (`resolveBedrockInvokeTargetId` per the review's dependency graph).

### Before upstream submission checklist

- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`, onto T4's branch specifically (hard dependency).
- [ ] Resolve the `MaxOutputTokensControl` name collision before opening the PR --
      this is a functional merge conflict, not just a rebase conflict.
- [ ] i18n locale parity for `bedrock.detectMaxTokens*` and `bedrock.contextWindowOverride*`
      keys plus the hardcoded probe-hook strings.
- [ ] `.changeset/` entry, `minor` impact.
- [ ] Tests: `bedrock-max-tokens-probe.spec.ts` already has exhaustive coverage of the
      binary-search/hint-extraction logic per the review (F-TC-4 note); carry it forward
      verbatim once the collision is resolved.
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 6: probe is opt-in
      (button) and override is opt-in (text input) -- confirm no behaviour change for
      existing users who never click the button.

---

## 7. T5 -- Bedrock structured-output strict mode

**Order:** 5th (branch `fork/05-structured-output`)

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

- Advisory: F-TC-3 (Medium) -- `getBedrockStructuredOutputAccessors` wiring through
  `ContextProxy` is untested (the pure cache helpers are tested in isolation, the
  `Task` wiring is not). Add a focused round-trip test.
- Advisory: F-M-2 (Low) -- the cache is hidden with no UI to clear it; consider a
  "Clear cache" button now rather than deferring, since it is a known sharp edge for
  users whose model later gains strict-mode support.
- Advisory: F-AA-1 (Info) -- 30-day TTL is a reasonable default; optionally make it
  config-driven or add a clear-cache affordance (overlaps F-M-2).

### Dependencies on other tranches

None functionally, though it shares its origin commit with T3/T4/T6.

### Before upstream submission checklist

- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`.
- [ ] i18n locale parity for the toggle label and tooltip.
- [ ] `.changeset/` entry, `minor` impact.
- [ ] **Schema migration check:** walk `migrateSettings.spec.ts` to confirm
      `bedrockStructuredOutputUnsupported` does not break old-state import -- this is a
      hard gate per upstream's contribution constraints (new `globalSettings` fields are
      reviewed carefully).
- [ ] Tests: F-TC-3 wiring test added.
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 5: be ready to
      justify why a global (not per-profile) cache is the right shape.

---

## 8. T7 -- Per-profile custom instructions

**Order:** 6th (branch `fork/07-profile-instructions`)

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
- [ ] Resolve F-DC-2 (verify/remove duplicate textarea) before opening the PR.
- [ ] i18n locale parity for `profileCustomInstructions*` keys across all locales.
- [ ] `.changeset/` entry, `minor` impact.
- [ ] Tests: add a focused test exercising both `Task` and `generateSystemPrompt` with
      various combinations of global + profile instructions (per review recommendation).
- [ ] Migration: confirm the field-rename/migration logic identified in the discrepancy
      note above round-trips through `migrateSettings.spec.ts` equivalents.

---

## 9. T8 -- Inline thinking extraction

**Order:** 7th (branch `fork/08-inline-thinking`)

### Purpose

Streams `<think>`/`<thinking>`/`<reasoning>` tags out of a model's plain-text output in
real time and renders them as proper collapsible reasoning blocks, for models that emit
their reasoning inline in text rather than via a dedicated reasoning-content channel.
User-facing benefit: open-weight and other non-native-reasoning models get the same
collapsible "thinking" UI treatment as models with first-class reasoning support.

### Provider-setting / global-setting keys

`extractInlineThinking` (`ProviderSettings`).

### Principal files

| File                                                                                                         | New/Modified                                                      |
| ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| [`src/core/task/Task.ts`](src/core/task/Task.ts)                                                             | Modified -- streaming state machine in `case "text"`              |
| [`packages/types/src/provider-settings.ts`](packages/types/src/provider-settings.ts)                         | Modified -- `extractInlineThinking` field                         |
| [`webview-ui/src/components/settings/ApiOptions.tsx`](webview-ui/src/components/settings/ApiOptions.tsx)     | Modified -- checkbox                                              |
| [`src/core/assistant-message/TextToolCallExtractor.ts`](src/core/assistant-message/TextToolCallExtractor.ts) | Modified -- `removeThinkingTags()` static helper (shared with T9) |

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

- Advisory: F-DC-1 (Low) -- duplicate thinking-tag-regex concept between the streaming
  handler in `Task.ts` and `TextToolCallExtractor`'s post-stream regex strip. Extract a
  single shared `THINKING_TAG_REGEX` constant; do this here if T8 lands before T9,
  otherwise defer to T9.
- Advisory: F-ER-2 / F-TC-2 (Low/Medium) -- the streaming state machine is ~130 lines of
  hand-rolled buffer management with no direct tests. Extract into its own testable
  module and add unit tests covering tag boundaries split across chunks, unclosed tags,
  and malformed tags before submission.

### Dependencies on other tranches

None inbound. T9 depends on this tranche (shared `THINKING_TAG_REGEX` extraction).

### Before upstream submission checklist

- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`.
- [ ] i18n locale parity for `advanced.extractInlineThinking.*` keys.
- [ ] `.changeset/` entry, `minor` impact.
- [ ] Tests: F-ER-2/F-TC-2 streaming-parser unit tests added (essential -- the review
      calls this out as the single most under-tested piece of new logic in the fork).
- [ ] Refactor: F-DC-1 shared regex extraction, if not deferred to T9.

---

## 10. T9 -- Text tool-call fallback

**Order:** 8th (branch `fork/09-text-tool-fallback`)

### Purpose

Parses XML, Anthropic `<invoke>`-style, and JSON-in-fenced-code tool calls out of a
model's plain-text response for models without native function-calling support, then
executes them as if they had been called natively. User-facing benefit: open-weight
models served through Bedrock (or any provider lacking native tool-calling) can still
drive the full tool-use loop.

### Provider-setting / global-setting keys

`textToolCallFallback` (`ProviderSettings`).

### Principal files

| File                                                                                                                                       | New/Modified                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| [`src/core/assistant-message/TextToolCallExtractor.ts`](src/core/assistant-message/TextToolCallExtractor.ts)                               | New                                                                                                                            |
| [`src/core/assistant-message/__tests__/TextToolCallExtractor.spec.ts`](src/core/assistant-message/__tests__/TextToolCallExtractor.spec.ts) | New -- 52 tests                                                                                                                |
| [`src/core/task/Task.ts`](src/core/task/Task.ts)                                                                                           | Modified -- post-stream fallback loop (~150 LOC)                                                                               |
| [`src/core/prompts/sections/tool-use.ts`](src/core/prompts/sections/tool-use.ts)                                                           | Modified -- `textToolCallFallback`/`allowTextOnlyResponses` flags -- **this is the file that broke 7 existing snapshot tests** |
| [`src/core/prompts/system.ts`](src/core/prompts/system.ts), [`src/core/prompts/types.ts`](src/core/prompts/types.ts)                       | Modified                                                                                                                       |
| [`src/core/webview/generateSystemPrompt.ts`](src/core/webview/generateSystemPrompt.ts)                                                     | Modified -- must also pass `textToolCallFallback` (see F-AI-3)                                                                 |
| [`packages/types/src/provider-settings.ts`](packages/types/src/provider-settings.ts)                                                       | Modified -- field                                                                                                              |
| [`webview-ui/src/components/settings/ApiOptions.tsx`](webview-ui/src/components/settings/ApiOptions.tsx)                                   | Modified -- checkbox                                                                                                           |

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
T10) via the `getSharedToolUseSection` signature. BASE's version of that function takes
**zero** parameters and is 5 lines; the fork's takes two parameters and is 32 lines with
branching wording. The class `TextToolCallExtractor` itself re-applies cleanly with no
upstream conflict -- it is the wiring into `tool-use.ts` / `system.ts` / `Task.ts` that
must be **rebuilt against BASE's current simplified shape**, not patched or
3-way-merged. This is the single largest structural-rework item in the whole
recon (recon section 5, item 8).

### Known defects to fix during re-application

- **Mandatory: F-AI-2** (Medium) -- the prompt-wording change in `getSharedToolUseSection`
  (upstream text: `"Use the provider-native tool-calling mechanism. Do not include XML
markup or examples."`) broke 7 existing snapshot/assertion tests in
  `add-custom-instructions.spec.ts` and `system-prompt.spec.ts` (including a hard
  `toContain(...)` assertion at line 552) that were never updated. Regenerate all
  affected snapshots and update the `toContain` assertion as part of this tranche, not
  as a follow-up.
- **Mandatory: F-AI-3** (Low) -- `generateSystemPrompt.ts` (the "Show System Prompt"
  preview) passes `allowTextOnlyResponses` through but omits `textToolCallFallback`,
  so the preview drifts from what the model actually receives. Add the missing field
  and a regression test that diffs both code paths for representative configurations.
- Advisory: F-BP-2 (Medium) -- five `await import(...)` dynamic imports inside the
  streaming hot path in `Task.ts` with no documented circular-import rationale. Hoist
  to top-of-file imports unless a real circular-import test fails; if real, document
  the cycle in a comment.
- Advisory: F-ER-1 / F-M-1 (Medium) -- `recursivelyMakeClineRequests` gained ~150 lines
  interleaving three concerns (text-tool-fallback extraction, `allowTextOnlyResponses`
  branching, mistake-counter logic). Extract each into a named private method.
- Advisory: F-ER-3 / F-BP-4 (Low) -- `crypto.randomUUID().slice(0, 8)` for synthetic
  tool-call IDs has no comment explaining the truncation; add one or use the full UUID.
- Advisory: F-DC-1 (Low) -- shared `THINKING_TAG_REGEX` extraction, if not already done
  in T8.

### Dependencies on other tranches

Depends on T8 (shared `THINKING_TAG_REGEX`, both touch `Task.ts` `case "text"`). Submit
T8 first and rebase this tranche onto it.

### Before upstream submission checklist

- [ ] **F-AI-2 (BLOCKER):** all 7 broken prompt snapshots regenerated and the hard
      `toContain` assertion updated.
- [ ] **F-AI-3 (BLOCKER):** `textToolCallFallback` added to `generateSystemPrompt.ts`.
- [ ] Issue-first + claim.
- [ ] Branch rebased onto `zoo/main`, specifically onto T8's branch.
- [ ] i18n locale parity for `advanced.textToolCallFallback.*` keys.
- [ ] `.changeset/` entry, `minor` impact.
- [ ] F-BP-2 dynamic-import hoist (or documented rationale) resolved.
- [ ] F-ER-1/F-M-1 extraction of the post-stream fallback loop into a private method.
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 9: be ready to
      defend or compromise on the exact prompt wording -- maintainers may debate whether
      the new phrasing is better than the existing one for models that do support native
      tools.

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

| File                                                                                                                     | New/Modified                                                              |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [`src/core/task/Task.ts`](src/core/task/Task.ts)                                                                         | Modified -- `initiateTaskLoop` text-only path, mistake-counter accounting |
| [`src/core/prompts/responses.ts`](src/core/prompts/responses.ts)                                                         | Modified -- `softNudge()`                                                 |
| [`src/core/prompts/sections/tool-use.ts`](src/core/prompts/sections/tool-use.ts)                                         | Modified -- `allowTextOnlyResponses` flag (shared surface with T9)        |
| [`packages/types/src/provider-settings.ts`](packages/types/src/provider-settings.ts)                                     | Modified -- field                                                         |
| [`packages/types/src/followup.ts`](packages/types/src/followup.ts)                                                       | Modified -- `silent` flag                                                 |
| [`webview-ui/src/components/chat/ChatRow.tsx`](webview-ui/src/components/chat/ChatRow.tsx)                               | Modified -- silent followup rendering (returns `null`)                    |
| [`webview-ui/src/components/settings/ApiOptions.tsx`](webview-ui/src/components/settings/ApiOptions.tsx)                 | Modified -- checkbox                                                      |
| [`src/core/task/__tests__/allow-text-only-responses.spec.ts`](src/core/task/__tests__/allow-text-only-responses.spec.ts) | New -- **needs rewrite, see F-AI-1**                                      |

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
signature problem described in T9's section above. This is the highest-complexity
tranche to re-apply -- it touches a core prompt-assembly function whose signature
upstream has not extended in the fork's direction, so the parameter-threading path
through `system.ts` -> `types.ts` -> `Task.ts` must be re-derived, not cherry-picked.

### Known defects to fix during re-application

- **Mandatory: F-LC-1** (High) -- the soft-nudge suggestion is generated only when
  `autoApprovalEnabled` is true, but `checkAutoApproval` requires **both**
  `autoApprovalEnabled` **and** `alwaysAllowFollowupQuestions === true` to auto-fire the
  timer. When the first is true and the second is false, the loop hangs indefinitely:
  no UI (silent followups render `null`) and no timer firing. Fix by gating suggestion
  generation on both flags and falling back to a non-silent ask in the mismatched case,
  or by making the silent followup user-cancellable another way.
- Advisory: F-LC-2 (Medium) -- even in the correctly-configured non-auto-approve case,
  there is no visible cue that the loop is paused waiting for a reply; the user can type
  into chat but has no reason to know that's expected. Render a small hint banner.
- Advisory: F-LC-3 / F-LC-4 (Medium/Low) -- the timer-fired check uses brittle
  string-equality on the soft-nudge text; add a marker on the auto-response payload
  instead, and stop calling `formatResponse.softNudge()` twice per cycle.
- Advisory: F-AI-1 / F-TC-1 (High) -- `allow-text-only-responses.spec.ts` reimplements
  the production counter logic inline in each test body instead of driving a real `Task`
  through `recursivelyMakeClineRequests`. This is a textbook "tests that test the test"
  AI-rot pattern; replace before submission (upstream review will catch it immediately).
- Advisory: F-ER-1 / F-M-1 (Medium) -- extract the text-only branch into its own private
  method (shared concern with T9).

### Dependencies on other tranches

Depends on T9 (shared `tool-use.ts` changes). Submit after T9.

### Before upstream submission checklist

- [ ] **F-LC-1 (BLOCKER):** soft-nudge deadlock fixed.
- [ ] **F-LC-2 (BLOCKER, UX):** visible pause cue added -- the review explicitly
      predicts the current "type-and-hope" UX will be rejected on sight by upstream
      review.
- [ ] **F-AI-1 (BLOCKER):** `allow-text-only-responses.spec.ts` replaced with tests that
      drive a real `Task`.
- [ ] Issue-first + claim -- expect a long design discussion; this is flagged in the
      review as the fork's most opinionated, highest-design-risk feature, since it
      changes a load-bearing safety assumption ("every turn calls a tool").
- [ ] Branch rebased onto `zoo/main`, specifically onto T9's branch.
- [ ] F-LC-3 soft-nudge string-equality contract replaced with a proper marker.
- [ ] i18n locale parity for `advanced.allowTextOnlyResponses.*` keys.
- [ ] `.changeset/` entry, `minor` impact.
- [ ] F-ER-1 extraction of the text-only branch into a private method (recommended, not
      blocking).

---

## 12. T1 -- Small bug fixes

**Order:** 10th, last (branch `fork/01-small-fixes`)

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
- [ ] i18n: none needed.
- [ ] `.changeset/` entry, `patch` impact.
- [ ] Tests: existing coverage (or add a one-line regression test reproducing a non-array
      `/models` response).
- [ ] Tranche-specific prerequisite from review section 7.2 Tranche 1.1: mention the
      reproducer (Unbound returning an error envelope) in the PR description.

---

## 13. Dropped / superseded

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

## 14. Deferred / watch list

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

## 15. Update discipline

This file is the source of truth for what this fork carries on top of upstream. Every
tranche merge into `feature/zoo-base`, and every future re-sync against a newer upstream
release, **must** update this file in the same PR/merge:

- When a `fork/NN-slug` branch merges, move its status from "planned" to "merged",
  record the actual merge commit SHA, and correct any "unverified" commit attributions
  once the real diff has been re-derived (several tranches above are marked unverified
  at the commit level because the source history squashed multiple tranches into one
  commit -- once re-split, record the real provenance here).
- When a future re-sync recon (a new `upstream-recon-vX.Y.Z.md` snapshot) is produced,
  re-check every row in section 13 (Dropped/superseded) and section 14 (Deferred/watch
  list) against the new upstream state -- a dropped feature can un-supersede itself if
  upstream reverts, and a watch-list bug can get fixed upstream and drop off the list.
- Do not let this file drift silently. If a tranche's re-applied code ends up differing
  materially from what its section here describes, update the section as part of that
  tranche's own PR, not as a separate cleanup pass.
