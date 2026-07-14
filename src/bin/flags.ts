export type ParsedFlags = {
  booleans: Set<string>
  values: Map<string, string>
}

export const parseFlags = (argv: string[]): ParsedFlags => {
  const values = new Map<string, string>()
  const booleans = new Set<string>()

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg?.startsWith('--')) {
      continue
    }

    const key = arg.slice(2)
    const eq = key.indexOf('=')
    if (eq >= 0) {
      values.set(key.slice(0, eq), key.slice(eq + 1))
      continue
    }

    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      values.set(key, next)
      i++
    } else {
      booleans.add(key)
    }
  }

  return { booleans, values }
}

export const getFlag = (flags: ParsedFlags, name: string): string | undefined => flags.values.get(name)

export const getBooleanFlag = (flags: ParsedFlags, name: string): boolean =>
  flags.booleans.has(name) || flags.values.get(name) === 'true'
