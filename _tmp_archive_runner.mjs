import { handleArchive } from './src/commands/archive.ts'
import { defaultConfig } from './src/types.ts'

const ctx = {
  directory: process.cwd(),
  worktree: process.cwd(),
  client: {},
  $: {},
  config: defaultConfig,
  enhancedPlans: new Set(),
}

try {
  const result = await handleArchive(ctx, 'feature-confirmation-interaction')
  console.log(result)
} catch (error) {
  console.error('ERROR:', error)
}
