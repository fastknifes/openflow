---
layout: doc
---

# 架构图解

这组图解释 OpenFlow 官网最需要被快速看懂的六个机制：主工作流、实施后端、质量门、harden 对抗、BDD/集成测试证据、归档追溯。

## 1. 工作流流程图

```mermaid
flowchart LR
    brainstorm([头脑风暴]) -.-> feature
    feature[设计澄清] --> plan[生成计划]
    plan --> implement[功能实施]
    implement --> qualityGate[质量门]
    qualityGate --> archive[归档结项]

    classDef main fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef optional fill:#f5f5f5,stroke:#9e9e9e,stroke-width:2px,color:#9e9e9e,stroke-dasharray: 5 5
    classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32

    class brainstorm optional
    class feature,plan,implement,qualityGate main
    class archive success
```

## 2. `/openflow-implement` 工作原理

```mermaid
flowchart TD
    start[/openflow-implement] --> detect{检测 OMO}
    detect -->|已安装| omo[OMO /start-work]
    detect -->|未安装| native[OpenCode 原生执行]
    omo --> worktree[工作树隔离]
    native --> worktree
    worktree --> execute[代码实现]

    classDef entry fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#1565c0
    classDef decision fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#e65100
    classDef process fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef result fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32

    class start entry
    class detect decision
    class omo,native,worktree process
    class execute result
```

## 3. 质量门执行原理

```mermaid
flowchart TD
    entry[AI 完成代码] --> qg[openflow-quality-gate]
    qg --> risk{风险评估}
    risk -->|高风险| harden[Harden 对抗审查]
    risk -->|低风险| evidence[证据检查]
    harden --> evidence
    evidence --> fresh{证据新鲜?}
    fresh -->|是| drift{设计漂移?}
    fresh -->|否| notReady[NotReady]
    drift -->|无| ready[Ready]
    drift -->|有| withDoc[ReadyWithDocUpdates]

    classDef entry fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#1565c0
    classDef process fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef decision fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#e65100
    classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32
    classDef failure fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#c62828

    class entry entry
    class qg,harden,evidence process
    class risk,fresh,drift decision
    class ready success
    class notReady,withDoc failure
```

## 4. harden 对抗

```mermaid
flowchart TD
    trigger[质量门触发 Harden] --> reviewer[对抗性审查者]
    reviewer --> attack[寻找缺陷和遗漏]
    attack --> findings{发现问题?}
    findings -->|是| fix[AI 修复]
    findings -->|否| pass[通过]
    fix --> verify[验证修复]
    verify --> findings

    classDef trigger fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#1565c0
    classDef process fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef decision fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#e65100
    classDef success fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32

    class trigger trigger
    class reviewer,attack,fix,verify process
    class findings decision
    class pass success
```

## 5. BDD 指导集成测试

```mermaid
flowchart LR
    behavior[behavior.md 场景] --> extract[提取关键行为]
    extract --> evidence[生成证据要求]
    evidence --> integTest[集成测试]
    integTest --> report[质量门检查报告]

    classDef source fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#1565c0
    classDef process fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef result fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32

    class behavior source
    class extract,evidence,integTest process
    class report result
```

## 6. 归档工作原理

```mermaid
flowchart TD
    archive[/openflow-archive] --> freeze[冻结 changes → archive]
    freeze --> promote[提升 current 事实]
    promote --> mapper[生成 implementation-mapper.md]

    classDef entry fill:#e3f2fd,stroke:#1565c0,stroke-width:2px,color:#1565c0
    classDef process fill:#e1f5fe,stroke:#01579b,stroke-width:2px,color:#01579b
    classDef result fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#2e7d32

    class archive entry
    class freeze,promote process
    class mapper result
```
