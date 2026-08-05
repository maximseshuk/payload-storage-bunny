export type InitService = 'both' | 'storage' | 'stream'

export type StorageAccess = 'http' | 's3'

export type StorageTier = 'edge' | 'standard'

export type RegionOption = {
  code: string
  label: string
}

export const DEFAULT_REGION = 'de'

export const PRICING = {
  optimizerMonthly: '$9.50/mo per pull zone',
  storagePerGb: {
    edge: '$0.02/GB',
    standard: '$0.01/GB',
  },
  streamAdditionalReplicaPerGb: '$0.005/GB',
  streamFirstReplicaPerGb: '$0.02/GB',
  streamMainPerGb: '$0.00/GB',
} as const

export const storageTierPrice = (tier: StorageTier): string => PRICING.storagePerGb[tier]

export const PRICING_NOTE =
  'Prices shown are Bunny storage only (approx, for orientation). Stream also bills encoding + CDN delivery; Storage bills CDN delivery. See current full pricing in the bunny.net dashboard after setup.'

const REGION_LABELS: Record<string, string> = {
  br: 'São Paulo, BR',
  cz: 'Prague, CZ',
  de: 'Frankfurt, DE (default)',
  es: 'Madrid, ES',
  hk: 'Hong Kong, HK',
  jh: 'Johannesburg, SA',
  jp: 'Tokyo, JP',
  la: 'Los Angeles, US',
  mi: 'Miami, US',
  ny: 'New York, US',
  se: 'Stockholm, SE',
  sg: 'Singapore, SG',
  syd: 'Sydney, SYD',
  uk: 'London, UK',
  wa: 'Washington, DC, US',
}

const HDD_REGION_CODES = ['de', 'uk', 'se', 'ny', 'la', 'sg', 'syd', 'br', 'jh']

const SSD_EXTRA_REGION_CODES = ['cz', 'es', 'mi', 'wa', 'hk', 'jp']

export const SSD_REGION_CODES = [...HDD_REGION_CODES, ...SSD_EXTRA_REGION_CODES]

export const S3_REGION_CODES = ['de', 'uk', 'se', 'ny', 'la', 'sg', 'syd', 'jh']

const STREAM_REGION_CODES = ['de', 'uk', 'se', 'la', 'ny', 'sg', 'syd', 'br', 'jh']

const toRegionOptions = (codes: string[]): RegionOption[] =>
  codes.map((code) => ({ code, label: REGION_LABELS[code] ?? code }))

export const storageMainRegionOptions = (access: StorageAccess): RegionOption[] =>
  toRegionOptions(access === 's3' ? S3_REGION_CODES : HDD_REGION_CODES)

export const storageReplicationRegionOptions = (access: StorageAccess, tier: StorageTier): RegionOption[] =>
  toRegionOptions(access === 's3' ? S3_REGION_CODES : tier === 'edge' ? SSD_REGION_CODES : HDD_REGION_CODES)

export const streamRegionOptions = (): RegionOption[] => toRegionOptions(STREAM_REGION_CODES)

export const replicationOptions = (all: RegionOption[], mainCode: string): RegionOption[] =>
  all.filter((option) => option.code !== mainCode)

export type InitAnswers = {
  clientUploads: boolean
  collectionSlug: string
  deployEdge: boolean
  optimizer: boolean
  purge: boolean
  region: string
  service: InitService
  signedUrls: boolean
  storageAccess: StorageAccess
  storageReplication: string[]
  storageTier: StorageTier
  storageZoneName: string
  streamReplication: string[]
  videoLibraryName: string
}

export type StoragePlanStep = {
  clientUploads: boolean
  deployEdge: boolean
  optimizer: boolean
  pullZoneTier: number
  region: string
  replication: string[]
  s3: boolean
  secure: boolean
  ssd: boolean
  zoneName: string
}

export type StreamPlanStep = {
  libraryName: string
  replication: string[]
  secure: boolean
}

export type InitPlan = {
  storage?: StoragePlanStep
  stream?: StreamPlanStep
}

export const STORAGE_ZONE_NAME_MAX = 20

const PULL_ZONE_TIER_STANDARD = 0

export const wantsStorage = (service: InitService): boolean => service === 'both' || service === 'storage'

export const wantsStream = (service: InitService): boolean => service === 'both' || service === 'stream'

export const sanitizeName = (input: string): string => {
  const withoutScope = input.includes('/') ? (input.split('/').pop() ?? input) : input
  return withoutScope
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, STORAGE_ZONE_NAME_MAX)
}

export const deriveBaseName = (packageName?: string): string => {
  const sanitized = packageName ? sanitizeName(packageName) : ''
  return sanitized || 'media'
}

export const deriveVideoLibraryName = (baseName: string): string => `${baseName}-stream`

export const validateStorageZoneName = (name: string): string | undefined => {
  if (name.length === 0) {
    return 'Storage zone name is required.'
  }
  if (name.length > STORAGE_ZONE_NAME_MAX) {
    return `Storage zone names must be ${STORAGE_ZONE_NAME_MAX} characters or fewer (Bunny limit).`
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    return 'Use only lowercase letters, digits and hyphens.'
  }
  return undefined
}

export const validateCollectionSlug = (slug: string): string | undefined => {
  if (slug.length === 0) {
    return 'Collection slug is required.'
  }
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return 'Use only lowercase letters, digits and hyphens.'
  }
  return undefined
}

export const buildInitPlan = (answers: InitAnswers): InitPlan => {
  const plan: InitPlan = {}

  if (wantsStorage(answers.service)) {
    const s3 = answers.storageAccess === 's3'
    const ssd = answers.storageTier === 'edge'
    plan.storage = {
      clientUploads: answers.clientUploads && s3,
      deployEdge: answers.clientUploads && !s3 && answers.deployEdge,
      optimizer: answers.optimizer,
      pullZoneTier: PULL_ZONE_TIER_STANDARD,
      region: (ssd ? DEFAULT_REGION : answers.region).toUpperCase(),
      replication: answers.storageReplication.map((code) => code.toUpperCase()),
      s3,
      secure: answers.signedUrls,
      ssd,
      zoneName: answers.storageZoneName,
    }
  }

  if (wantsStream(answers.service)) {
    plan.stream = {
      libraryName: answers.videoLibraryName,
      replication: answers.streamReplication.map((code) => code.toUpperCase()),
      secure: answers.signedUrls,
    }
  }

  return plan
}
