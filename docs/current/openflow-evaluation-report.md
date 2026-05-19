# OpenFlow 机制评估报告

**评估日期**: 2026-05-18
**评估范围**: Contract Marker 稳定性、AI Checkpoint 执行力、Drift 检测准确性、Archive 产出质量
**评估方法**: 源码审查 + 测试覆盖分析 + 归档产物抽检

---

## 一、总体评分

| 评估维度 | 评分 (1-5) | 风险等级 | 一句话结论 |
|----------|-----------|----------|-----------|
| Contract Marker 稳定性 | ⭐⭐⭐⭐ (4/5) | 低 | 机制简单稳健，但存在精度边界 |
| AI Checkpoint 执行力 | ⭐⭐ (2/5) | **高** | 核心依赖 prompt 自律，无程序化强制 |
| Drift 检测准确性 | ⭐⭐⭐ (3/5) | 中 | 检测逻辑合理但误报场景明确存在 |
| Archive 产出质量 | ⭐⭐⭐ (3/5) | 中 | 架构正确但自动化产物信息密度低 |

---

## 二、Contract Marker 稳定性评估

### 2.1 机制概述

OpenFlow 使用 **HTML 注释标记** 管控 `AGENTS.md` 中的 docs guide 区块：

```
<!-- OPENFLOW DOCS GUIDE:BEGIN -->
... 受管理的内容 ...
<!-- OPENFLOW DOCS GUIDE:END -->
```

**不是** AGENTS.md 中看到的 `<!-- gitnexus:start/end -->`——后者是 GitNexus 外部工具的标记，OpenFlow 代码不解析它们。

### 2.2 稳定性分析

**优点：**

| 方面 | 评价 |
|------|------|
| 标记设计 | 纯字符串匹配（`indexOf`），无正则复杂性，不易出错 |
| 损坏检测 | 完整覆盖 4 种损坏场景：缺 begin、缺 end、数量不匹配、嵌套错乱 |
| 恢复策略 | 保守安全——永远保留原文，追加新 block，不覆盖 |
| 缓存机制 | SHA-256 源文件哈希验证，sourceHashesEqual 防止过期缓存 |
| 测试覆盖 | `init-agents.test.ts`（270 行）覆盖标记解析、损坏检测、动作决策 |

**风险点：**

| 风险 | 严重度 | 说明 |
|------|--------|------|
| 精确匹配无容错 | 低 | `<!-- OPENFLOW DOCS GUIDE:BEGIN -->` 不允许任何空格偏差，但实际被意外篡改的概率很低 |
| 重复 block 视为损坏 | 低 | 不会合并或清理，追加新 block 导致 AGENTS.md 膨胀 |
| 无内容完整性校验 | 低 | 标记内内容可被静默修改，不触发告警 |

### 2.3 Contract 提取机制（与标记分离）

Contract 系统不依赖 HTML 标记，而是从结构化文档中提取：

- **behavior.md**: YAML frontmatter → JSON 场景数组 / Markdown 表格 / `### Scenario:` 标题
- **design.meta.json**: Zod 校验的 JSON（RequirementModelSchema）
- **docs/current/**/*.md**: 关键词检测（`@stable`, `locked`, `must not change`）
- **docs/decisions/ADR-*.md**: 规则提取（含 `must`/`shall`/`required` + 代码路径的列表项）

**三种 fallback 解析策略** 确保行为场景总有一种能工作。

### 2.4 结论

> **Contract Marker 足够稳定。** 标记机制简单、测试充分、恢复策略保守。真正的 Contract 不是标记而是结构化文档（design.meta.json + behavior.md），后者由 Zod schema 和多级 fallback 保护。短期不需要大幅改进。

---

## 三、AI Checkpoint 执行力评估

### 3.1 核心发现：执行力主要依赖 Prompt 自律

这是四个维度中 **风险最高** 的一个。

**工作流执行链：**

```
feature → writing-plan → implement → quality-gate → archive
                                       ↑
                                   关键检查点
```

**AI 如何被告知执行 checkpoint：**

| 传递方式 | 机制类型 | AI 能否跳过 |
|----------|----------|------------|
| `quality-gate-skill.ts` 中 "DO NOT CLAIM COMPLETION UNTIL..." | **Prompt 指令** | ✅ 能跳过 |
| writing-plan 中嵌入 quality-gate 调用指令 | **Prompt 指令** | ✅ 能跳过 |
| acceptance-prompt hook 追加提示 | **Prompt 指令** | ✅ 能跳过 |
| acceptance state 阶段状态机 | 程序化 | 仅记录，不阻断执行 |
| verify readiness 分类 | 程序化 | 归档前检查，但 AI 可跳过归档 |
| archive readiness gate | 程序化 | **真正的强制门**——NotReady 阻断归档 |

