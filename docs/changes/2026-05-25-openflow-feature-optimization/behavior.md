# openflow-feature 优化行为契约

## 1. 行为目标

`/openflow-feature` 应表现为一个自然语言驱动的 feature 设计助手。

用户只需要描述需求。系统负责：

- 判断当前 session 是否能开始 feature。
- 从当前对话中提炼 Feature Brief。
- 动态追问必要问题。
- 生成 `design.md` 和 `behavior.md`。
- 按复杂度生成条件文档。
- 执行 Cross-Validation。
- 在完成后提示下一步。

实现行为必须体现重构优先：旧规则不应作为隐式 fallback 残留，新规则应通过明确的规则模型、策略对象、验证器或状态机执行。

## 2. 启动行为

### 2.0 主流程顺序

系统必须按以下顺序执行：

```text
Intent Gate
→ 当前 session feature 检测
→ state.md 恢复或初始化
→ Feature Brief 更新
→ 动态槽位收敛
→ 文档集选择
→ 生成前确认
→ 写入文档
→ Cross-Validation
→ 输出 complete / failed / draft_blocked
```

如果 session 检测失败或 `state.md` 恢复/写入失败，系统不得继续生成正式文档。

### 2.0.1 命令入口不可绕过

`/openflow-feature` 必须被 command dispatch / chat hook 拦截并进入正式 feature workflow。

系统不得把 `/openflow-feature ...` 当作普通聊天交给 AI 自由解释。

如果命令无法被识别或缺少必要上下文，系统必须返回明确失败，而不是继续普通对话。

### 2.1 新 session 中启动

用户输入：

```text
/openflow-feature <需求描述>
```

系统行为：

1. 将 `<需求描述>` 作为 feature 需求描述。
2. 不把 `<需求描述>` 作为 feature 名称或参数。
3. 根据需求自动生成 feature 目录名。
4. 初始化 Feature Brief。
5. 判断是否还需要澄清问题。

### 2.2 当前 session 已存在 feature

如果当前 session 已存在 feature，用户再次输入 `/openflow-feature ...`：

系统必须拒绝。

提示示例：

```text
当前会话已经在处理一个 openflow-feature，不能在同一会话中开启新的 feature，以免污染上下文。

如果你想开始新的 feature，请打开一个新的会话后再运行：

/openflow-feature <新的需求描述>
```

### 2.3 当前 session 内自然语言继续

当前 session 已进入 feature 流程后，用户自然语言输入默认视为当前 feature 的补充、回答或修正。

如果用户明显提出另一个 feature，系统拒绝切换，并提示开新 session。

## 3. Feature 命名行为

系统自动生成 feature 目录名，优先遵循现有日期前缀命名约定：

```text
YYYY-MM-DD-语义名称
```

用户不需要命名，也不需要传参。

如果 feature 目录名冲突：

1. 系统自动尝试新的语义名称。
2. 不提示用户名称已存在。
3. 不使用随机数。
4. 语义候选耗尽后，可以使用确定性后缀，如 `-2`。
5. 同一需求描述在同一 session 中保持稳定命名。
6. 日期使用本地环境日期 `Asia/Shanghai`，格式 `YYYY-MM-DD-语义名`。
7. 语义名使用英文 kebab-case。
8. 目录名一旦创建即固定；同一 session 跨日后不得重命名当前 feature 目录。

## 4. Feature Brief 与 state.md 行为

系统在当前 feature 目录中维护：

```text
docs/changes/{feature}/state.md
```

行为规则：

- 用户每回答一个 openflow-feature 澄清问题，系统更新一次 `state.md`。
- `state.md` 是 AI 管理的工作状态，不是正式设计文档。
- `state.md` 只记录结构化 brief、状态、待问问题、已生成路径和稳定决策，不记录完整聊天流水。
- 生成文档时优先读取 `state.md` 中的 Feature Brief，而不是完整聊天上下文。
- 正式文档生成后，正文文档是事实来源；如果 `state.md` 与正文冲突，系统更新或重建 `state.md`，不自动改正文。
- `state.md` 更新必须原子写入；写入失败时不得继续生成正式文档。
- `state.md` 损坏或不可解析时，不得静默重建错误状态，应提示恢复失败并要求用户重新描述当前需求或重新初始化当前 feature。
- `state.md` / FeatureSession 是设计阶段令牌。生成、修改或 review feature 文档时，系统必须绑定当前 feature state。
- 没有当前 feature state 时，不允许直接写入 `design.md` / `behavior.md`。
- 不考虑 compact 恢复。
- 当前 session 重启但不是新会话时，系统应从 `state.md` 恢复 Feature Brief。
- 恢复前必须结合当前会话上下文确认仍是同一 feature。
- 如果 `state.md` 与当前上下文明显不一致，系统不得静默恢复，应提示用户重新描述当前需求或开启新 session。
- Brainstorm context packet 只在 feature 启动时作为辅助输入；已有 `state.md` 后以 `state.md` 为准。

