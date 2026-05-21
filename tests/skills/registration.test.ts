import { describe, expect, test } from 'bun:test'
import { readFile, rm } from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { registerSkills } from '../../src/skills/registration.js'
import { findSkillByName } from '../../src/skills/registry.js'
import { defaultConfig, type OpenFlowContext } from '../../src/types.js'

function createContext(directory: string): OpenFlowContext {
  return {
    directory,
    worktree: directory,
    client: {},
    $: {},
    config: { ...defaultConfig },
    enhancedPlans: new Set<string>(),
  }
}

describe('skill registration', () => {
  test('registers writing-plan and brainstorm as discovered OpenFlow SKILL.md entries', async () => {
    const root = join(process.cwd(), '.test-skill-registration')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const writingPlanSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(writingPlanSkillPath, 'utf-8')

    expect(content).toContain('name: openflow-writing-plan')
    expect(content).toContain('description:')
    expect(content).toContain('development plan')
    expect(content).toContain('/openflow-writing-plan <feature>')
    expect(content).toContain('openflow-writing-plan <feature>')
    expect(content).toContain('Do NOT invoke this skill from brainstorm, ULW/ultrawork, or continuation flow unless the user explicitly asked for plan generation')

    const brainstormSkillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-brainstorm', 'SKILL.md')
    const brainstormContent = await readFile(brainstormSkillPath, 'utf-8')
    expect(brainstormContent).toContain('name: openflow-brainstorm')
    expect(brainstormContent).toContain('description:')
    expect(brainstormContent).toContain('/openflow-feature')
  })
})

describe('writing-plan skill content contract', () => {
  test('skill content uses ## Tasks in template example, not ## TODOs', async () => {
    const root = join(process.cwd(), '.test-skill-contract-tasks')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const skillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(skillPath, 'utf-8')

    // The plan template in the skill content must use ## Tasks, not ## TODOs
    // Extract the template section between ```markdown fences
    const fenceStart = content.indexOf('```markdown')
    const fenceEnd = content.indexOf('```', fenceStart + 3)
    const templateSection = fenceStart > -1 && fenceEnd > fenceStart
      ? content.substring(fenceStart, fenceEnd)
      : content

    // Contract: template example must use ## Tasks
    expect(templateSection).toContain('## Tasks')
    // Contract: template must NOT promote ## TODOs
    expect(templateSection).not.toContain('## TODOs')

    await rm(root, { recursive: true, force: true })
  })

  test('skill content does not contain forbidden subagent-dispatch wording', async () => {
    const root = join(process.cwd(), '.test-skill-no-forbidden')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const skillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(skillPath, 'utf-8')

    const forbidden = [
      'maximum parallel execution',
      'one file per task',
      'dispatch each same-wave task as a subagent',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }

    await rm(root, { recursive: true, force: true })
  })

  test('skill content includes openflow-quality-gate as final verification instruction', async () => {
    const root = join(process.cwd(), '.test-skill-quality-gate')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const skillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(skillPath, 'utf-8')

    // Contract: openflow-quality-gate must remain the final verification authority
    expect(content).toContain('openflow-quality-gate')
    // Must include the quality gate handoff instruction
    expect(content).toContain('Do not claim completion until the quality gate reports readiness')
    // The Step 7 quality gate section must NOT provide positive instructions to
    // run /openflow-harden or /openflow-verify directly (negatives like "Do NOT run"
    // are acceptable as guard instructions)
    const step7Start = content.indexOf('### Step 7:')
    const step7End = content.indexOf('### Step 8:', step7Start)
    const step7Section = step7End > step7Start
      ? content.substring(step7Start, step7End)
      : content.substring(step7Start)
    // Step 7 must reference quality-gate
    expect(step7Section).toContain('openflow-quality-gate')
    // Step 7: positive instructions should reference quality-gate, not direct harden/verify
    // (the "Do NOT" guard line is allowed but the handoff text must use quality-gate)
    const qualityGateReference = 'After implementation is complete, invoke the openflow-quality-gate skill'
    expect(step7Section).toContain(qualityGateReference)

    await rm(root, { recursive: true, force: true })
  })

  test('skill content includes both docs/changes/ primary and .sisyphus/plans/ OMO copy paths', async () => {
    const root = join(process.cwd(), '.test-skill-dual-path')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const skillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(skillPath, 'utf-8')

    // Contract: skill must mention both output paths
    expect(content).toContain('docs/changes/')
    expect(content).toContain('.sisyphus/plans/')

    await rm(root, { recursive: true, force: true })
  })
})

