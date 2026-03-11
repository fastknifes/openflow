# OpenFlow Plugin Implementation Plan

## TL;DR

> **Quick Summary**: 实现 OpenFlow 插件，提供从需求到归档的完整开发工作流增强。包括 Brainstorming 自动触发、Prometheus 计划增强（TDD 展开 + 验证任务）、变更追踪、以及归档功能。
> 
> **Deliverables**:
> - 完整的 OpenFlow 插件 (`src/index.ts`)
> - 配置管理系统（从 opencode.json 读取）
> - 3 个 Skills（brainstorm, verify, archive）
> - 3 个 Hooks（chat.message, tool.execute.before, tool.execute.after）
> - 1 个自定义 Tool（openflow）
> - 工具函数（变更追踪、构建清理）
> - 文档模板
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: Phase 1 → Phase 3 → Phase 4 → Phase 5

---

## Context

### Original Request
基于 SRS 文档 (`docs/srs/index.md`) 实现 OpenFlow 插件，整合 oh-my-openagent、Superpowers、OpenSpec 的最佳实践。

### Key Decisions (from Brainstorming)
- **Sisyphus 验证指令**: skill + hook 注入组合
- **Brainstorming 触发**: 前置增强（chat.message hook）
- **配置位置**: opencode.json 的 openflow 字段
- **变更追踪路径**: .sisyphus/builds/{id}/changes.json（自动清理）
- **Archive 触发**: openflow tool + archive skill
- **Skills 存放**: 插件内嵌 + 动态注册

### Dependencies
- `@opencode-ai/plugin` - OpenCode 插件 API
- `oh-my-openagent` - 伴生插件（不修改源码）

---

## Work Objectives

### Core Objective
实现一个完整的 OpenCode 插件，提供 4 阶段开发工作流增强。

### Concrete Deliverables
- `src/index.ts` - 插件入口
- `src/config.ts` - 配置管理
- `src/hooks/chat-message.ts` - Brainstorming 触发
- `src/hooks/tool-before.ts` - 验证任务指令注入
- `src/hooks/tool-after.ts` - 计划增强 + 变更追踪
- `src/skills/brainstorm.ts` - Brainstorming skill
- `src/skills/verify.ts` - 验证 skill
- `src/skills/archive.ts` - Archive skill
- `src/tools/openflow-tool.ts` - openflow 命令工具
- `src/utils/file-tracker.ts` - 变更追踪
- `src/utils/build-cleaner.ts` - 构建清理
- `templates/` - 文档模板

### Definition of Done
- [ ] 插件可被 OpenCode 正确加载
- [ ] 配置从 opencode.json 正确读取
- [ ] Brainstorming 在检测到新需求时触发
- [ ] Prometheus 计划被正确增强（TDD + 验证任务）
- [ ] 变更被正确追踪到 .sisyphus/builds/
- [ ] Archive 生成完整的 SRS 文档
- [ ] 构建完成后自动清理临时文件

### Must Have
- 不修改 oh-my-openagent 源码
- 配置放在 opencode.json
- 变更追踪路径在 .sisyphus/builds/

### Must NOT Have (Guardrails)
- 不创建独立的配置文件 (.opencode/openflow.json)
- 不在项目根目录创建额外的隐藏目录
- 不保留过期的构建数据（及时清理）

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Start Immediately — 基础架构):
├── Task 1: 项目初始化 (package.json, tsconfig.json) [quick]
├── Task 2: 插件入口骨架 (src/index.ts) [quick]
├── Task 3: 配置管理系统 (src/config.ts) [quick]
├── Task 4: TypeScript 类型定义 (src/types.ts) [quick]
└── Task 5: Skills 注册系统 (src/skills/index.ts) [quick]

Wave 2 (After Wave 1 — 核心 Hooks):
├── Task 6: chat.message Hook (src/hooks/chat-message.ts) [deep]
├── Task 7: tool.execute.before Hook (src/hooks/tool-before.ts) [deep]
├── Task 8: tool.execute.after Hook (src/hooks/tool-after.ts) [deep]
├── Task 9: 计划解析器 (src/phases/plan-enhancer/parser.ts) [quick]
└── Task 10: 计划增强器 (src/phases/plan-enhancer/index.ts) [deep]

