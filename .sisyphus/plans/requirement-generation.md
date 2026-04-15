# Requirement Generation - Implementation Plan

**Feature**: requirement-generation
**Created**: 2026-03-22
**Design**: [docs/design/requirement-generation/](../docs/design/requirement-generation/)

---

## Overview

扩展 brainstorm skill，在生成设计文档的同时生成 PRD 文档。

---

## Tasks

### Phase 1: 基础设施

- [ ] **T1.1** 创建 PRD 模板文件 `templates/requirements/prd.md`
  - 包含：功能描述、用户故事、验收标准、优先级
  - 使用 `{{feature}}`、`{{date}}` 等占位符

- [ ] **T1.2** 扩展类型定义 `src/types.ts`
  - 添加 `BrainstormingConfig.generate_prd: boolean`
  - 默认值为 `true`

- [ ] **T1.3** 扩展配置 `src/config.ts`
  - 在 `defaultConfig.brainstorming` 中添加 `generate_prd: true`

### Phase 2: PRD 生成逻辑

- [ ] **T2.1** 创建 PRD 生成模块 `src/phases/brainstorm/prd-generator.ts`
  - `generatePrd(options: PrdGenerationOptions): Promise<string>`
  - 读取设计文档提取关键信息
  - 填充模板并写入文件

- [ ] **T2.2** 扩展 brainstorm-workflow `src/hooks/brainstorm-workflow.ts`
  - 在生成设计文档后调用 `generatePrd`
  - 输出路径：`docs/requirements/{feature}/YYYYMMDD-prd.md`

### Phase 3: 归档扩展

- [ ] **T3.1** 扩展 archive 命令 `src/commands/archive.ts`
  - 检查 `docs/requirements/{feature}/` 是否存在
  - 复制到 `docs/archive/{feature}/requirements/`

### Phase 4: 测试

- [ ] **T4.1** 单元测试 `tests/phases/brainstorm/prd-generator.test.ts`
  - 测试模板填充
  - 测试路径生成

- [ ] **T4.2** 集成测试 `tests/commands/archive.test.ts`
  - 扩展现有测试，验证需求文档归档

### Phase 5: 文档更新

- [ ] **T5.1** 更新 README.md
  - 添加 PRD 生成功能说明
  - 更新目录结构说明

- [ ] **T5.2** 更新 archive skill 文档 `.opencode/skills/openflow/archive.md`
  - 添加需求文档归档说明

---

## Dependencies

```
T1.1 ──→ T2.1
T1.2 ──→ T2.1
T1.3 ──→ T2.1
T2.1 ──→ T2.2
T2.2 ──→ T3.1
T3.1 ──→ T4.2
T2.1 ──→ T4.1
```

---

## Verification

- [ ] 调用 brainstorm skill 后，`docs/requirements/{feature}/` 目录下存在 PRD 文件
- [ ] PRD 文件包含：功能描述、用户故事、验收标准、优先级
- [ ] archive 命令执行后，`docs/archive/{feature}/requirements/` 目录存在
- [ ] 所有测试通过
- [ ] 类型检查通过

---

## Files to Modify

| 文件 | 操作 | 说明 |
|------|------|------|
| `templates/requirements/prd.md` | 新增 | PRD 模板 |
| `src/types.ts` | 修改 | 添加配置类型 |
| `src/config.ts` | 修改 | 添加默认配置 |
| `src/phases/brainstorm/prd-generator.ts` | 新增 | PRD 生成逻辑 |
| `src/hooks/brainstorm-workflow.ts` | 修改 | 调用 PRD 生成 |
| `src/commands/archive.ts` | 修改 | 归档需求文档 |
| `tests/phases/brainstorm/prd-generator.test.ts` | 新增 | 单元测试 |
| `tests/commands/archive.test.ts` | 修改 | 集成测试 |
| `README.md` | 修改 | 文档更新 |
| `.opencode/skills/openflow/archive.md` | 修改 | Skill 文档 |
