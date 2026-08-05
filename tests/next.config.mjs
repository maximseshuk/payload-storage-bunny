import { withPayload } from '@payloadcms/next/withPayload'

export default withPayload(
  {
    devIndicators: {
      position: 'bottom-right',
    },
    eslint: {
      ignoreDuringBuilds: true,
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    experimental: {
      fullySpecified: true,
      serverActions: {
        bodySizeLimit: '5mb',
      },
    },
    turbopack: {
      resolveAlias: {
        '@payload-config': './payload.config.ts',
        '@seshuk/payload-storage-bunny$': '../src/index.ts',
        '@seshuk/payload-storage-bunny/client': '../src/client/index.ts',
      },
    },
    env: {
      PAYLOAD_CORE_DEV: 'true',
      PAYLOAD_DO_NOT_SANITIZE_LOCALIZED_PROPERTY: 'true',
    },
    async redirects() {
      return [
        {
          destination: '/admin',
          permanent: true,
          source: '/',
        },
      ]
    },
    images: {
      domains: ['localhost'],
    },
    webpack: (webpackConfig) => {
      webpackConfig.resolve.extensionAlias = {
        '.cjs': ['.cts', '.cjs'],
        '.js': ['.ts', '.tsx', '.js', '.jsx'],
        '.mjs': ['.mts', '.mjs'],
      }

      webpackConfig.resolve.alias = {
        ...webpackConfig.resolve.alias,
        '@payload-config': './payload.config.ts',
      }

      return webpackConfig
    },
  },
  { devBundleServerPackages: false },
)
