# Brainstorm Context Packet - Observable Behavior

## Human Consensus Summary

- Feature title: Brainstorm Context Packet
- Internal slug: `brainstorm-context-packet`
- Problem statement: `/openflow-feature` must not lose constraints and decisions already developed during `/openflow-brainstorm`.
- Consensus: introduce a structured Context Packet produced by brainstorm and harvested by feature before generating formal design documents.

## User Context

Users often explore a complex workflow through `/openflow-brainstorm` before formalizing it with `/openflow-feature`. The brainstorm conversation may already include decisions, constraints, trade-offs, examples, risks, and non-goals. Without a handoff mechanism, `/openflow-feature` asks sparse fixed questions and generates shallow documents that omit the discussion context.

## Trigger Rules

The behavior applies when:

- A user runs `/openflow-brainstorm` and the discussion produces reusable design context.
- A user later runs `/openflow-feature` in the same session or for a related feature.
- A Brainstorm Context Packet exists for the current session, feature slug, or related topic.
- The user wants feature design docs to include previously discussed decisions and constraints.

## Non-Trigger Rules

The behavior does not apply when:

- No Context Packet exists and no relevant brainstorm context can be found.
- The user explicitly chooses to ignore harvested context.
- The discussion is still exploratory and has not produced stable decisions or constraints.
- The user is only asking for a lightweight brainstorm response and has not entered feature design.

## User-Visible Scenarios

### Scenario 1: Brainstorm captures reusable context

**Given:**
- The user discusses a workflow improvement in `/openflow-brainstorm`.
- The discussion reaches concrete decisions, constraints, or open questions.

**When:**
- The brainstorm phase identifies stable context worth preserving.

**Then:**
- OpenFlow records a Brainstorm Context Packet as intermediate workflow state.
- The packet includes problem, decisions, constraints, non-goals, risks, open questions, and examples when available.
- Each extracted item has a confidence level and source reference.
- The user is not told that formal design docs have been generated.

### Scenario 1a: Brainstorm discussion is too weak to create a packet

**Given:**
- The user is casually exploring an idea.
- The discussion has no concrete problem, decision, constraint, risk, example, or open question.

**When:**
- Brainstorm handling completes.

**Then:**
- OpenFlow does not create a Context Packet.
- The conversation continues normally.
- The user is not forced into feature design.

### Scenario 1b: Assistant proposes an option but user has not confirmed it

**Given:**
- The assistant proposes a possible direction during brainstorm.
- The user has not agreed, corrected, or selected that direction.

**When:**
- OpenFlow updates the Context Packet.

**Then:**
- The proposed direction is not stored as a high-confidence decision.
- It may be stored as medium confidence pending confirmation or omitted if it is not useful.

### Scenario 2: Feature harvests brainstorm context

**Given:**
- A relevant Brainstorm Context Packet exists.
- The user starts `/openflow-feature brainstorm-context-packet` or an equivalent feature request.

**When:**
- `/openflow-feature` resolves the feature identity.

**Then:**
- OpenFlow displays a Context Harvest summary before generating `design.md` and `behavior.md`.
- The summary lists harvested decisions, constraints, non-goals, risks, and pending confirmations.
- The user can confirm, refine, or ignore the harvested context.

### Scenario 3: User confirms harvested context

**Given:**
- `/openflow-feature` displays harvested brainstorm context.
- The user confirms it should be used.

**When:**
- OpenFlow builds the `RequirementModel`.

**Then:**
- Confirmed decisions and constraints are injected into the model.
- Generated `design.md` includes the confirmed design decisions, constraints, non-goals, and risks.
- Generated `behavior.md` includes observable scenarios and verification mapping derived from the confirmed context.

### Scenario 3a: User partially accepts harvested context

**Given:**
- `/openflow-feature` displays harvested decisions, constraints, non-goals, risks, examples, and open questions.

**When:**
- The user accepts only some field groups, such as constraints but not decisions.

**Then:**
- Only accepted field groups are injected into `RequirementModel`.
- Excluded field groups do not appear as confirmed design authority.
- The generated documents show only the accepted context plus ordinary feature answers.

### Scenario 4: User ignores harvested context

**Given:**
- `/openflow-feature` finds a relevant Context Packet.
- The user chooses to ignore it.

**When:**
- OpenFlow continues the feature design flow.

**Then:**
- No Context Packet content is injected into `RequirementModel`.
- The existing fixed-question flow continues unchanged.
- The generated documents reflect only confirmed answers from the feature flow.
- The packet remains available for future explicit selection unless the user deletes or supersedes it.

### Scenario 5: Harvested context contains uncertainty

**Given:**
- The Context Packet contains tentative ideas or unresolved questions.

**When:**
- `/openflow-feature` prepares the harvest summary.

**Then:**
- Uncertain items are marked as pending confirmations or open questions.
- They are not treated as confirmed constraints unless the user confirms them.
- Blocking open questions prevent final generation unless the user explicitly chooses draft-with-assumptions.

### Scenario 5a: User correction overrides prior extracted context

**Given:**
- A Context Packet contains an assistant-synthesized decision or constraint.
- The user later corrects or narrows that point.

**When:**
- The packet is updated or harvested.

**Then:**
- The user correction takes precedence.
- The prior extracted item is updated, downgraded, or moved to non-goal/risk as appropriate.
- The generated documents must not preserve the superseded interpretation as confirmed authority.

### Scenario 6: Multiple context packets match

**Given:**
- More than one Context Packet could match the current feature.

**When:**
- `/openflow-feature` attempts Context Harvest.

