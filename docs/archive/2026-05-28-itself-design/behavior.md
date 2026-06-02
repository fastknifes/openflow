# 把这套工作流 itself 作为 feature 来出设计文档，然后按文档重构， 目的是保证代码整洁，尽量做到代码干净整洁。没必要做兼容 - Observable Behavior


## Human Consensus Summary

Feature title: 把这套工作流 itself 作为 feature 来出设计文档，然后按文档重构， 目的是保证代码整洁，尽量做到代码干净整洁。没必要做兼容
Internal slug: itself-design
Source intent: 把这套工作流 itself 作为 feature 来出设计文档，然后按文档重构， 目的是保证代码整洁，尽量做到代码干净整洁。没必要做兼容
Problem statement: 当前 OpenFlow feature workflow 采用固定5个问题 + 硬编码收敛判断，导致约束收集不足且无法适应不同 feature 的差异化信息需求

## User Context

**Problem statement:** 当前 OpenFlow feature workflow 采用固定5个问题 + 硬编码收敛判断，导致约束收集不足且无法适应不同 feature 的差异化信息需求
## Trigger Rules

These conditions activate or require the feature behavior:

- Goal-driven: Solve: 重构 feature workflow，消除固定问题和硬编码收敛判断
- Goal-driven: Honor priority: 易维护（代码整洁优先）
- In-scope match: feature workflow 重构（src/phases/feature/ 目录）
- In-scope match: tool schema 扩展（src/index.ts）
- In-scope match: hook 行为变更（src/hooks/chat-message.ts）
## Non-Trigger Rules

These conditions do NOT activate the feature:

- Not a goal: Unrelated product areas or workflows
## User-Visible Scenarios

Each scenario describes what a user or external caller observes — not how the system produces it internally.

### Scenario: AI 动态追问并收集事实

**Given:**
- 用户已启动 feature design：`/openflow-feature 给支付接口加限流`
- Tool 返回状态摘要（当前无已收集事实）

**When:**
- OpenCode AI 自主决定追问策略
- AI 调用 `openflow-feature({ action: 'collect', facts: { 'rate_limit_strategy': '令牌桶，1000 QPS' } })`

**Then (observable outcome):**
- Tool 记录事实并返回更新后的状态摘要
- 摘要中显示 `collectedFacts: { rate_limit_strategy: '令牌桶，1000 QPS' }`
- AI 可基于新状态继续追问或决定生成文档

### Scenario: AI 判断信息足够后生成设计文档

**Given:**
- 已收集足够事实（如 rate_limit_strategy、degradation_behavior、target_module 等）
- AI 评估认为信息充分

**When:**
- AI 调用 `openflow-feature({ action: 'generate' })`

**Then (observable outcome):**
- Tool 生成 design.md 和 behavior.md
- 生成的文档中包含从 collectedFacts 提取的约束（非模板化）
- 返回文档路径给用户

### Scenario: 代码整洁性验证

**Given:**
- 重构后的代码已提交

**When:**
- 审查者检查 `src/phases/feature/` 目录

**Then (observable outcome):**
- `convergence.ts` 不存在
- `state-machine.ts` 中无固定 `FeatureQuestionId` 类型
- `FeatureSession` 接口中无 question 管理字段
- 无残留死代码或"临时兼容"逻辑
## Required Content

The following content or outcomes must be present in any successful response:

- Must include: feature workflow 重构
- Must include: 动态问题生成（无固定5个问题）
- Must include: AI 自主收敛判断（工具不做决策）
- Required outcome: Solve: 消除硬编码收敛判断导致的约束收集不足
- Required outcome: Honor priority: 代码整洁（删除死代码、简化状态模型）
## Success Responses

**Success:** Tool 返回结构化状态摘要（含 collectedFacts、assumptions、pendingConfirmations）

**Success:** AI 调用 collect action 后，新事实被正确记录到 session

**Success:** AI 调用 generate action 后，design.md 和 behavior.md 被生成且包含从动态 facts 提取的约束

**Success:** `convergence.ts` 被删除且代码库中无残留引用

**Success:** `FeatureSession` 接口中无固定 question 管理字段
## Must Not Behavior

The following outcomes must not occur as user-visible behavior:

- Must not: Tool 返回"请回答问题X"或选项列表等旧格式内容
- Must not: `chat-message.ts` 自动将用户自然语言消息转发给 feature tool
- Must not: Tool 内部做"够了吗"的收敛判断
- Must not: 保留 `convergence.ts` 或硬编码收敛逻辑
- Must not: 保留固定 `FeatureQuestionId` 类型或 question 管理字段
- Must not: Unrelated product areas or workflows
## Acceptance / Verification Mapping

Each acceptance criterion maps to an observable scenario and verification approach:

| Acceptance Criterion | Scenario | Evidence Type | Expected Evidence | Status |
|---------------------|----------|--------------|-------------------|--------|
| Tool 支持 status/collect/generate 三种 action | AI 动态追问并收集事实 | 单元测试 + 集成测试 | 测试用例覆盖三种 action 的正确分发和处理 | pending |
| collectedFacts 以 Record<string, string> 存储 | AI 动态追问并收集事实 | 单元测试 | 测试用例验证 facts 的增删改查 | pending |
| 生成的 design.md 包含从动态 facts 提取的约束 | AI 判断信息足够后生成设计文档 | 集成测试 + 人工审查 | 运行测试后检查生成的 design.md 约束部分非空且非模板化 | pending |
| `convergence.ts` 被删除且无残留引用 | 代码整洁性验证 | 代码审查 + grep 搜索 | 代码库中无 `convergence.ts` 文件，无 `evaluateFeatureConvergence` 函数引用 | pending |
| `FeatureSession` 中无 question 管理字段 | 代码整洁性验证 | 代码审查 + 类型检查 | `state-machine.ts` 中无 `pendingQuestionId`、`askedQuestionIds` 等字段 | pending |
| 旧 v3 session 遇到时提示重新描述 | 向后兼容断裂 | 集成测试 | 测试用例验证加载 v3 session 时返回提示信息 | pending |
| Hook 不再自动转发用户消息给 feature tool | 代码整洁性验证 | 代码审查 + 集成测试 | `chat-message.ts` 中无 `handleFeature(ctx, undefined, message, input)` 自动调用逻辑 | pending |
| Tool 返回的状态摘要包含 collectedFacts/assumptions/pendingConfirmations | AI 动态追问并收集事实 | 集成测试 | 测试用例验证返回内容包含 Markdown 格式的状态摘要 | pending |
| Tool 不再返回"请回答问题X"等旧格式 | AI 动态追问并收集事实 | 集成测试 + 人工审查 | 验证返回内容中不包含"Feature Question"标题和选项列表 | pending |
| facts 输入经过安全过滤 | AI 动态追问并收集事实 | 单元测试 | 测试用例验证 XSS/注入字符被过滤或转义 | pending |
| `feature` 参数仍经过 sanitizeFeatureName 处理 | AI 动态追问并收集事实 | 单元测试 | 测试用例验证非法 feature 名称被拒绝 | pending |

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

- Status: Passed
- Documents checked in order:

- Non-blocking gaps: 0
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
