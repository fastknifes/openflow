# verify-evidence-adapters - Design

**日期**: 2026-05-11（修订版 2026-05-12）
**Feature**: verify-evidence-adapters
**状态**: Draft → 重新规划
**涉及文件**: `src/commands/verify.ts`、`src/types.ts`、`src/config.ts`、`src/adapters/*`、`src/contracts/*`（新增）

---

## 1. 问题陈述与源码审计结论

### 1.1 已实现部分（无需重复建设）

源码审计确认以下组件已真实落地：

- `src/adapters/types.ts` — `EvidenceAdapter` / `AdapterContext` / `AdapterCache` 接口 ✅
- `src/adapters/cache.ts` — 跨适配器共享缓存，支持并发去重 ✅
- `src/adapters/command-runner.ts` — 安全命令执行，含 timeout / tool_missing / non-interactive env ✅
- `src/adapters/security/secret-scanner.ts` — gitleaks + detect-secrets 降级，JSON 解析，secret 脱敏 ✅
- `src/adapters/security/vuln-scanner.ts` — npm/pnpm/yarn 自动检测，critical/high → failed ✅
- `src/adapters/security/dependency-check.ts` — 复用 vuln audit 缓存，检查 deprecated + engine mismatch ✅
- `src/adapters/consistency/design-drift.ts` — markdown heuristic + `detectDrift()` 包装，含 git diff 获取变更文件 ✅
- `src/adapters/consistency/current-constraints.ts` — `@stable/@public` + locked + forbidden dependency 检查 ✅
- `src/adapters/consistency/decisions-constraints.ts` — ADR-002 / ADR-003 规则检查 ✅
- `src/types.ts` — `VerificationAdapterConfig` / `AdapterConfig` / `ConsistencyAdapterConfig` 类型 ✅
- `src/config.ts` — `verification.adapters` 配置校验 ✅
- `src/commands/verify.ts` — `runSecurityChecks()` / `runConsistencyChecks()` 已集成 adapter 调用 ✅

### 1.2 严重偏移（设计假设与源码现实不符）

旧 design.md 假设 **Contract Runtime / `OpenFlowContract` 已存在或只需增强**。审计发现：

| 设计假设 | 源码现实 | 偏移级别 |
|---------|---------|---------|
| `src/contracts/openflow-contract.ts` 提供统一契约 | **目录不存在** | 结构性缺失 |
| `behavior.md` 被解析为 Behavior Scenario | **代码中零引用** | 结构性缺失 |
| `DesignDriftAdapter` 消费 `alignmentItems` | 仅使用 `detectDrift()` markdown heuristic | 功能缺失 |
| 符号级精度通过 GitNexus `IMPLEMENTS`/`CALLS` 验证 | 无 GitNexus 调用，仅字符串匹配 export 名称 | 功能缺失 |
| verify 按 Behavior Scenario 输出行为级 evidence | `collectEvidence()` 无此概念 | 功能缺失 |

### 1.3 重新定位后的核心缺口

1. **Contract Runtime 需要从零构建**：`OpenFlowContract` 解析层、`behavior.md`/`design.md`/`current.md`/`decisions.md` 的统一提取器、`ContractRuntime` 缓存服务均不存在。
2. **一致性检查仍偏启发式**：`DesignDriftAdapter` 未消费结构化契约数据；`CurrentConstraintsAdapter` 和 `DecisionsConstraintsAdapter` 各自独立解析 markdown，口径可能分叉。
3. **GitNexus / LSP 符号级验证未落地**：源码变更的函数/类/方法符号未与设计文档的 `expectedSymbols` 做精确匹配。
4. **行为级 evidence 输出缺失**：verify 结果未按 Behavior Scenario 聚合为 `verified` / `missing_evidence` / `failed` / `not_applicable`。

**本次改造的实质是：在已实现的 adapter 基础设施之上，新增 Contract Runtime 层，并让所有 adapters 逐步消费它，同时补齐行为级 evidence 与符号级精度。**

---

## 2. 设计目标（修订版）

### 2.1 核心目标

