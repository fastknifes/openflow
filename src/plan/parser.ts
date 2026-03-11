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

export function parsePlanTasks(content: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const lines = content.split('\n')

  let taskNumber = 0
  let inTaskSection = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue

    if (/^##?\s*(Tasks?|任务)/i.test(line)) {
      inTaskSection = true
      continue
    }

    if (!inTaskSection) continue

    const taskMatch = line.match(/^[-*]\s*\[[ x]\]\s*(.+)$|^(\d+)\.\s+(.+)$|^##\s+(.+)$/i)

    if (taskMatch) {
      taskNumber++
      const title = taskMatch[1] ?? taskMatch[3] ?? taskMatch[4] ?? ''
      const cleanTitle = title.trim()

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
  const match = filePath.match(/plans[\/\\]([^\/\\]+)\.md$/i)
  return match?.[1] ?? null
}
