# 温和型 Feature 设计助手 - Design

## Human Consensus Summary

`/openflow-feature` should evolve from a fixed-question, feature-name-first document generator into a gentle design assistant that accepts natural language and can start without any user-provided slug.

The current feature workflow has two product-level flaws. First, it treats `/openflow-feature` as if the user must provide a valid feature name slug, even though users naturally describe intent in ordinary language and often expect the assistant to name the feature. Second, it does not decide whether the conversation is ready to enter `design.md` / `behavior.md` generation. It asks a fixed sequence of questions and then converges automatically. That behavior can reject useful Chinese/natural-language input, ask unnecessary questions, miss unresolved constraints, generate documents too early, and pull the user into code-level discussion when they are still talking about product intent or workflow experience.

The improved workflow should help the user clarify an idea without making the interaction feel like a rigid form. It should infer or derive an internal feature identity from the conversation, understand what has already been said, decide whether any uncertainty still changes the design direction, ask only one valuable follow-up question when needed, and generate documents only when the feature is sufficiently converged or the user explicitly wants a draft with assumptions.

### Agreed Product Positioning

`/openflow-feature` is a gentle design assistant. It is not:

- a command that requires the user to invent a slug;
- a fixed questionnaire;
- a hard requirement gate;
- a code-design entrypoint by default;
- a template filler that always emits the same document shape.

It should help users think clearly, preserve useful design constraints, generate safe internal identifiers when needed, and hand off the result without forcing implementation.

### Confirmed User Feedback To Preserve

The following user statement is a first-class product requirement:

> “你的建议我看不懂，我不跟你讨论代码层面的设计。”

This means `/openflow-feature` must adapt to the user's abstraction level. If the user is discussing product intent, workflow, experience, or documentation behavior, OpenFlow should stay at that level. It should not introduce function names, types, interfaces, modules, or implementation structure unless the user explicitly asks for implementation design.

The following user feedback is also a first-class product requirement:

> “`openflow-feature` 这个命令应该不需要任何参数。Feature name 应该是 AI 生成。用户只需要用自然语言来交互。”

This means `/openflow-feature` must not require the user to know or supply a filesystem-safe feature slug. If a slug is needed for storage, document paths, or session lookup, OpenFlow should derive one from active session context, conversation intent, or a deterministic fallback. The user-facing workflow should remain natural-language first.

## Problem

The existing workflow overfits to command arguments and a fixed set of questions. It expects users to pass a feature name even when the conversation already contains enough intent, and it fails on meaningful Chinese/natural-language arguments because the slug sanitizer strips non-ASCII text into an invalid name. Some fixed questions may also be inferable or irrelevant for a given feature. For example, asking “who is the user?” can be unnecessary when the feature clearly concerns OpenFlow's internal workflow users or maintainers.

The more serious issue is premature convergence. The workflow can reach document generation because the fixed questions are answered, not because the requirement is actually clear. Conversely, it can continue asking low-value questions even when the design is already clear enough.

This creates three failure modes:

1. **Argument-first friction** — the command asks users to provide a slug instead of accepting natural-language intent and deriving internal identity.
2. **Natural-language rejection** — useful Chinese or descriptive input can fail with messages such as “Feature name is too short after sanitization”.
3. **Mechanical questioning** — the assistant asks questions because the flow says so, not because the answer changes the design.
4. **Premature document generation** — `design.md` and `behavior.md` can be generated before constraints, behavior, or success criteria are sufficiently clear.
5. **Wrong abstraction level** — product or workflow discussion can be dragged into code-level design too early.

## Goals

- Make `/openflow-feature` usable with no arguments.
- Treat natural-language user input as feature intent, not as a required slug.
- Derive or generate the internal feature identity automatically when needed.
- Replace fixed-question convergence with readiness-based convergence.
- Ask only questions whose answers can materially change the design direction.
- Before generating documents, decide whether the conversation is sufficiently converged.
- If not converged, ask one key question by default.
- If the user still wants documents, generate a `Draft with Assumptions` instead of blocking.
- Generate `behavior.md` only when observable behavior needs to be captured, and shape it by feature scenario.
- Keep documents readable for humans while preserving execution constraints for later AI/developer work.
- Treat user feedback such as “skip this”, “I do not want code-level discussion”, or “I do not understand” as flow-control signals.

