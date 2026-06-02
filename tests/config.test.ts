import { test, expect, describe, afterEach, spyOn } from 'bun:test'
import {
  loadConfig,
  getBuildsPath,
  getBuildPath,
  getAcceptanceStatePath,
  getPlanPath,
  defaultConfig,
} from '../src/config.js'
import { setLocale, getLocale } from '../src/i18n/index.js'

describe('config', () => {
  afterEach(() => {
    setLocale('zh-CN')
  })

  // ── loadConfig ──

  describe('loadConfig', () => {
    test('no config returns defaultConfig', () => {
      const config = loadConfig()
      expect(config).toEqual(defaultConfig)
    })

    test('no openflow key in opencodeConfig returns defaultConfig', () => {
      const config = loadConfig({ otherKey: 'value' })
      expect(config).toEqual(defaultConfig)
    })

    test('valid config merges with defaults', () => {
      const config = loadConfig({
        openflow: {
          feature: {
            enabled: false,
          },
        },
      })
      expect(config.feature.enabled).toBe(false)
      // Defaults preserved for unspecified fields
      expect(config.feature.trigger_mode).toBe('smart')
      expect(config.feature.closure.enabled).toBe(true)
    })

    test('invalid config warns and returns defaultConfig', () => {
      const warnSpy = spyOn(console, 'warn')
      const config = loadConfig({
        openflow: {
          feature: {
            enabled: 'not-a-boolean', // invalid type
          },
        },
      })
      expect(warnSpy).toHaveBeenCalledWith(
        '[OpenFlow] Invalid configuration detected, using defaults',
      )
      expect(config).toEqual(defaultConfig)
      warnSpy.mockRestore()
    })

    test('deep merge preserves defaults for unspecified nested fields', () => {
      const config = loadConfig({
        openflow: {
          feature: {
            closure: {
              weak_signal_threshold: 5,
            },
          },
        },
      })
      // Specified value overridden
      expect(config.feature.closure.weak_signal_threshold).toBe(5)
      // Unspecified sibling fields retain defaults
      expect(config.feature.closure.enabled).toBe(true)
      expect(config.feature.closure.auto_transition).toBe(true)
      expect(config.feature.closure.strong_signals.length).toBeGreaterThan(0)
    })

    test('locale setting triggers setLocale', () => {
      loadConfig({
        openflow: {
          locale: 'en',
        },
      })
      expect(getLocale()).toBe('en')
    })

    test('locale zh-CN setting triggers setLocale', () => {
      setLocale('en')
      loadConfig({
        openflow: {
          locale: 'zh-CN',
        },
      })
      expect(getLocale()).toBe('zh-CN')
    })

    test('paths override merges correctly', () => {
      const config = loadConfig({
        openflow: {
          paths: {
            builds: 'custom/builds',
          },
        },
      })
      expect(config.paths.builds).toBe('custom/builds')
      // Other paths retain defaults
      expect(config.paths.archive).toBe('docs/archive')
      expect(config.paths.plans).toBe('.openflow/plans')
    })
  })

  // ── Path resolution functions ──

  describe('getBuildsPath', () => {
    test('uses default path when config not provided', () => {
      const result = getBuildsPath('/project')
      expect(result).toBe('\\project\\.openflow\\builds')
    })

    test('uses config path when provided', () => {
      const config = loadConfig({
        openflow: { paths: { builds: 'custom/builds' } },
      })
      const result = getBuildsPath('/project', config)
      expect(result).toBe('\\project\\custom\\builds')
    })
  })

  describe('getBuildPath', () => {
    test('uses default path when config not provided', () => {
      const result = getBuildPath('/project', 'build-001')
      expect(result).toBe('\\project\\.openflow\\builds\\build-001')
    })

    test('uses config path when provided', () => {
      const config = loadConfig({
        openflow: { paths: { builds: 'custom/builds' } },
      })
      const result = getBuildPath('/project', 'build-001', config)
      expect(result).toBe('\\project\\custom\\builds\\build-001')
    })
  })

  describe('getAcceptanceStatePath', () => {
    test('uses default path when config not provided', () => {
      const result = getAcceptanceStatePath('/project')
      expect(result).toBe('\\project\\.openflow\\acceptance.local.md')
    })

    test('uses config path when provided', () => {
      const config = loadConfig({
        openflow: { paths: { acceptance_state: 'custom/acceptance.md' } },
      })
      const result = getAcceptanceStatePath('/project', config)
      expect(result).toBe('\\project\\custom\\acceptance.md')
    })
  })

  describe('getPlanPath', () => {
    test('uses default path when config not provided', () => {
      const result = getPlanPath('/project', 'my-feature')
      expect(result).toBe('\\project\\.openflow\\plans\\my-feature.md')
    })

    test('uses config path when provided', () => {
      const config = loadConfig({
        openflow: { paths: { plans: 'custom/plans' } },
      })
      const result = getPlanPath('/project', 'my-feature', config)
      expect(result).toBe('\\project\\custom\\plans\\my-feature.md')
    })
  })
})
