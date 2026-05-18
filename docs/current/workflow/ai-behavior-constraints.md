# AI Behavior Constraints

This document records current AI-facing workflow constraints that are active behavior rules, not architecture decision records.

## AI Reflection Skill

`openflow-ai-reflection` is an AI-callable Skill for recording repeatable AI workflow or process mistakes.

- The AI self-triggers the Skill when a reflection condition is met; users do not normally run a command for it.
- Reflection records are written under `docs/current/workflow/ai-reflection/`.
- The Skill may record lessons and promotion candidates, but it must not automatically edit `AGENTS.md`, ADR files, Skill files, or global workflow rules.
- It is not a slash command, command file, plugin tool, hook, event listener, guardian, or background task.

This Skill is allowed to appear in `<available_skills>` because it is an AI self-governance capability, not a user-facing governance command. ADR-003 still applies to normal OpenFlow commands: interactive commands such as `/openflow-feature` remain command-file driven and must not be registered as Skills.