## Non-Goals

- Do not make `/openflow-feature` a strict approval gate.
- Do not require users to manually provide a slug-like feature name.
- Do not reject meaningful natural-language input merely because it is not ASCII or not path-safe.
- Do not require users to answer every possible clarification dimension.
- Do not generate code-level implementation design unless requested.
- Do not force every feature to generate the same `behavior.md` structure.
- Do not treat assumptions as final implementation constraints.

## Design Principles

### 1. Natural-Language Entry Is The Default

`/openflow-feature` should be valid without arguments. The command should start or continue feature clarification from the current chat context whenever possible.

Supported entry styles:

- `/openflow-feature`
- `/openflow-feature 为 quality gate 引入 evidence-ledger 机制`
- natural-language follow-up in an active feature session
- AI/tool invocation with no explicit `feature` argument when session context can identify the active feature

Feature identity is an internal implementation concern. User-facing copy may show the derived feature name for traceability, but it must not ask the user to invent or repair the slug.

### 2. Feature Identity Is Derived, Not User-Owned

When a feature identity is needed, OpenFlow should resolve it with this priority order:

1. active feature session bound to the current chat session;
2. explicit AI-provided slug generated from the user's natural-language intent;
3. natural-language command argument converted into a safe derived slug;
4. latest incomplete feature session in `.sisyphus/feature/` when unambiguous;
5. latest relevant design workspace or plan when unambiguous;
6. deterministic fallback slug from the natural-language text, with collision handling.

If multiple plausible active features exist, OpenFlow may ask one disambiguation question. That question should ask which feature idea the user wants to continue, not ask the user to supply a slug.

The internal slug must be filesystem-safe and stable, but it may differ from the user-facing feature title. Documents should preserve both when helpful:

- `featureSlug`: safe internal identifier;
- `featureTitle`: human-readable title inferred from conversation;
- `sourceIntent`: short summary of the natural-language request that produced the identity.

### 3. Sanitization Is Not Intent Extraction

Path sanitization protects storage. It must not be treated as the mechanism for understanding the user's feature idea.

If raw input is not a valid slug, OpenFlow should not fail immediately. It should first treat the input as natural language, infer a title or intent summary, and then create a safe slug. Chinese and mixed-language descriptions must not collapse into an invalid empty string.

The user-facing error “Feature name is too short after sanitization” should not appear for normal `/openflow-feature` usage. If identity cannot be resolved, the recovery message should ask for a short natural-language description, not a feature name.

### 4. Fixed Questions Become Candidate Dimensions

Existing fixed questions can remain useful as candidate dimensions, but they must not define the workflow order or completion condition.

Candidate dimensions may include:

- problem or motivation;
- intended outcome;
- scope boundary;
- observable behavior;
- success criteria;
- constraints;
- assumptions;
- risks;
- next-step handoff.

The assistant should ask about a dimension only when the answer is not inferable and the missing information could change the design.

### 5. Convergence Before Generation

Before entering `design.md` or `behavior.md` generation, OpenFlow must decide whether the discussion is ready to converge.

Default generation is appropriate when the following are basically clear:

1. the problem or improvement target;
2. the rough product/workflow boundary;
3. the user-visible or process-visible result;
4. remaining unknowns can safely be recorded as assumptions rather than blockers.

If any unresolved point would materially change the design direction, OpenFlow should continue with one key question instead of generating final documents.

### 6. Gentle Handling When Not Converged

If the feature is not ready to converge, OpenFlow should not abruptly reject the user. It should explain the gap in plain language and ask one focused question.

If the user says to skip, use judgment, or generate anyway, OpenFlow should respect that instruction and generate a draft marked as:

> **Draft with Assumptions / 带假设的草稿**

Draft assumptions must be clearly separated from confirmed facts and must not be treated as final implementation constraints.

### 7. One Valuable Question At A Time