Wave 3 (After Wave 2 — Skills & Tools):
├── Task 11: Brainstorming Skill (src/skills/brainstorm.ts) [deep]
├── Task 12: Verify Skill (src/skills/verify.ts) [deep]
├── Task 13: Archive Skill (src/skills/archive.ts) [deep]
├── Task 14: OpenFlow Tool (src/tools/openflow-tool.ts) [quick]
├── Task 15: 变更追踪器 (src/utils/file-tracker.ts) [quick]
└── Task 16: 构建清理器 (src/utils/build-cleaner.ts) [quick]

Wave 4 (After Wave 3 — 模板 & 集成):
├── Task 17: 设计文档模板 (templates/design/) [quick]
├── Task 18: SRS 模板 (templates/srs/) [quick]
├── Task 19: 归档生成器 (src/phases/archive/) [deep]
├── Task 20: 集成测试 [deep]
└── Task 21: 文档完善 [writing]

Critical Path: Task 1 → Task 6 → Task 11 → Task 19
Parallel Speedup: ~60% faster than sequential
```

---

## TODOs

### Wave 1: 基础架构

- [ ] 1. **项目初始化**

  **What to do**:
  - 创建 `package.json` (name, version, main, dependencies, scripts)
  - 创建 `tsconfig.json` (ESM, strict, outDir)
  - 配置 `@opencode-ai/plugin` 依赖
  - 设置构建脚本

  **Must NOT do**:
  - 不添加不必要的依赖
  - 不使用 CommonJS

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: Task 2, 3, 4, 5

  **Acceptance Criteria**:
  - [ ] `bun install` 成功
  - [ ] `bun run build` 成功
  - [ ] 类型定义可导入

  **Commit**: YES
  - Message: `chore: initialize openflow plugin project`
  - Files: `package.json, tsconfig.json`

---

- [ ] 2. **插件入口骨架**

  **What to do**:
  - 创建 `src/index.ts`
  - 导出 `OpenFlowPlugin` 函数
  - 定义基础 Hooks 结构（空实现）
  - 导出类型定义

  **References**:
  - `F:\ai-code\opencode\packages\plugin\src\index.ts` - Plugin 类型
  - `F:\ai-code\oh-my-openagent\src\plugin-interface.ts` - 参考实现

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 3, 4, 5 after Task 1)
  - **Parallel Group**: Wave 1

  **Acceptance Criteria**:
  - [ ] 导出符合 Plugin 类型的函数
  - [ ] 构建无错误

  **Commit**: YES
  - Message: `feat: add plugin entry point skeleton`

---

- [ ] 3. **配置管理系统**

  **What to do**:
  - 创建 `src/config.ts`
  - 定义 `OpenFlowConfig` 接口
  - 实现 `loadConfig()` 从 opencode.json 读取 `openflow` 字段
  - 实现默认配置合并
  - 支持项目级 + 用户级配置合并

  **References**:
  - `F:\ai-code\oh-my-openagent\src\plugin-config.ts` - 配置加载参考

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)

  **Acceptance Criteria**:
  - [ ] 正确读取 opencode.json
  - [ ] 默认值正确合并
  - [ ] 配置变更不需要重启

  **Commit**: YES
  - Message: `feat: add configuration management`

---

- [ ] 4. **TypeScript 类型定义**

  **What to do**:
  - 创建 `src/types.ts`
  - 定义 `OpenFlowConfig` 接口
  - 定义 `BuildMetadata` 接口
  - 定义 `ChangeRecord` 接口
  - 定义 `PlanEnhancement` 接口
  - 导出所有公共类型

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)

  **Acceptance Criteria**:
  - [ ] 类型定义完整
  - [ ] 导出正确

  **Commit**: YES
  - Message: `feat: add type definitions`

---

- [ ] 5. **Skills 注册系统**

  **What to do**:
  - 创建 `src/skills/index.ts`
  - 实现 `registerSkills()` 函数
  - 动态生成 SKILL.md 文件到 `.opencode/skills/openflow/`
  - 支持 skill 热更新

  **References**:
  - `F:\ai-code\oh-my-openagent\src\features\opencode-skill-loader\loader.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 1)

  **Acceptance Criteria**:
  - [ ] Skills 正确注册到 .opencode/skills/openflow/
  - [ ] skill tool 可以调用

  **Commit**: YES
  - Message: `feat: add skills registration system`

