# Behavior Contract: bdd

**日期**: 2026-05-11  
**Feature**: bdd  
**状态**: Draft  

---

## 1. Scope

### In Scope

- 在 OpenFlow 中引入 behavior-first 的文档治理方式。
- 让用户主要阅读并确认 `behavior.md`。
- 让 `design.md`、verify evidence、archive 和 implementation mapper 与 `behavior.md` 对齐。
- 保持标准 BDD 框架为可选集成，而不是强制依赖。

### Out of Scope

- 不强制引入 Cucumber、Gherkin、step definitions 或其他 BDD 测试框架。
- 不让用户必须阅读全部 AI 面向文档才能确认功能行为。
- 不用 `behavior.md` 承载内部模块设计、实现计划或架构权衡。

---

## 2. Behavior Scenarios

### Scenario: brainstorm 生成用户主行为契约

Given:
- 用户发起一个需要 OpenFlow brainstorm 的 feature。
- 该 feature 需要明确用户可感知行为。

When:
- `/openflow-brainstorm <feature>` 完成约束澄清。

Then:
- 系统应生成 `docs/changes/{feature}/behavior.md`。
- `behavior.md` 应作为用户主要阅读和确认的行为契约。
- `design.md` 应显式说明它如何对齐 `behavior.md`。

### Scenario: verify 逐条检查行为证据

Given:
- feature 工作区存在 `behavior.md`。
- `behavior.md` 包含关键行为场景。

When:
- 用户运行 `/openflow-verify <feature>`。

Then:
- verify 应逐条输出每个行为场景的证据状态。
- 没有证据或证据失败的关键行为不得被视为 ready。
- 行为与 current/decisions 冲突时，应输出 `needs_decision`。

### Scenario: archive 归档并提升稳定行为

Given:
- feature 已通过 verify。
- `behavior.md` 中存在已验证且长期有效的行为。

When:
- 用户运行 `/openflow-archive <feature>`。

Then:
- 系统应将 `behavior.md` 复制到 archive 快照。
- 系统应将稳定行为 promotion 到 `docs/current/spec/*` 或 `docs/current/requirements/*`。
- `implementation-mapper.md` 应体现 Behavior Scenario → Evidence → Code 的追溯链。

---

## 3. Must Not Behaviors

- 系统不得强制用户安装标准 BDD 框架才能使用 behavior-first 流程。
- 系统不得让 `.feature` 文件或测试框架输出替代 `behavior.md` 的用户主契约地位。
- 系统不得在 behavior 与 current/decisions 冲突时自动覆盖当前事实或全局决策。
- 系统不得把未验证的行为 promotion 到 `docs/current/*`。
- 系统不得要求用户阅读全部 AI 面向文档才能判断 feature 行为是否正确。

---

## 4. Boundary Scenarios

### Boundary: 项目自行接入标准 BDD 框架

Given:
- 项目存在 Cucumber/Gherkin 等标准 BDD 产物。

When:
- OpenFlow 进行 verify。

Then:
- BDD 框架执行结果可作为 behavior evidence 来源。
- `behavior.md` 仍然是用户主契约。
- `.feature` 文件不得自动取代 `behavior.md`。

### Boundary: behavior 与已有 current 文档冲突

Given:
- `behavior.md` 描述的新行为与 `docs/current/*` 已生效事实冲突。

When:
- OpenFlow 进行 verify 或 archive。

Then:
- 系统应输出 `needs_decision`。
- 系统不得自动覆盖 current 文档。
- 需要用户确认后才能改变长期事实。

---

## 5. Verification Mapping

| Behavior | Evidence Type | Expected Evidence | Status |
|---|---|---|---|
| brainstorm 生成用户主行为契约 | inspection / test | `behavior.md` 被生成，`design.md` 包含 Behavior Alignment | pending |
| verify 逐条检查行为证据 | test / command | `/openflow-verify` 输出 behavior evidence 状态 | pending |
| archive 归档并提升稳定行为 | test / inspection | archive 快照包含 `behavior.md`，current promotion 可追溯 | pending |
| 标准 BDD 框架可选集成 | inspection | 框架结果作为 evidence provider，而非主契约 | pending |
| behavior/current 冲突进入决策 | test / inspection | 冲突时 readiness 为 `needs_decision` | pending |
