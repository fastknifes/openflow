import type { SkillInfo } from './types.js'
import { getWritingPlanSkill } from './writing-plan-skill.js'
import { getBrainstormSkill } from './brainstorm-skill.js'
import { getQualityGateSkill } from './quality-gate-skill.js'
import { getAiReflectionSkill } from './ai-reflection-skill.js'
import { getTddSkill } from './tdd-skill.js'
import { OPENFLOW_REGISTERED_SKILL_NAMES } from '../commands/manifest.js'
import type { OpenFlowConfig } from '../types.js'

const SKILL_FACTORIES = {
  'openflow-writing-plan': getWritingPlanSkill,
  'openflow-brainstorm': getBrainstormSkill,
  'openflow-quality-gate': getQualityGateSkill,
  'openflow-ai-reflection': getAiReflectionSkill,
  'openflow-tdd': getTddSkill,
} as const satisfies Record<typeof OPENFLOW_REGISTERED_SKILL_NAMES[number], () => SkillInfo>

export function getSkills(config?: OpenFlowConfig): SkillInfo[] {
  return OPENFLOW_REGISTERED_SKILL_NAMES
    .filter((name) => {
      if (name === 'openflow-tdd') {
        return config?.tdd.enabled ?? true
      }
      return true
    })
    .map((name) => SKILL_FACTORIES[name]())
}

export function findSkillByName(name: string): SkillInfo | undefined {
  return getSkills().find((skill) => skill.name === name)
}
