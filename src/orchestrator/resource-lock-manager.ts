import { resolve } from 'node:path'

import { invalidResource } from './errors.js'
import type { ResourceLock, ResourceMode } from './types.js'

interface HeldResourceLock extends ResourceLock {
  taskId: string
}

/** In-memory manager for scheduler resource locks. */
export class ResourceLockManager {
  private readonly locksByTaskId = new Map<string, HeldResourceLock[]>()

  /**
   * Attempt to acquire every requested lock for a task.
   *
   * Returns false if any requested resource conflicts with an already-held lock;
   * no partial acquisitions are retained in that case.
   */
  acquireLocks(taskId: string, resources: ResourceLock[]): boolean {
    const normalizedResources = resources.map((resource) => this.normalizeResource(taskId, resource))

    if (normalizedResources.some((resource) => this.hasConflict(resource))) {
      return false
    }

    const heldLocks = this.locksByTaskId.get(taskId) ?? []
    this.locksByTaskId.set(
      taskId,
      normalizedResources.map((resource) => ({ ...resource, taskId })).concat(heldLocks),
    )

    return true
  }

  /** Release all locks held by the given task ID. */
  releaseLocks(taskId: string): void {
    this.locksByTaskId.delete(taskId)
  }

  /** Release locks held by tasks that are not currently running. */
  cleanupOrphans(runningTaskIds: Set<string>): void {
    for (const taskId of this.locksByTaskId.keys()) {
      if (!runningTaskIds.has(taskId)) {
        this.locksByTaskId.delete(taskId)
      }
    }
  }

  private normalizeResource(taskId: string, resource: ResourceLock): ResourceLock {
    this.validateResource(taskId, resource)

    return {
      kind: resource.kind,
      id: resource.kind === 'file' ? resolve(resource.id) : resource.id,
      mode: resource.mode,
    }
  }

  private validateResource(taskId: string, resource: ResourceLock): void {
    if (typeof resource.kind !== 'string' || resource.kind.length === 0) {
      throw invalidResource(taskId, 'kind must be a non-empty string')
    }

    if (typeof resource.id !== 'string' || resource.id.length === 0) {
      throw invalidResource(taskId, 'id must be a non-empty string')
    }

    if (!isResourceMode(resource.mode)) {
      throw invalidResource(taskId, 'mode must be read or write')
    }
  }

  private hasConflict(resource: ResourceLock): boolean {
    for (const heldLocks of this.locksByTaskId.values()) {
      for (const heldLock of heldLocks) {
        if (isSameResource(heldLock, resource) && conflicts(heldLock.mode, resource.mode)) {
          return true
        }
      }
    }

    return false
  }
}

function isResourceMode(mode: unknown): mode is ResourceMode {
  return mode === 'read' || mode === 'write'
}

function isSameResource(left: ResourceLock, right: ResourceLock): boolean {
  return left.kind === right.kind && left.id === right.id
}

function conflicts(left: ResourceMode, right: ResourceMode): boolean {
  return left === 'write' || right === 'write'
}
