import { describe, expect, test } from 'bun:test'
import { loadConfig, defaultConfig } from '../src/config.js'

describe('loadConfig', () => {
  it('should return default config when no input', () => {
    const config = loadConfig()
    expect(config).toEqual(defaultConfig)
  })

  it('should return merged config when valid input', () => {
    const config = loadConfig({ openflow: { brainstorming: { enabled: true } })
    expect(result.brainstorming.enabled).toBe(true)
    expect(result.tdd.enabled).toBe(true)
    expect(result.verification.in_plan).toBe(true)
    expect(result.archive.enabled).toBe(true)
  })

  it('should warn and return default config for invalid input', () => {
    const invalidConfig = { brainstorming: { enabled: 'invalid' } }
    const config = loadConfig({ openflow: { brainstorming: { enabled: 'invalid' } })
    expect(config.brainstorming.enabled).toBe(false)
    expect(config.tdd.enabled).toBe(true)
    expect(config.verification.in_plan).toBe(true)
    expect(config.archive.enabled).toBe(true)
  })
})
