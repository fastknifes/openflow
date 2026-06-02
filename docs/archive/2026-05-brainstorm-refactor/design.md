# Design: Brainstorm 系统金字塔重构

## Overview

本次重构目标：**让 brainstorm 对话自动沉淀为可复用的结构化上下文，同时保持其"轻量对话"的本质。**

### 问题域

当前 `openflow-brainstorm` 系统存在以下代码漂移：

| 问题 | 严重性 | 位置 |
|------|--------|------|
| `saveBrainstormPacket()` 零调用方（死代码） | Critical | `brainstorm-packet-save.ts` |
| Skill prompt 和文档承诺"自动保存"但代码无触发机制 | High | `brainstorm-skill.ts` + 文档 |
| `context-harvest.ts` 581 行承担 3 个独立职责 | Medium | `context-harvest.ts` |
| 文件命名前缀不一致（brainstorm-/context-/packet-） | Low | 多个文件 |

### 设计结论

采用两阶段策略：Phase 1 激活死代码 + 结构瘦身，Phase 2 引入领域抽象。本设计仅覆盖 Phase 1。

### 范围

**Phase 1 改动**：
- 新增 `brainstorm-auto-save.ts`（触发编排层）
- 接入 hook 触发点（opportunistic + transition）
- 拆分 `context-harvest.ts`（581行 → 3 模块）
- 统一命名前缀

**不改动**：
- `brainstorm-skill.ts`（纯 prompt，质量已足够）
- `context-extraction.ts`（纯规则引擎，职责单一）
- `context-packet.ts`（Schema + 磁盘 I/O，边界清晰）
- `state-machine.ts`（被 6+ 文件依赖，修改需独立 impact analysis）
- 所有 feature workflow 消费逻辑（finalization / generation / response）

## Constraints

- brainstorm 必须保持轻量对话特性；普通对话中的 opportunistic save 必须异步执行，不得阻塞对话流
- transition save 只能在用户实际触发 `/openflow-feature` 时短超时等待；超时或失败不得阻塞 feature workflow 启动
- 保存失败时不得向用户输出错误提示或中断对话
- 自动保存前必须可靠识别当前 session 是否处于 `openflow-brainstorm`；优先使用 skill activation metadata，若 runtime 不提供可靠 metadata，则必须引入显式 session marker 或等价的保守标记机制
- Phase 1 不得引入新的外部依赖
- Phase 1 不得修改 feature workflow 的 harvest 消费逻辑（只可更新 import 路径）
- 拆分 `context-harvest.ts` 时不得破坏现有 barrel re-export 兼容性
- 命名统一只影响 brainstorm 相关模块，不得扩展到其他 skill

## Architecture

### 分层图（Phase 1 后）

```
┌──────────────────────────────────────────────────────┐
│  L0  触发层（Hook 层）                                │
│   chat-message.ts        → opportunistic save        │
│   chat-command-dispatch.ts → transition forced save  │
├──────────────────────────────────────────────────────┤
│  L1  编排层（Auto-Save）                              │
│   brainstorm-auto-save.ts → tryAutoSave()            │
│   职责：会话检测 + stability + fingerprint + throttle │
├──────────────────────────────────────────────────────┤
│  L2  持久化层                                        │
│   packet-save.ts  (原 brainstorm-packet-save.ts)    │
│   职责：extract → threshold → write                  │
├──────────────────────────────────────────────────────┤
│  L3  提取层（不变）                                   │
│   context-extraction.ts                              │
│   职责：正则规则提取 ExtractedItem[]                   │
├──────────────────────────────────────────────────────┤
│  L4  桥接层（3 模块，拆自 context-harvest.ts）          │
│   harvest-discovery.ts  → 匹配候选 packets            │
│   harvest-choice.ts     → 用户交互（use/edit/ignore）  │
│   harvest-injection.ts  → 注入 session + req-model   │
├──────────────────────────────────────────────────────┤
│  L5  基础设施层（不变）                                │
│   context-packet.ts → schema, write/read/list        │
└──────────────────────────────────────────────────────┘
```

### 组件职责表

| 组件 | 输入 | 输出 | 核心职责 |
|------|------|------|---------|
| `tryAutoSaveBrainstormPacket()` | sessionID, messages, trigger | `AutoSaveResult` | 编排整个 save 流程 |
| `saveBrainstormPacket()` | messages, featureHint, projectDir | `SaveResult` | 提取+阈值+写盘 |
| `extractContextFromMessages()` | messages | `ExtractionResult` | 正则提取结构化 items |
| `discoverContextPackets()` | sessionID, featureSlug | `HarvestCandidate[]` | 按相似度查找 packets |
| `resolveHarvestChoice()` | candidates | `HarvestChoice?` | 交互选择 |
| `applyHarvestToSession()` | session, choice | `FeatureSession` | 注入 session |

