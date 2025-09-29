import type { AcceptedLanguages, NestedKeysStripped } from '@payloadcms/translations'

import type { PluginDefaultTranslationsObject } from './types.js'

import { ar } from './locales/ar.js'
import { az } from './locales/az.js'
import { bg } from './locales/bg.js'
import { bnBd } from './locales/bnBd.js'
import { bnIn } from './locales/bnIn.js'
import { ca } from './locales/ca.js'
import { cs } from './locales/cs.js'
import { da } from './locales/da.js'
import { de } from './locales/de.js'
import { en } from './locales/en.js'
import { es } from './locales/es.js'
import { et } from './locales/et.js'
import { fa } from './locales/fa.js'
import { fr } from './locales/fr.js'
import { he } from './locales/he.js'
import { hr } from './locales/hr.js'
import { hu } from './locales/hu.js'
import { hy } from './locales/hy.js'
import { id } from './locales/id.js'
import { is } from './locales/is.js'
import { it } from './locales/it.js'
import { ja } from './locales/ja.js'
import { ko } from './locales/ko.js'
import { lt } from './locales/lt.js'
import { lv } from './locales/lv.js'
import { my } from './locales/my.js'
import { nb } from './locales/nb.js'
import { nl } from './locales/nl.js'
import { pl } from './locales/pl.js'
import { pt } from './locales/pt.js'
import { ro } from './locales/ro.js'
import { rs } from './locales/rs.js'
import { rsLatin } from './locales/rsLatin.js'
import { ru } from './locales/ru.js'
import { sk } from './locales/sk.js'
import { sl } from './locales/sl.js'
import { sv } from './locales/sv.js'
import { ta } from './locales/ta.js'
import { th } from './locales/th.js'
import { tr } from './locales/tr.js'
import { uk } from './locales/uk.js'
import { vi } from './locales/vi.js'
import { zh } from './locales/zh.js'
import { zhTw } from './locales/zhTw.js'

export const translations: {
  [key in AcceptedLanguages]?: PluginDefaultTranslationsObject
} = {
  id,
  ar,
  az,
  bg,
  'bn-BD': bnBd,
  'bn-IN': bnIn,
  ca,
  cs,
  da,
  de,
  en,
  es,
  et,
  fa,
  fr,
  he,
  hr,
  hu,
  hy,
  is,
  it,
  ja,
  ko,
  lt,
  lv,
  my,
  nb,
  nl,
  pl,
  pt,
  ro,
  rs,
  'rs-latin': rsLatin,
  ru,
  sk,
  sl,
  sv,
  ta,
  th,
  tr,
  uk,
  vi,
  zh,
  'zh-TW': zhTw,
}

export type PluginStorageBunnyTranslations = typeof translations.en
export type PluginStorageBunnyTranslationsKeys = NestedKeysStripped<PluginStorageBunnyTranslations>
