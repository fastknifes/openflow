import { describe, expect, test, afterAll } from 'bun:test'
import { access, mkdir, rm, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { handleIssue } from '../../src/commands/issue.js'
import { loadAcceptanceState } from '../../src/utils/acceptance-state.js'
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

function todayPrefix(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

describe('issue command', () => {
  test('returns helpful prompt with flag documentation when no args provided', async () => {
    const root = join(process.cwd(), '.test-issue-no-args')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root))

    expect(result).toContain('## OpenFlow Issue Clarification')
    expect(result).toContain('No issue description provided')
    expect(result).toContain('Please describe the issue you are investigating')
    expect(result).toContain('--name <slug>')
    expect(result).toContain('--env <local|staging|production>')
    expect(result).toContain('--readonly')
    expect(result).toContain('--write-doc')
    expect(result).toContain('--no-doc')
    expect(result).toContain('--continue')
    expect(result).toContain('--resolve')

    await rm(root, { recursive: true, force: true })
  })

  test('--no-doc returns 8-section markdown and creates no files', async () => {
    const root = join(process.cwd(), '.test-issue-no-doc')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--no-doc "api broken"')

    // All 8 sections present
    expect(result).toContain('### 1. Issue Intake')
    expect(result).toContain('### 2. Requirement Clarification')
    expect(result).toContain('### 3. Constraint Clarification')
    expect(result).toContain('### 4. Evidence Investigation')
    expect(result).toContain('### 5. Semantic Alignment')
    expect(result).toContain('### 6. Classification')
    expect(result).toContain('### 7. Next Action Gate')
    expect(result).toContain('### 8. Governance Promotion')
    expect(result).toContain('api broken')
    expect(result).toContain('Slug: `api-broken`')

    // No files created
    const changesDir = join(root, 'docs', 'changes')
    await expect(access(changesDir)).rejects.toBeDefined()

    await rm(root, { recursive: true, force: true })
  })

  test('--write-doc with --name writes issue-clarification.md with all 8 sections', async () => {
    const root = join(process.cwd(), '.test-issue-write-doc')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const date = todayPrefix()
    const result = await handleIssue(createContext(root), '--write-doc "api broken" --name api-broken')

    // Output contains all sections
    expect(result).toContain('### 1. Issue Intake')
    expect(result).toContain('### 2. Requirement Clarification')
    expect(result).toContain('### 3. Constraint Clarification')
    expect(result).toContain('### 4. Evidence Investigation')
    expect(result).toContain('### 5. Semantic Alignment')
    expect(result).toContain('### 6. Classification')
    expect(result).toContain('### 7. Next Action Gate')
    expect(result).toContain('### 8. Governance Promotion')

    // File was written
    const docPath = join(root, 'docs', 'changes', `${date}-api-broken`, 'issue-clarification.md')
    await expect(access(docPath)).resolves.toBeNull()
    const fileContent = await readFile(docPath, 'utf-8')
    expect(fileContent).toContain('### 1. Issue Intake')
    expect(fileContent).toContain('### 2. Requirement Clarification')
    expect(fileContent).toContain('### 3. Constraint Clarification')
    expect(fileContent).toContain('### 4. Evidence Investigation')
    expect(fileContent).toContain('### 5. Semantic Alignment')
    expect(fileContent).toContain('### 6. Classification')
    expect(fileContent).toContain('### 7. Next Action Gate')
    expect(fileContent).toContain('### 8. Governance Promotion')
    expect(fileContent).toContain('Slug: `api-broken`')

    await rm(root, { recursive: true, force: true })
  })

  test('--readonly includes read-only guardrails in output', async () => {
    const root = join(process.cwd(), '.test-issue-readonly')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '"login 500 error" --readonly')

    // Readonly guardrails in constraint section
    expect(result).toContain('read_only_guard')
    expect(result).toContain('ENABLED')
    // Readonly guardrails in evidence section
    expect(result).toContain('read_only_guardrails')
    expect(result).toContain('No filesystem writes permitted')
    expect(result).toContain('No data mutations permitted')
    expect(result).toContain('No configuration changes permitted')
    // Mode flags include readonly
    expect(result).toContain('readonly')

    await rm(root, { recursive: true, force: true })
  })

  test('--env production marks environment as production and includes readonly guardrails', async () => {
    const root = join(process.cwd(), '.test-issue-env-production')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '"login 500 error" --env production')

    // Environment marked as production
    expect(result).toContain('production')
    // Readonly guardrails active (production implies readonly)
    expect(result).toContain('read_only_guard')
    expect(result).toContain('ENABLED')
    expect(result).toContain('read_only_guardrails')
    // Constraint notes
    expect(result).toContain('no writes or mutations allowed')

    await rm(root, { recursive: true, force: true })
  })

  test('--write-doc is skipped in production readonly mode', async () => {
    const root = join(process.cwd(), '.test-issue-production-write-doc')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const date = todayPrefix()
    const result = await handleIssue(createContext(root), '--write-doc "api broken" --name api-broken --env production')

    expect(result).toContain('Write skipped')
    expect(result).toContain('--write-doc is disabled when --readonly or --env production is active')
    const docPath = join(root, 'docs', 'changes', `${date}-api-broken`, 'issue-clarification.md')
    await expect(access(docPath)).rejects.toBeDefined()

    await rm(root, { recursive: true, force: true })
  })

  test('--continue with nonexistent name returns helpful error about missing clarification', async () => {
    const root = join(process.cwd(), '.test-issue-continue-missing')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--continue --name nonexistent')

    expect(result).toContain('## OpenFlow Issue Clarification')
    expect(result).toContain('--continue specified but no existing issue-clarification.md found')
    expect(result).toContain('nonexistent')
    expect(result).toContain('Searched:')
    expect(result).toContain('Run the issue command without --continue')

    await rm(root, { recursive: true, force: true })
  })

  test('--continue with existing name returns prior clarification content with continuation header', async () => {
    const root = join(process.cwd(), '.test-issue-continue-existing')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const date = todayPrefix()

    // First write a doc
    await handleIssue(ctx, '--write-doc "api broken" --name api-broken')

    // Then continue
    const result = await handleIssue(ctx, '--continue --name api-broken')

    expect(result).toContain('## OpenFlow Issue Clarification (Continuation)')
    expect(result).toContain('> **Continuation**: loaded prior clarification from')
    expect(result).toContain(`${date}-api-broken`)
    expect(result).toContain('issue-clarification.md')
    expect(result).toContain('### 1. Issue Intake')
    expect(result).toContain('### 8. Governance Promotion')

    await rm(root, { recursive: true, force: true })
  })

  test('--resolve writes durable issue artifacts without requiring a plan', async () => {
    const root = join(process.cwd(), '.test-issue-resolve')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const date = todayPrefix()
    const result = await handleIssue(createContext(root), '--resolve "cache stale after write" --name cache-stale')

    expect(result).toContain('## Issue Work Node Recorded')
    expect(result).toContain('plan required: no')
    expect(result).toContain('quality gate:')
    expect(result).toContain('openflow-quality-gate')

    const workspace = join(root, 'docs', 'changes', `${date}-cache-stale`)
    const clarificationPath = join(workspace, 'issue-clarification.md')
    const resolutionPath = join(workspace, 'issue-resolution.md')
    const promotionCandidatePath = join(workspace, 'promotion-candidate.md')
    await expect(access(clarificationPath)).resolves.toBeNull()
    await expect(access(resolutionPath)).resolves.toBeNull()
    await expect(access(promotionCandidatePath)).resolves.toBeNull()
    await expect(access(join(root, '.sisyphus', 'plans', 'cache-stale.md'))).rejects.toBeDefined()

    const resolution = await readFile(resolutionPath, 'utf-8')
    expect(resolution).toContain('## Recurrence Signature')
    expect(resolution).toContain('## Future AI Guidance')
    expect(resolution).toContain('cache stale after write')

    const promotionCandidate = await readFile(promotionCandidatePath, 'utf-8')
    expect(promotionCandidate).toContain('## Approval Needed')
    expect(promotionCandidate).toContain('User approval required')

    const state = await loadAcceptanceState(root)
    expect(state?.feature).toBe('cache-stale')
    expect(state?.phase).toBe('verification_pending')
    expect(state?.mode).toBe('issue')
    expect(state?.primaryClassification).toBe('bugfix')
    expect(state?.issueClarificationPath).toBe(clarificationPath)
    expect(state?.promotionCandidatePath).toBe(promotionCandidatePath)
    expect(state?.governancePromotionStatus).toBe('candidate_created')

    await rm(root, { recursive: true, force: true })
  })

  test('--resolve is skipped when --no-doc is active', async () => {
    const root = join(process.cwd(), '.test-issue-resolve-no-doc')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--resolve --no-doc "api broken" --name api-broken')

    expect(result).toContain('Resolve skipped')
    expect(result).toContain('--no-doc')

    await rm(root, { recursive: true, force: true })
  })

  test('--resolve is skipped when --env production is active', async () => {
    const root = join(process.cwd(), '.test-issue-resolve-production')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--resolve "api broken" --name api-broken --env production')

    expect(result).toContain('Resolve skipped')
    expect(result).toContain('--readonly or --env production')

    await rm(root, { recursive: true, force: true })
  })

  test('--resolve result mentions quality gate delegation to openflow-quality-gate', async () => {
    const root = join(process.cwd(), '.test-issue-resolve-harden')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--resolve "trivial fix" --name trivial-fix')

    expect(result).toContain('## Issue Work Node Recorded')
    expect(result).toContain('quality gate:')
    expect(result).toContain('openflow-quality-gate')

    await rm(root, { recursive: true, force: true })
  })

  test('--resolve includes bugfix routing suggestion in Recommended Next Step section', async () => {
    const root = join(process.cwd(), '.test-issue-suggest-bugfix')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--resolve "data not saving" --name data-not-saving')

    expect(result).toContain('### 9. Recommended Next Step')
    expect(result).toContain('Fix recommended')
    expect(result).toContain('/openflow-issue data-not-saving --resolve')

    await rm(root, { recursive: true, force: true })
  })

  test('includes similar historical issues hint when archive has matching issue-resolution.md', async () => {
    const root = join(process.cwd(), '.test-issue-history')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    // Create an archive directory with issue-resolution.md
    const archiveDir = join(root, 'docs', 'archive', '2026-05-01-api-broken')
    await mkdir(archiveDir, { recursive: true })

    const resolutionContent = `# Issue Resolution

## Symptom
The API is returning 500 errors when users try to login

## Root Cause
A null pointer exception in the authentication handler

## Fix Summary
Added null check before processing user credentials

## Files Involved
- src/auth/handler.ts

## Verification Evidence
All tests pass and manual testing confirmed the fix

## Recurrence Signature
Look for 500 errors in the auth endpoint

## Future AI Guidance
Check auth handler null safety first
`
    await writeFile(join(archiveDir, 'issue-resolution.md'), resolutionContent, 'utf-8')

    const result = await handleIssue(createContext(root), '"api broken" --name api-broken')

    expect(result).toContain('### Similar Historical Issues')
    expect(result).toContain('api-broken')
    expect(result).toContain('relevance:')

    await rm(root, { recursive: true, force: true })
  })
})
