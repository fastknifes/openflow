import { describe, expect, test } from 'bun:test'
import { loadConfig, defaultConfig } from '../../src/config'
import { defaultConfig as defaultConfigFromTypes } from '../../src/types.js'
import type { HardenConfig } from '../../src/types.js'

describe('loadConfig', () => {
  test('should return default config when no input', () => {
    const config = loadConfig()
    expect(config).toEqual(defaultConfig)
  })

  test('should return merged config when valid input', () => {
    const config = loadConfig({
      openflow: {
        feature: {
          enabled: true,
          trigger_mode: 'always',
          closure: {
            enabled: true,
            auto_transition: false,
            strong_signals: ['ship it'],
            weak_signals: ['ok'],
            weak_signal_threshold: 1,
          },
        },
        archive: {
          auto_promote_current: true,
        },
      },
    })
    expect(config.feature.enabled).toBe(true)
    expect(config.feature.trigger_mode).toBe('always')
    expect(config.feature.closure.auto_transition).toBe(false)
    expect(config.tdd.enabled).toBe(true)
    expect(config.verification.in_plan).toBe(true)
    expect(config.archive.enabled).toBe(true)
    expect(config.archive.auto_promote_current).toBe(true)
  })

  test('should warn and return default config for invalid input', () => {
    const config = loadConfig({ openflow: { feature: { enabled: 'invalid' } } })
    expect(config.feature.enabled).toBe(defaultConfig.feature.enabled)
    expect(config.tdd.enabled).toBe(true)
    expect(config.verification.in_plan).toBe(true)
    expect(config.archive.enabled).toBe(true)
  })
})

describe('paths config', () => {
  test('default config contains all required path keys', () => {
    expect(defaultConfig.paths.changes).toBe('docs/changes')
    expect(defaultConfig.paths.archive).toBe('docs/archive')
    expect(defaultConfig.paths.current_requirements).toBe('docs/current/requirements')
    expect(defaultConfig.paths.current_design).toBe('docs/current/design')
    expect(defaultConfig.paths.current_spec).toBe('docs/current/spec')
    expect(defaultConfig.paths.current_workflow).toBe('docs/current/workflow')
    expect(defaultConfig.paths.builds).toBe('.sisyphus/builds')
    expect(defaultConfig.paths.plans).toBe('.sisyphus/plans')
    expect(defaultConfig.paths.acceptance_state).toBe('.sisyphus/acceptance.local.md')
    expect(defaultConfig.paths.feature_state).toBe('.sisyphus/feature')
    expect(defaultConfig.paths.change_units).toBe('.sisyphus/change-units.json')
    expect(defaultConfig.paths.guardian_state).toBe('.sisyphus/openflow/guardian')
    expect(defaultConfig.paths.boulder_state).toBe('.sisyphus/boulder.json')
    expect(defaultConfig.paths.evidence_dir).toBe('.sisyphus/evidence')
  })

  test('partial paths override deep-merges with defaults', () => {
    const config = loadConfig({
      openflow: {
        paths: {
          plans: '.custom/plans',
          builds: '.custom/builds',
        },
      },
    })
    expect(config.paths.plans).toBe('.custom/plans')
    expect(config.paths.builds).toBe('.custom/builds')
    expect(config.paths.changes).toBe(defaultConfig.paths.changes)
    expect(config.paths.archive).toBe(defaultConfig.paths.archive)
  })

  test('removed old fields are rejected and return defaults', () => {
    const config = loadConfig({
      openflow: {
        feature: {
          output_dir: 'custom/changes',
          prd_output_dir: 'custom/changes',
        },
        archive: {
          output_dir: 'custom/archive',
        },
        guardian: {
          state_dir: 'custom/guardian',
        },
      },
    })
    // Strict schema rejects objects with removed fields
    expect(config.feature).toEqual(defaultConfig.feature)
    expect(config.archive).toEqual(defaultConfig.archive)
    expect(config.guardian).toEqual(defaultConfig.guardian)
    expect(config.paths).toEqual(defaultConfig.paths)
  })

  test('paths validation rejects path traversal', () => {
    const config = loadConfig({
      openflow: {
        paths: {
          changes: '../../../etc/passwd',
        },
      },
    })
    expect(config.paths.changes).toBe(defaultConfig.paths.changes)
  })
})

describe('HardenConfig contract', () => {
  test('defaultConfig.harden.maxArgumentRoundsPerFinding defaults to 2', () => {
    expect(defaultConfigFromTypes.harden.maxArgumentRoundsPerFinding).toBe(2)
  })

  test('HardenConfig interface includes maxArgumentRoundsPerFinding', () => {
    // Compile-time assertion: this object literal must satisfy HardenConfig.
    // If maxArgumentRoundsPerFinding is missing from HardenConfig, TypeScript will error.
    const _config: HardenConfig = {
      enabled: true,
      maxRounds: 5,
      reviewerModel: undefined,
      executorModel: undefined,
      maxArgumentRoundsPerFinding: 2,
    }
    expect(_config.maxArgumentRoundsPerFinding).toBe(2)
  })
})