## 5. 动态提问行为

### 5.1 槽位识别

系统从用户输入中提取：

- problem
- target-users
- scope
- priority
- constraints

每个槽位带有置信度和来源。

### 5.2 下一问选择

系统每次只问一个问题。

问题选择依据：

1. 是否阻塞文档生成。
2. 是否存在高风险歧义。
3. 哪个槽位置信度最低且影响最大。

系统不得固定依次询问所有槽位。

### 5.3 用户回答后的响应

用户回答后，系统应按三段式回应：

```text
我已更新理解为：...

现在还缺/还不确定的是：...

为了确认 X，请问：...
```

如果关键槽位已足够，系统不继续追问，转入生成前确认。

## 6. 当前 session 已有 feature 行为

系统判断当前 session 已有 feature 时，应检查 session state，而不是只看文件目录。

以下任一存在即视为已有 feature：

- feature identity；
- Feature Brief；
- generated document path；
- feature state；
- pending openflow-feature question。

用户输入明显新主题时，只有满足以下条件才拒绝切换：

- 明确提出另一个独立目标；
- 与当前 Feature Brief 的 problem/scope 无共享上下文；
- 不能解释为补充、约束、反例或文档修改。

模糊输入按当前 feature 补充处理。

## 7. Feature Brief 行为

### 7.1 更新

系统在用户提供 feature 信息后更新 Feature Brief。

如果用户只是在讨论流程或评价系统，不更新 Feature Brief。

### 7.2 “按你理解继续”

用户说“按你理解继续”时：

- 系统将当前推断内容标记为 assumed。
- 不把 assumed 内容伪装成用户显式输入。
- 关键约束类 assumed 内容必须在生成前确认中展示。

## 8. 生成前确认行为

当 Feature Brief 达到生成门槛后，系统展示轻量确认。

示例：

```text
准备生成文档。我当前理解如下：

- problem: ...
- target-users: ...
- scope: ...
- priority: ...
- constraints: ...

将生成：
- design.md
- behavior.md
- requirements.md（原因：...）
- decisions.md（原因：...）

请确认：
1. 确认生成
2. 修改某一项
3. 先生成草稿
```

用户选择修改某一项时，系统回到对应槽位澄清，不进入复杂编辑模式。

## 9. 文档生成行为

### 9.1 强制生成

系统必须生成：

- `design.md`
- `behavior.md`

如果任一文档生成失败，状态为 `failed`，不得 complete，也不得视为草稿完成。

### 9.2 条件生成

系统根据需求复杂度生成：

- `requirements.md`
- `prd.md`
- `decisions.md`

`requirements.md` 适用于工程执行型需求。`prd.md` 适用于产品价值型需求。`decisions.md` 只在有重要取舍时生成。

### 9.3 不生成 proposal.md

系统不默认生成 `proposal.md`。

对话中也不反复提醒“不生成 proposal.md”，除非正在解释全局文档治理变更。

### 9.4 不生成 plan

系统不创建 `plan.md`、不创建 `.sisyphus/plans/*`、不调用 `/openflow-writing-plan`。

## 10. Cross-Validation 行为

### 10.1 自动验证时机

系统在以下场景运行 Cross-Validation：

- 初次生成文档后。
- 用户显式要求 review 后。
- AI 根据自然语言修改文档后。
- 用户显式要求生成草稿时。

Cross-Validation 按固定输入顺序读取文档：

```text
requirements.md
prd.md
design.md
behavior.md
decisions.md
```

不存在的条件文档跳过，`design.md` 和 `behavior.md` 永远必检。

### 10.2 验证通过

系统输出：

```text
Cross-Validation 通过。

已验证文档：
- docs/changes/<feature>/design.md
- docs/changes/<feature>/behavior.md
- ...

下一步：
确认无误后，可执行：
/openflow-writing-plan <feature>
```