describe('writing-plan skill content: superpowers steps', () => {
  test('skill contains all 8 superpowers-style step labels', async () => {
    const root = join(process.cwd(), '.test-skill-superpowers')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const skillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(skillPath, 'utf-8')

    const steps = [
      'Scope Check',
      'File Structure',
      'Plan Document Header',
      'Task Structure',
      'No Placeholders',
      'Remember',
      'Self-Review',
      'Execution Handoff',
    ]
    for (const step of steps) {
      expect(content).toContain(step)
    }

    await rm(root, { recursive: true, force: true })
  })

  test('skill includes blocking clarification language', async () => {
    const root = join(process.cwd(), '.test-skill-blocking')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const skillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(skillPath, 'utf-8')

    expect(content).toContain('stop and ask clarifying questions')
    expect(content).not.toContain('[DECISION NEEDED]')

    await rm(root, { recursive: true, force: true })
  })

  test('skill includes Prometheus precedence and agent routing', async () => {
    const root = join(process.cwd(), '.test-skill-prometheus')
    await rm(root, { recursive: true, force: true })

    await registerSkills(createContext(root))

    const skillPath = join(os.homedir(), '.config', 'opencode', 'skills', 'openflow-writing-plan', 'SKILL.md')
    const content = await readFile(skillPath, 'utf-8')

    expect(content).toContain('Prometheus Precedence')
    expect(content).toContain('Prometheus wins')
    expect(content).toContain('Agent Target')
    expect(content).toContain('plan agent')

    await rm(root, { recursive: true, force: true })
  })
})

// ---------------------------------------------------------------------------
// Negative-scope: openflow-reflect must not be registered as a skill
// The MVP uses openflow-ai-reflection as the skill name; openflow-reflect
// must not exist as a discoverable skill.
// ---------------------------------------------------------------------------

describe('negative scope: no openflow-reflect skill', () => {
  test('findSkillByName does not discover openflow-reflect', () => {
    const skill = findSkillByName('openflow-reflect')
    expect(skill).toBeUndefined()
  })

  test('findSkillByName does not discover openflow-feature as a skill', () => {
    const skill = findSkillByName('openflow-feature')
    expect(skill).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// AI Reflection skill contract tests
// These tests define the contract for the openflow-ai-reflection skill BEFORE
// implementation. They are expected to FAIL until Task 2 registers the skill.
// ---------------------------------------------------------------------------

describe('openflow-ai-reflection skill registration contract', () => {
  test('findSkillByName discovers openflow-ai-reflection in the skill registry', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()
    expect(skill!.name).toBe('openflow-ai-reflection')
    expect(skill!.description.length).toBeGreaterThan(0)
  })

  test('skill description mentions AI self-triggering and reflection', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const desc = skill!.description.toLowerCase()
    expect(desc).toContain('ai')
    expect(desc).toContain('reflect')
  })
})

describe('openflow-issue skill registration contract', () => {
  test('findSkillByName discovers openflow-issue in the skill registry', () => {
    const skill = findSkillByName('openflow-issue')
    expect(skill).toBeDefined()
    expect(skill!.name).toBe('openflow-issue')
    expect(skill!.description).toContain('Issue investigation')
  })

  test('openflow-issue skill describes packet-first investigation and no auto-archive', () => {
    const skill = findSkillByName('openflow-issue')
    expect(skill).toBeDefined()
    expect(skill!.content).toContain('issue packet')
    expect(skill!.content).toContain('Do not auto-archive')
  })
})

describe('openflow-quality-gate skill trigger-boundary contract', () => {
  test('skill is post-implementation and does not require trivial non-implementation gates', () => {
    const skill = findSkillByName('openflow-quality-gate')
    expect(skill).toBeDefined()

    const content = skill!.content
    expect(content).toContain('implementation code changes or bug fixes')
    expect(content).toContain('design-only, planning-only, metadata-only, or feature-renaming')
    expect(content).not.toContain('Do NOT skip the quality gate even for "trivial" changes')
  })

  test('skill forbids creating workflow artifacts merely to satisfy readiness', () => {
    const skill = findSkillByName('openflow-quality-gate')
    expect(skill).toBeDefined()

    const content = skill!.content
    expect(content).toContain('Do not create missing workflow artifacts merely to satisfy the gate')
    expect(content).toContain('Do NOT create plan.md, design.md, behavior.md, or issue-clarification.md merely to make the gate pass')
  })
})

describe('openflow-ai-reflection content: self-triggering language', () => {
  test('skill content says AI self-triggers and does not ask the user to run a reflection command', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must state that AI self-triggers
    expect(content).toContain('self-trigger')
    // Must not instruct the user to run a command
    expect(content).not.toContain('/openflow-reflect')
    expect(content).not.toContain('run a reflection command')
    expect(content).not.toContain('ask the user to run')
  })

  test('skill content states user correction is a signal for AI self-triggering', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    expect(content).toContain('User correction')
    expect(content).toContain('self-trigger')
  })
})

