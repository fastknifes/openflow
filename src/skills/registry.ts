import type { SkillInfo } from './types.js'
import { getWritingPlanSkill } from './writing-plan-skill.js'
import { getFeatureSkill } from './feature-skill.js'
import { getBrainstormSkill } from './brainstorm-skill.js'
import { getQualityGateSkill } from './quality-gate-skill.js'

export function getSkills(): SkillInfo[] {
  return [
    getWritingPlanSkill(),
    getFeatureSkill(),
    getBrainstormSkill(),
    getQualityGateSkill(),
  ]
}

export function findSkillByName(name: string): SkillInfo | undefined {
  return getSkills().find((skill) => skill.name === name)
}
