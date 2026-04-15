declare module 'bun:test' {
  export const afterEach: (...args: unknown[]) => void
  export const beforeEach: (...args: unknown[]) => void
  export const describe: (...args: unknown[]) => void
  export const expect: (value: unknown) => any
  export const test: (...args: unknown[]) => void
}
