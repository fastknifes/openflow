# Behavior: Brainstorm 系统金字塔重构

## Scenarios

### SC-BR-01: Brainstorm 对话中自动保存（Opportunistic Save）

**触发条件**：assistant 回复完成，当前 session 正在使用 `openflow-brainstorm` skill。

**期望行为**：

1. `tryAutoSaveBrainstormPacket(trigger: 'assistant-turn')` 被异步调用（fire-and-forget），不等待结果
2. 若对话内容未达到稳定性阈值（`meetsStabilityThreshold` 返回 `false`），静默跳过，不产生任何文件输出
3. 若达到阈值，提取 items 并生成 fingerprint：
   - fingerprint 与上次一致 → 跳过（不重复写盘）
   - fingerprint 已变化 → 检查节流（≥1 turn 或 ≥30s）
     - 未到节流间隔 → 跳过
     - 到达间隔 → 调用 `saveBrainstormPacket()` 写入磁盘
4. 保存成功时，最多在对话中追加一行：`Context packet updated with N items.`
5. 保存失败时，仅记录日志，**不在对话中输出任何错误信息**，不打断对话

**涉及约束**：
- 保存操作必须异步，不得阻塞对话流（design.md: Constraints）
- 保存失败不得向用户输出错误（design.md: Constraints）

---

### SC-BR-02: 用户触发 /openflow-feature 时的转场保存（Transition Save）

**触发条件**：用户在 brainstorm 对话后触发 `/openflow-feature`。

**期望行为**：

1. 在 feature workflow 正式启动前，短超时调用 `tryAutoSaveBrainstormPacket(trigger: 'transition-to-feature')`
2. 与 opportunistic save 相同：检测 brainstorm 会话 → 稳定性检查 → fingerprint 去重
3. **节流检查被忽略**（transition 是最后一次保存机会，强制执行）
4. 保存成功 → feature workflow 正常启动，`discoverContextPackets()` 能找到刚写入的 packet
5. 保存超时或失败 → 仅记录日志，**不阻塞 feature workflow 启动**

**涉及约束**：
- transition save 超时或失败不阻塞 feature workflow（design.md: Constraints）

---

### SC-BR-03: Fingerprint 去重

**触发条件**：`tryAutoSaveBrainstormPacket` 被调用，且本次提取的 items 内容与上次保存完全一致。

**期望行为**：

1. items 按 `type + content` 稳定排序后计算 SHA-256 摘要作为 fingerprint
2. 若本次 fingerprint 与上次保存的 fingerprint 相同 → 返回 `{ status: 'skipped', reason: 'unchanged' }`，不触发写盘
3. 若不同 → 继续节流检查并尝试保存

**验证**：连续两次调用（对话内容未变）应产生：第一次 `saved`，第二次 `skipped(unchanged)`。

---

### SC-BR-04: 节流（Throttling）

**触发条件**：fingerprint 已变化，但距离上次保存不足 1 turn 或 30 秒。

**期望行为**：

1. 返回 `{ status: 'skipped', reason: 'throttled' }`，不触发写盘
2. `trigger: 'transition-to-feature'` 时**忽略节流**，始终尝试保存

---

### SC-BR-05: context-harvest 拆分后的兼容性

**触发条件**：现有 feature workflow 代码（`finalization.ts`、`generation.ts`、`feature-workflow.ts`）调用 harvest 相关函数。

**期望行为**：

1. `import { ... } from '../context-harvest.js'` 的现有调用方**无需修改**，barrel re-export 完整兼容
2. `discoverContextPackets` 行为不变（发现逻辑完全迁移）
3. `resolveHarvestChoice` 行为不变（交互逻辑完全迁移）
4. `applyHarvestToSession` / `applyConfirmedHarvestToRequirementModel` 行为不变

**验证**：现有测试套件（feature 相关）全部通过，无回归。

---

### SC-BR-06: brainstorm 会话检测

**触发条件**：`tryAutoSaveBrainstormPacket` 被调用，但当前 session 并非 brainstorm 对话。

**期望行为**：

1. 优先通过 skill activation metadata 判断当前 session 是否使用了 `openflow-brainstorm`
2. 若 runtime 不提供可靠 metadata，则必须使用显式 session marker 或等价的保守标记机制
3. 若非 brainstorm 会话 → 返回 `{ status: 'skipped', reason: 'not-brainstorm' }`，不触发任何提取或写盘操作
4. **不得**通过正则匹配消息内容来判断（避免误判）

---

### SC-BR-07: packet-save 重命名

**触发条件**：Phase 1 实施后，所有 import `brainstorm-packet-save` 的文件。

**期望行为**：

1. `brainstorm-packet-save.ts` 被重命名为 `packet-save.ts`
2. 所有现有 import 路径同步更新
3. TypeScript 编译无报错
4. 现有调用方功能完全不变

---

### SC-BR-08: 保存结果处理

**触发条件**：`tryAutoSaveBrainstormPacket` 返回结果后。

**期望行为**：

| 结果状态 | 对话内输出 | 日志 |
|---------|-----------|------|
| `saved` | 最多一行：`Context packet updated with N items.` | 记录 packetId + itemCount |
| `skipped(not-brainstorm)` | 无输出 | 无日志 |
| `skipped(not-stable)` | 无输出 | 无日志 |
| `skipped(unchanged)` | 无输出 | 无日志 |
| `skipped(throttled)` | 无输出 | 无日志 |
| `failed` | 无输出 | 记录错误原因 |

## Non-Goals

- 本 feature 不涉及 Phase 2 领域对象（`BrainstormSession`）实现
- 本 feature 不引入 LLM 辅助提取（保持纯 regex）
- 本 feature 不修改 Skill prompt（`brainstorm-skill.ts`）
- 本 feature 不改变 brainstorm 对话的交互风格或行为

## Acceptance Criteria

- [ ] brainstorm 对话中出现稳定决策时，context packet 自动写入 `.sisyphus/brainstorm/context-packets/`
- [ ] 后续 `/openflow-feature` 能通过 `discoverContextPackets()` 找到并消费该 packet
- [ ] 普通 brainstorm 自动保存全程异步，不打断 brainstorm 对话
- [ ] `/openflow-feature` 转场保存使用短超时等待，超时或失败不阻塞 feature workflow
- [ ] 保存失败时对话中无任何错误输出
- [ ] `context-harvest.ts` 拆分为 3 个独立模块，barrel 保持兼容
- [ ] 所有现有 feature workflow 测试通过，无回归
- [ ] TypeScript 编译通过，无类型错误
