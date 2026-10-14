import type { Config } from 'payload'

import { bunnyStorage } from '@/index.js'
import type { BunnyStorageOptions } from '@/shared/types/index.js'

export const initPlugin = (
  options: Record<string, unknown>,
  collections: Record<string, unknown>[],
  config: Record<string, unknown> = {},
): Config =>
  bunnyStorage(options as unknown as BunnyStorageOptions).init({
    collections,
    ...config,
  } as unknown as Config) as Config
