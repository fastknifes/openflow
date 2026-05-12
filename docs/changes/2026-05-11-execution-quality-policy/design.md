# execution-quality-policy - Design

**日期**: 2026-05-11  
**Feature**: execution-quality-policy  
**状态**: Draft  

---

## 1. 问题陈述

OpenFlow 当前将质量治理拆成独立命令：

```text
brainstorm → writing-plan / start-work → implement → harden → verify → archive
```

这个模型能够建立清晰的治理链路，但在真实执行中有几个问题：

1. **harden 太像额外步骤**：用户需要在实现完成后记得手动运行 `/openflow-harden`。
2. **事后提醒打断收尾节奏**：复杂变更做完后再提示 harden，用户往往已经希望进入 verify 或 archive。
3. **非 OMO 用户被不必要打扰**：harden 的最佳形态依赖 OMO 的执行流、任务拆解和 agent 修复循环；非 OMO 用户不应被强制进入该流程。
4. **verify 当前正在增强证据能力**：`verify-evidence-adapters` 提案会让安全与一致性证据真实化，因此 verify 应继续作为所有执行路径的必跑治理门禁。
5. **执行质量策略缺少持久化**：用户是否启用 harden、为什么跳过、采用什么质量档位，目前没有稳定记录，后续 verify/archive 难以追溯。

本功能的目标是把 harden 从“用户要记住的独立命令”调整为 **hook-based quality governance overlay**：OpenFlow 不修改 OMO 的执行核心，而是通过 hook 观察 OMO execution context、记录质量策略、在合适时机提示或触发 harden，并保持 verify 作为 OpenFlow 全局必跑门禁。

---

## 2. 设计目标

### 2.1 核心目标

1. **通过 hook 观察 OMO execution 并确定质量策略**
   - 不在 brainstorm 阶段最终决定 harden。
   - 不在实现完成后临时询问 harden。
   - 在检测到 `/start-work` 或 OMO resume 信号时，通过 hook-based overlay 让用户选择本次执行的 quality mode。

2. **harden 作为 hook-based OMO 执行增强策略**
   - 只有检测到 OMO execution flow 时才进入 harden 决策。
   - 非 OMO 用户跳过 harden 流程。
   - harden 不作为 OpenFlow 全局硬门禁。
   - OpenFlow 不修改 OMO `boulder.json` schema，不接管 `/start-work` 实现。

3. **verify 作为全局必跑门禁**
   - 无论是否使用 OMO，最终完成或 archive 前都必须运行 verify。
   - verify 继续使用 `VerifyEvidencePacket` / `VerifyEvidenceCheckResult` 结构。
   - `verify-evidence-adapters` 提案提供真实 security / consistency evidence。

4. **将 harden 决策持久化**
   - 记录 executor、quality mode、harden policy、verify policy、选择时间。
   - 同一 feature 后续执行复用已选策略，不重复询问。
   - verify 报告需要展示 harden 是否执行、是否跳过和跳过原因。

5. **质量档位替代二元选择**
   - 不直接问“是否 harden”。
   - 使用 `Fast` / `Balanced` / `Strict` 三档。
   - 默认推荐 `Balanced`。

### 2.2 非目标

1. 不把 harden 做成 `EvidenceAdapter`。
2. 不让 verify 自动修复安全或一致性问题。
3. 不修改 OMO 的 `boulder.json` schema。
4. 不要求非 OMO 用户安装或使用 OMO。
5. 不取消 `/openflow-harden` 手动命令，手动命令仍可保留作为高级入口。
6. 不在第一版实现任务级异步验证流水线，该能力可作为后续增强。

---

## 3. 核心原则

### 3.1 职责边界

```text
Harden = hook-based OMO 执行增强策略
Verify = OpenFlow 治理门禁
EvidenceAdapter = Verify 的证据采集能力
```

因此：

