import { defineConfig } from 'tsdown'

export default defineConfig({
  copy: [
    { flatten: false, from: 'src/**/*.scss', to: 'dist' },
    { flatten: false, from: 'src/**/*.edge.js', to: 'dist' },
  ],
  dts: true,
  entry: ['src/**/*.ts', 'src/**/*.tsx'],
  exports: false,
  fixedExtension: false,
  external: [/\.scss$/],
  skipNodeModulesBundle: true,
  format: 'esm',
  hash: false,
  outDir: 'dist',
  platform: 'node',
  sourcemap: true,
  target: 'esnext',
  tsconfig: './tsconfig.build.json',
  unbundle: true,
})
