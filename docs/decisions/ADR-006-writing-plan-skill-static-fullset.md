# ADR-006: writing-plan SKILL.md 改为配置无关的全集文档

**日期**: 2026-05-28
**状态**: Accepted
**适用范围**: `src/skills/writing-plan-skill.ts`、`src/skills/registry.ts`、SKILL.md 静态注册机制

## 1. 背景

OpenFlow 的 `openflow-writing-plan` 命令存在两条执行路径：

| 路径 | 触发方式 | 时效性 |
|------|----------|--------|
| **SKILL.md 静态文件** | LLM 主动调用 `skill` tool 加载 | 启动时快照，不热更新 |
| **命令处理器** `handleWritingPlan()` | 用户输入 `/openflow-writing-plan`，hook 拦截后调用 | 每次运行时实时评估 |

### 1.1 SKILL.md 注册流程

```
OpenFlow 启动
  → registerSkills() (src/skills/registration.ts)
    → getWritingPlanSkill(config) (src/skills/writing-plan-skill.ts)
      → 根据 config.tdd.enabled 选择 ternary 分支
      → 生成静态文本
    → 写入 ~/.config/opencode/skills/openflow-writing-plan/SKILL.md
  → OpenCode 启动时扫描并缓存 SKILL.md
```

SKILL.md 内容在 **OpenFlow 启动时** 根据当时的 config 一次性生成，之后不会变更。

### 1.2 命令处理器流程

```
用户输入 /openflow-writing-plan <feature>
  → chat-command-dispatch.ts hook 拦截
    → handleWritingPlan() 实时读取 config.tdd.enabled
    → detectOmoEnvironment() 实时检测文件系统
    → 生成动态 packet 注入对话
```

命令处理器在每次调用时实时评估，始终反映当前配置状态。

### 1.3 问题

当 `config.tdd.enabled` 在 OpenFlow 运行期间被修改时：

- SKILL.md 仍然包含旧的 TDD/non-TDD 变体（启动时快照）
- 命令处理器输出反映新的配置状态
- LLM 可能同时持有两份矛盾的指令

## 2. 决策

将 `writing-plan-skill.ts` 改为**配置无关的全集文档**，不再依赖 `config` 参数做 ternary 分支。

### 2.1 核心变更

**`src/skills/writing-plan-skill.ts`**：

- 删除 `config` 参数，`getWritingPlanSkill()` 变为无参纯函数
- 删除所有 `tddEnabled ? A : B` ternary 分支（共 12 处）
- 改为全集 + 条件标记模式：
  - 正文同时包含 TDD 和非 TDD 路径的说明
  - 使用 "When TDD is enabled..." 条件从句标记可选部分
  - 模板中使用 `<!-- OR "..." when TDD is enabled -->` HTML 注释标记变体
- 新增 `## Authority` 段落，明确声明命令输出为权威源

**`src/skills/registry.ts`**：

- `.map()` 中删除 `openflow-writing-plan` 的特判分支
- 统一走 `SKILL_FACTORIES[name]()`，与其他 skill 一致

### 2.2 不变更的部分

- `handleWritingPlan()` — 保持不变，运行时动态逻辑不受影响
- `omo-detection.ts` — 保持不变
- `chat-command-dispatch.ts` — 保持不变，hook 拦截链路不受影响

## 3. 方案对比

| 方案 | 思路 | 优点 | 缺点 |
|------|------|------|------|
| **A. 全集 + 条件标记（采纳）** | 去掉 ternary，同时包含 TDD 和非 TDD 路径 | 永远不会过时；一次写入覆盖所有配置 | 文件略长，LLM 需按条件选择 |
| B. 命令输出为唯一权威源 | SKILL.md 只保留流程指导，格式模板全交给命令处理器 | 彻底消除不一致 | 加载 skill 后看不到格式模板 |
| C. 配置变更时重新注册 | 监听 config 变化，重新调用 `registerSkills()` | SKILL.md 始终精确 | OpenCode skill 缓存不热更新，需改 OpenCode 本身 |

选择方案 A 的理由：
- 不需要修改 OpenCode 的 skill 缓存机制
- SKILL.md 作为参考文档，全集覆盖比单变体更健壮
- 命令处理器作为权威源，SKILL.md 作为参考源，职责分离清晰

## 4. 影响分析

- **SKILL.md 消费者**（LLM 通过 skill tool 加载）：现在看到全集文档，包含两种变体的说明和条件标记。需根据命令输出的具体配置选择对应路径。
- **命令调用者**（用户输入 `/openflow-writing-plan`）：无影响，命令处理器始终是实时动态的。
- **`registerSkills()` 调用方**（`src/index.ts`）：无影响，接口不变。
- **`findSkillByName()` 调用方**（`src/skills/index.ts`）：无影响，返回值结构不变。

## 5. 变更统计

```
src/skills/writing-plan-skill.ts  | 142 ++++++--------- (-104, +45, net -59)
src/skills/registry.ts            |   7 +-    (-9, +2, net -7)
```

TypeScript 编译通过，无类型错误。