---

### Wave 2: 核心 Hooks

- [ ] 6. **chat.message Hook (Brainstorming 触发)**

  **What to do**:
  - 创建 `src/hooks/chat-message.ts`
  - 实现新需求检测逻辑
  - 检测关键词："实现"、"添加"、"创建" + 名词
  - 检查 `docs/design/{feature}/` 是否存在
  - 检查 `.sisyphus/plans/{feature}.md` 是否存在
  - 如果是新需求，提示用户是否进行 Brainstorming
  - 如果用户确认，调用 `brainstorm` skill

  **Must NOT do**:
  - 不阻止用户继续对话
  - 不强制触发 Brainstorming

  **References**:
  - `F:\ai-code\oh-my-openagent\src\plugin\tool-execute-after.ts` - Hook 模式

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 7, 8, 9, 10)
  - **Parallel Group**: Wave 2
  - **Blocked By**: Wave 1

  **Acceptance Criteria**:
  - [ ] 新需求被正确检测
  - [ ] 已有计划时跳过
  - [ ] 用户确认后才触发 Brainstorming

  **Commit**: YES
  - Message: `feat: add chat.message hook for brainstorming trigger`

---

- [ ] 7. **tool.execute.before Hook (验证指令注入)**

  **What to do**:
  - 创建 `src/hooks/tool-before.ts`
  - 检测 Sisyphus agent 是否在执行验证任务
  - 注入 `openflow-verify` skill 内容
  - 注入验证检查清单（Security + Quality）

  **References**:
  - `F:\ai-code\oh-my-openagent\src\hooks\prometheus-md-only\hook.ts` - 参考模式

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)

  **Acceptance Criteria**:
  - [ ] 验证任务时正确注入指令
  - [ ] 不影响其他任务

  **Commit**: YES
  - Message: `feat: add tool.execute.before hook for verification injection`

---

- [ ] 8. **tool.execute.after Hook (计划增强 + 变更追踪)**

  **What to do**:
  - 创建 `src/hooks/tool-after.ts`
  - 检测 Write/Edit 工具执行
  - 检测路径是否匹配 `.sisyphus/plans/*.md`
  - 如果是计划文件：
    - 读取计划内容
    - 调用计划增强器
    - 重写增强后的计划
  - 如果是其他文件：
    - 记录变更到 `.sisyphus/builds/{id}/changes.json`

  **References**:
  - `F:\ai-code\oh-my-openagent\src\hooks\prometheus-md-only\path-policy.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)

  **Acceptance Criteria**:
  - [ ] Prometheus 计划被正确增强
  - [ ] 变更被正确追踪
  - [ ] 不影响其他工具执行

  **Commit**: YES
  - Message: `feat: add tool.execute.after hook for plan enhancement and change tracking`

---

- [ ] 9. **计划解析器**

  **What to do**:
  - 创建 `src/phases/plan-enhancer/parser.ts`
  - 解析 Prometheus 计划 Markdown
  - 提取 TODOs section
  - 识别任务类型（实现任务 vs 验证任务）
  - 提取任务依赖关系

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)

  **Acceptance Criteria**:
  - [ ] 正确解析计划结构
  - [ ] 提取所有 TODOs

  **Commit**: YES
  - Message: `feat: add plan parser`

---

- [ ] 10. **计划增强器**

  **What to do**:
  - 创建 `src/phases/plan-enhancer/index.ts`
  - 实现 TDD 任务展开：
    - 每个实现任务 → Red + Green + Refactor 3 子任务
  - 实现验证任务注入：
    - Security Check (secret scan, vuln check)
    - Quality Check (lint, typecheck, test)
  - 保持原有计划结构
  - 增强部分用注释标记

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 2)
  - **Blocked By**: Task 9

  **Acceptance Criteria**:
  - [ ] TDD 任务正确展开
  - [ ] 验证任务正确添加
  - [ ] 原计划结构保持

  **Commit**: YES
  - Message: `feat: add plan enhancer with TDD expansion and verification tasks`

---

### Wave 3: Skills & Tools

- [ ] 11. **Brainstorming Skill**

  **What to do**:
  - 创建 `src/skills/brainstorm.ts`
  - 实现 SKILL.md 内容生成
  - 包含 Socratic 提问流程
  - 包含 2-3 方案生成指南
  - 包含设计文档输出格式

  **References**:
  - `F:\ai-code\superpowers\skills\brainstorming\SKILL.md`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (with Task 12, 13, 14, 15, 16)
  - **Parallel Group**: Wave 3
  - **Blocked By**: Wave 2

  **Acceptance Criteria**:
  - [ ] Skill 内容完整
  - [ ] 正确注册到 .opencode/skills/openflow/

  **Commit**: YES
  - Message: `feat: add brainstorming skill`

---

- [ ] 12. **Verify Skill**

  **What to do**:
  - 创建 `src/skills/verify.ts`
  - 实现 Security Check 指南：
    - Secret scan (trufflehog/gitleaks/正则)
    - Vulnerability check (npm audit/snyk)
  - 实现 Quality Check 指南：
    - Lint (ESLint/Ruff/golangci-lint)
    - Type check (tsc/mypy)
    - Test run (jest/pytest/go test)
  - 自动检测项目技术栈

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)

  **Acceptance Criteria**:
  - [ ] 验证步骤完整
  - [ ] 技术栈自动检测

  **Commit**: YES
  - Message: `feat: add verify skill`

---

- [ ] 13. **Archive Skill**

  **What to do**:
  - 创建 `src/skills/archive.ts`
  - 实现归档流程：
    1. 检查任务完成状态
    2. 收集所有相关文档
    3. 生成功能↔代码映射
    4. 生成功能↔测试映射
    5. 打包到 `docs/archive/{feature}/`
  - 参考 OpenSpec 的 archive-change.ts

  **References**:
  - `F:\ai-code\openspec\src\core\templates\workflows\archive-change.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)

  **Acceptance Criteria**:
  - [ ] 归档流程完整
  - [ ] SRS 文档正确生成

  **Commit**: YES
  - Message: `feat: add archive skill`

