import { pluginBuild } from '@seshuk/payload-plugin-tooling/tsdown'
import { defineConfig } from 'tsdown'

export default defineConfig(pluginBuild({ copy: ['src/**/*.edge.js'] }))
