import type { SkillInfo } from './types.js'
import { getWritingPlanSkill } from './writing-plan-skill.js'

export function getSkills(): SkillInfo[] {
  return [
    getWritingPlanSkill(),
  ]
}

export function findSkillByName(name: string): SkillInfo | undefined {
  return getSkills().find((skill) => skill.name === name)
}