### 10.3 Non-blocking Gap

如果只有 Non-blocking Gap，系统允许 Passed，并在 Suggestions 中提示优化建议。

Non-blocking 不打断完成流程。

### 10.4 Blocking Gap

如果存在 Blocking Gap：

- 状态为 `failed`。
- 不 complete。
- 用户可自行修改后要求 review。
- 用户可要求 AI 按建议修改。
- 用户可显式要求生成 `Draft with Blocking Gaps`。

系统必须清楚提示这三个选项，不替用户选择。

### 10.5 Critical Blocking Gap

如果存在 Critical Blocking Gap：

- 状态为 `failed`。
- 不 complete。
- 不允许生成草稿。
- 必须显示风险。
- 必须给出解决方案。
- 等用户确认后才执行修改或重新生成。

系统不得在 Critical Blocking Gap 下生成草稿或继续完成流程。

输出示例：

```text
Cross-Validation failed.

Severity: Critical Blocking Gap

Issue:
- design.md states X is unsupported.
- behavior.md promises X to users.

Why it blocks:
This would lead implementation in opposite directions.

Recommended resolutions:
1. Remove X from behavior.md.
2. Update design.md to support X with constraints.

请选择解决方案，或说明你的修正意图。
```

### 10.6 执行标准

Cross-Validation 必须先做结构性检查，再做语义检查。

结构性检查包括：

- mandatory 文档存在；
- Summary 区块唯一；
- checked documents 列表一致；
- status 合法；
- 不存在 `design.meta.json` / `behavior.meta.json`；
- 不存在默认生成 `proposal.md` 的新规则。

语义检查包括：

- 约束完整性；
- design/behavior 一致性；
- 条件文档是否被 design/behavior 覆盖。

涉及安全、权限、数据删除、自动执行、跨 session、全局制度提升的冲突，默认按 Critical Blocking Gap 处理。

## 11. Cross-Validation Summary 行为

AI 在所有参与验证的文档中维护 Summary 区块。

用户不需要编辑该区块。

如果用户手动编辑正文，Summary 可能暂时过期；系统不自动检测 stale。下一次 review 或 AI 修改后，系统重新验证并更新 Summary。

如果 Summary 缺失或损坏，系统自动重建。

Summary 只是最近一次验证结果缓存。review、plan、archive 的关键路径必须重新读取正文，不能只看 Summary。

## 12. 草稿行为

用户显式要求“先生成草稿”时：

1. 系统仍运行 Cross-Validation。
2. 如果只有普通 Blocking Gap，写入文档并标记 `Draft with Blocking Gaps`。
3. 如果存在 Critical Blocking Gap，拒绝生成草稿，状态为 `failed`。
4. 如果 Cross-Validation 通过，生成正式文档，不标记草稿。

草稿不等于完成。

## 13. 用户自行编辑 + AI Review 行为

用户可以自行打开 Markdown 文件修改。

用户显式说“帮我 review 一下”后，系统：

1. 读取实际存在的文档集。
2. 检查 `design.md` 和 `behavior.md` 是否存在。
3. 纳入已有条件文档。
4. 执行 Cross-Validation。
5. 输出详细报告。
6. 更新 Summary。

AI 不自动修改文件。

## 14. 自然语言指导 AI 修改行为

用户明确要求 AI 修改文档时，系统：

1. 判断涉及哪些文档。
2. 如果修改会影响一致性，主动提出同步修改相关文档。
3. 复述理解。
4. 等用户确认。
5. 修改文档。
6. 自动运行 Cross-Validation。
7. 输出结果。

如果验证失败，系统报告问题和建议，不自动继续修。

AI 修改范围不得超出：

```text
docs/changes/{feature}/*
```

用户说“按建议修”时，只授权本轮报告中明确列出的修复。若需要额外同步修改，系统必须在复述中列出。

一次确认只覆盖一次修改事务。如果系统发现额外问题，必须重新请求确认。

## 15. 已有文档行为

### 15.1 已有完整文档，用户要求 review

系统直接 review，不覆盖。

### 15.2 已有文档，用户要求重新生成

系统必须提示覆盖风险并等待确认。

重新生成全部文档时必须确认覆盖。

### 15.3 文档不完整

如果缺少 `design.md` 或 `behavior.md`：

