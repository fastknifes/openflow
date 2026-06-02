---
layout: doc
---

# BDD 与集成测试

将行为规格（behavior.md）中的场景定义转化为可验证的集成测试证据，确保实现与设计的行为契约一致。

## 它是什么

OpenFlow 的 BDD（行为驱动开发）实践围绕 `behavior.md` 展开。`behavior.md` 使用 Given/When/Then 格式定义 feature 的行为场景，每个场景标注关键性级别（critical、normal、optional）。

在质量门验证阶段，系统会：

1. 解析 `behavior.md` 中的行为场景（支持 YAML frontmatter、Markdown 表格、标题+步骤三种格式）
2. 检查 `.sisyphus/evidence/` 目录下是否存在对应的验证证据文件
3. 对 critical 场景要求新鲜的精确或等效证据，缺失或过期的 critical 证据将阻塞就绪性

行为场景同时作为 [Code Map](./code-map.md) 生成的输入，将每个场景映射到实现它的代码文件。

## 为什么需要它

传统的测试覆盖关注"代码被测试覆盖了多少"，但不回答"设计要求的行为是否都被验证了"。行为覆盖率比代码覆盖率更能反映软件质量——一个 100% 代码覆盖但遗漏了关键业务场景的测试套件，其保障价值远低于覆盖所有 critical 行为场景的测试。

通过将行为场景与验证证据直接关联，OpenFlow 在设计层和测试层之间建立了可追溯的契约。

## 适用场景

- 在 feature 设计阶段使用 Given/When/Then 定义行为边界和关键场景
- 质量门验证时，检查 critical 行为场景是否有对应的测试证据
- 生成 implementation-mapper.md 时，将行为场景映射到实际代码文件
- 在 Harden 审查中，`missing_evidence` 类别专门检测缺失行为证据的场景

## 与其他功能的关系

- behavior.md 由 `/openflow-feature` 命令生成，是 [合约与约束扫描](./contract-scanning.md) 中 `ContractExtractor` 的核心输入
- [质量门](/guide/how-it-works/quality-gate) 在"行为证据验证"阶段检查场景证据的完整性和新鲜度
- 行为场景的代码映射结果写入 [Code Map](./code-map.md)
- [Harden 对抗审查](./harden.md) 会检查实现是否符合 behavior.md 定义的行为契约
