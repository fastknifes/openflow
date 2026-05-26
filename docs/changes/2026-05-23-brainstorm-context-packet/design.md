# Brainstorm Context Packet - Design

## Human Consensus Summary

- Feature title: Brainstorm Context Packet
- Internal slug: `brainstorm-context-packet`
- Problem or improvement target: `/openflow-feature` 当前只从固定问题答案生成 `RequirementModel`，没有吸收 `/openflow-brainstorm` 中已经形成的上下文，导致 `design.md` 与 `behavior.md` 遗漏关键约束。
- Expected result: brainstorm 阶段沉淀结构化上下文包，feature 阶段读取、展示并确认上下文后，再注入 `RequirementModel` 生成正式设计文档。

## Identity And Assumptions

- Feature slug: `brainstorm-context-packet`
- This is a workflow enhancement, not a replacement for `/openflow-brainstorm` or `/openflow-feature`.
- `/openflow-brainstorm` remains conversational and does not generate formal design documents.
- `/openflow-feature` remains responsible for formalizing requirements into `design.md` and `behavior.md`.
- Context Packet is intermediate workflow state, not final product/design authority until confirmed during feature design.

## Problem

OpenFlow currently has an information handoff gap:

```text
/openflow-brainstorm
  -> rich discussion, decisions, constraints, trade-offs
  -> no structured handoff artifact

/openflow-feature
  -> reads only fixed question answers
  -> builds RequirementModel from sparse answers
  -> generates shallow design.md / behavior.md
```

Even when the user and AI have already discussed enough context, `/openflow-feature` only captures answers such as `problem`, `scope`, `priority`, and `constraints`. It may read session history for identity inference, but it does not extract decisions, non-goals, risks, or behavior rules into the requirement model.

## Goals

- Preserve key brainstorm outcomes across workflow phases.
- Introduce a structured Brainstorm Context Packet as the handoff layer between brainstorm and feature design.
- Let `/openflow-feature` perform a Context Harvest before generating documents.
- Require user-visible confirmation of harvested context before injecting it into `RequirementModel`.
- Ensure generated `design.md` and `behavior.md` include confirmed decisions, constraints, non-goals, risks, and open questions from brainstorm.
- Keep existing `/openflow-brainstorm` and `/openflow-feature` behaviors compatible for users who do not use context packets.

## Non-Goals

- Do not turn `/openflow-brainstorm` into a formal design document generator.
- Do not make `/openflow-feature` blindly parse the entire chat transcript without a structured handoff.
- Do not require LLM enrichment as a hard dependency for basic feature design.
- Do not auto-run `/openflow-writing-plan` after context harvest.
- Do not treat unconfirmed brainstorm notes as final design authority.

## Proposed Workflow

```text
/openflow-brainstorm
  -> conversational exploration
  -> maintain/update Brainstorm Context Packet

/openflow-feature <feature>
  -> resolve feature identity
  -> find relevant Context Packet(s)
  -> display Context Harvest summary
  -> user confirms / edits / ignores harvested context
  -> inject confirmed context into RequirementModel
  -> generate design.md + behavior.md
```

## Brainstorm Context Packet

The Context Packet should be a structured intermediate artifact containing:

| Field | Purpose |
|---|---|
| `featureHint` | Candidate feature name or topic inferred from brainstorm |
| `problem` | Problem statement discussed during brainstorm |
| `decisions` | Decisions already agreed or strongly preferred |
| `constraints` | Must/should/may constraints discovered in discussion |
| `nonGoals` | Explicitly excluded scope |
| `openQuestions` | Questions still requiring confirmation |
| `risks` | Known implementation/workflow risks |
| `examples` | Concrete examples, incidents, or evidence from discussion |
| `sourceSessionID` | Session where the packet was produced |
| `updatedAt` | Last update timestamp |

Recommended schema constraints:

| Field | Required | Shape |
|---|---:|---|
| `id` | yes | Stable packet id, derived from `{sourceSessionID}-{featureHint}` or a safe slug |
| `version` | yes | Schema version number, initially `1` |
| `featureHint` | yes | Non-empty string used for matching, not final feature authority |
| `problem` | optional | String |
| `decisions` | optional | Array of `{ text, confidence, source }` |
| `constraints` | optional | Array of `{ text, severity, category?, confidence, source }` |
| `nonGoals` | optional | Array of `{ text, source }` |
| `openQuestions` | optional | Array of `{ text, blocking, source }` |
| `risks` | optional | Array of `{ text, mitigation?, source }` |
| `examples` | optional | Array of `{ text, source }` |
| `sourceSessionID` | yes | Session id where the packet was created or last derived |
| `createdAt` | yes | ISO timestamp |
| `updatedAt` | yes | ISO timestamp |

`confidence` should be `high`, `medium`, or `low`. Only high-confidence items may be offered as confirmed candidates by default. Medium/low-confidence items must appear as pending confirmations unless the user explicitly confirms them.

Recommended storage:

```text
.sisyphus/brainstorm/context-packets/{slug-or-session}.json
```