**Then:**
- OpenFlow asks the user to choose the relevant packet or ignore all candidates.
- It does not silently merge unrelated brainstorm topics.

### Scenario 7: Packet is stale, malformed, or unreadable

**Given:**
- `/openflow-feature` discovers a candidate packet.
- The packet is stale, malformed, unreadable, or fails schema validation.

**When:**
- Context Harvest runs.

**Then:**
- OpenFlow does not inject the packet.
- Normal feature design continues.
- The user is warned when the skipped packet is relevant to the current feature.

### Scenario 8: Non-interactive harvest fallback

**Given:**
- A relevant packet exists.
- The question picker or confirmation UI is unavailable.

**When:**
- `/openflow-feature` reaches Context Harvest.

**Then:**
- OpenFlow prints the harvest summary as text.
- No packet content is injected until the user confirms in natural language.
- If the user asks to proceed without confirmation, generated docs mark packet-derived assumptions separately or omit packet content.

### Scenario 9: Brainstorm packet write fails

**Given:**
- `/openflow-brainstorm` identifies stable reusable context.
- Writing the packet fails because of permissions, missing directories, or filesystem errors.

**When:**
- The brainstorm response completes.

**Then:**
- The conversation continues normally.
- The user is told that the packet was not saved.
- No formal design document is implied or generated.

## Required Content

A successful implementation must make the following user-visible behavior possible:

- A Brainstorm Context Packet can preserve discussion outcomes without becoming a formal design document.
- `/openflow-feature` can discover relevant packet context.
- `/openflow-feature` presents a Context Harvest summary before generation.
- The user can confirm, refine, or ignore harvested context.
- Confirmed context is visible in generated `design.md` and `behavior.md`.
- Unconfirmed context remains pending or excluded.
- Packet schema includes id, version, source session, timestamps, confidence, and source references.
- Use/edit/ignore semantics are visible and predictable.
- Stale, malformed, unreadable, or conflicting packets fail safe.
- Extraction rules distinguish explicit user statements, accepted assistant synthesis, tentative options, rejected options, and generic acknowledgements.
- Generic acknowledgements are only treated as confirmation when tied to a specific immediately preceding design choice.

## Success Responses

**Success:** After a brainstorm discussion, OpenFlow can preserve the key context in a structured packet.

**Success:** When `/openflow-feature` runs later, the user sees the harvested context before document generation.

**Success:** Generated design and behavior documents include the brainstorm decisions and constraints after user confirmation.

## Must Not Behavior

The following outcomes must not occur:

- `/openflow-feature` must not blindly parse and inject the entire chat transcript without a structured packet or user confirmation.
- `/openflow-brainstorm` must not become a formal design document generator.
- Tentative brainstorm ideas must not be treated as confirmed requirements without user confirmation.
- Unrelated context packets must not be silently merged into the current feature.
- Existing feature design flows must not break when no Context Packet exists.
- The system must not require the user to manually copy long brainstorm summaries into `/openflow-feature`.
- Ignore must not permanently delete or suppress a packet unless the user explicitly requests deletion.
- Edit must not silently rewrite saved packet state unless the user chooses to save the edited harvest.
- Open questions must not silently become confirmed requirements.
- Assistant-only speculation must not become a high-confidence decision.
- Generic agreement words must not confirm unrelated earlier context.
- Raw transcript chunks must not be stored as packet fields in place of structured extracted items.

## Acceptance / Verification Mapping

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---|---|---|---|---|
| Brainstorm context can be preserved as intermediate workflow state | Scenario 1 | unit / integration | A packet exists with structured fields after brainstorm context is captured | pending |
| Feature can find and display harvested context | Scenario 2 | integration | `/openflow-feature` shows Context Harvest summary before generation | pending |
| Confirmed context is injected into RequirementModel | Scenario 3 | unit | Generated model contains packet-derived constraints and decisions | pending |
| Confirmed context appears in design and behavior docs | Scenario 3 | integration | `design.md` and `behavior.md` contain packet-derived decisions/scenarios | pending |
| Ignored context is not injected | Scenario 4 | regression | Generated docs omit ignored packet fields | pending |
| Uncertain context remains pending | Scenario 5 | unit | Tentative packet items become pending confirmations, not must constraints | pending |
| Multiple matching packets require disambiguation | Scenario 6 | integration | User is asked to choose or ignore candidate packets | pending |
| Existing feature flow remains compatible | Non-trigger rules | regression | Feature design works unchanged without any context packet | pending |
| Partial acceptance injects only accepted fields | Scenario 3a | integration | Accepted groups appear in docs; rejected groups do not | pending |
| Stale/malformed/unreadable packet fails safe | Scenario 7 | regression | Feature flow continues and packet content is not injected | pending |
| Non-interactive harvest requires confirmation | Scenario 8 | integration | Text harvest appears; docs do not include packet content before confirmation | pending |
| Packet write failure does not block brainstorm | Scenario 9 | regression | Brainstorm response completes and reports save failure | pending |
| Blocking open questions do not become requirements | Scenario 5 | unit | Blocking questions remain blockers or draft assumptions | pending |
| Weak brainstorm does not create packet | Scenario 1a | unit | No packet is written when no reusable design context exists | pending |
| Assistant-only proposal is not high confidence | Scenario 1b | unit | Unconfirmed assistant proposal becomes pending/medium or omitted | pending |
| User correction overrides extracted context | Scenario 5a | regression | Superseded extracted item is not injected as confirmed authority | pending |
| Generic acknowledgements require local context | Required Content | unit | “好/继续/同意” only confirms immediately preceding explicit choice | pending |
