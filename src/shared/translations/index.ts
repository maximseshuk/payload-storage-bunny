import type { AcceptedLanguages, DefaultTranslationKeys, NestedKeysStripped, TFunction } from '@payloadcms/translations'

import { ar } from '@/shared/translations/locales/ar.js'
import { az } from '@/shared/translations/locales/az.js'
import { bg } from '@/shared/translations/locales/bg.js'
import { bnBd } from '@/shared/translations/locales/bnBd.js'
import { bnIn } from '@/shared/translations/locales/bnIn.js'
import { ca } from '@/shared/translations/locales/ca.js'
import { cs } from '@/shared/translations/locales/cs.js'
import { da } from '@/shared/translations/locales/da.js'
import { de } from '@/shared/translations/locales/de.js'
import { en } from '@/shared/translations/locales/en.js'
import { es } from '@/shared/translations/locales/es.js'
import { et } from '@/shared/translations/locales/et.js'
import { fa } from '@/shared/translations/locales/fa.js'
import { fr } from '@/shared/translations/locales/fr.js'
import { he } from '@/shared/translations/locales/he.js'
import { hr } from '@/shared/translations/locales/hr.js'
import { hu } from '@/shared/translations/locales/hu.js'
import { hy } from '@/shared/translations/locales/hy.js'
import { id } from '@/shared/translations/locales/id.js'
import { is } from '@/shared/translations/locales/is.js'
import { it } from '@/shared/translations/locales/it.js'
import { ja } from '@/shared/translations/locales/ja.js'
import { ko } from '@/shared/translations/locales/ko.js'
import { lt } from '@/shared/translations/locales/lt.js'
import { lv } from '@/shared/translations/locales/lv.js'
import { my } from '@/shared/translations/locales/my.js'
import { nb } from '@/shared/translations/locales/nb.js'
import { nl } from '@/shared/translations/locales/nl.js'
import { pl } from '@/shared/translations/locales/pl.js'
import { pt } from '@/shared/translations/locales/pt.js'
import { ro } from '@/shared/translations/locales/ro.js'
import { rs } from '@/shared/translations/locales/rs.js'
import { rsLatin } from '@/shared/translations/locales/rsLatin.js'
import { ru } from '@/shared/translations/locales/ru.js'
import { sk } from '@/shared/translations/locales/sk.js'
import { sl } from '@/shared/translations/locales/sl.js'
import { sv } from '@/shared/translations/locales/sv.js'
import { ta } from '@/shared/translations/locales/ta.js'
import { th } from '@/shared/translations/locales/th.js'
import { tr } from '@/shared/translations/locales/tr.js'
import { uk } from '@/shared/translations/locales/uk.js'
import { vi } from '@/shared/translations/locales/vi.js'
import { zh } from '@/shared/translations/locales/zh.js'
import { zhTw } from '@/shared/translations/locales/zhTw.js'

import type { PluginDefaultTranslationsObject } from './types.js'

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
export type PluginStorageBunnyTFunction = TFunction<DefaultTranslationKeys | PluginStorageBunnyTranslationsKeys>