---

- [ ] 14. **OpenFlow Tool**

  **What to do**:
  - 创建 `src/tools/openflow-tool.ts`
  - 使用 `tool()` 辅助函数
  - 支持 actions: archive, status, config
  - archive: 触发归档流程
  - status: 显示当前 OpenFlow 状态
  - config: 显示/修改配置

  **References**:
  - `F:\ai-code\opencode\packages\plugin\src\tool.ts`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)

  **Acceptance Criteria**:
  - [ ] Tool 正确注册
  - [ ] 所有 actions 可用

  **Commit**: YES
  - Message: `feat: add openflow custom tool`

---

- [ ] 15. **变更追踪器**

  **What to do**:
  - 创建 `src/utils/file-tracker.ts`
  - 实现 `trackChange()` 函数
  - 记录到 `.sisyphus/builds/{id}/changes.json`
  - 支持增量和覆盖模式
  - build-id 生成策略（时间戳或 plan name）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)

  **Acceptance Criteria**:
  - [ ] 变更正确记录
  - [ ] 路径正确

  **Commit**: YES
  - Message: `feat: add file change tracker`

---

- [ ] 16. **构建清理器**

  **What to do**:
  - 创建 `src/utils/build-cleaner.ts`
  - 实现 `cleanBuild()` 函数
  - 在任务完成时自动调用
  - 删除 `.sisyphus/builds/{id}/` 目录
  - 保留必要的元数据（可选）

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 3)

  **Acceptance Criteria**:
  - [ ] 构建目录正确清理
  - [ ] 不产生垃圾文件

  **Commit**: YES
  - Message: `feat: add build cleaner`

---

### Wave 4: 模板 & 集成

- [ ] 17. **设计文档模板**

  **What to do**:
  - 创建 `templates/design/proposal.md`
  - 创建 `templates/design/design.md`
  - 创建 `templates/design/decisions.md`
  - 使用 Mustache/HANDLEBARS 变量

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)
  - **Blocked By**: Wave 3

  **Acceptance Criteria**:
  - [ ] 模板格式正确
  - [ ] 变量可替换

  **Commit**: YES
  - Message: `feat: add design document templates`

