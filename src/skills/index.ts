export { getSkills, findSkillByName } from './registry.js'
export { getFeatureSkill } from './feature-skill.js'
export { getInitSkill } from './init-skill.js'
export { getVerifySkill } from './verify-skill.js'
export { getArchiveSkill } from './archive-skill.js'

import { findSkillByName, getSkills } from './registry.js'

export function getAvailableSkills(): string[] {
  return getSkills().map((skill) => skill.name)
}

export function getSkillContent(name: string): string | undefined {
  return findSkillByName(name)?.content
}