- harden 可以调用 reviewer / executor，甚至进入修复循环。
- OpenFlow 只通过 hook 观察和提示，不成为 OMO 的第二套 executor。
- verify 只负责收集证据、分类 readiness、记录治理结果。
- EvidenceAdapter 只负责把安全、一致性、依赖等检查结果标准化为 verify evidence。

### 3.2 OMO installed 不等于 OMO execution

检测 OMO 时需要区分两个概念：

```text
安装了 OMO 插件 ≠ 当前正在使用 OMO 执行
```

只有当前执行入口或状态表明正在走 OMO work session，才进入 harden policy 逻辑。

---

## 4. OMO 检测策略

基于 `oh-my-openagent` 源码，可靠信号包括：

1. 插件 ID：`oh-my-openagent`
2. 旧包名兼容：`oh-my-opencode`
3. OMO 内置命令：`/start-work`
4. OMO start-work hook 会切换 session agent 到 `atlas` 或 `sisyphus`
5. OMO 会维护 `.sisyphus/boulder.json`

推荐检测规则：

```text
如果当前命令是 /start-work：
  视为 OMO execution flow

否则如果 .sisyphus/boulder.json 存在且 active_plan 有效：
  视为 OMO execution resume

否则如果 opencode config 中包含 oh-my-openagent 或 oh-my-opencode：
  只视为 OMO installed，不视为当前 OMO execution

否则：
  非 OMO execution
```

非 OMO execution 的行为：

```text
skip harden entirely
do not show harden suggestion
verify remains required
```

### 4.1 当前代码集成点

当前代码已有 `src/hooks/tool-before.ts`、`src/hooks/tool-after.ts`、`src/hooks/task-classification.ts`、`src/hooks/chat-message.ts` 等 hook。quality policy 不应新增一套独立执行监听层，也不应修改 OMO `/start-work` 核心，而应接入现有 hook：

- `/start-work` 前置判断优先放在 command / task classification 相关 hook 中。
- 文件变更统计和风险规则可复用现有 `.sisyphus/builds/*/changes.json` 记录。
- verify 报告中的 quality policy 摘要应在 `src/commands/verify.ts` 的现有 evidence/readiness 输出中追加，不应创建第二套 verify 报告。

该提案与 Drift Guardian 的区别是：quality policy 决定是否运行 harden；Guardian 负责执行期契约漂移维护。二者都可读取文件变更记录，但不得分别维护互不兼容的变更状态。

---

## 5. Quality Mode

### 5.1 用户交互

当 hook 检测到 OMO execution flow 且当前 feature 没有已保存 policy 时，OpenFlow 询问：

```text
Choose quality mode for this OMO execution:

1. Balanced (Recommended): risk-based harden + required verify
2. Fast: skip harden + required verify
3. Strict: final harden + required verify
```

### 5.2 模式映射

| Quality Mode | Harden Policy | Verify Policy | 适用场景 |
|---|---|---|---|
| `fast` | `none` | `required` | 小改动、快速原型、用户明确跳过 harden |
| `balanced` | `risk-based` | `required` | 默认模式，高风险任务触发 harden |
| `strict` | `final` | `required` | 高风险项目、关键模块、团队严格治理 |

默认值：

```text
balanced
```

---

## 6. Balanced 风险规则

第一版采用简单、可解释的风险规则。

当满足任一条件时判定为 high risk：

1. 变更文件数 `>= 3`
2. diff 增删行数 `>= 50`
3. 新增 exported function / class / type
4. 触及以下目录或概念：
   - `hooks`
   - `commands`
   - `config`
   - `verify`
   - `archive`
   - `security`
   - `auth`
   - `permission`
   - `payment`
5. 修改 public API 或 shared types

`balanced` 模式下：

```text
high risk → trigger harden
medium/low risk → skip harden, record risk summary
```

---

## 7. Policy 持久化

不修改 OMO 的 `.sisyphus/boulder.json`，避免污染 OMO 状态 schema。

OpenFlow 使用自己的执行策略文件：

```text
.sisyphus/openflow/execution-policy.json
```

