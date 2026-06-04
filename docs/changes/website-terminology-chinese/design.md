# website-terminology-chinese - 设计

## 目标

将 `website/` 下指定 Markdown 文档中的描述性英文状态词和机制名替换为中文表达，降低中文文档站中的中英混用。

## 范围

- 仅修改 `website/` 目录下的 Markdown 文档。
- 保留命令名与技术术语原样，例如 `/openflow-quality-gate`、`openflow-quality-gate`、`lint`、`typecheck`、`test`、`TDD`、`BDD`、`ADR`。
- 使用 PowerShell 的 `[System.IO.File]::ReadAllText`、`Replace` 与 UTF8 写回完成替换。

## 成功标准

- 指定文件中的 `Ready`、`NotReady`、`NeedsDecision`、`Quality Gate` 等描述性用语已替换为中文。
- 命令名中的 `quality-gate` 保持不变。
- 文档替换后没有明显多余空格。