1. **保留现有 adapter 基础设施**
   - security / consistency adapters 已真实可用，本次不修改其核心逻辑，仅扩展 Contract Runtime 消费入口。
   - cache、command-runner、config 类型均保持现有实现。

2. **从零构建 Contract Runtime**
   - 新增 `src/contracts/` 目录，提供统一契约模型与提取服务。
   - `OpenFlowContract` 聚合 feature 的 behavior scenarios、design alignment items、current constraints、decision constraints。
   - `ContractExtractor` 从 `docs/changes/{feature}/` 和 `docs/current/` / `docs/decisions/` 提取结构化数据。
   - `ContractRuntime` 向 adapters 提供缓存后的 `OpenFlowContract`。

3. **让 consistency adapters 逐步消费 Contract Runtime**
   - `DesignDriftAdapter` 在 Contract Runtime 可用时优先使用 `alignmentItems` 和 `expectedSymbols`；缺失时保留现有 markdown heuristic fallback。
   - `CurrentConstraintsAdapter` 与 `DecisionsConstraintsAdapter` 在 Contract Runtime 可用时消费结构化约束，减少重复 markdown 解析。

4. **行为级 evidence 输出**
   - 当 feature 存在 `behavior.md`（或 Contract Runtime 提供 behavior scenarios）时，verify evidence 按 Behavior Scenario 输出状态。
   - 状态口径：`verified` / `missing_evidence` / `failed` / `not_applicable`。
   - 行为级状态作为独立 evidence 类别进入 readiness 聚合。

5. **符号级精度（渐进实现）**
   - 对源码变更，提取函数/类/方法符号，与设计文档的 `expectedSymbols` 做匹配。
   - **Phase 1**：静态正则 + LSP 符号搜索（本次实现）。
   - **Phase 2**：GitNexus `IMPLEMENTS` / `CALLS` 边验证（预留接口，待 GitNexus 集成完善后接入）。

6. **Verify 保持最终裁判**
   - Guardian repair / pending evidence 只能作为输入。
   - Verify adapters 必须重新读取最终 contract + workspace 状态独立判断。
   - readiness 只能由 `/openflow-verify` 聚合输出。

7. **不改变对外契约**
   - `handleVerify()` 签名不变。
   - `VerifyEvidencePacket` / `VerifyEvidenceCheckResult` 结构不变。
   - 已有测试 (`tests/commands/verify.test.ts`) 全部通过。

### 2.2 非目标

1. 不新增安全扫描器类型（`SecurityCheckType` 保持 `'secret' | 'vuln' | 'dependency'`）
2. 不替代专门的 CI/CD 安全流水线
3. 不在 verify 阶段自动修复安全问题
4. 不把一致性检查扩展为完整需求追溯引擎
5. 不产出 `implementation-mapper.md` 替代品
6. 不改变 `runQualityChecks()` 的现有行为
7. 不删除或重写现有 adapter 的实现逻辑（只增加 Contract Runtime 消费入口）

---

## 3. 现有适配器架构与增强边界

### 3.1 已有统一接口

当前代码已经存在 adapter 接口和缓存层。本提案继续沿用现有接口，不引入第二套 adapter 抽象。新增的 Contract Runtime 只提供统一输入，不改变 adapter 的基本职责：采集证据并标准化为 verify evidence。

```typescript
interface EvidenceAdapter {
  /** 适配器唯一标识，对应 SecurityCheckType 或 'workspace_consistency' */
  readonly name: string
  /** 人类可读标签 */
  readonly label: string
  /** 执行检查，返回标准化结果 */
  run(ctx: AdapterContext): Promise<VerifyEvidenceCheckResult>
}

interface AdapterContext {
  projectDir: string
  feature: string
  config: VerifyAdapterConfig
  cache: AdapterCache  // 跨适配器共享缓存（避免重复 git diff、npm audit 等）
}

interface VerifyAdapterConfig {
  /** 覆盖命令（未提供则用默认值） */
  command?: string
  /** 覆盖命令参数 */
  args?: string[]
  /** 超时时间（ms），默认 120000 */
  timeout?: number
  /** 找不到工具时的行为：'skip' | 'fail'，默认 'skip' */
  onMissing?: 'skip' | 'fail'
}
```