Rationale: the packet is workflow state, not a formal design artifact. It should become design authority only after `/openflow-feature` harvests and confirms it.

Storage and lifecycle decisions:

- The storage path is fixed for the first implementation: `.sisyphus/brainstorm/context-packets/{id}.json`.
- Packet writes are best-effort. If writing fails, brainstorm continues and reports that no packet was saved.
- Malformed packets must be ignored with a warning; they must not block normal feature design.
- Packets older than 7 days are stale by default and require explicit user confirmation before use.
- Packets may be reused across sessions only when the user explicitly selects them during Context Harvest.
- Slug/id collisions are resolved by appending a short stable suffix derived from the source session id.

## Packet Creation Semantics

Recommended behavior:

- `/openflow-brainstorm` may automatically draft or update a packet when the conversation contains stable decisions, constraints, non-goals, risks, or open questions.
- Automatic packet creation does not mean the content is approved design authority.
- A brainstorm response should disclose when a packet was created or updated, but it must not interrupt ordinary brainstorming with a heavy confirmation flow.
- Stable context means the assistant can point to a clear user statement, explicit agreement, or repeated consensus. Tentative exploration remains low/medium confidence.
- Packet updates replace or compact structured fields; they should not append raw transcript indefinitely.

## Context Extraction Rules

The first implementation should use a conservative extraction policy. The goal is not to perfectly summarize the whole conversation; the goal is to preserve stable, implementation-relevant context without turning brainstorm speculation into requirements.

Extraction categories:

| Category | Extract when | Packet target |
|---|---|---|
| Problem | The user states the pain point, failure mode, or desired improvement | `problem` |
| Decision | The user agrees with a proposed direction or repeatedly reinforces a choice | `decisions` |
| Constraint | The user says must / should / should not / keep / avoid / do not break, or the discussion establishes a boundary | `constraints` |
| Non-goal | The user excludes scope or says something should not be part of this feature | `nonGoals` |
| Open question | The discussion identifies an unresolved choice that affects behavior or implementation | `openQuestions` |
| Risk | The discussion identifies likely failure modes, ambiguity, UX risk, compatibility risk, or verification risk | `risks` |
| Example | The user gives a concrete incident, session id, output, file path, or behavior sample | `examples` |

Confidence rules:

| Confidence | Meaning | Default handling |
|---|---|---|
| `high` | Explicit user statement, explicit agreement, or direct correction from the user | Offer as confirmable harvested context |
| `medium` | Strong assistant synthesis that the user did not reject, or repeated but not explicitly confirmed direction | Show as pending confirmation |
| `low` | Speculation, brainstorming option, rejected option, or weak inference from surrounding context | Do not inject; preserve only if useful as an open question or risk |

Source rules:

- Every extracted item must include a `source` string that points to the origin, such as `user statement`, `assistant synthesis accepted by user`, `session:{id}`, or a short excerpt.
- If no source can be identified, the item must not become high confidence.
- Assistant-only suggestions are at most medium confidence unless the user agrees with them.
- User corrections override prior assistant synthesis.

Noise filtering:

- Do not extract generic acknowledgements such as “好”, “继续”, “同意” unless they clearly confirm a immediately preceding design choice.
- Do not extract every alternative discussed during brainstorm; rejected alternatives become risks or non-goals only when still relevant.
- Do not preserve raw transcript chunks as packet fields.
- Do not include implementation tasks, file edits, or test commands unless the user explicitly discussed them as design constraints.

Stability threshold:

- A packet may be created when at least one of the following exists: a concrete problem, a high-confidence decision, a high-confidence constraint, or an open question that affects feature design.
- A packet should not be created for ordinary casual discussion with no reusable design context.

## Feature Context Harvest

When `/openflow-feature` starts or reaches generation readiness, it should:

1. Locate relevant Context Packet(s) by current session, active feature slug, or topic similarity.
2. Render a user-visible Context Harvest summary.
3. Ask the user to confirm one of the following:
   - Use harvested context.
   - Edit/refine harvested context.
   - Ignore harvested context and continue with normal feature questions.
4. Inject only confirmed context into `RequirementModel`.

The harvest summary must be explicit enough that the user can spot missing or hallucinated constraints before document generation.

Confirmation semantics:

- **Use** confirms all displayed high-confidence fields for this feature generation.
- **Edit/refine** confirms the final edited harvest shown to the user. The edited result may update the packet only if the user explicitly chooses to save it; otherwise it is session-local.
- **Ignore** is session-local by default and does not delete or permanently suppress the packet.
- Partial acceptance should be supported at the field-group level: decisions, constraints, non-goals, risks, examples, and open questions can be accepted or excluded independently.
- In non-interactive mode, `/openflow-feature` must show the Context Harvest as text and wait for natural-language confirmation before injecting it. If no confirmation is available, continue without injection or generate a draft with assumptions only when the user explicitly asks to proceed.

Open question handling:

- Blocking open questions prevent final-status design generation unless the user explicitly chooses draft-with-assumptions.
- Non-blocking open questions become `pendingConfirmations`.
- If an open question conflicts with a proposed constraint, the item remains pending and must not become a confirmed constraint.

