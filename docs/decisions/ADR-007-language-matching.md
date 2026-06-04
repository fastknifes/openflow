# AI 输出语言匹配用户输入语言

**日期**: 2026-06-03
**状态**: Accepted
**适用范围**: 所有 OpenFlow 工作流的用户交互输出

## 1. 背景

OpenFlow 作为面向国际用户的工具，用户可能使用任意语言交互。此前存在两个问题：

1. **交互式选项按钮走静态 i18n 字典** — `feature` 和 `verify` 的 post-design/verify-failure 选项通过 `askQuestion()` 渲染按钮，文案来自 `en.ts` / `zh-cn.ts` 翻译表。只支持两种语言，无法覆盖日语、韩语等
2. **格式化函数硬编码英文** — `response.ts` 等模块的输出全部是英文模板字符串

## 2. 决策

**AI 输出必须匹配用户输入的语言。不使用静态翻译字典，由 AI 在运行时动态处理。**

具体规则：

| 层面 | 策略 |
|------|------|
| 工具返回的结构化文本（response.ts 等） | 保持英文作为内部格式，AI 自然语言回复时用用户语言表述 |
| 交互式选项（下一步选择、失败处理等） | 不再使用 `askQuestion()` 按钮选择器，改为 AI 用用户语言自然呈现选项，用户自然语言回复 |
| 信号检测（closure、convergence、keywords） | 保留 i18n 机制，这是代码逻辑依赖，不是展示层 |
| Skill 指令 | 保持英文（给 AI 看的指令），但指示 AI 用用户语言呈现交互内容 |

## 3. 理由

1. **静态字典不可扩展** — 每增加一种语言就要维护一套翻译，成本高且永远不完整
2. **AI 天然具备多语言能力** — LLM 本身就能用任意语言输出，不需要翻译层
3. **消除翻译延迟** — 不需要"英文→翻译→展示"的额外步骤，AI 直接输出
4. **i18n 机制职责清晰化** — i18n 只用于代码逻辑（信号检测），不承担展示职责

## 4. 已实施的变更

| 变更 | 文件 |
|------|------|
| 删除 `askPostDesignConfirmation` 调用 | `finalization.ts`、`feature.ts` |
| 删除 `askVerifyFailureQuestion` 调用 | `verify.ts` |
| 删除 `questioning.ts` | 整个文件移除 |
| 更新 feature skill rule 9 | `feature-skill.ts` |
| 简化 `formatNextStepOptions` | `response.ts` |
| 清理 i18n display keys | `types.ts`、`en.ts`、`zh-cn.ts` |

## 5. 约束

- i18n 信号检测 keys（`signals.*`、`resolver.*`、`contract.*`）**必须保留**，代码逻辑依赖
- `PostDesignDecision` 类型在 `state-machine.ts` 中保留，用于旧数据兼容
- 格式化函数保持英文输出，不做 i18n 化 — AI 会在自然语言回复中处理语言匹配

## 6. 不适用范围

- 不影响 `design.md`、`behavior.md`、`plan.md` 等文档的生成语言 — 这些文档的语言由用户与 AI 的交互语言自然决定
- 不影响信号检测机制的准确性判断
- 不要求格式化函数的输出做多语言支持
