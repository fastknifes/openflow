---
layout: doc
---

# 迁移已有文档

如果项目已经有 OpenSpec、Spec Kit、Kiro、Cursor/Trae 或手工维护的旧文档，可以用迁移命令接入 OpenFlow 结构。

## 先 dry-run

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --dryRun
```

dry-run 会扫描、分类并给出计划，但不落盘。

## 正式迁移

```text
/openflow-migrate-docs --sourceDir ./legacy-docs --targetDir .
```

## 原则

- 默认复制优先，不自动删除旧文档；
- 低置信度分类会要求澄清；
- 目标目录遵守 `docs/current/`、`docs/changes/`、`docs/archive/`、`docs/decisions/` 的语义边界。
