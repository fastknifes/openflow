# Missed explicit feature continuation path while fixing generic names

- **Date**: 2026-05-18
- **Category**: context-loss
- **Classification**: must-trigger
- **Trigger**: The user challenged whether I had really tested the fix after `/openflow-feature 同意你的方案，生成相关文档` still asked them to manually run `/openflow-feature stateful-quality-guardrails`.
- **Context**: I was fixing bad feature names such as `future-future-*` and `feature-*` generated from vague inputs. I added tests for rejecting generic names and generic document-generation instructions.

## What Went Wrong

I treated “generic instruction should not create a placeholder feature” as the whole problem. That missed a separate valid path: when the user explicitly invokes `/openflow-feature` with a confirmation phrase like “同意你的方案，生成相关文档”, OpenFlow should use the existing conversation context to derive the feature and generate `design.md` / `behavior.md`. Instead, my first fix rejected the input and told the user to manually re-enter a concrete command.

## Root Cause

I optimized for preventing bad slugs but did not model the full intent matrix for `/openflow-feature` arguments. I tested the negative path (vague input must not create `feature-*`) but skipped the positive continuation path (explicit command plus approval phrase should continue from session context). This was a context-loss error because the conversation already established that the user expected OpenFlow to infer feature identity from context without manual slug repetition.

## Correct Behavior

When changing feature identity or command parsing, test both sides of the behavior:

1. Vague standalone input with no usable context should return `Feature Identity Needed` and create no session.
2. Explicit `/openflow-feature` continuation input with session context should reuse or infer the feature identity and proceed to design generation.

The AI should not claim the fix is tested until it includes a regression case using the user's actual command shape, not only synthetic simplified cases.

## Recurrence Signal

This pattern recurs when a fix is framed as “reject bad input” but the real product expectation is “reject bad standalone input while accepting contextual continuation.” It is especially likely around commands whose arguments can be either a new identifier or a natural-language answer to prior context.

## Evidence

- User command that exposed the gap: `/openflow-feature 同意你的方案，生成相关文档`.
- Failed behavior: the assistant response asked the user to manually run `/openflow-feature stateful-quality-guardrails` instead of generating documents from context.
- Corrective code path added afterward: `src/commands/feature.ts` now treats continuation phrases as session-context continuation before deriving a new feature identity.
- Regression test added afterward: `tests/commands/feature.test.ts` covers `同意你的方案，生成相关文档` and expects `stateful-quality-guardrails` documents to be generated.

## Corrective Rule

When modifying OpenFlow command parsing for natural-language arguments, include tests for the user's exact command shape and for both negative standalone-input behavior and positive context-continuation behavior. Do not treat “no placeholder slug generated” as sufficient if the user expected contextual document generation.

## Scope Boundary

In scope: `/openflow-feature` argument interpretation, feature identity derivation, and session-context continuation behavior. Out of scope: general LLM prompt wording, unrelated feature design quality, and historical cleanup of already generated bad feature directories.

## Promotion Decision

Promotion candidate: Yes. This lesson should be considered for a global rule because OpenFlow intentionally supports natural-language command arguments; tests must cover whether the argument is a new feature identity, a continuation answer, or an approval-to-generate signal.
