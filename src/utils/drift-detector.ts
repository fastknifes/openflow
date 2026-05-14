import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { RequirementModelSchema, type RequirementModel } from '../phases/feature/requirement-model.js'
import type { DriftItem, PhasedChanges } from '../types.js'
import { logger } from './logger.js'

interface DesignDocContent {
  features: string[]
  modules: string[]
  keywords: string[]
}

async function readDesignDoc(designDir: string): Promise<DesignDocContent | null> {
  const model = await readRequirementModelFromWorkspace(designDir)
  if (model) {
    return designDocContentFromModel(model)
  }

  const result: DesignDocContent = {
    features: [],
    modules: [],
    keywords: []
  }
  
  try {
    const files = await fs.readdir(designDir)
    const mdFiles = files.filter(f => f.endsWith('.md'))
    
    for (const file of mdFiles) {
      const filePath = path.join(designDir, file)
      const content = await fs.readFile(filePath, 'utf-8')
      
      const featureMatches = content.match(/##?\s*(.+)/g) || []
      for (const match of featureMatches) {
        const feature = match.replace(/^##?\s*/, '').trim()
        if (feature && feature.length < 100) {
          result.features.push(feature)
        }
      }
      
      const moduleMatches = content.match(/(?:src|lib|app)\/[\w/]+/g) || []
      result.modules.push(...moduleMatches)
      
      const keywordMatches = content.match(/`([^`]+)`/g) || []
      for (const match of keywordMatches) {
        result.keywords.push(match.replace(/`/g, ''))
      }
    }
    
    return result
  } catch {
    return null
  }
}

async function readRequirementModelFromWorkspace(designDir: string): Promise<RequirementModel | null> {
  const sidecarPath = path.join(designDir, 'design.meta.json')

  try {
    const content = await fs.readFile(sidecarPath, 'utf-8')
    return RequirementModelSchema.parse(JSON.parse(content) as unknown)
  } catch {
    return null
  }
}

function designDocContentFromModel(model: RequirementModel): DesignDocContent {
  return {
    features: [
      ...model.goals,
      ...model.constraints.map(constraint => constraint.description),
      ...model.acceptanceCriteria.map(criterion => criterion.description),
    ],
    modules: model.expectedModules?.map(module => module.path) ?? [],
    keywords: model.expectedSymbols?.map(symbol => symbol.name) ?? [],
  }
}

function extractCodeKeywords(content: string): string[] {
  const keywords: string[] = []
  
  const exportMatches = content.match(/export\s+(?:async\s+)?function\s+(\w+)/g) || []
  for (const match of exportMatches) {
    const fnName = match.replace(/export\s+(?:async\s+)?function\s+/, '')
    keywords.push(fnName)
  }
  
  const classMatches = content.match(/export\s+class\s+(\w+)/g) || []
  for (const match of classMatches) {
    const className = match.replace(/export\s+class\s+/, '')
    keywords.push(className)
  }
  
  const constMatches = content.match(/export\s+const\s+(\w+)/g) || []
  for (const match of constMatches) {
    const constName = match.replace(/export\s+const\s+/, '')
    keywords.push(constName)
  }
  
  return keywords
}

async function analyzeAcceptanceChanges(
  baseDir: string,
  acceptanceChanges: Array<{ filePath: string }>
): Promise<Map<string, string[]>> {
  const codeKeywords = new Map<string, string[]>()
  
  for (const change of acceptanceChanges) {
    const fullPath = path.join(baseDir, change.filePath)
    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      const keywords = extractCodeKeywords(content)
      if (keywords.length > 0) {
        codeKeywords.set(change.filePath, keywords)
      }
    } catch {
      // File might not exist
    }
  }
  
  return codeKeywords
}

export async function detectDrift(
  baseDir: string,
  designDir: string,
  phasedChanges: PhasedChanges
): Promise<DriftItem[]> {
  const drifts: DriftItem[] = []
  
  if (phasedChanges.acceptance.length === 0) {
    return drifts
  }
  
  const designContent = await readDesignDoc(designDir)
  if (!designContent) {
    logger.warn('Could not read design document for drift detection')
    return drifts
  }
  
  const codeKeywords = await analyzeAcceptanceChanges(baseDir, phasedChanges.acceptance)

  for (const change of phasedChanges.acceptance) {
    if (designContent.modules.length === 0) {
      continue
    }

    const filePath = normalizePath(change.filePath)
    const inDesignModule = designContent.modules.some(modulePath => filePath.includes(normalizePath(modulePath)))
    if (!inDesignModule) {
      drifts.push({
        item: filePath,
        designDoc: designContent.modules.join(', '),
        actualCode: `Implemented in ${filePath}`,
        reason: 'Acceptance-phase change touches a module not expected by the design document',
      })
    }
  }
  
  for (const [filePath, keywords] of codeKeywords) {
    for (const keyword of keywords) {
      const inDesign = designContent.keywords.some(k => 
        k.toLowerCase().includes(keyword.toLowerCase())
      )
      
      if (!inDesign) {
        drifts.push({
          item: keyword,
          designDoc: 'Not mentioned',
          actualCode: `Implemented in ${filePath}`,
          reason: 'New functionality added during acceptance phase'
        })
      }
    }
  }
  
  return drifts
}

function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join('/')
}

export function formatDriftReport(drifts: DriftItem[]): string {
  if (drifts.length === 0) {
    return 'No design document drift detected.'
  }
  
  const lines = [
    '## Design Document Drift Detected',
    '',
    'The following items were implemented during acceptance phase but are not mentioned in the design document:',
    ''
  ]
  
  for (const drift of drifts) {
    lines.push(`- **${drift.item}**: ${drift.actualCode}`)
  }
  
  lines.push('')
  lines.push('Please review and update the design document if necessary.')
  
  return lines.join('\n')
}