### 3.2 关键差距

**差距 1：Quality Gate 调用无强制力**

```typescript
// quality-gate-skill.ts 的核心内容
'DO NOT CLAIM COMPLETION UNTIL THE QUALITY GATE REPORTS READINESS.'
```

这只是一条 prompt 指令。AI 模型（无论 Claude、GPT、GLM）都可能：
- 在长上下文中遗忘这条指令
- 优先响应用户的 "看起来完成了" 判断
- 在 tool call 失败时静默跳过
- 被后续 prompt 覆盖优先级

**差距 2：阶段状态机不阻断执行**

```typescript
// acceptance-state.ts 记录了阶段
phase: 'implementation' | 'acceptance' | 'verification_pending' | 'verification_failed' | 'archived'
```

但状态转换是 **记录型**，不是 **阻断型**。AI 在 `implementation` 阶段可以继续写代码，即使状态已经是 `acceptance`。

**差距 3：唯一真正的强制门是 Archive**

archive 命令会检查 readiness 状态，NotReady 时阻断。这是唯一程序化的强制检查点。但前提是 AI 真的去调用了 archive。

### 3.3 测试证据

`quality-gate.test.ts`（1038 行）测试了：
- Harden → Verify 调用顺序
- Risk assessment 决策
- Session ID 传递
- 各种 readiness 场景
- 但 **没有测试 AI 跳过 quality-gate 的场景**——因为这是 prompt 层面的问题，无法在单元测试中覆盖。

### 3.4 结论

> **AI Checkpoint 执行力是最薄弱环节。** 整个工作流的 "hardening" 依赖 AI 自觉调用 quality-gate，而这在现实中不可靠。建议考虑：
>
> 1. **在 OpenCode plugin hook 层面添加强制拦截**——在 AI 输出 "done"/"complete" 相关文本时，自动触发 quality-gate
> 2. **在 tool-after hook 中检测"完成声明"**——如果 AI 声称完成但未调用 quality-gate，注入警告 prompt
> 3. **在 archive 之前增加 verification 状态检查**——archive 是唯一的强制门，应该更严格

---

## 四、Drift 检测准确性评估

### 4.1 双层检测架构

OpenFlow 有 **两套** drift 检测机制：

**层级 1：verify 阶段的 `drift-detector.ts`（旧/启发式）**

```
设计文档 → 提取 headings, modules(src/lib/app 路径), keywords(反引号内容)
代码文件 → 提取 export function/class/const 名称
比对 → 文件路径是否在 design modules 中？关键词是否在 design keywords 中？
```

**层级 2：Drift Guardian 的 `diff-engine.ts`（新/Contract 驱动）**

```
Contract (alignmentItems) → 提取 files[], modules[], expectedSymbols[]
代码文件 → 提取 export function/class/const 名称
比对 → 文件路径 vs alignmentItems.files/modules（contains 双向匹配）
       符号名称 vs expectedSymbols（大小写不敏感）
分级 → no_drift / auto_repaired / ambiguous_needs_confirmation / violation_needs_fix
```

### 4.2 误报场景分析

**明确的误报来源：**

| 场景 | 机制 | 误报原因 | 频率估计 |
|------|------|---------|---------|
| **文件路径 contains 双向匹配** | `normalizedFile.includes(p) \|\| p.includes(normalizedFile)` | `src/foo.ts` 会匹配 alignment 中的 `src/foo.ts`，但 `src/a.ts` 也会匹配 modules 中的 `src/a` | **高** |
| **未列出符号 → ambiguous** | 每个 `export` 的函数/类/常量都会检查 | 工具函数、类型导出、常量等不在 expectedSymbols 中的合法导出会被标记为 drift | **高** |
| **新增合法功能被标记** | expectedSymbols 是闭合集合 | 实现过程中合理新增的 helper/utility 函数会被标记 | **中** |
| **design.md 未写路径** | modules 为空则跳过 | 无误报但也无检测——安全漏洞 | N/A |

**具体代码证据——路径匹配过于宽松：**

```typescript
// diff-engine.ts line 50
const allPaths = [...item.files, ...item.modules].map(normalizePath)
return allPaths.some(p => normalizedFile.includes(p) || p.includes(normalizedFile))
```

`src/services/auth/login.ts` 会匹配 modules `src/services`——这是对的。
但 `src/services2/whatever.ts` 也会匹配 `src/services`（contains 检查）——这是误报。

**具体代码证据——符号检测不可跳过：**

