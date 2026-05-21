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
    expect(config.guardian.contract_cache).toBe(defaultConfig.guardian.contract_cache)
    // state_dir removed — paths.guardian_state is the new location
    expect(config.paths.guardian_state).toBe(defaultConfig.paths.guardian_state)
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

  test('valid paths.guardian_state passes validation', () => {
    const config = loadConfig({
      openflow: {
        paths: { guardian_state: 'data/guardian-state' },
      },
    })
    expect(config.paths.guardian_state).toBe('data/guardian-state')
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
    expect(config.guardian.enabled).toBe(false)
    expect(config.guardian.max_retries).toBe(5)
    expect(config.guardian.auto_start).toBe(defaultConfig.guardian.auto_start)
    expect(config.guardian.auto_fix).toBe(defaultConfig.guardian.auto_fix)
    expect(config.guardian.contract_cache).toBe(defaultConfig.guardian.contract_cache)
  })

  test('removed guardian.state_dir is rejected and returns defaults', () => {
    const config = loadConfig({
      openflow: {
        guardian: { state_dir: 'data/guardian-state' },
      },
    })
    // state_dir is no longer a valid field; strict schema rejects the guardian object
    expect(config.guardian).toEqual(defaultConfig.guardian)
    expect(config.paths.guardian_state).toBe(defaultConfig.paths.guardian_state)
  })

  test('invalid paths.guardian_state with path traversal returns defaults', () => {
    const config = loadConfig({
      openflow: {
        paths: { guardian_state: '../../../etc/passwd' },
      },
    })
    expect(config.paths).toEqual(defaultConfig.paths)
  })
})