describe('openflow-ai-reflection content: trigger rules', () => {
  test('must-trigger section exists with blocking language', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must contain Must Trigger heading and blocking language
    expect(content).toContain('## Must Trigger')
    expect(content).toContain('before claiming completion')
  })

  test('should-trigger section exists with non-blocking language', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Should contain Should Trigger heading
    expect(content).toContain('## Should Trigger')
    // Should use non-blocking language
    expect(content).toContain('does not block completion')
  })

  test('must-not-trigger section exists with scope boundaries', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must contain Must Not Trigger heading
    expect(content).toContain('## Must Not Trigger')
    // Must exclude trivial noise
    expect(content).toContain('typos')
    expect(content).toContain('formatting nits')
  })
})

describe('openflow-ai-reflection content: canonical categories', () => {
  const canonicalCategories = [
    'premature-implementation',
    'verification-skipped',
    'docs-misuse',
    'delegation-misuse',
    'context-loss',
  ]

  test.each(canonicalCategories)('skill content defines category "%s"', (category) => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    expect(content).toContain(category)
  })
})

describe('openflow-ai-reflection content: required reflection fields', () => {
  const requiredFields = [
    'category',
    'summary',
    'trigger',
    'context',
    'what went wrong',
    'root cause',
    'correct behavior',
    'recurrence signal',
    'evidence',
    'classification',
    'corrective rule',
    'scope boundary',
    'promotion decision',
  ]

  test.each(requiredFields)('skill content requires field "%s" in case content', (field) => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content.toLowerCase()
    expect(content).toContain(field.toLowerCase())
  })
})

describe('openflow-ai-reflection content: docs path and templates', () => {
  test('skill content references docs/current/workflow/ai-reflection/', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    expect(content).toContain('docs/current/workflow/ai-reflection/')
  })

  test('skill content contains markdown template section with fenced template', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must contain a Markdown Templates heading
    expect(content).toContain('## Markdown Templates')
    // Must contain a fenced code block with md language tag
    expect(content).toContain('```md')
  })

  test('index template separates reusable rules from concrete case samples', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    expect(content).toContain('## Reusable Rules')
    expect(content).toContain('## Trigger Patterns')
    expect(content).toContain('## Boundary Rules')
    expect(content).toContain('## Case Samples')
    expect(content).toContain('detailed failure evidence in the case files below')
  })
})

describe('openflow-ai-reflection content: promotion boundaries', () => {
  test('skill content defines promotion boundaries and forbids auto-promotion', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must contain a Promotion Boundaries heading
    expect(content).toContain('## Promotion Boundaries')
    // Must forbid automatic promotion into global rules
    expect(content).toContain('Do not edit AGENTS.md')
    // Must state that promotion is recommendation-only
    expect(content).toContain('promotion')
  })

  test('skill content forbids slash commands, hooks, listeners, guardians, and background tasks', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must explicitly state these are not part of the skill
    expect(content).toContain('not a slash command')
    expect(content).toContain('background')
  })
})

