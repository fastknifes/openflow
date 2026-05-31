# 温和型 Feature 设计助手 - Observable Behavior

## Human Consensus Summary

`/openflow-feature` should behave like a gentle design assistant. It should not behave like a slug-first command, a fixed form that asks every predefined question, or a strict gate that blocks the user until all fields are filled.

The user experience should feel conversational and adaptive: OpenFlow listens to what the user has already said, derives any internal feature identity it needs, judges whether the feature is clear enough, asks only one useful follow-up question when needed, and generates documents only when the feature is ready or when the user explicitly asks for a draft with assumptions.

This behavior document describes observable behavior only. It does not prescribe internal functions, types, or module structure.

## Behavior Scope

This behavior applies to `/openflow-feature` sessions where the user is exploring or formalizing a feature idea.

It covers:

- deciding whether to ask another question;
- starting or continuing `/openflow-feature` without requiring a user-supplied slug;
- deriving safe internal feature identity from natural-language context;
- deciding whether to generate `design.md` and/or `behavior.md`;
- respecting user feedback about abstraction level and skipped questions;
- producing `Draft with Assumptions` when requested before full convergence;
- shaping `behavior.md` according to the feature scenario.

It does not cover:
- implementation planning;
- code editing;
- quality-gate verification;
- archive promotion.

## Trigger Rules

`/openflow-feature` should enter gentle design-assistant behavior when the user starts or continues a feature clarification session.

The command may be invoked with no arguments, with a slug, or with a natural-language description. The assistant should first infer the active feature idea and what is already known from the conversation before asking anything.

Before asking a feature-design question, OpenFlow should resolve an internal feature identity from active session context, an AI-generated slug, the natural-language command argument, an unambiguous incomplete feature session, or a deterministic fallback derived from the user's description.

The assistant should consider document generation only after checking whether these points are basically clear:

- the problem or improvement target;
- the rough boundary of the change;
- the expected user-visible or process-visible result;
- whether remaining unknowns can safely be written as assumptions.

## Non-Trigger Rules

The assistant should not ask the user to provide a filesystem-safe feature name as the normal way to start `/openflow-feature`.

The assistant should not reject meaningful Chinese, mixed-language, or sentence-like input merely because it is not already a slug.

The assistant should not ask a question merely because it exists in a fixed questionnaire.

The assistant should not generate final `design.md` or `behavior.md` merely because a fixed sequence of questions has been answered.

The assistant should not move into code-level design when the user is discussing product intent, workflow behavior, user experience, or documentation expectations.

## Scenario: Command Starts Without A Feature Name Argument

**Given:**

- The user invokes `/openflow-feature` with no argument.
- The current chat session has an active feature session, recent feature clarification context, or another unambiguous feature idea.

**When:**

- OpenFlow handles the command.

**Then:**

- OpenFlow should continue or start the matching feature session.
- OpenFlow should not return “Feature name is required” as the first response when context is sufficient.
- OpenFlow may display the derived feature title or slug for traceability, but must not require the user to invent it.

## Scenario: Natural-Language Command Argument Becomes Feature Intent

**Given:**

- The user invokes `/openflow-feature 为 quality gate 引入 evidence-ledger 机制` or another sentence-like description.

**When:**

- OpenFlow handles the command.

**Then:**

- OpenFlow should treat the argument as feature intent, not as a literal slug requirement.
- OpenFlow should derive a safe internal slug and preserve a human-readable title or source intent.
- OpenFlow should not fail with “Feature name is too short after sanitization”.
- OpenFlow should proceed to convergence evaluation or ask one meaningful clarification question.

## Scenario: Ambiguous Feature Identity Needs Disambiguation

**Given:**

- The user invokes `/openflow-feature` without an argument.
- Multiple incomplete feature sessions or plausible feature ideas are active.

**When:**

- OpenFlow cannot safely choose one.

**Then:**

- OpenFlow should ask one disambiguation question listing the likely feature ideas.
- The question should be phrased in natural language.
- The user should not be asked to type a slug.

## Scenario: Clear Feature Request Can Generate Documents

**Given:**

- The user has described what should improve.
- The rough boundary is understandable.
- The expected outcome is understandable.
- Remaining unknowns are minor enough to record as assumptions.

**When:**

- The user asks to generate or continue the feature design.

**Then:**

- OpenFlow may generate `design.md`.
- OpenFlow may generate `behavior.md` if observable behavior or workflow behavior changes.
- The generated documents should use a human consensus summary followed by execution constraints.
- The final response should summarize generated files, assumptions, constraints, and suggested next steps.

## Scenario: Unclear Feature Request Needs One Key Question

**Given:**

- The user describes a feature idea, but one unresolved point would change the design direction.

**When:**

- OpenFlow evaluates whether to generate documents.

**Then:**

- OpenFlow should not generate final documents yet.
- OpenFlow should explain the missing decision in plain language.
- OpenFlow should ask exactly one key question.
- The question should be about the uncertainty that most affects the design.
- If useful, OpenFlow should provide options rather than requiring an open-ended answer.

## Scenario: User Skips A Question

**Given:**

- OpenFlow asks a follow-up question.

