import type { SkillInfo } from './types.js'
import { getWritingPlanSkill } from './writing-plan-skill.js'
import { getBrainstormSkill } from './brainstorm-skill.js'
import { getQualityGateSkill } from './quality-gate-skill.js'
import { getAiReflectionSkill } from './ai-reflection-skill.js'
import { getIssueSkill } from './issue-skill.js'
import { OPENFLOW_REGISTERED_SKILL_NAMES } from '../commands/manifest.js'

const SKILL_FACTORIES = {
  'openflow-writing-plan': getWritingPlanSkill,
  'openflow-brainstorm': getBrainstormSkill,
  'openflow-quality-gate': getQualityGateSkill,
  'openflow-ai-reflection': getAiReflectionSkill,
  'openflow-issue': getIssueSkill,
} as const satisfies Record<typeof OPENFLOW_REGISTERED_SKILL_NAMES[number], () => SkillInfo>

export function getSkills(): SkillInfo[] {
  return OPENFLOW_REGISTERED_SKILL_NAMES.map((name) => SKILL_FACTORIES[name]())
}

export function findSkillByName(name: string): SkillInfo | undefined {
  return getSkills().find((skill) => skill.name === name)
}