// ---------------------------------------------------------------------------
// Negative-scope compatibility checks
// These tests verify the skill does NOT register runtime artifacts and does
// not promise/enable command handlers, hooks, listeners, guardians, background
// automation, or auto-promotion as capabilities.
// ---------------------------------------------------------------------------

describe('openflow-ai-reflection negative scope: no runtime registration', () => {
  test('skill content does not promise or enable an event listener', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    // The content may *mention* listeners in exclusion context ("no event listener"),
    // but must not describe how to attach, register, or use one.
    // Positive-imperative phrasing that would indicate enabling:
    const forbidden = [
      'register an event listener',
      'attach a listener',
      'addListener',
      'addEventListener',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })

  test('skill content does not promise or enable a hook', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    // Negative wording like "no hook" is allowed; positive enablement is not.
    const forbidden = [
      'register a hook',
      'addHook',
      'useHook',
      'implement a hook',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })

  test('skill content does not promise or enable a guardian or background task', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    // Negative wording like "no guardian" or "no background task" is allowed.
    const forbidden = [
      'start a guardian',
      'launch a guardian',
      'spawn a background',
      'start a background task',
      'run a background',
      'setInterval',
      'setTimeout',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })

  test('skill content does not promise or enable automatic promotion of reflection lessons', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    // Negative wording like "does not perform automatic promotion" is allowed and expected.
    // Positive-imperative promotion instructions are forbidden.
    const forbidden = [
      'automatically promote',
      'auto-promote',
      'promote automatically',
      'silently promote',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
    // The content must explicitly state that promotion is NOT automatic
    expect(content).toContain('not')
    expect(content).toContain('automatic promotion')
  })

  test('skill content does not provide a command handler or tool registration', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content
    // Positive-imperative phrasing that would indicate enabling.
    // Note: "command handler" appears in MVP exclusion text — that is allowed.
    const forbidden = [
      'plugin.tool',
      'registerTool',
      'registerCommand',
      'tool handler',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })

  test('skill content explicitly lists MVP non-goals in ## MVP Scope section', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must have the MVP Scope section that lists what is excluded
    expect(content).toContain('## MVP Scope')
    // Must explicitly state exclusion of slash command
    expect(content).toContain('slash command')
    // Must explicitly state exclusion of plugin tool registration
    expect(content).toContain('plugin tool registration')
    // Must explicitly state exclusion of event listener/guardian/background
    expect(content).toContain('event listener')
    expect(content).toContain('guardian')
    // Must explicitly state no automatic promotion
    expect(content).toContain('automatic promotion')
  })
})

// ---------------------------------------------------------------------------
// P0+P1: Corrective-rule pre-work guidance in AI reflection skill
// These tests assert the skill includes a pre-work section that instructs the
// AI to check existing corrective rules BEFORE writing a new reflection case.
// They are expected to FAIL until production content is updated.
// ---------------------------------------------------------------------------

