import { describe, expect, test } from 'bun:test'
import { loadConfig, defaultConfig } from '../src/config'

describe('guardian config validation', () => {
  test('valid partial guardian config merges with defaults', () => {
    const config = loadConfig({
      openflow: {
        guardian: {
          enabled: false,
        },
      },
    })
    expect(config.guardian.enabled).toBe(false)
    expect(config.guardian.auto_start).toBe(defaultConfig.guardian.auto_start)
    expect(config.guardian.auto_fix).toBe(defaultConfig.guardian.auto_fix)
    expect(config.guardian.max_retries).toBe(defaultConfig.guardian.max_retries)
    expect(config.guardian.state_dir).toBe(defaultConfig.guardian.state_dir)
    expect(config.guardian.contract_cache).toBe(defaultConfig.guardian.contract_cache)
  })

  test('invalid guardian.enabled (string) returns defaults', () => {
    const config = loadConfig({
      openflow: {
        guardian: { enabled: 'yes' },
      },
    })
    expect(config.guardian).toEqual(defaultConfig.guardian)
  })

  test('invalid guardian.max_retries = 0 returns defaults', () => {
    const config = loadConfig({
      openflow: {
        guardian: { max_retries: 0 },
      },
    })
    expect(config.guardian).toEqual(defaultConfig.guardian)
  })

  test('invalid guardian.max_retries = 11 returns defaults', () => {
    const config = loadConfig({
      openflow: {
        guardian: { max_retries: 11 },
      },
    })
    expect(config.guardian).toEqual(defaultConfig.guardian)
  })

  test('invalid guardian.auto_start (number) returns defaults', () => {
    const config = loadConfig({
      openflow: {
        guardian: { auto_start: 1 },
      },
    })
    expect(config.guardian).toEqual(defaultConfig.guardian)
  })

  test('invalid guardian.contract_cache (string) returns defaults', () => {
    const config = loadConfig({
      openflow: {
        guardian: { contract_cache: 'true' },
      },
    })
    expect(config.guardian).toEqual(defaultConfig.guardian)
  })

  test('valid guardian state_dir passes validation', () => {
    const config = loadConfig({
      openflow: {
        guardian: { state_dir: 'data/guardian-state' },
      },
    })
    expect(config.guardian.state_dir).toBe('data/guardian-state')
    // Other fields should be defaults
    expect(config.guardian.enabled).toBe(defaultConfig.guardian.enabled)
  })

  test('guardian section absent uses defaultConfig.guardian values', () => {
    const config = loadConfig({
      openflow: {
        feature: { enabled: true },
      },
    })
    expect(config.guardian).toEqual(defaultConfig.guardian)
  })

  test('deepMerge preserves nested guardian fields from partial override', () => {
    const config = loadConfig({
      openflow: {
        guardian: {
          enabled: false,
          max_retries: 5,
        },
      },
    })
    // Overridden fields
    expect(config.guardian.enabled).toBe(false)
    expect(config.guardian.max_retries).toBe(5)
    // Preserved defaults
    expect(config.guardian.auto_start).toBe(defaultConfig.guardian.auto_start)
    expect(config.guardian.auto_fix).toBe(defaultConfig.guardian.auto_fix)
    expect(config.guardian.state_dir).toBe(defaultConfig.guardian.state_dir)
    expect(config.guardian.contract_cache).toBe(defaultConfig.guardian.contract_cache)
  })

  test('invalid guardian.state_dir with path traversal returns defaults', () => {
    const config = loadConfig({
      openflow: {
        guardian: { state_dir: '../../../etc/passwd' },
      },
    })
    expect(config.guardian).toEqual(defaultConfig.guardian)
  })
})
