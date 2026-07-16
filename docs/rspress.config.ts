import * as path from 'node:path'

import { defineConfig } from '@rspress/core'

export default defineConfig({
  root: path.join(__dirname, 'docs'),
  base: process.env.DOCS_BASE ?? '/',
  title: 'Payload Storage Bunny',
  description: 'Bunny.net storage adapter for Payload CMS',
  logo: '/logo.svg',
  logoText: 'Payload Storage Bunny',
  icon: '/favicon.ico',
  globalStyles: path.join(__dirname, 'docs/styles/custom.css'),
  markdown: {
    globalComponents: [path.join(__dirname, 'components/Card.tsx'), path.join(__dirname, 'components/Columns.tsx')],
  },
  llms: true,
  themeConfig: {
    editLink: {
      docRepoBaseUrl: 'https://github.com/maximseshuk/payload-storage-bunny/tree/main/docs/docs',
    },
    lastUpdated: true,
    llmsUI: {
      placement: 'title',
      viewOptions: ['markdownLink', 'claude', 'chatgpt'],
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/maximseshuk/payload-storage-bunny',
      },
    ],
  },
})