Multi-packet handling:

- Matching should prefer packets from the current session, then exact `featureHint` / feature slug matches, then topic similarity.
- Multiple high-confidence matches require a user choice.
- Packets must not be silently merged when they contain conflicting problem statements, decisions, or constraints.
- User-approved merging is allowed only after a summary of conflicts is displayed.

## RequirementModel Injection

Confirmed Context Packet data should map into the existing model as follows:

| Context Packet Field | RequirementModel Target |
|---|---|
| `problem` | `problemStatement` and/or `answers.problem` |
| `decisions` | design decisions section or custom constraints |
| `constraints` | `constraints` with severity/category when possible |
| `nonGoals` | `nonGoals` |
| `openQuestions` | `pendingConfirmations` |
| `risks` | `risks` / `risksAndMitigations` |
| `examples` | behavior scenarios or evidence notes |

The implementation should prefer lossless preservation over over-normalization. If a field cannot be confidently categorized, preserve it as a custom constraint or pending confirmation rather than dropping it.

Injection constraints:

- Only confirmed harvest content may be injected.
- Injected constraints must preserve original text and source reference where possible.
- `decisions` without a dedicated model field may be represented as design constraints or a generated design-decisions section, but they must not disappear.
- `examples` should become behavior scenarios only when they describe observable behavior; otherwise preserve them as evidence notes.
- Existing manually answered feature questions remain authoritative when they conflict with packet content, unless the user explicitly chooses the packet value.

## Compatibility Constraints

- Existing feature flows without a Context Packet must behave as before.
- Existing feature session files remain valid.
- Existing `RequirementModel` schema should be extended only if necessary; prefer mapping into existing fields first.
- `/openflow-brainstorm` must remain conversational and lightweight.
- The packet mechanism must not require users to manually copy long summaries into `/openflow-feature`.
- The system must not silently inject unconfirmed brainstorm conclusions into final design docs.

## Failure Mode Constraints

- If packet discovery fails, `/openflow-feature` continues with the existing no-packet flow.
- If packet JSON is invalid, the packet is skipped and the user-visible harvest should mention the skipped invalid packet when appropriate.
- If a packet cannot be written, `/openflow-brainstorm` continues conversationally and reports the save failure.
- If user confirmation is cancelled or unavailable, no packet content is injected.
- If document generation fails after confirmation, the confirmed harvest should remain recoverable for retry.
- Concurrent writes should prefer last-write-wins with updated timestamps for the first implementation; conflict-free merge is out of scope.

## Behavior Alignment

| Behavior Scenario | Design Response | Risk |
|---|---|---|
| A brainstorm discussion reaches useful decisions before `/openflow-feature` starts | Store or update a Context Packet with decisions, constraints, risks, and open questions | Medium |
| `/openflow-feature` starts after brainstorm | Run Context Harvest and show extracted context before generation | Medium |
| User confirms harvested context | Inject confirmed packet fields into `RequirementModel` and generated docs | Medium |
| User rejects or ignores harvested context | Continue with current feature question flow without packet injection | Low |
| Multiple packets match | Ask user to choose or ignore candidates instead of guessing | Medium |
| Packet contains uncertain items | Preserve them as pending confirmations, not confirmed constraints | Medium |

## Success Criteria

- [ ] A brainstorm discussion can produce or update a structured Context Packet.
- [ ] `/openflow-feature` can discover a relevant Context Packet for the current session or feature.
- [ ] `/openflow-feature` displays a Context Harvest summary before document generation.
- [ ] Confirmed packet decisions and constraints appear in `design.md`.
- [ ] Confirmed packet behavior scenarios or examples appear in `behavior.md`.
- [ ] Rejected or ignored packet context is not injected.
- [ ] Existing feature flows without brainstorm context continue to work unchanged.
- [ ] Malformed, stale, or unreadable packets do not block normal `/openflow-feature` operation.
- [ ] Blocking open questions are handled as blockers or draft assumptions, not silently converted into requirements.
- [ ] Multiple matching packets require disambiguation when conflicts exist.
- [ ] Non-interactive Context Harvest does not inject context without explicit confirmation.

## Risks And Mitigations

| Risk | Mitigation |
|---|---|
| AI over-extracts tentative brainstorm ideas as confirmed requirements | Require user confirmation before injection; uncertain items become pending confirmations |
| Packet grows too noisy over long sessions | Store structured fields and support replacement/compaction rather than appending raw transcript |
| Multiple brainstorm topics exist in one session | Match by slug/topic and ask the user to disambiguate |
| Users expect brainstorm to generate formal docs | Keep packet status clearly marked as intermediate workflow state |
| Feature docs still become sparse if no packet exists | Keep existing question flow and allow manual constraints |

## Testing Strategy

- Unit test context packet creation/update from brainstorm-like inputs.
- Unit test feature discovery of matching packets.
- Unit test RequirementModel injection from confirmed packet fields.
- Regression test normal `/openflow-feature` flow without context packets.
- Behavior test that rejected packet context does not appear in generated docs.
