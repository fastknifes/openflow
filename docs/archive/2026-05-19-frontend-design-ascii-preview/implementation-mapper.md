# frontend-design-ascii-preview - Implementation Mapper

**Date**: 2026-05-19
**Status**: Archived

## 1. 概述

本次变更解决了与 `frontend-design-ascii-preview` 相关的实现追溯需求。

**归档时间**: 2026-05-19
**追溯范围**: 本次变更覆盖需求到实现的完整追溯链。

## 2. 需求到实现映射

> 未发现 requirements / proposal 追溯项，已回退使用 design 文档生成追溯关系。

| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |
|----------|-----------|----------|----------|----------|----------|
| design: docs/changes/frontend-design-ascii-preview/design.md → Scope | In scope: src/phases/feature/design-renderer.ts 的前端需求识别与 ASCII 预览渲染。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Scope | In scope: tests/phases/feature/design-renderer.test.ts 的前端/非前端覆盖。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Scope | Out of scope: 修改 OpenFlow command 注册方式或交互式 /openflow-feature 状态机。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Design Constraints | \[must\] 预览必须由 renderer 生成，保证所有 feature 文档生成路径行为一致。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Design Constraints | \[must\] 非前端需求不能出现 \#\# UI / Interaction ASCII Preview，避免污染后端/流程类设计文档。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Design Constraints | \[should\] ASCII 预览应包含页面结构、主要动作和交互反馈路径，供用户实现前确认。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Success Criteria | \[ \] 前端需求生成的 design.md 包含 ASCII 页面与交互预览。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Success Criteria | \[ \] 非前端需求生成的 design.md 不包含该预览段落。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Success Criteria | \[ \] renderer 单测、typecheck、build 通过。 | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Verification | npx bun test tests/phases/feature/design-renderer.test.ts | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Verification | rtk npm build | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |
| design: docs/changes/frontend-design-ascii-preview/design.md → Verification | openflow-quality-gate frontend-design-ascii-preview | F:/ai-code/openflow/src/hooks/chat-message.ts; F:/ai-code/openflow/src/utils/acceptance-state.ts | file-level fallback | F:/ai-code/openflow/src/hooks/chat-message.ts \(modified\); F:/ai-code/openflow/src/utils/acceptance-state.ts \(modified\) | no verification evidence recorded |


## 3. 验证与结论

**验证证据**: no verification evidence recorded


