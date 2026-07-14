export const slash = (path: string): string => {
  if (path.startsWith('\\\\?\\')) {
    return path
  }
  return path.replace(/\\/g, '/')
}