### 3.2 已有适配器集合

当前实现已经包含以下 adapter 文件：

```text
src/adapters/security/secret-scanner.ts
src/adapters/security/vuln-scanner.ts
src/adapters/security/dependency-check.ts
src/adapters/consistency/design-drift.ts
src/adapters/consistency/current-constraints.ts
src/adapters/consistency/decisions-constraints.ts
src/adapters/cache.ts
src/adapters/types.ts
```

后续改造应修改这些现有文件，而不是新增同名并行实现。

### 3.3 适配器注册表

```typescript
const securityAdapters: Map<SecurityCheckType, EvidenceAdapter> = new Map([
  ['secret', new SecretScannerAdapter()],
  ['vuln', new VulnerabilityScannerAdapter()],
  ['dependency', new DependencyCheckAdapter()],
])

const consistencyAdapters: EvidenceAdapter[] = [
  new DesignDriftAdapter(),       // 设计偏离检查
  new CurrentConstraintsAdapter(), // docs/current 约束检查
  new DecisionsConstraintsAdapter(), // docs/decisions 约束检查
]
```

### 3.4 结果缓存

为减少重复操作（如多次 `git diff`、多次 `npm audit`），引入 `AdapterCache`：

```typescript
interface AdapterCache {
  getOrCompute<T>(key: string, compute: () => Promise<T>): Promise<T>
}
```

- `git-diff` → 同一 feature 下只执行一次
- `npm-audit` → 一次运行覆盖 `vuln` 和 `dependency` 两个适配器

---

## 4. 安全适配器设计

### 4.1 Secret Scanner (`secret`)

| 属性 | 值 |
|------|-----|
| 默认工具 | `gitleaks`（未安装时降级到 `detect-secrets`，再未安装则跳过） |
| 默认命令 | `gitleaks detect --source . --no-git --verbose --format json` |
| 配置覆盖 | `opencode.json → openflow.verification.adapters.secret.command` / `args` |
| 解析策略 | parse JSON output → 每个 finding 映射为一个检查项 |
| 超时 | 120s（可配） |
| 工具缺失 | 返回 `skipped`，detail 标注 "gitleaks not found in PATH; install from https://github.com/gitleaks/gitleaks" |

**输出映射**：

```typescript
// gitleaks finding → VerifyEvidenceCheckResult
{
  name: `secret:${finding.ruleId}`,
  passed: false,
  category: 'security',
  detail: `Secret detected: ${finding.description} in ${finding.file}:${finding.startLine}`,
}
```

空 finding 时返回单条 `passed: true` 结果。

### 4.2 Vulnerability Scanner (`vuln`)

| 属性 | 值 |
|------|-----|
| 默认工具 | 基于项目 lockfile 自动选择：`npm audit --json` / `pnpm audit --json` / `yarn npm audit --json` |
| 配置覆盖 | `opencode.json → openflow.verification.adapters.vuln.command` / `args` |
| 解析策略 | parse `npm audit --json` → 每条 advisory 映射为一个检查项 |
| 严重级别 | 按 `severity` 过滤：`critical` / `high` → `passed: false`；`moderate` / `low` → `passed: true` + warning detail |
| 超时 | 180s（可配） |
| 工具缺失 | 返回 `${pkgManager} audit not available` → `skipped` |

### 4.3 Dependency Check (`dependency`)

与 `vuln` 共享 `npm audit` 缓存。额外检查：

- `engines` 字段是否匹配当前 Node 版本
- 是否存在 deprecated 包（从 `npm outdated --json` 或 audit 的 deprecation 信息）

```typescript
// 复用 vuln 缓存的 audit 数据
const auditData = await cache.getOrCompute('npm-audit', () => runNpmAudit(projectDir))
```

---

## 5. 一致性适配器增强设计

### 5.1 Design Drift Adapter

