import { describe, expect, test } from 'bun:test'
import { loadConfig, defaultConfig } from '../../src/config'

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