### 接口设计

```typescript
// brainstorm-auto-save.ts
interface BrainstormAutoSaveInput {
  projectDir: string
  sourceSessionID: string
  featureHint: string
  messages: MessageLike[]
  trigger: 'assistant-turn' | 'transition-to-feature' | 'manual'
  previousFingerprint?: string
}

type BrainstormAutoSaveResult =
  | { status: 'saved'; packetId: string; itemCount: number; fingerprint: string }
  | { status: 'skipped'; reason: 'not-brainstorm' | 'not-stable' | 'unchanged' | 'throttled' }
  | { status: 'failed'; reason: string }
```

### 保存触发策略

**混合模式**（基于 Oracle 建议）：

```
用户对话中:
  assistant 回复完成
    → chat-message hook: tryAutoSave(trigger: 'assistant-turn')
      1. 检测 brainstorm 会话？否→skip
      2. 提取 items → meetsStabilityThreshold？否→skip
      3. fingerprint vs 上次？相同→skip（去重）
      4. 节流检查（≥1 turn 或 ≥30s）？未到→skip
      5. saveBrainstormPacket() → 成功写一行日志，失败静默

用户触发 /openflow-feature:
  → command dispatch: tryAutoSave(trigger: 'transition-to-feature')
      1. 步骤 1-3 相同（去重）
      2. 忽略节流（强制最后一次尝试）
      3. 短超时等待落盘，便于后续 harvest 读取
      4. 超时或失败不阻塞 feature workflow
```

### 拆分设计（context-harvest.ts → 3 模块）

```
context-harvest.ts (581行)
  ├── harvest-discovery.ts (~120行)
  │     discoverContextPackets()
  │     computeTopicSimilarity()  [内部]
  │     renderHarvestSummary()
  │     renderMultiCandidateSummary()
  │
  ├── harvest-choice.ts (~160行)
  │     resolveHarvestChoice()
  │     parseItemSelection()
  │     parseHarvestResponse()
  │
  ├── harvest-injection.ts (~140行)
  │     applyHarvestToSession()
  │     applyConfirmedHarvestToRequirementModel()
  │     selectConfirmedItems()
  │
  └── context-harvest.ts (barrel re-export，约15行)
        export from './harvest-discovery.js'
        export from './harvest-choice.js'
        export from './harvest-injection.js'
```

现有调用方（`finalization.ts`、`generation.ts`、`feature-workflow.ts`）在 Phase 1 期间无需修改 import，barrel 保持完整兼容。

### 重命名映射

| 旧文件 | 新文件 | 影响范围 |
|--------|--------|---------|
| `brainstorm-packet-save.ts` | `packet-save.ts` | `brainstorm-auto-save.ts`（新增，唯一调用方） |

## Risks & Mitigations

| 风险 | 等级 | 缓解方案 |
|------|------|---------|
| chat-message hook 中检测 brainstorm 会话不准确 | 中 | 检查 skill 激活状态 metadata，非正则匹配消息内容 |
| fingerprint 误判导致重复写盘 | 低 | items 排序后 SHA-256 组合，顺序不影响 hash |
| transition save 阻塞 feature workflow | 中 | 仅做短超时等待，超时或失败直接跳过，不阻塞 feature workflow |
| 拆分 `context-harvest` 破坏 barrel 兼容 | 低 | 保留原文件作为 barrel re-export，测试验证所有现有调用方 |
| `featureHint` 早期不稳定 | 低 | 用 session 首轮用户消息主题，transition 时覆盖 |

## Phase 2 Preview（仅在 Phase 1 验证后执行）

| 抽象目标 | 评估标准 |
|---------|---------|
| `BrainstormSession` 领域对象 | 当第二个 skill 需要类似"会话状态管理"时 |
| 可插拔 `ContextExtractor`（LLM 辅助） | 当用户反馈 regex 提取质量不足时 |
| `AutoSavePolicy` 抽象 | 当第二个 skill 需要类似"自动保存"能力时 |
| 持久化策略抽象 | 当存储后端需要切换时 |

## Cross-Validation Summary

- ✅ 所有设计约束已明确
- ✅ 桥接层拆分保持 barrel 兼容，现有调用方零改动
- ✅ 普通触发层（hook）与编排层严格异步，不阻塞对话流；transition save 仅短超时等待且失败不阻塞 feature workflow
- ✅ Phase 1 不引入任何新的外部依赖
- ⚠️ `featureHint` 早期不稳定已在风险点记录
- ⚠️ brainstorm 会话检测需使用 skill activation metadata，不可靠消息正则
