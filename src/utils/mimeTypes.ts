export const isImage = (mimeType: string) => mimeType.startsWith('image/')

export const matchesMimeTypePattern = (
  mimeType: string,
  pattern: string,
): boolean => {
  return pattern.endsWith('*')
    ? mimeType.startsWith(pattern.slice(0, -1))
    : mimeType === pattern
}

export const intersectMimeTypes = (
  arr1?: string[],
  arr2?: string[],
): string[] | undefined => {
  if (!arr1) {
    return arr2
  }
  if (!arr2) {
    return arr1
  }

  const matches = new Set<string>()

  for (const type of arr1) {
    if (arr2.some(pattern => matchesMimeTypePattern(type, pattern))) {
      matches.add(type)
    }
  }

  for (const type of arr2) {
    if (arr1.some(pattern => matchesMimeTypePattern(type, pattern))) {
      matches.add(type)
    }
  }

  return matches.size > 0 ? Array.from(matches) : undefined
}