**When:**

- The user says “skip”, “先按你的判断”, “这个不用问”, or gives an equivalent instruction.

**Then:**

- OpenFlow should stop pursuing that question.
- OpenFlow should record the skipped point as an assumption or non-blocking unknown.
- OpenFlow should not ask the same kind of question again in the same session unless the user reopens it.

## Scenario: User Rejects Code-Level Discussion

**Given:**

- The user is discussing product intent, user experience, workflow, or document behavior.

**When:**

- The user says “我不跟你讨论代码层面的设计”, “看不懂”, or otherwise rejects implementation-level discussion.

**Then:**

- OpenFlow should lower the abstraction level to product, workflow, or experience language.
- OpenFlow should avoid function names, type names, module structure, implementation mechanics, or code design.
- OpenFlow should treat that feedback as a session preference, not merely as a one-time answer.

## Scenario: User Wants Documents Before Full Convergence

**Given:**

- OpenFlow detects unresolved points that would normally require further clarification.

**When:**

- The user explicitly asks to generate anyway, says to proceed, or asks for a draft.

**Then:**

- OpenFlow may generate documents.
- The documents must be marked as:

  > **Draft with Assumptions / 带假设的草稿**

- The documents must separate:
  - confirmed facts;
  - current assumptions;
  - pending confirmations;
  - risks that must not be treated as final implementation constraints.

## Scenario: Behavior Document Is Needed

**Given:**

- The feature changes something observable by a user, command caller, hook trigger, agent workflow, or documentation governance process.

**When:**

- OpenFlow generates `behavior.md`.

**Then:**

- The behavior document should describe what can be observed.
- It should not describe internal implementation.
- It should choose a behavior shape appropriate to the scenario.

Examples:

- Command behavior: input command, expected response, generated result.
- Hook behavior: triggering event, non-trigger condition, visible side effect.
- Workflow behavior: user-visible steps from start to completion.
- Documentation governance behavior: which documents are created, updated, skipped, or protected.
- Error behavior: failure signal, user-facing message, recovery path.

## Scenario: Behavior Document Is Not Needed Or Should Be Minimal

**Given:**

- The feature is internal-only and does not change user-visible, process-visible, or governance-visible behavior.

**When:**

- OpenFlow evaluates whether to generate `behavior.md`.

**Then:**

- OpenFlow should not force a large behavior document.
- It may omit `behavior.md` when allowed by the workflow, or keep it short if the filename must be produced.
- It should state that no externally observable behavior changes are expected.

## Scenario: Completed Feature Design Handoff

**Given:**

- OpenFlow has generated the appropriate documents.

**When:**

- The assistant returns the result to the user.

**Then:**

- It should summarize the consensus.
- It should list the generated files.
- It should identify assumptions and pending confirmations.
- It should highlight constraints future work must not violate.
- It should suggest a reasonable next step without forcing implementation.

## Must Not Behavior

- Must not require the user to manually provide a feature slug for normal `/openflow-feature` use.
- Must not surface raw sanitization failures such as “Feature name is too short after sanitization” for meaningful natural-language feature descriptions.
- Must not treat path sanitization as intent extraction.
- Must not ask fixed questions just because they exist.
- Must not treat answering a fixed questionnaire as sufficient convergence.
- Must not generate final documents while design-direction gaps remain unresolved.
- Must not treat assumptions as confirmed facts.
- Must not use one rigid behavior template for every feature.
- Must not turn `behavior.md` into an implementation design document.
- Must not ignore user feedback that asks to skip, simplify, or avoid code-level discussion.

## Acceptance / Verification Mapping

| Expected Behavior | Verification Approach | Status |
|-------------------|-----------------------|--------|
| `/openflow-feature` can start or continue without a user-provided feature name when context is unambiguous. | Covered by command and chat hook tests for omitted feature arguments with active sessions. | verified |
| Natural-language Chinese or mixed-language command arguments are accepted as feature intent. | Covered by command test using `为 quality gate 引入 evidence-ledger 机制`; verifies derived slug/title and no sanitization failure. | verified |
| Ambiguous identity asks one natural-language disambiguation question, not for a slug. | Covered by command test with multiple incomplete feature sessions and no feature argument. | verified |
| Clear feature requests can generate documents without irrelevant fixed questions. | Covered by command generation tests where problem, scope, and constraints are enough to generate. | verified |
| Unclear feature requests receive one key question before final generation. | Covered by convergence and command tests showing source intent alone asks one key question and generates no docs. | verified |
| Users can skip a question and proceed with assumptions. | Covered by command test for `先生成草稿`; generated docs are marked `Draft with Assumptions`. | verified |
| Code-level discussion is avoided when the user rejects it. | Covered by command test for `我不跟你讨论代码层面的设计`; product-level preference is persisted. | verified |
| Drafts generated before full convergence are marked `Draft with Assumptions`. | Covered by command test inspecting generated `design.md` and `behavior.md`. | verified |
| `behavior.md` describes observable behavior using a scenario-appropriate shape. | Covered by behavior renderer tests for command behavior, trigger rules, observable scenarios, and implementation-mechanics exclusion. | verified |