- review 时报告 Critical Blocking Gap。
- 补齐时优先只生成缺失文档。
- 补齐缺失文档时不覆盖已有文档。
- 如需改已有文档以保持一致，先说明并确认。

### 15.4 已有条件文档

系统纳入 Cross-Validation，不自动删除。

AI 自然语言修改只修改确认范围内文档。`state.md` 可自动更新，不需要用户确认。

## 16. 状态行为

系统状态只使用：

- `collecting`
- `ready_to_generate`
- `failed`
- `draft_blocked`
- `complete`

用户不需要理解内部状态名，但系统行为必须符合状态语义。

`complete` 只表示 feature design 完成，可进入 optional planning，不表示实现完成。

## 17. 完成输出行为

当满足：

```text
已生成本次所需文档 + Cross-Validation Passed
```

系统输出：

```text
Feature design complete.

Generated documents:
- docs/changes/<feature>/design.md
- docs/changes/<feature>/behavior.md
- ...

Cross-Validation: Passed

Next:
Run /openflow-writing-plan <feature> when ready.
```

如果存在 Candidate Global decisions，必须追加：

```text
Candidate Global decisions:
- ... → ADR-001

These will be promoted during /openflow-archive.
If this is not desired, edit decisions.md and change Scope to Local before archiving.
```

下一步命令应兼容完整目录名和不带日期的语义名称：

```text
/openflow-writing-plan 2026-05-25-openflow-feature-optimization
/openflow-writing-plan openflow-feature-optimization
```

如果不带日期的语义名称匹配多个 feature 目录，系统必须拒绝并提示使用完整目录名。

`/openflow-writing-plan` 只能接收已 `complete` 且 Cross-Validation Passed 的 feature。`failed`、`draft_blocked`、mandatory 文档缺失或正文重算不通过时，必须阻断 planning。

同一 session、同一 feature 重复触发生成时，如果已 complete 且文档仍通过验证，系统返回现有文档路径和状态，不重复生成。用户明确要求重新生成时，才进入覆盖确认。

`failed` 或 `draft_blocked` 状态重复触发时，系统返回恢复建议，不重新开始、不静默覆盖。

## 18. Candidate Global 行为

`decisions.md` 中 `Scope: Candidate Global` 表示该决策在归档时会自动提升到全局制度文件。

系统在设计阶段必须告知用户这一点。

归档阶段不再二次确认。

`decisions.md` 写入时必须去重：同一决策按标题和语义相似度合并。如果决策反转，更新原 Decision 并保留 alternatives/reason，不新增冲突 Decision。

归档提升时：

- 能定位目标文档则自动提升。
- `Promotion note: target TBD` 时仅 warning，不阻塞归档，也不自动提升。
- 与现有 ADR 冲突时输出冲突报告，不静默覆盖。

## 19. complete 后继续修改行为

当前 feature complete 后，用户仍可在同一 session 内继续修改当前 feature 文档。

系统应重新运行 Cross-Validation，并根据结果更新状态语义。

正式文档一旦被修改，状态必须退出 `complete`；只有 Cross-Validation 再次 Passed 后才能回到 `complete`。

complete 后仍不得在同一 session 中开启新 feature。

## 20. 用户不可见复杂度

系统不得把内部机制暴露成复杂操作要求。

用户不需要关心：

- Feature Brief 文件。
- meta 文件。
- Summary 维护细节。
- feature 目录名参数。
- 跨 session 恢复命令。
- review/edit 模式切换。

用户只需要：

- 描述需求。
- 回答必要问题。
- 确认生成。
- 自己编辑文档后要求 review，或明确让 AI 修改。

## 21. 历史代码清理行为

实现本 feature 时，系统行为不得继续依赖以下历史逻辑：

- 默认生成或验证 `proposal.md`。
- 读取或生成 `design.meta.json` / `behavior.meta.json`。
- 固定顺序问完整问卷。
- 扫描未完成 feature session。
- 查找 active feature。
- 在同一 session 中切换 feature。
- 跨 session 通过名称恢复 feature。

如果清理历史逻辑导致旧路径报错，应在实现阶段显式修复或调整测试；不得为了避免报错而保留会污染新语义的旧 fallback。

<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:BEGIN -->
## Cross-Validation Summary

Status: Passed

Checked documents:
- requirements.md
- design.md
- behavior.md
- decisions.md

Issues:
- None
<!-- OPENFLOW:CROSS_VALIDATION_SUMMARY:END -->
