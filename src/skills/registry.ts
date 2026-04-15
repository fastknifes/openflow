import type { SkillInfo } from './types.js'
import { getArchiveSkill } from './archive-skill.js'
import { getBrainstormSkill } from './brainstorm-skill.js'
import { getVerifySkill } from './verify-skill.js'

export function getSkills(): SkillInfo[] {
  return [
    getBrainstormSkill(),
    getVerifySkill(),
    getArchiveSkill(),
  ]
}

export function findSkillByName(name: string): SkillInfo | undefined {
  return getSkills().find((skill) => skill.name === name)
}