示例：

```json
{
  "feature": "execution-quality-policy",
  "plan_name": "execution-quality-policy",
  "executor": "omo",
  "quality_mode": "balanced",
  "harden_policy": "risk-based",
  "verify_policy": "required",
  "selected_at": "2026-05-11T00:00:00.000Z",
  "selected_by": "user"
}
```

后续同一 feature 再次 `/start-work` 时：

```text
已有 policy → 复用，不重复询问
用户显式覆盖 → 更新 policy
```

该文件只记录执行质量策略，不记录 Guardian drift 状态，也不替代 `.sisyphus/acceptance.local.md`。verify 可以读取它作为 evidence context，但 readiness 仍由 verify evidence、behavior evidence、Guardian pending/violation 和用户决策共同决定。

---

## 8. 与 verify-evidence-adapters 的关系

`verify-evidence-adapters` 提案负责让 verify 的安全与一致性证据真实化。

本功能不替代该提案，而是在它上方增加执行策略层：

```text
hook observes OMO execution context
  ↓
quality policy selected / reused
  ↓
OMO 执行阶段按 policy 决定是否 harden
  ↓
/openflow-verify
  ├─ quality checks
  ├─ security adapters
  ├─ consistency adapters
  ├─ execution policy summary
  └─ readiness classification
```

verify 报告需要新增治理上下文展示：

```text
### Execution Quality Policy
- executor: omo / non-omo
- quality_mode: balanced
- harden_policy: risk-based
- harden_result: passed / skipped / not_run
- verify_policy: required
```

如果非 OMO：

```text
Harden skipped: OMO execution flow not detected.
```

---

## 9. 后续可选增强

### 9.1 任务级异步验证流水线

后续可以将验证做成旁路流水线：

```text
任务完成 → 启动 scoped verification job → 主执行流继续
```

只有 blocker 级失败才阻塞相关任务链，warning/info 进入最终报告。

该能力可以复用 adapter 架构，但需要额外 scope：

```typescript
scope?: {
  taskID?: string
  touchedFiles?: string[]
  changedSymbols?: string[]
}
```

第一版不实现，避免扩大范围。

### 9.2 CLI 覆盖

未来允许：

```text
/start-work --quality=fast
/start-work --quality=balanced
/start-work --quality=strict
```

第一版可先通过交互选择，不强制支持 CLI 参数。

---

## 10. 验收标准

- [ ] hook-based quality policy 能检测 OMO execution flow。
- [ ] 非 OMO execution 不显示 harden suggestion，不进入 harden 选择。
- [ ] OMO execution 首次启动时询问 quality mode。
- [ ] 默认推荐 `Balanced`。
- [ ] 用户选择写入 `.sisyphus/openflow/execution-policy.json`。
- [ ] 同一 feature 后续复用已有 policy，不重复询问。
- [ ] `Balanced` 模式能基于风险规则决定是否建议或触发 harden。
- [ ] verify 输出包含 Execution Quality Policy 摘要。
- [ ] verify 仍然是所有执行路径的 required gate。
- [ ] harden 不作为 EvidenceAdapter 实现。
- [ ] 手动 `/openflow-harden` 命令仍然可用。

---

## 11. 结论

本设计将 OpenFlow 的质量治理拆成清晰的两层：

1. **执行策略层**：通过 hook-based overlay 在 OMO execution context 中确定 harden policy。
2. **证据门禁层**：通过 `/openflow-verify` 和 evidence adapters 产出可信 readiness。

最终效果：

```text
非 OMO：implement → verify → archive
OMO Fast：start-work（hook observes policy）→ implement → verify → archive
OMO Balanced：start-work（hook observes policy）→ risk-based harden → verify → archive
OMO Strict：start-work（hook observes policy）→ final harden → verify → archive
```

harden 不再是用户需要事后记住的命令，而是 OpenFlow 通过 hook 附着在 OMO 执行上下文上的质量档位；verify 继续作为所有路径的最终治理门禁。
