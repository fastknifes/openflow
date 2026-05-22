---
layout: doc
---

# 测试分层理念：TDD / BDD / SDD

本文档介绍 OpenFlow 中测试驱动开发（TDD）、行为驱动开发（BDD）和语义漂移检测（SDD）的分层理念。

## 测试分层

OpenFlow 将测试治理分为三个层次：

### TDD — 测试驱动开发

- **定位**：单元/集成级别的代码正确性保障
- **机制**：`tdd.enabled` 默认为 `true`，自动在实施计划中注入测试要求
- **阈值**：`tdd.expand_threshold` 控制何时触发 TDD 展开（默认复杂度 ≥ 3）

### BDD — 行为驱动开发

- **定位**：用户行为级别的功能正确性保障
- **来源**：从 `design.md` 和 `behavior.md` 中提取的行为合约
- **表达**：以用户场景和预期行为描述验证点

### SDD — 语义漂移检测

- **定位**：语义级别的意图一致性保障
- **机制**：在 plan milestone 检查点进行异步语义审查
- **特点**：建议性输出，不替代 TDD 和 BDD 的判断

## 三层协同

```
TDD（代码层）→ 确保实现正确
BDD（行为层）→ 确保功能正确
SDD（语义层）→ 确保意图一致
```

三层互补而非替代：
- TDD 验证"代码做了什么"
- BDD 验证"功能满足什么"
- SDD 验证"意图保持了什么"

## 配置

```json
{
  "tdd": {
    "enabled": true,
    "expand_threshold": 3
  },
  "verification": {
    "in_plan": true,
    "quality": ["lint", "typecheck", "test"]
  }
}
```

> 本文档正在建设中，更多实践指南和案例将持续补充。
