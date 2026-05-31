export class AdapterCache {
  private pending = new Map<string, Promise<unknown>>()
  private resolved = new Map<string, unknown>()

  async getOrCompute<T>(key: string, compute: () => Promise<T>): Promise<T> {
    // Return cached resolved value if available
    if (this.resolved.has(key)) {
      return this.resolved.get(key) as T
    }

    // Return in-flight promise if concurrent
    const existing = this.pending.get(key)
    if (existing) {
      return existing as Promise<T>
    }

    // Compute, cache the result, and clean up pending
    const promise = compute().then((value: T) => {
      this.resolved.set(key, value)
      return value
    }).finally(() => {
      this.pending.delete(key)
    })

    this.pending.set(key, promise)
    return promise
  }
}
