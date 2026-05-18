import type { TaskType } from '../types.js'

export interface ParsedTask {
  id: number
  title: string
  description: string
  type: TaskType
  dependencies: number[]
  isImplementation: boolean
  raw: string
  lineNumber: number
}

const SECTION_END_MARKERS = [
  /^##\s*(Success\s*Criteria|Final\s*Checklist|Verification|Commit\s*Strategy|Execution|Notes|References|Appendix)/i,
  /^---\s*$/,
  /^##\s*[^T]/,
]

export function parsePlanTasks(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const lines = content.split('\n')

  let taskNumber = 0
  let inTaskSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    if (/^##?\s*(Tasks?|TODOs?|任务)/i.test(line)) {
      inTaskSection = true
      continue
    }

    if (!inTaskSection) continue

    if (SECTION_END_MARKERS.some(pattern => pattern.test(line))) {
      break
    }

    if (/^##[^#\s]/.test(line) && !/^##\s*(Wave|Task|Step)/i.test(line)) {
      break
    }

    const taskMatch = line.match(/^[-*]\s*\[[ x]\]\s*(.+)$|^(\d+)\.\s+(.+)$/)

    if (taskMatch) {
      taskNumber++
      const title = taskMatch[1] ?? taskMatch[3] ?? ''
      const cleanTitle = title.trim()

      if (cleanTitle.length < 2) continue

      tasks.push({
        id: taskNumber,
        title: cleanTitle,
        description: '',
        type: classifyTaskType(cleanTitle),
        dependencies: [],
        isImplementation: isImplementationTask(cleanTitle),
        raw: line,
        lineNumber: i + 1,
      })
    }
  }

  return tasks
}

export function classifyTaskType(title: string): TaskType {
  const lowerTitle = title.toLowerCase()

  if (/test|spec|测试/.test(lowerTitle)) return 'test'
  if (/verify|check|review|验证|检查/.test(lowerTitle)) return 'verification'
  if (/setup|config|init|配置|初始化/.test(lowerTitle)) return 'setup'
  if (/implement|create|build|add|实现|创建|开发|添加/.test(lowerTitle)) return 'implementation'

  return 'unknown'
}

export function isImplementationTask(title: string): boolean {
  const lowerTitle = title.toLowerCase()
  return /implement|create|build|add|develop|实现|创建|开发|添加|编写/.test(lowerTitle)
}

export function extractPlanName(filePath: string): string | null {
  // .sisyphus/plans/{feature}.md
  let match = filePath.match(/plans[\/\\]([^\/\\]+)\.md$/i)
  if (match) return match[1] ?? null

  // docs/changes/YYYY-MM-DD-{feature}/plan.md
  match = filePath.match(/changes[\/\\]([^\/\\]+)[\/\\]plan\.md$/i)
  if (match) {
    const raw = match[1] ?? ''
    // Strip date prefix from YYYY-MM-DD-feature → feature
    const stripped = raw.replace(/^\d{4}-\d{2}-\d{2}-/, '')
    return stripped || raw
  }

  return null
}
