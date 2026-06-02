/**
 * PRD template utilities — template content, section builders, and placeholder validation.
 */
import { t } from '../../../../i18n/index.js'

interface DesignInfo {
  problemStatement: string
  successCriteria: string[]
  overview: string
  components: string[]
  goals: string[]
  constraints: string[]
  outOfScope: string[]
}

export interface TemplateData {
  feature: string
  date: string
  designInfo: DesignInfo
}

export function fillPrdTemplate(template: string, data: TemplateData): string {
  let result = template

  // Replace simple placeholders
  result = result.replace(/\{\{feature\}\}/g, data.feature)
  result = result.replace(/\{\{date\}\}/g, data.date)
  result = result.replace(/\{\{priority\}\}/g, 'P1') // Default priority

  // Build and replace dynamic sections
  const backgroundAndGoals = buildBackgroundAndGoalsSection(data.designInfo)
  result = result.replace(
    /\{\{backgroundAndGoals\}\}/g,
    backgroundAndGoals || 'TBD: 此功能要解决什么问题？为什么需要这个功能？',
  )

  const overviewAndConstraints = buildOverviewAndConstraintsSection(data.designInfo)
  result = result.replace(
    /\{\{overviewAndConstraints\}\}/g,
    overviewAndConstraints || 'TBD: 简要描述功能的核心内容',
  )

  const userStories = buildUserStoriesSection(data.designInfo)
  result = result.replace(/\{\{userStories\}\}/g, userStories || 'TBD: 暂无用户故事')

  const acceptanceCriteria =
    data.designInfo.successCriteria.length > 0
      ? data.designInfo.successCriteria.map((c) => `- [ ] ${c}`).join('\n')
      : '- TBD: 验收标准待补充'
  result = result.replace(/\{\{acceptanceCriteria\}\}/g, acceptanceCriteria)

  const nonFunctionalAcceptance = '- [ ] TBD: 性能要求\n- [ ] TBD: 安全要求\n- [ ] TBD: 兼容性要求'
  result = result.replace(/\{\{nonFunctionalAcceptance\}\}/g, nonFunctionalAcceptance)

  const inScope =
    data.designInfo.components.length > 0
      ? data.designInfo.components.map((c) => `- ${c}`).join('\n')
      : '- TBD: 功能范围待补充'
  result = result.replace(/\{\{inScope\}\}/g, inScope)

  const outOfScope =
    data.designInfo.outOfScope.length > 0
      ? data.designInfo.outOfScope.map((item) => `- ${item}`).join('\n')
      : '- TBD: 非功能点待补充'
  result = result.replace(/\{\{outOfScope\}\}/g, outOfScope)

  assertNoUnresolvedPlaceholders(result)

  return result
}

export function buildBackgroundAndGoalsSection(designInfo: DesignInfo): string {
  const sections: string[] = []

  if (designInfo.problemStatement) {
    sections.push(designInfo.problemStatement)
  }

  if (designInfo.goals.length > 0) {
    sections.push(`Goals:\n${designInfo.goals.map((goal) => `- ${goal}`).join('\n')}`)
  }

  return sections.join('\n\n').trim()
}

export function buildUserStoriesSection(designInfo: DesignInfo): string {
  if (designInfo.goals.length === 0) {
    return ''
  }

  const stories = designInfo.goals.slice(0, 3).map((goal, i) => {
    return `| US-${String(i + 1).padStart(3, '0')} | 目标用户 | ${goal} | 达成业务目标 |`
  })

  return `| ID | 角色 | 需求 | 目的 |\n|----|------|------|------|\n${stories.join('\n')}`
}

export function buildOverviewAndConstraintsSection(designInfo: DesignInfo): string {
  const sections: string[] = []

  if (designInfo.overview) {
    sections.push(designInfo.overview)
  }

  if (designInfo.constraints.length > 0) {
    sections.push(
      `Constraints:\n${designInfo.constraints.map((constraint) => `- ${constraint}`).join('\n')}`,
    )
  }

  return sections.join('\n\n').trim()
}

export function assertPrdHasSubstantiveSource(
  feature: string,
  designDir: string,
  designInfo: DesignInfo,
): void {
  const hasSubstantiveSource =
    designInfo.problemStatement.trim().length > 0 ||
    designInfo.overview.trim().length > 0 ||
    designInfo.goals.length > 0 ||
    designInfo.successCriteria.length > 0 ||
    designInfo.components.length > 0 ||
    designInfo.constraints.length > 0 ||
    designInfo.outOfScope.length > 0

  if (!hasSubstantiveSource) {
    throw new Error(
      `Cannot generate PRD for '${feature}' because no substantive design or requirement model was found in ${designDir}.`,
    )
  }
}

export function assertNoUnresolvedPlaceholders(content: string): void {
  const unresolved = content.match(/\{\{\w+\}\}/g)
  if (unresolved && unresolved.length > 2) {
    throw new Error(
      `PRD contains ${unresolved.length} unresolved placeholders: ${unresolved.join(', ')}`,
    )
  }
}

export function getDefaultPrdTemplate(): string {
  return `# {{feature}} - Product Requirements Document

**Date**: {{date}}
**Version**: 1.0
**Priority**: {{priority}}
**Status**: Draft

---

## 1. 功能描述

### ${t('templates.prd.sectionBackgroundGoals')}

{{backgroundAndGoals}}

### ${t('templates.prd.sectionOverview')}

{{overviewAndConstraints}}

---

## 2. 用户故事

{{userStories}}

---

## 3. 验收标准

### ${t('templates.prd.sectionAcceptance')}

{{acceptanceCriteria}}

### 3.2 非功能验收

{{nonFunctionalAcceptance}}

---

## 4. 功能范围

### 4.1 In Scope

{{inScope}}

### 4.2 Out of Scope

{{outOfScope}}

---

## ${t('templates.prd.sectionPriority')}

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 核心功能 | P0 | ${t('templates.prd.priorityP0')} |
| 重要功能 | P1 | ${t('templates.prd.priorityP1')} |
| 增强功能 | P2 | ${t('templates.prd.priorityP2')} |
| 未来功能 | P3 | ${t('templates.prd.priorityP3')} |

---

## 6. 相关文档

- [设计文档](./design.md)
- [执行计划](../../.openflow/plans/{{feature}}.md)

---

## 7. 变更历史

| 日期 | 版本 | 变更内容 | 作者 |
|------|------|----------|------|
| {{date}} | 1.0 | 初始版本 | - |
`
}
