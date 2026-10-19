import { describe, expect, test } from 'bun:test'
import { deriveFeatureIdentity } from '../../src/utils/feature-resolver.js'

describe('feature resolver keyword derivation', () => {
  test('concrete Chinese UI intent derives a durable slug instead of untitled-feature', () => {
    const identity = deriveFeatureIdentity('在退出菜单上面增加一个"关于系统"的菜单，弹窗展示一段系统介绍的内容')

    expect(identity.lowConfidenceReason).toBeUndefined()
    expect(identity.slug).not.toBe('untitled-feature')
    expect(identity.slug).toContain('menu')
    expect(identity.slug).toContain('dialog')
  })

  test('existing quality gate request still resolves', () => {
    const identity = deriveFeatureIdentity('为 quality gate 引入 evidence-ledger 机制')

    expect(identity.lowConfidenceReason).toBeUndefined()
    expect(identity.slug).toContain('quality-gate')
  })
})