**复用已有资产**：`src/utils/drift-detector.ts` 与 `src/adapters/consistency/design-drift.ts` 已经在做设计文档模块/关键词偏离检测。

本次改造：
- 保留现有 markdown path / keyword fallback，保障旧 change workspace 可继续 verify。
- 当 Contract Runtime 提供 `OpenFlowContract` 时，优先读取 `alignmentItems`，以 Behavior Scenario → Design Response → Files / Modules / Expected Symbols 为准。
- 新增符号级精度：利用 GitNexus 的 `IMPLEMENTS` / `CALLS` 边验证实现是否真正落地了设计文档声明的 `expectedSymbols`。
- GitNexus 不可用时降级到 LSP 符号搜索；LSP 不可用时再降级到现有静态正则。

| 属性 | 值 |
|------|-----|
| 输入 | feature design doc + acceptance-phase 文件变更 |
| 检查项 | (1) 新增文件是否在设计声明的模块范围内 (2) 新增符号是否在设计声明的符号集中 (3) 设计声明符号是否全部有对应实现 |
| 输出 | `VerifyEvidenceCheckResult[]`，每项带文件路径和符号名 |

### 5.2 Current Constraints Adapter

**检查 `docs/current/*` 中的硬约束是否被违反**：

1. 从 `docs/current/design/`、`docs/current/requirements/`、`docs/current/spec/` 中提取约束声明
2. 检查本次变更是否：
   - 修改了被约束标记为 `@stable` 或 `@public` 的接口签名
   - 新增了被约束禁止的依赖（如 `lodash` 被禁用但变更引入了它）
   - 修改了被约束锁定的文件（如在 `docs/current/` 中声明 `src/core/router.ts` 不可变）

### 5.3 Decisions Constraints Adapter

**检查 `docs/decisions/*` 中的全局 ADR 是否被遵守**：

1. 从 `docs/decisions/ADR-*.md` 解析约束声明
2. 针对当前变更做规则匹配：
   - `ADR-002`（命名规范）：新增文件/符号是否遵循命名约定
   - `ADR-003`（命令注册）：新增命令是否走 commands 路径
   - 其他 ADR 中的硬性约束

---

## 6. 配置模型变更

### 6.1 `opencode.json` 扩展

```json
{
  "openflow": {
    "verification": {
      "security": ["secret", "vuln", "dependency"],
      "quality": ["lint", "typecheck", "test"],
      "adapters": {
        "secret": {
          "command": "gitleaks",
          "args": ["detect", "--source", ".", "--no-git", "--format", "json"],
          "timeout": 120000,
          "onMissing": "skip"
        },
        "vuln": {
          "timeout": 180000
        },
        "dependency": {
          "timeout": 120000
        },
        "consistency": {
          "drift_check": true,
          "current_constraints": true,
          "decisions_constraints": true,
          "symbol_level": true
        }
      }
    }
  }
}
```

### 6.2 TypeScript 类型扩展

在 `src/types.ts` 中扩展 `VerificationConfig`：

```typescript
export interface VerificationConfig {
  in_plan: boolean
  security: SecurityCheckType[]
  quality: QualityCheckType[]
  auto_fix: boolean
  completion_prompt: boolean
  allow_accept_failures?: boolean
  // 新增：适配器配置
  adapters?: VerificationAdapterConfig
}

export interface VerificationAdapterConfig {
  secret?: AdapterConfig
  vuln?: AdapterConfig
  dependency?: AdapterConfig
  consistency?: ConsistencyAdapterConfig
}

export interface AdapterConfig {
  command?: string
  args?: string[]
  timeout?: number
  onMissing?: 'skip' | 'fail'
}

export interface ConsistencyAdapterConfig {
  drift_check?: boolean
  current_constraints?: boolean
  decisions_constraints?: boolean
  symbol_level?: boolean
}
```

### 6.3 向后兼容

- `adapters` 字段全部 optional，不配置时使用默认行为
- 已有 `opencode.json` 无需修改即可正常使用新适配器
- `allow_accept_failures` 仍然生效：适配器 `failed` 的结果可以通过 `--accept-failures` 标记接受

