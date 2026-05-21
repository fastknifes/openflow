## OpenFlow Issue

### Issue
- **symptom**: 质量门在 feature scope 存在时，对 untracked 文件过滤过度——当 scope 推导无法匹配时，所有 untracked 实现文件被错误裁剪，而 tracked diff 有安全阀回退。导致误判"实现缺失"。
- **slug**: `quality-gate-untracked-omission`
- **environment**: `local`
- **status**: `resolved`

### Evidence
- **user_report**: mdd-mall-server 项目中质量门只看到部分 tracked diff，未纳入 untracked 实现文件，导致误判"实现缺失"
- **code_analysis**: 完整代码审查确认 tracked/untracked 过滤不对称缺陷
- **historical_issue**: 2026-05-17 scope-contamination 修复引入裁剪逻辑，但安全阀仅加在 tracked diff 侧
- **test_verification**: full test suite: 1482 pass, 0 fail; quality-gate tests: 36/36 pass; typecheck: clean; LSP: no diagnostics

### Classification
- **primary**: `bugfix`
- **confidence**: `high`
- **hypotheses**:
- confirmed: filterPathsToExactScope 缺少安全阀导致全量裁剪
- confirmed: P1 目录推断已修复 depth bug（仅对 2+ 级深目录做推断）

### Next Step
- **recommended_action**: resolve → quality-gate → archive
- **required_checks**:
- openflow-quality-gate


### Similar Historical Issues

- **`quality-gate-untracked-omission`** (relevance: 14) — quality-gate-untracked-omission
- **`2026-05-17-quality-gate-scope-contamination`** (relevance: 3) — quality-gate-scope-contamination
- **`archive-feature-readiness-binding`** (relevance: 2) — - \*\*raw_case_text\*\*: /openflow-archive \\\<feature\\\> 当前只读取全局 .sisyphus/acceptance.local.md 的 readiness，导致目标 feature 与当前...
