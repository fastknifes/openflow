---
layout: doc
---

# 迁移已有文档

当一个项目已经积累了 Wiki、Notion、Confluence、OpenSpec、Spec Kit、Kiro、Cursor/Trae 规则或手工维护的 Markdown 文档时，可以先把这些材料迁移到 OpenFlow 的文档结构中，再开始新的 Feature 工作流。

## 适用场景

迁移已有文档适合以下情况：

- 项目已有大量历史文档，但目录结构不统一。
- 需求、设计、决策和历史记录混在一起，AI 难以判断哪些内容仍然有效。
- 想把旧文档接入 OpenFlow，让后续 `/openflow-feature` 能读取当前事实与架构约束。
- 团队希望保留旧文档，同时让新工作遵守 OpenFlow 的 `docs/` 语义边界。

迁移的目标不是“重写业务”，而是把已有资料整理成 AI 和团队都能稳定理解的结构。

## 操作方式

在项目中运行：

```text
/openflow-migrate-docs
```

AI 会读取现有文档，识别文档用途，并按 OpenFlow 目录结构重组。常见迁移结果包括：

| 目标目录 | 放置内容 | 说明 |
|----------|----------|------|
| `docs/current/` | 当前仍然有效的需求、设计、规格和工作流约定 | 这些内容会成为后续 Feature 的默认事实来源。 |
| `docs/decisions/` | 已确认的架构决策、技术选型、长期约束 | 适合保存跨 Feature 生效的决策记录。 |
| `docs/archive/` | 历史版本、已完成事项、过期说明 | 用于保留追溯信息，但不作为当前实现依据。 |

如果你已经把旧文档集中在某个目录，也可以在调用时说明来源目录，例如：

```text
/openflow-migrate-docs 从 ./legacy-docs 迁移已有文档
```

AI 会先扫描、分类，再说明将如何放置文档。对于低置信度内容，它会要求你澄清，而不是强行归类。

## 注意事项

- 迁移只重组文档，不会修改业务代码。
- 默认保留旧文档内容，不会主动删除原始资料。
- 当前有效事实应进入 `docs/current/`，不要把已过期内容混入当前事实目录。
- 长期架构约束应进入 `docs/decisions/`，避免散落在 Feature 文档中。
- 历史记录应进入 `docs/archive/`，用于追溯，而不是指导新的实现。

## 下一步

完成迁移后，可以从第一个 Feature 开始使用 OpenFlow：

```text
/openflow-feature 你的功能描述
```

如果你还没有初始化项目，请先阅读[快速开始](/介绍/quickstart)。需要查看全部命令时，可参考[命令速查](/使用指南/reference/commands)。