---

- [ ] 18. **SRS 模板**

  **What to do**:
  - 创建 `templates/srs/index.md`
  - 创建 `templates/srs/requirements.md`
  - 创建 `templates/srs/code-mapping.md`
  - 创建 `templates/srs/test-mapping.md`

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)

  **Acceptance Criteria**:
  - [ ] SRS 模板完整

  **Commit**: YES
  - Message: `feat: add SRS templates`

---

- [ ] 19. **归档生成器**

  **What to do**:
  - 创建 `src/phases/archive/index.ts`
  - 创建 `src/phases/archive/srs-generator.ts`
  - 创建 `src/phases/archive/code-mapper.ts`
  - 实现完整的归档流程
  - 生成功能↔代码映射表
  - 生成功能↔测试映射表

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES (Wave 4)

  **Acceptance Criteria**:
  - [ ] 归档流程完整
  - [ ] 映射表正确生成

  **Commit**: YES
  - Message: `feat: add archive generator with SRS and code mapping`

---

- [ ] 20. **集成测试**

  **What to do**:
  - 测试 Brainstorming 触发
  - 测试计划增强
  - 测试变更追踪
  - 测试归档流程
  - 端到端测试

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final)
  - **Blocked By**: All previous tasks

  **Acceptance Criteria**:
  - [ ] 所有功能正常工作
  - [ ] 无回归问题

  **Commit**: YES
  - Message: `test: add integration tests`

---

- [ ] 21. **文档完善**

  **What to do**:
  - 更新 README.md
  - 添加使用指南
  - 添加配置说明
  - 添加 API 文档

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO (final)

  **Acceptance Criteria**:
  - [ ] 文档完整
  - [ ] 示例可运行

  **Commit**: YES
  - Message: `docs: complete documentation`

---

## Success Criteria

### Verification Commands
```bash
bun install           # 安装依赖
bun run build         # 构建插件
bun test              # 运行测试
```

### Final Checklist
- [ ] 插件可被 OpenCode 加载
- [ ] 配置正确读取
- [ ] Brainstorming 正确触发
- [ ] 计划正确增强
- [ ] 变更正确追踪
- [ ] 归档正确生成
- [ ] 构建正确清理
- [ ] 测试全部通过
- [ ] 文档完整

---

## Commit Strategy

| Wave | Commit | Files |
|------|--------|-------|
| 1 | `chore: initialize openflow plugin project` | package.json, tsconfig.json |
| 1 | `feat: add plugin entry point skeleton` | src/index.ts |
| 1 | `feat: add configuration management` | src/config.ts |
| 1 | `feat: add type definitions` | src/types.ts |
| 1 | `feat: add skills registration system` | src/skills/index.ts |
| 2 | `feat: add chat.message hook for brainstorming trigger` | src/hooks/chat-message.ts |
| 2 | `feat: add tool.execute.before hook for verification injection` | src/hooks/tool-before.ts |
| 2 | `feat: add tool.execute.after hook for plan enhancement and change tracking` | src/hooks/tool-after.ts |
| 2 | `feat: add plan parser` | src/phases/plan-enhancer/parser.ts |
| 2 | `feat: add plan enhancer with TDD expansion and verification tasks` | src/phases/plan-enhancer/index.ts |
| 3 | `feat: add brainstorming skill` | src/skills/brainstorm.ts |
| 3 | `feat: add verify skill` | src/skills/verify.ts |
| 3 | `feat: add archive skill` | src/skills/archive.ts |
| 3 | `feat: add openflow custom tool` | src/tools/openflow-tool.ts |
| 3 | `feat: add file change tracker` | src/utils/file-tracker.ts |
| 3 | `feat: add build cleaner` | src/utils/build-cleaner.ts |
| 4 | `feat: add design document templates` | templates/design/ |
| 4 | `feat: add SRS templates` | templates/srs/ |
| 4 | `feat: add archive generator with SRS and code mapping` | src/phases/archive/ |
| 4 | `test: add integration tests` | tests/ |
| 4 | `docs: complete documentation` | README.md, docs/ |

---

**Plan Generated**: 2026-03-11
**Author**: OpenFlow Team