Follow-up questions are not form fields. They exist only to remove uncertainty that could change the design.

Each follow-up should:

- ask exactly one question;
- briefly explain why the question matters;
- prefer concrete options when helpful;
- allow the user to skip or ask the assistant to assume;
- avoid re-asking questions the user has already rejected.

### 8. User Feedback Controls The Flow

User corrections should immediately change the strategy.

Examples:

- “跳过这个问题” means stop pursuing that question and record an assumption if needed.
- “这个不用问” means do not ask similar low-value questions in the same session.
- “我不想讨论代码层面” means stay at product, workflow, or experience level.
- “你说的我看不懂” means simplify the language and lower the technical abstraction.
- “先生成草稿” means generate `Draft with Assumptions` if convergence is incomplete.

### 9. Documents Use A Two-Layer Structure

Generated documents should first help people understand the shared agreement, then preserve execution constraints.

The top layer should be a human-readable consensus summary:

- why the feature exists;
- what experience or workflow should improve;
- what has been agreed;
- what is currently assumed;
- where to return if the assumptions are wrong.

The lower layer should be an execution constraint list:

- what is in scope;
- what is out of scope;
- required behavior or outcomes;
- success criteria;
- assumptions that are not final constraints;
- when to return to the user for confirmation.

### 10. Behavior Documents Are Scenario-Specific

`behavior.md` is an observable behavior contract, not a rewritten `design.md`.

It should borrow the BDD principle of describing observable behavior, but not force all features into one rigid Given/When/Then template. Commands, hooks, workflows, documentation governance, and error handling have different behavior shapes.

## Document Generation Policy

### design.md

Generate `design.md` when the feature direction is clear enough to summarize intent, boundaries, assumptions, and execution constraints.

If convergence is incomplete but the user asks to proceed, generate `design.md` as `Draft with Assumptions`.

### behavior.md

Generate `behavior.md` when any of the following is true:

- user-visible behavior changes;
- command behavior changes;
- hook or automatic trigger behavior changes;
- agent workflow behavior changes;
- document generation, archive, verification, or governance behavior changes;
- future implementation could easily misunderstand when something should happen.

If behavior is not externally or process-observably changing, `behavior.md` may be omitted or kept short.

## Execution Constraints

- `/openflow-feature` must accept zero arguments when an active session or inferable context exists.
- The assistant must not ask the user to manually provide a feature slug.
- Natural-language command arguments must be treated as intent/description before any slug sanitization failure is surfaced.
- Internal feature slugs must be safe, stable, and collision-aware, while preserving a human-readable feature title in session/doc metadata when available.
- The assistant must not treat fixed-question completion as readiness.
- The assistant must not generate final documents while blocking design-direction gaps remain.
- The assistant may generate `Draft with Assumptions` when the user explicitly wants to proceed despite unresolved gaps.
- The assistant must separate confirmed facts, assumptions, and unresolved risks.
- The assistant must keep the user's requested abstraction level unless the user asks to move deeper.
- The assistant must not turn behavior documents into implementation design.

## Success Criteria

- A user can start `/openflow-feature` without a feature-name argument when the current session or message context identifies the feature idea.
- A user can pass Chinese or mixed natural-language text to `/openflow-feature` without receiving “Feature name is too short after sanitization”.
- Generated documents and session metadata preserve a human-readable feature title or source intent separately from the filesystem-safe slug.
- A clear feature request can produce useful documents without forcing irrelevant questions.
- An unclear feature request causes one meaningful follow-up question instead of automatic document generation.
- A user can skip a question and still receive a draft with assumptions clearly marked.
- `behavior.md` describes observable behavior appropriate to the feature scenario.
- The final response after generation summarizes consensus, assumptions, generated files, and recommended next steps without forcing implementation.

## Handoff Guidance

After document generation, OpenFlow should provide a short next-step summary:

- what was agreed;
- which documents were generated;
- which assumptions remain;
- which constraints future implementation must not violate;
- whether the likely next step is planning, implementation, more clarification, or stopping here.

The assistant should suggest the next step without trapping the user in the feature workflow or pushing implementation prematurely.
