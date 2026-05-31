# implementation-mapper-traceability - Implementation Mapper

**Date**: 2026-05-09
**Status**: Archived

## 1. 概述

本次变更解决了与 `implementation-mapper-traceability` 相关的实现追溯需求。

**归档时间**: 2026-05-09
**追溯范围**: 本次变更覆盖需求到实现的完整追溯链。

## 2. 需求到实现映射

| 追溯来源 | 需求/决策 | 代码文件 | 关键符号 | 关联说明 | 验证证据 |
|----------|-----------|----------|----------|----------|----------|
| requirement: prd.md → 3.1 功能验收 | 路径过滤器拒绝临时目录、外部绝对路径、`..` 遍历路径和缓存目录 | src/phases/archive/implementation-mapper.ts; src/phases/archive/traceability.ts | generateImplementationMapper; buildTraceabilityRows | 归档追溯只收录仓库内可复核文件，避免将临时路径作为需求证据 | tests/phases/implementation-mapper.test.ts; tests/phases/archive/implementation-mapper-guardian.test.ts |
| requirement: prd.md → 3.1 功能验收 | 映射表以需求项/设计决策项为主键构建 | src/phases/archive/traceability.ts; src/phases/archive/implementation-mapper.ts | extractTraceabilitySources; formatTraceabilityTable | 输出以需求和决策来源组织，而不是直接透传变更文件清单 | tests/phases/implementation-mapper.test.ts |
| requirement: prd.md → 3.1 功能验收 | 源码文件优先提取函数、类、方法等符号；无法提取时标记为 `file-level fallback` | src/phases/archive/code-mapper.ts | extractCodeSymbols | 追溯精度优先到符号级，无法解析时显式降级 | tests/phases/code-mapper.test.ts |
| requirement: prd.md → 3.1 功能验收 | 验证证据包含具体命令、测试文件或用例名 | src/phases/archive/implementation-mapper.ts | formatVerificationEvidence | 验证字段输出可复核证据，不使用含糊的完成描述 | tests/phases/implementation-mapper.test.ts |
| requirement: prd.md → 3.1 功能验收 | 相同输入多次生成时输出顺序不变 | src/phases/archive/traceability.ts; src/phases/archive/implementation-mapper.ts | sortTraceabilityRows; generateImplementationMapper | 稳定排序避免无意义归档 diff | tests/phases/implementation-mapper.test.ts |
| requirement: prd.md → 3.2 非功能验收 | 不输出空表格或无意义章节 | src/phases/archive/implementation-mapper.ts | generateImplementationMapper | 无全局依赖或偏差时省略空章节，提升阅读信噪比 | tests/phases/implementation-mapper.test.ts |
| requirement: prd.md → 3.2 非功能验收 | 不暴露过滤规则到文档中 | src/phases/archive/implementation-mapper.ts | generateImplementationMapper | 过滤规则属于生成逻辑，不作为读者面向章节输出 | tests/phases/archive/implementation-mapper-guardian.test.ts |
| requirement: prd.md → 3.2 非功能验收 | 归档文档不含系统临时路径 | src/phases/archive/implementation-mapper.ts; src/phases/archive/traceability.ts | normalizeRepositoryPath; buildTraceabilityRows | 避免 AppData/Local/Temp 等路径污染归档文档 | tests/phases/archive/implementation-mapper-guardian.test.ts |


## 3. 验证与结论

**验证证据**: pending acceptance/doc updates recorded (166)