```typescript
// diff-engine.ts line 138
results.push({
  item: keyword,
  type: 'symbol',
  contractReference: 'Not in expected symbols',
  actualValue: `Found in ${normalizedFile}`,
  reason: `Symbol '${keyword}' is not in contract's expectedSymbols`,
})
```

每个不在 expectedSymbols 中的 export 都会生成一条 ambiguous 结果。实际项目中大量的工具函数、类型导出、辅助常量都会触发。

### 4.3 Drift Guardian 的缓解机制

```
ambiguous_needs_confirmation → 不自动修复，进入 pending 队列
verify 阶段 → guardian evidence 作为输入之一，但不作为最终裁判
```

这意味着 **误报不会导致错误修复**，但会产生噪音——pending 队列中可能充满 false positive。

### 4.4 测试覆盖评估

| 测试文件 | 行数 | 覆盖内容 |
|---------|------|---------|
| `drift/diff-engine.test.ts` | 418 | 路径匹配、符号匹配、分类、重命名检测 |
| `drift/integration.test.ts` | 649 | 完整 pipeline（10 个测试用例） |
| `drift/guardian-consumer.test.ts` | — | 消费者注册与事件分发 |
| `drift/repair-coordinator.test.ts` | — | 自动修复执行 |
| `utils/drift-detector.test.ts` | — | 旧启发式检测 |

测试质量良好，但 **没有测试误报场景**——所有测试用例都是 "精确匹配" 或 "完全不匹配" 的二元场景。

### 4.5 结论

> **Drift 检测存在系统性误报风险。** 核心问题：
>
> 1. **路径匹配过于宽松**（contains 双向匹配）——应改用路径段精确匹配
> 2. **符号检测无白名单/过滤**——所有 export 都检查，helper/util/type 导出必然误报
> 3. **expectedSymbols 必须完整**——但实际上 AI 生成 design.meta.json 时很难列出所有符号
>
> 误报是 `ambiguous_needs_confirmation` 级别，不触发自动修复，但会污染 pending 队列和 evidence 输出。建议：
> - 引入符号过滤规则（如 `*.type.ts`、`*util*` 跳过）
> - 路径匹配改用 path segment 精确匹配替代 contains
> - 增加 `ignoredPatterns` 配置项

---

## 五、Archive 产出质量评估

### 5.1 机制概述

Archive 的核心产物是 **implementation-mapper.md**，通过以下 pipeline 自动生成：

```
源文档 (design.md, requirements.md, prd.md)
  → traceability.ts 提取追溯项（markdown bullets → 追溯条目）
  → code-mapper.ts 提取代码符号（regex export function/class/const）
  → 两边 join → 追溯映射表
  → implementation-mapper.md
```

### 5.2 实际产物抽检

**样本 1：`bdd` 归档 (2026-05-14)**

```markdown
| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |
|----------|-----------|----------|----------|----------|----------|
| changed files | bdd archived implementation changes | F:/ai-code/openflow/src/commands/verify.ts; ... | file-level fallback | ... | verification completed at 2026-05-09T03:29:52.786Z |
```

**问题：**
- "追溯来源" = `changed files`——这是 fallback，不是真正的追溯
- "关键符号" = `file-level fallback`——符号提取失败
- 只有一行，映射了 3 个文件到同一个模糊条目
- 信息密度极低——看这个文档不如直接 `git log`

**样本 2：`drift-guardian` 归档 (2026-05-11)**

```markdown
| design: .../design.md → 2.1 Core Goals (goal-1) | 执行期持续对齐维护 | src/drift/diff-engine.ts; src/drift/scoped-job.ts; ... | checkDrift, classifyDrift, ScopedDriftJob; tool-after hook | ... | no verification evidence recorded |
```

**问题：**
- 追溯来源正确引用了 design.md 的具体条目——**这个比较好**
- 符号映射较准确（checkDrift, classifyDrift 等）
- **但每行的验证证据都是 `no verification evidence recorded`**——12 行，全部如此
- 这意味着追溯链的最后一环（验证证据）完全断裂

### 5.3 系统性问题

| 问题 | 严重度 | 原因 |
|------|--------|------|
| **验证证据普遍缺失** | **高** | implementation-mapper 从 acceptanceState 读取证据，但证据注入链路可能不完整 |
| **file-level fallback 噪音** | 中 | code-mapper regex 提取失败时退化为文件级映射，失去符号精度 |
| **无人工确认环节** | 中 | 自动生成的追溯映射表无人验证准确性 |
| **18 个归档目录无质量分层** | 低 | 所有归档同等对待，无过期清理 |
| **路径使用绝对路径** | 低 | 归档中出现 `F:/ai-code/openflow/src/...` 而非相对路径 |

### 5.4 Current Promotion 机制评估

归档时的 `auto_promote_current` 使用 **heading overlap + token overlap** 评分匹配历史文档：

```typescript
const RELIABLE_MATCH_SCORE = 0.25
const RELIABLE_HEADING_OVERLAP = 0.3
const RELIABLE_TOKEN_OVERLAP = 0.08
```

**阈值非常宽松**：
- Token overlap 只需 8%——这意味着只有 8% 的词重叠就被认为是 "可靠匹配"
- Stop words 过滤了常见的英文词（the, and, for...）但缺少中文停用词
- 可能导致不相关文档被错误匹配并合并

### 5.5 结论

> **Archive 机制架构正确，但产物质量堪忧。**
>
> 核心问题不是机制设计，而是 **自动化 pipeline 的精度不够**：
>
> 1. **验证证据链断裂**——所有 implementation-mapper 行显示 `no verification evidence recorded`，这意味着追溯链的验证环节是空的
> 2. **追溯映射是机械 join**——从 markdown bullet 提取的关键词与从代码 regex 提取的符号做关联，不保证语义准确性
> 3. **Current promotion 阈值过松**——8% token overlap 就算匹配，可能产生错误的文档合并
>
> 建议：
> - 修复验证证据注入链路（这是最高优先级——没有验证证据的追溯链是无意义的）
> - 增加 implementation-mapper 的人工确认环节
> - Current promotion 阈值提高到 heading overlap ≥ 0.5, token overlap ≥ 0.2
> - 归档路径应使用相对路径
> - 考虑增加归档清理机制（如保留最近 20 个或 12 个月内）

---

## 六、交叉分析与系统性风险

### 6.1 四维度关联

```
Contract Marker (稳定)
  → 提供 Contract 数据
    → Drift 检测 (误报多)
      → 产出 Guardian Evidence
        → AI Checkpoint (依赖自律)
          → 决定是否进入 Archive
            → Archive (证据链断裂)
