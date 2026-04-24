import * as fs from 'node:fs/promises'

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

export async function hasFiles(dirPath: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries.some(entry => entry.isFile())
  } catch {
    return false
  }
}
