/**
 * Shared markdown escaping utilities for OpenFlow renderers.
 */

export function escapeInline(value: string): string {
  return normalizeWhitespace(value).replace(/([\\`*_{}\[\]()#+>|])/g, '\\$1')
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\r?\n+/g, ' ').replace(/\s+/g, ' ').trim()
}