```

**系统性问题：链条中最弱的一环决定了整个系统的可靠性。**

当前最弱的环节是 **AI Checkpoint 执行力**（完全依赖 prompt）和 **Archive 验证证据缺失**（追溯链断裂）。

### 6.2 测试基础设施

| 指标 | 值 |
|------|-----|
| 测试文件数 | 90+ 个 `.test.ts` 文件 |
| 测试框架 | Bun test（当前环境不可用） |
| 测试覆盖的关键模块 | contracts, drift, archive, quality-gate, hooks, phases |
| 缺失的测试场景 | AI 跳过 checkpoint、误报场景、验证证据注入链路 |

### 6.3 未覆盖的集成测试场景

1. **AI 不调用 quality-gate 的场景**——无法在单元测试中验证
2. **Drift 误报的累积效应**——pending 队列在长会话中的行为
3. **验证证据从 verify → acceptance state → implementation-mapper 的完整流转**——抽检显示断裂
4. **并发文件变更下的 Guardian 行为**——有 `repair-coordinator-concurrent.test.ts` 但覆盖有限

---

## 七、改进建议优先级

| 优先级 | 改进项 | 预期效果 | 工作量 |
|--------|--------|---------|--------|
| **P0** | 修复验证证据注入链路（verify → mapper） | Archive 产物有意义 | 中 |
| **P0** | 添加 quality-gate 强制调用机制（hook 层面） | 工作流不可跳过 | 高 |
| **P1** | Drift 路径匹配改用 segment 精确匹配 | 减少路径误报 | 低 |
| **P1** | Drift 符号检测增加白名单/过滤规则 | 减少 export 误报 | 中 |
| **P1** | Current promotion 提高匹配阈值 | 减少错误文档合并 | 低 |
| **P2** | Archive 增加人工确认追溯映射表步骤 | 提高追溯准确性 | 中 |
| **P2** | 归档路径改为相对路径 | 提高可移植性 | 低 |
| **P2** | 添加归档清理/过期机制 | 防止文档堆积 | 中 |
| **P3** | Contract marker 增加 SHA-256 校验 | 提高标记完整性感知 | 低 |

---

## 八、总结

OpenFlow 是一个 **设计理念先进、架构层次清晰** 的 AI 开发治理层。四个核心机制的设计思路都是正确的——Contract 提取、Checkpoint 流程、Drift 检测、Archive 追溯。

但在 **落地精度** 上存在不同程度的差距：

- **Contract Marker** 落地最好，简单稳健
- **Drift 检测** 有明确的误报来源，需要调优匹配算法
- **Archive** 验证证据链断裂是硬伤，需要修复数据流
- **AI Checkpoint** 是最大的架构风险——prompt 自律在复杂的 AI 执行环境中不可靠，需要程序化强制手段

**一句话总结**：OpenFlow 的 "应该怎样" 是清楚的，但 "确保怎样" 还有明显差距。
