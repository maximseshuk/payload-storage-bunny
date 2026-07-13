export const slash = (path: string): string => {
  // Extended-length paths (\\?\...) should not be converted
  if (path.startsWith('\\\\?\\')) {
    return path
  }
  return path.replace(/\\/g, '/')
}
