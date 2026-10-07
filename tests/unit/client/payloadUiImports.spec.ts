import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const CONTEXT_FREE_SUBPATHS = new Set([
  '@payloadcms/ui/elements/FileManager/FilePreview/AudioPreview',
  '@payloadcms/ui/elements/FileManager/FilePreview/PdfPreview',
  '@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview',
  '@payloadcms/ui/elements/RenderServerComponent',
  '@payloadcms/ui/hooks/useElementHeightVariable',
  '@payloadcms/ui/icons/Crop',
  '@payloadcms/ui/icons/Download',
  '@payloadcms/ui/utilities/appendCacheTag',
  '@payloadcms/ui/utilities/getFilesFromClipboard',
])

const IMPORT_PATTERN = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g
const TYPE_IMPORT_PATTERN = /(?:import|export)\s+type\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s*from\s*['"][^'"]+['"]/g
const CONTEXT_PATTERNS = [
  /\bcreateContext\b/,
  /\buseContext\b/,
  /\buse\(/,
  /['"][^'"]*\/(?:providers|forms)\//,
  /@faceless-ui/,
]

const findImports = (source: string): string[] =>
  [...source.replace(TYPE_IMPORT_PATTERN, '').matchAll(IMPORT_PATTERN)].map(([, specifier]) => specifier)

const findBadImports = (source: string): string[] =>
  findImports(source).filter(
    (specifier) =>
      specifier.startsWith('@faceless-ui/') ||
      (specifier.startsWith('@payloadcms/ui/') && !CONTEXT_FREE_SUBPATHS.has(specifier)),
  )

const findContextUse = (entry: string): string[] => {
  const seen = new Set<string>()
  const found: string[] = []
  const visit = (file: string) => {
    if (seen.has(file) || !file.endsWith('.js')) {
      return
    }
    seen.add(file)
    const source = readFileSync(file, 'utf8')
    for (const pattern of CONTEXT_PATTERNS) {
      if (pattern.test(source)) {
        found.push(`${file}: ${pattern}`)
      }
    }
    for (const specifier of findImports(source)) {
      if (specifier.startsWith('.')) {
        visit(resolve(dirname(file), specifier))
      }
    }
  }
  visit(entry)
  return found
}

const srcDir = new URL('../../../src/', import.meta.url)
const sources = readdirSync(srcDir, { recursive: true })
  .map(String)
  .filter((file) => /\.tsx?$/.test(file))
  .map((file) => ({ file, source: readFileSync(new URL(file, srcDir), 'utf8') }))

const deepImports = sources.flatMap(({ file, source }) =>
  findImports(source)
    .filter((specifier) => specifier.startsWith('@payloadcms/ui/'))
    .map((specifier) => ({ file, specifier })),
)

const require = createRequire(import.meta.url)

describe('@payloadcms/ui subpath imports', () => {
  it('finds the deep imports it guards', () => {
    expect(deepImports.length).toBeGreaterThan(0)
  })

  it('imports only context-free subpaths and no @faceless-ui package, so React contexts come from the root export', () => {
    expect(
      sources.flatMap(({ file, source }) => findBadImports(source).map((specifier) => ({ file, specifier }))),
    ).toEqual([])
  })

  it('flags every import form, ignoring type-only imports', () => {
    const source = [
      `import { A } from "@payloadcms/ui/elements/Modal"`,
      `import '@payloadcms/ui/providers/Config'`,
      `const B = await import('@payloadcms/ui/forms/Form')`,
      `const C = require("@faceless-ui/modal")`,
      `import { useModal } from '@faceless-ui/window-info'`,
      `import type { D } from '@payloadcms/ui/elements/Drawer'`,
      `export type E = { a: string }`,
      `export { Drawer } from '@payloadcms/ui/elements/Drawer'`,
      `import { VideoPreview } from '@payloadcms/ui/elements/FileManager/FilePreview/VideoPreview'`,
    ].join('\n')

    expect(findBadImports(source)).toEqual([
      '@payloadcms/ui/elements/Modal',
      '@payloadcms/ui/providers/Config',
      '@payloadcms/ui/forms/Form',
      '@faceless-ui/modal',
      '@faceless-ui/window-info',
      '@payloadcms/ui/elements/Drawer',
    ])
  })

  it.each([...CONTEXT_FREE_SUBPATHS])('%s and its relative imports use no React context', (specifier) => {
    expect(findContextUse(require.resolve(specifier))).toEqual([])
  })

  it('flags a built file that reaches a React context', () => {
    expect(findContextUse(require.resolve('@payloadcms/ui/elements/Modal')).length).toBeGreaterThan(0)
  })
})
