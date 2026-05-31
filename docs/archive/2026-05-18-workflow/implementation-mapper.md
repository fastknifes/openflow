# workflow - Implementation Mapper

**Date**: 2026-05-18
**Status**: Archived

## 1. 概述

本次变更解决了与 `workflow` 相关的实现追溯需求。

**归档时间**: 2026-05-18
**追溯范围**: 本次变更覆盖需求到实现的完整追溯链。

## 2. 需求到实现映射

> 未发现 requirements / proposal 追溯项，已回退使用 design 文档生成追溯关系。

| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |
|----------|-----------|----------|----------|----------|----------|
| design: docs/changes/workflow/design.md → Design | Persist issue state as issue-packet.json inside the issue workspace. | F:/ai-code/openflow/src/commands/init-content.ts; F:/ai-code/openflow/src/skills/quality-gate-skill.ts; F:/ai-code/openflow/src/skills/ai-reflection-skill.ts | file-level fallback | F:/ai-code/openflow/src/commands/init-content.ts \(created\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\); F:/ai-code/openflow/src/skills/ai-reflection-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Design | Render markdown as a projection of the packet, not the source of truth. | F:/ai-code/openflow/src/commands/init-content.ts; F:/ai-code/openflow/src/skills/quality-gate-skill.ts; F:/ai-code/openflow/src/skills/ai-reflection-skill.ts | file-level fallback | F:/ai-code/openflow/src/commands/init-content.ts \(created\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\); F:/ai-code/openflow/src/skills/ai-reflection-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Design | Keep investigation read-only by default until classification exists. | F:/ai-code/openflow/src/commands/init-content.ts; F:/ai-code/openflow/src/skills/quality-gate-skill.ts; F:/ai-code/openflow/src/skills/ai-reflection-skill.ts | file-level fallback | F:/ai-code/openflow/src/commands/init-content.ts \(created\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\); F:/ai-code/openflow/src/skills/ai-reflection-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Design | Treat --resolve as a gated record step, not a shortcut that assumes bugfix. | F:/ai-code/openflow/src/commands/init-content.ts; F:/ai-code/openflow/src/skills/quality-gate-skill.ts; F:/ai-code/openflow/src/skills/ai-reflection-skill.ts | file-level fallback | F:/ai-code/openflow/src/commands/init-content.ts \(created\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\); F:/ai-code/openflow/src/skills/ai-reflection-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Design | Do not automatically archive; archive remains a separate authority boundary after readiness. | F:/ai-code/openflow/src/commands/archive.ts | file-level fallback | F:/ai-code/openflow/src/commands/archive.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Files | src/types.ts | F:/ai-code/openflow/src/commands/init-content.ts; F:/ai-code/openflow/src/skills/quality-gate-skill.ts; F:/ai-code/openflow/src/skills/ai-reflection-skill.ts | file-level fallback | F:/ai-code/openflow/src/commands/init-content.ts \(created\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\); F:/ai-code/openflow/src/skills/ai-reflection-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Files | src/utils/issue-utils.ts | F:/ai-code/openflow/tests/utils/init-content.test.ts; F:/ai-code/openflow/src/commands/init-content.ts; F:/ai-code/openflow/src/skills/quality-gate-skill.ts | file-level fallback | F:/ai-code/openflow/tests/utils/init-content.test.ts \(modified\); F:/ai-code/openflow/src/commands/init-content.ts \(created\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Files | src/commands/issue.ts | F:/ai-code/openflow/src/commands/init-content.ts; F:/ai-code/openflow/src/commands/archive.ts; F:/ai-code/openflow/src/skills/quality-gate-skill.ts | file-level fallback | F:/ai-code/openflow/src/commands/init-content.ts \(created\); F:/ai-code/openflow/src/commands/archive.ts \(modified\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Files | src/skills/issue-skill.ts | F:/ai-code/openflow/src/skills/quality-gate-skill.ts; F:/ai-code/openflow/src/skills/ai-reflection-skill.ts; F:/ai-code/openflow/tests/skills/registration.test.ts | file-level fallback | F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\); F:/ai-code/openflow/src/skills/ai-reflection-skill.ts \(modified\); F:/ai-code/openflow/tests/skills/registration.test.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Files | src/skills/registry.ts | F:/ai-code/openflow/src/skills/quality-gate-skill.ts; F:/ai-code/openflow/src/skills/ai-reflection-skill.ts; F:/ai-code/openflow/src/commands/init-content.ts | file-level fallback | F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\); F:/ai-code/openflow/src/skills/ai-reflection-skill.ts \(modified\); F:/ai-code/openflow/src/commands/init-content.ts \(created\) | no verification evidence recorded |
| design: docs/changes/workflow/design.md → Files | src/commands/manifest.ts | F:/ai-code/openflow/src/commands/init-content.ts; F:/ai-code/openflow/src/commands/archive.ts; F:/ai-code/openflow/src/skills/quality-gate-skill.ts | file-level fallback | F:/ai-code/openflow/src/commands/init-content.ts \(created\); F:/ai-code/openflow/src/commands/archive.ts \(modified\); F:/ai-code/openflow/src/skills/quality-gate-skill.ts \(modified\) | no verification evidence recorded |


## 3. 行为到实现映射

No behavior scenarios found.


## 4. 验证与结论

**验证证据**: no verification evidence recorded


