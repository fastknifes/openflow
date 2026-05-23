import codecs

file_path = r'F:\ai-code\openflow\.sisyphus\worktree\quality-gate-workflow-redesign\docs\current\workflow\openflow-usage-tutorial.md'
with codecs.open(file_path, 'r', 'utf-8') as f:
    content = f.read()

old = content[content.find('## 8.'):content.find('---\n\n## 9.')]
new = '''## 8. 问题调查工作流（兼容性保留）

> `/openflow-issue` 是兼容性保留路径，不再是活跃的质量门工作流入口。对于不确定问题，建议直接用自然语言描述，由 AI 判断是否需要进入 `/openflow-feature` 或 `openflow-quality-gate`。

如果你的输入不是"做个功能"，而是"这里为什么不对"，正确路径是：

### Step 1：用自然语言描述问题

直接描述现象，AI 会根据上下文判断是否需要设计澄清或直接验证。

### Step 2：根据结论分流

- 如果是明确 bugfix：进入实现，完成后调用 `openflow-quality-gate`
- 如果是 `behavior_change`：升级到 `/openflow-feature`
- 如果是 `doc_ambiguity`：先做用户澄清或决策
- 如果是数据/配置/环境问题：按对应路径处理

### Step 3：实现后走 quality gate / archive

主链路始终是代码完成后调用 `openflow-quality-gate`，然后 `/openflow-archive`。

---

'''

content = content.replace(old, new)
with codecs.open(file_path, 'w', 'utf-8') as f:
    f.write(content)
print('Section 8 replacement done')