describe('openflow-ai-reflection content: corrective-rule pre-work guidance', () => {
  test('skill content has a pre-work / check-existing-corrective-rules section', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must have a section heading about pre-work or checking existing rules
    const hasPreWorkSection =
      content.includes('## Pre-Work') ||
      content.includes('## Pre-work') ||
      content.includes('## Check Existing Corrective Rules') ||
      content.includes('## Existing Rules')
    expect(hasPreWorkSection).toBe(true)
  })

  test('pre-work section references docs/current/workflow/ai-reflection/ for rule lookup', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // The pre-work section must reference the reflection docs path
    // (The path already appears elsewhere in the skill; confirm it appears
    //  in a pre-work context — at minimum the path must be present)
    expect(content).toContain('docs/current/workflow/ai-reflection/')
  })

  test('pre-work section says absence of related rules is non-blocking', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must state that absence or no related rules is not a blocker
    const hasNonBlockingAbsence =
      content.includes('does not block') ||
      content.includes('non-blocking') ||
      content.includes('no related rules') ||
      content.includes('absence') ||
      content.includes('没有相关规则') ||
      content.includes('不存在')
    expect(hasNonBlockingAbsence).toBe(true)
  })

  test('pre-work section mentions smallest relevant set or category index', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must reference reading the smallest relevant set or using category index
    const hasSmallestRelevant =
      content.includes('smallest relevant') ||
      content.includes('category index') ||
      content.includes('relevant category') ||
      content.includes('最小相关') ||
      content.includes('relevant set')
    expect(hasSmallestRelevant).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// P0+P1: Corrective-rule check in quality-gate skill
// These tests assert the quality-gate skill includes a step to check existing
// corrective rules during verification.
// They are expected to FAIL until production content is updated.
// ---------------------------------------------------------------------------

describe('openflow-quality-gate content: corrective-rule reflection check', () => {
  test('quality-gate skill content includes a reflection corrective rule check', () => {
    const skill = findSkillByName('openflow-quality-gate')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must mention checking corrective rules or reflection rules
    const hasReflectionCheck =
      content.includes('corrective rule') ||
      content.includes('reflection') ||
      content.includes('ai-reflection')
    expect(hasReflectionCheck).toBe(true)
  })

  test('quality-gate skill content references docs/current/workflow/ai-reflection/', () => {
    const skill = findSkillByName('openflow-quality-gate')
    expect(skill).toBeDefined()

    const content = skill!.content

    expect(content).toContain('docs/current/workflow/ai-reflection/')
  })

  test('quality-gate skill scopes corrective-rule check to relevant rules only', () => {
    const skill = findSkillByName('openflow-quality-gate')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must indicate the check is scoped — not reading all reflection docs
    const hasScopedCheck =
      content.includes('relevant') ||
      content.includes('scoped') ||
      content.includes('applicable') ||
      content.includes('related')
    expect(hasScopedCheck).toBe(true)
  })

  test('quality-gate skill says missing reflection docs are not a blocker', () => {
    const skill = findSkillByName('openflow-quality-gate')
    expect(skill).toBeDefined()

    const content = skill!.content

    // Must state that missing or absent reflection docs do not block readiness
    const hasMissingNonBlocker =
      content.includes('not a blocker') ||
      content.includes('does not block') ||
      content.includes('not blocking') ||
      content.includes('absence') ||
      content.includes('missing reflection') ||
      content.includes('no reflection docs')
    expect(hasMissingNonBlocker).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// P0+P1: Negative scope — new corrective-rule content must not imply
// hooks, listeners, background automation, or automatic promotion.
// ---------------------------------------------------------------------------

describe('openflow-ai-reflection corrective-rule content: negative scope', () => {
  test('new corrective-rule guidance does not introduce hooks or listeners', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    const forbidden = [
      'register a hook',
      'addHook',
      'register an event listener',
      'addEventListener',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })

  test('new corrective-rule guidance does not imply background automation', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    const forbidden = [
      'start a guardian',
      'spawn a background',
      'start a background task',
      'setInterval',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })

  test('new corrective-rule guidance does not enable automatic promotion', () => {
    const skill = findSkillByName('openflow-ai-reflection')
    expect(skill).toBeDefined()

    const content = skill!.content

    const forbidden = [
      'automatically promote',
      'auto-promote',
      'promote automatically',
      'silently promote',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })
})

describe('openflow-quality-gate corrective-rule content: negative scope', () => {
  test('new corrective-rule check does not introduce hooks, listeners, or background automation', () => {
    const skill = findSkillByName('openflow-quality-gate')
    expect(skill).toBeDefined()

    const content = skill!.content

    const forbidden = [
      'register a hook',
      'addHook',
      'register an event listener',
      'addEventListener',
      'start a guardian',
      'spawn a background',
      'start a background task',
      'setInterval',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })

  test('new corrective-rule check does not enable automatic promotion', () => {
    const skill = findSkillByName('openflow-quality-gate')
    expect(skill).toBeDefined()

    const content = skill!.content

    const forbidden = [
      'automatically promote',
      'auto-promote',
      'promote automatically',
      'silently promote',
    ]
    for (const phrase of forbidden) {
      expect(content).not.toContain(phrase)
    }
  })
})