---

## 7. 模块影响（修订版）

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/types.ts` | 扩展类型 | 新增 `OpenFlowContract`、行为级 evidence 类型；保留现有 adapter config 类型 |
| `src/config.ts` | 扩展路径工具 | 增加 behavior / contract 相关 path helper；保留现有 adapter 配置校验 |
| `src/commands/verify.ts` | 扩展聚合 | 在现有 adapter 调用基础上加入 behavior evidence 与 readiness 聚合 |
| `src/adapters/consistency/design-drift.ts` | 扩展 | 增加 Contract Runtime 消费入口：优先使用 `OpenFlowContract.alignmentItems` + `expectedSymbols`，保留现有 heuristic fallback |
| `src/adapters/consistency/current-constraints.ts` | 扩展 | 增加 Contract Runtime 消费入口：可消费 `OpenFlowContract.currentConstraints`，减少重复解析 |
| `src/adapters/consistency/decisions-constraints.ts` | 扩展 | 增加 Contract Runtime 消费入口：可消费 `OpenFlowContract.decisionConstraints`，减少重复解析 |
| `src/adapters/security/*` | 保留 | 已真实可用，本次不修改 |
| `src/adapters/cache.ts` / `src/adapters/types.ts` | 保留 | 已真实可用，本次不修改 |
| `src/contracts/openflow-contract.ts` | **新增** | 共享 contract 类型定义（`OpenFlowContract`、`BehaviorScenario`、`AlignmentItem`、`ExpectedSymbol` 等） |
| `src/contracts/contract-extractor.ts` | **新增** | 从 `docs/changes/{feature}/` 的 `behavior.md` / `design.md` / `design.meta.json` 和 `docs/current/` / `docs/decisions/` 提取统一 `OpenFlowContract` |
| `src/contracts/runtime.ts` | **新增** | 向 verify adapters 提供缓存后的 `OpenFlowContract`；管理 Guardian evidence 输入 |
| `src/utils/symbol-resolver.ts` | **新增** | 符号级解析：从源码提取函数/类/方法名，与 `expectedSymbols` 匹配；支持 LSP / 静态正则双模式 |
| `tests/contracts/contract-extractor.test.ts` | **新增** | ContractExtractor 单元测试 |
| `tests/contracts/runtime.test.ts` | **新增** | ContractRuntime 缓存与集成测试 |
| `tests/utils/symbol-resolver.test.ts` | **新增** | SymbolResolver 单元测试 |
| `tests/commands/verify.test.ts` | 扩展 | 新增 behavior scenario evidence 与 readiness 聚合测试 |
| `tests/adapters/consistency-contract.test.ts` | **新增** | Consistency adapters 消费 Contract Runtime 的集成测试 |

---

## 8. 验收标准（修订版）

### 8.1 已有基础设施（回归验证）
- [ ] 现有 security adapters (`secret`, `vuln`, `dependency`) 保持真实可用，行为不变。
- [ ] 现有 consistency adapters (`design_drift`, `current_constraints`, `decisions_constraints`) 保持真实可用，行为不变。
- [ ] `src/adapters/cache.ts` 缓存逻辑不变，`npm-audit` 仍被 `vuln` + `dependency` 共享。
- [ ] 已有测试 `tests/commands/verify.test.ts` 全部通过。
- [ ] `opencode.json` 中不配置 `adapters` 时，使用默认行为，不影响现有用户。
- [ ] `--accept-failures` 对适配器结果仍然有效。

### 8.2 Contract Runtime（新增核心）
- [ ] `src/contracts/openflow-contract.ts` 导出完整的 `OpenFlowContract` 类型体系。
- [ ] `src/contracts/contract-extractor.ts` 能从 `behavior.md` 解析 `BehaviorScenario[]`（支持 YAML frontmatter 或 markdown 表格格式）。
- [ ] `ContractExtractor` 能从 `design.md` / `design.meta.json` 提取 `alignmentItems` 和 `expectedSymbols`。
- [ ] `ContractExtractor` 能从 `docs/current/**/*.md` 提取结构化约束。
- [ ] `ContractExtractor` 能从 `docs/decisions/ADR-*.md` 提取决策约束。
- [ ] `src/contracts/runtime.ts` 提供 `getOrLoadContract(feature)`，结果在单次 verify 中缓存。
- [ ] 无 `behavior.md` / 无 `design.meta.json` 时，`ContractExtractor` 返回部分填充的 `OpenFlowContract`（不报错）。

### 8.3 Consistency Adapters + Contract Runtime 集成
- [ ] `DesignDriftAdapter` 在 `AdapterContext` 提供 `contract` 时，优先使用 `contract.alignmentItems` + `contract.expectedSymbols` 做漂移检测。
- [ ] 无 `contract` 时，`DesignDriftAdapter` 完全回退到现有 heuristic fallback（不变）。
- [ ] `CurrentConstraintsAdapter` 在 `contract.currentConstraints` 可用时优先消费，缺失时保留现有 markdown 解析。
- [ ] `DecisionsConstraintsAdapter` 在 `contract.decisionConstraints` 可用时优先消费，缺失时保留现有 ADR 解析。

### 8.4 行为级 Evidence（新增）
- [ ] 当 `OpenFlowContract.behaviorScenarios` 非空时，`collectEvidence()` 输出 behavior scenario 检查结果。
- [ ] 每个 behavior scenario 状态为 `verified` / `missing_evidence` / `failed` / `not_applicable` 之一。
- [ ] behavior scenario 失败进入 readiness 聚合（非阻断，但出现在 `knownRisksOrMissingEvidence`）。

### 8.5 符号级精度（Phase 1）
- [ ] `src/utils/symbol-resolver.ts` 提供 `extractSymbols(filePaths)`，返回 `{ file, symbols: { name, kind, line }[] }`。
- [ ] `extractSymbols` 优先使用 LSP（如果可用），否则降级到静态正则提取 export function/class/const/interface/type。
- [ ] `DesignDriftAdapter` 在符号级检查开启时（`symbol_level: true` 或 contract 存在），用 `extractSymbols` 对比 `expectedSymbols`，报告缺失或多余的符号。
- [ ] 符号级结果包含文件路径、符号名、行号。

### 8.6 配置与兼容性
- [ ] 适配器 `command` / `args` / `timeout` 仍可通过 `opencode.json` 覆盖。
- [ ] `onMissing: 'fail'` 时，工具缺失仍导致 verify status 为 `NotReady`。
- [ ] 所有新增类型在 `src/types.ts` 中声明，不引入循环依赖。

---

## 9. 结论（修订版）

本次改造的定位经历了重大校准：

- **旧计划的幻觉**：先前计划标记所有任务完成，但实际上仅实现了 adapter 基础设施（types/cache/command-runner/security/consistency），而 design.md 中核心的 Contract Runtime、行为级 evidence、符号级精度均未落地。
- **源码审计后的现实**：`src/contracts/` 目录不存在，`behavior.md` 在代码中零引用，GitNexus 符号验证完全缺失。
- **重新规划后的原则**：

1. **承认并保留已有 adapter**：security / consistency adapters 已真实可用，本次在其上叠加 Contract Runtime，不破坏现有逻辑。
2. **从零构建 Contract Runtime**：`src/contracts/` 是本次的新增核心，而非"增强已有层"。
3. **统一契约口径**：BDD、Drift Guardian、verify adapter、implementation mapper 最终共用 `OpenFlowContract`。
4. **渐进迁移**：Contract Runtime 可用时 adapters 消费它；缺失时 100% 回退到现有 heuristic，保证兼容性。
5. **补齐精度与追溯**：行为级 evidence（Behavior Scenario 状态）和符号级检查（LSP/正则 Phase 1，GitNexus Phase 2 预留）。
6. **不改变对外契约**：`handleVerify()` 签名、`VerifyEvidencePacket` / `VerifyEvidenceCheckResult`、SecurityCheckType 保持兼容。
