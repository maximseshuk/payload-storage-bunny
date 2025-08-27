import type { AcceptedLanguages, NestedKeysStripped } from '@payloadcms/translations'

import type { PluginDefaultTranslationsObject } from './types.js'

import { en } from './locales/en.js'

export const translations: {
  [key in AcceptedLanguages]?: PluginDefaultTranslationsObject
} = {
  en,
}

export type PluginStorageBunnyTranslations = typeof translations.en
export type PluginStorageBunnyTranslationsKeys = NestedKeysStripped<PluginStorageBunnyTranslations>
