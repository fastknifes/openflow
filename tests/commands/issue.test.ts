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

async function writeResolvablePacket(root: string, slug: string, symptom: string, datePrefix = todayPrefix()): Promise<void> {
  const workspace = join(root, 'docs', 'changes', `${datePrefix}-${slug}`)
  await mkdir(workspace, { recursive: true })
  const now = new Date().toISOString()
  await writeFile(join(workspace, 'issue-packet.json'), JSON.stringify({
    version: 1,
    slug,
    symptom,
    environment: 'local',
    status: 'classified',
    classification: 'bugfix',
    confidence: 'high',
    evidence: [{ source: 'test', summary: 'confirmed regression' }],
    hypotheses: ['root cause confirmed'],
    rootCause: 'Confirmed test root cause',
    recommendedAction: 'Apply minimal bugfix',
    requiredChecks: ['bun test'],
    fixSummary: 'Applied minimal bugfix',
    verificationEvidence: 'bun test passed',
    residualRisk: 'none',
    createdAt: now,
    updatedAt: now,
  }, null, 2), 'utf-8')
}

async function writePartialPacket(root: string, slug: string, datePrefix = todayPrefix()): Promise<void> {
  const workspace = join(root, 'docs', 'changes', `${datePrefix}-${slug}`)
  await mkdir(workspace, { recursive: true })
  await writeFile(join(workspace, 'issue-packet.json'), JSON.stringify({
    version: 1,
    slug,
    classification: 'bugfix',
    status: 'classified',
    rootCause: 'Manual packet root cause',
    verificationEvidence: 'Manual verification evidence',
  }, null, 2), 'utf-8')
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

  test('--no-doc returns compact issue packet markdown and creates no files', async () => {
    const root = join(process.cwd(), '.test-issue-no-doc')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--no-doc "api broken"')

    expect(result).toContain('## OpenFlow Issue')
    expect(result).toContain('### Issue')
    expect(result).toContain('### Evidence')
    expect(result).toContain('### Classification')
    expect(result).toContain('### Next Step')
    expect(result).toContain('api broken')
    expect(result).toContain('`api-broken`')

    // No files created
    const changesDir = join(root, 'docs', 'changes')
    await expect(access(changesDir)).rejects.toBeDefined()

    await rm(root, { recursive: true, force: true })
  })

  test('--write-doc with --name writes clarification and issue packet', async () => {
    const root = join(process.cwd(), '.test-issue-write-doc')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const date = todayPrefix()
    const result = await handleIssue(createContext(root), '--write-doc "api broken" --name api-broken')

    expect(result).toContain('## OpenFlow Issue')
    expect(result).toContain('### Classification')

    // File was written
    const docPath = join(root, 'docs', 'changes', `${date}-api-broken`, 'issue-clarification.md')
    const packetPath = join(root, 'docs', 'changes', `${date}-api-broken`, 'issue-packet.json')
    await expect(access(docPath)).resolves.toBeNull()
    await expect(access(packetPath)).resolves.toBeNull()
    const fileContent = await readFile(docPath, 'utf-8')
    expect(fileContent).toContain('## OpenFlow Issue')
    expect(fileContent).toContain('`api-broken`')
    const packet = JSON.parse(await readFile(packetPath, 'utf-8')) as { slug: string; classification: string }
    expect(packet.slug).toBe('api-broken')
    expect(packet.classification).toBe('cannot_determine')

    await rm(root, { recursive: true, force: true })
  })

  test('--readonly includes read-only guardrails in output', async () => {
    const root = join(process.cwd(), '.test-issue-readonly')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '"login 500 error" --readonly')

    expect(result).toContain('## OpenFlow Issue')
    expect(result).toContain('login 500 error')
    expect(result).toContain('cannot_determine')
    await expect(access(join(root, 'docs', 'changes'))).rejects.toBeDefined()

    await rm(root, { recursive: true, force: true })
  })

  test('--env production marks environment as production and includes readonly guardrails', async () => {
    const root = join(process.cwd(), '.test-issue-env-production')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '"login 500 error" --env production')

    expect(result).toContain('production')
    expect(result).toContain('## OpenFlow Issue')

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
    expect(result).toContain('--continue specified but no existing issue-packet.json or issue-clarification.md found')
    expect(result).toContain('nonexistent')
    expect(result).toContain('Searched:')
    expect(result).toContain('Run the issue command without --continue')

    await rm(root, { recursive: true, force: true })
  })

  test('--continue with existing packet renders packet continuation', async () => {
    const root = join(process.cwd(), '.test-issue-continue-existing')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const ctx = createContext(root)
    const date = todayPrefix()

    await handleIssue(ctx, '--write-doc "api broken" --name api-broken')
    const result = await handleIssue(ctx, '--continue --name api-broken')

    expect(result).toContain('## OpenFlow Issue (Continuation)')
    expect(result).toContain('> **Continuation**: loaded issue packet from')
    expect(result).toContain(`${date}-api-broken`)
    expect(result).toContain('issue-packet.json')
    expect(result).toContain('## OpenFlow Issue')

    await rm(root, { recursive: true, force: true })
  })

  test('--resolve is blocked without a complete issue packet', async () => {
    const root = join(process.cwd(), '.test-issue-resolve-blocked')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--resolve "cache stale after write" --name cache-stale')

    expect(result).toContain('## Resolve Blocked')
    expect(result).toContain('classification is still cannot_determine')

    await rm(root, { recursive: true, force: true })
  })

  test('default invocation writes issue packet without markdown clarification', async () => {
    const root = join(process.cwd(), '.test-issue-default-packet')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const date = todayPrefix()
    const result = await handleIssue(createContext(root), 'api broken --name api-broken')

    expect(result).toContain('## OpenFlow Issue')
    await expect(access(join(root, 'docs', 'changes', `${date}-api-broken`, 'issue-packet.json'))).resolves.toBeNull()
    await expect(access(join(root, 'docs', 'changes', `${date}-api-broken`, 'issue-clarification.md'))).rejects.toBeDefined()

    await rm(root, { recursive: true, force: true })
  })

  test('--resolve writes durable issue artifacts without requiring a plan when packet is complete', async () => {
    const root = join(process.cwd(), '.test-issue-resolve')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const date = todayPrefix()
    await writeResolvablePacket(root, 'cache-stale', 'cache stale after write')
    const result = await handleIssue(createContext(root), '--resolve "cache stale after write" --name cache-stale')

    expect(result).toContain('## Issue Work Node Recorded')
    expect(result).toContain('plan required: no')
    expect(result).toContain('verification evidence:')
    expect(result).toContain('quality gate: required before archive / final readiness')
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
    expect(resolution).toContain('Confirmed test root cause')

    const resolvedPacket = JSON.parse(await readFile(join(workspace, 'issue-packet.json'), 'utf-8')) as { status: string }
    expect(resolvedPacket.status).toBe('resolved')

    const promotionCandidate = await readFile(promotionCandidatePath, 'utf-8')
    expect(promotionCandidate).toContain('## Approval Needed')
    expect(promotionCandidate).toContain('User approval required')

    const state = await loadAcceptanceState(root)
    expect(state?.feature).toBe('cache-stale')
    expect(state?.phase).toBe('verification_pending')
    expect(state?.readiness).toBeUndefined()
    expect(state?.verifyResult).toBeUndefined()
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

  test('--resolve result requires quality gate for final readiness', async () => {
    const root = join(process.cwd(), '.test-issue-resolve-harden')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writeResolvablePacket(root, 'trivial-fix', 'trivial fix')
    const result = await handleIssue(createContext(root), '--resolve "trivial fix" --name trivial-fix')

    expect(result).toContain('## Issue Work Node Recorded')
    expect(result).toContain('verification evidence:')
    expect(result).toContain('quality gate: required before archive / final readiness')

    await rm(root, { recursive: true, force: true })
  })

  test('--fix is blocked until classification is available', async () => {
    const root = join(process.cwd(), '.test-issue-suggest-bugfix')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const result = await handleIssue(createContext(root), '--fix "data not saving" --name data-not-saving')

    expect(result).toContain('Fix blocked')
    expect(result).toContain('classify the issue')
    expect(result).toContain('- **status**: `reported`')

    await rm(root, { recursive: true, force: true })
  })

  test('--close writes closed issue packet and does not archive automatically', async () => {
    const root = join(process.cwd(), '.test-issue-close')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const date = todayPrefix()
    const result = await handleIssue(createContext(root), '--close "stale report" --name stale-report')

    expect(result).toContain('## Issue Closed')
    expect(result).toContain('archive: not run automatically')
    const packetPath = join(root, 'docs', 'changes', `${date}-stale-report`, 'issue-packet.json')
    const packet = JSON.parse(await readFile(packetPath, 'utf-8')) as { status: string }
    expect(packet.status).toBe('closed')
    await expect(access(join(root, 'docs', 'archive'))).rejects.toBeDefined()

    await rm(root, { recursive: true, force: true })
  })

  test('--resolve uses an existing previous-date issue packet workspace', async () => {
    const root = join(process.cwd(), '.test-issue-resolve-old-workspace')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const oldDate = '2026-01-02'
    await writeResolvablePacket(root, 'old-cache-stale', 'old cache stale', oldDate)
    const result = await handleIssue(createContext(root), '--resolve "old cache stale" --name old-cache-stale')

    expect(result).toContain('## Issue Work Node Recorded')
    await expect(access(join(root, 'docs', 'changes', `${oldDate}-old-cache-stale`, 'issue-resolution.md'))).resolves.toBeNull()
    await expect(access(join(root, 'docs', 'changes', `${todayPrefix()}-old-cache-stale`, 'issue-resolution.md'))).rejects.toBeDefined()

    await rm(root, { recursive: true, force: true })
  })

  test('--fix uses an existing previous-date packet and renders fixing status', async () => {
    const root = join(process.cwd(), '.test-issue-fix-old-workspace')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const oldDate = '2026-01-02'
    await writeResolvablePacket(root, 'old-fixable', 'old fixable', oldDate)
    const result = await handleIssue(createContext(root), '--fix "old fixable" --name old-fixable')

    expect(result).toContain('## Fix Routing Ready')
    expect(result).toContain('- **status**: `fixing`')
    const packet = JSON.parse(await readFile(join(root, 'docs', 'changes', `${oldDate}-old-fixable`, 'issue-packet.json'), 'utf-8')) as { status: string }
    expect(packet.status).toBe('fixing')

    await rm(root, { recursive: true, force: true })
  })

  test('--close uses an existing previous-date packet and renders closed status', async () => {
    const root = join(process.cwd(), '.test-issue-close-old-workspace')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    const oldDate = '2026-01-02'
    await writeResolvablePacket(root, 'old-closable', 'old closable', oldDate)
    const result = await handleIssue(createContext(root), '--close "old closable" --name old-closable')

    expect(result).toContain('## Issue Closed')
    expect(result).toContain('- **status**: `closed`')
    const packet = JSON.parse(await readFile(join(root, 'docs', 'changes', `${oldDate}-old-closable`, 'issue-packet.json'), 'utf-8')) as { status: string }
    expect(packet.status).toBe('closed')

    await rm(root, { recursive: true, force: true })
  })

  test('partial manual packet renders without array-field crashes', async () => {
    const root = join(process.cwd(), '.test-issue-partial-packet')
    await rm(root, { recursive: true, force: true })
    await mkdir(root, { recursive: true })

    await writePartialPacket(root, 'partial-packet')
    const result = await handleIssue(createContext(root), 'partial packet --name partial-packet')

    expect(result).toContain('## OpenFlow Issue')
    expect(result).toContain('No evidence recorded yet')
    expect(result).toContain('No hypotheses recorded yet')

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
