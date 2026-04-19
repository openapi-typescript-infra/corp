// Managed by cpconfig
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

function hasPackage(name) {
  try {
    // Try to resolve from current working directory context
    const requireFn = typeof require !== 'undefined' ? require : createRequire(import.meta.url);
    const resolvedPath = requireFn.resolve(name, {
      paths: [path.resolve(process.cwd())],
    });
    return !!resolvedPath;
  } catch {
    return false;
  }
}

function getPlugin(importValue) {
  if ('default' in importValue) {
    return importValue.default;
  }
  return importValue;
}

function safePackageLoad() {
  try {
    return JSON.parse(fs.readFileSync('package.json', 'utf8'));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Could not load package.json', {
      cwd: process.cwd(),
      error,
    });
    return {};
  }
}

const pkgConfig = safePackageLoad();

function nextConfig() {
  return import('next-intl/plugin')
    .then((plugin) => getPlugin(plugin)())
    .catch(() => (config) => config)
    .then((withNextIntl) => {
      return withNextIntl({
        transpilePackages: ['@justtellme/web-service/src/client'],
        // Test builds overwrite build files, so get them out of the way
        distDir: process.env.NODE_ENV === 'test' ? undefined : 'private',
        generateBuildId() {
          return process.env.GITHUB_SHA || 'development';
        },
        reactStrictMode: true,
        allowedDevOrigins: ['**.dev.justtellme.com'],
        typescript: {
          tsconfigPath: './tsconfig.build.json',
        },
        turbopack: {
          resolveAlias: { '#src': './src' },
          resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      });
    })
    .then(async (withAllConfig) => {
      if (hasPackage('@sentry/nextjs') && pkgConfig) {
        const [org, name] = pkgConfig.name.split('/');
        const { withSentryConfig } = await import('@sentry/nextjs');

        if (process.env.NO_SENTRY_UPLOAD) {
          return withSentryConfig(
            withAllConfig,
            {
              silent: true,
              org: org.substring(1),
              project: name,
            },
            {
              disableClientWebpackPlugin: true,
              disableServerWebpackPlugin: true,
            },
          );
        }

        const sentryConfig = withSentryConfig(
          withAllConfig,
          {
            silent: true,
            org: org.substring(1),
            project: name,
          },
          {
            // Upload a larger set of source maps for prettier stack traces (increases build time)
            widenClientFileUpload: true,
            // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers (increases server load)
            tunnelRoute: '/monitoring',
            // Hides source maps from generated client bundles
            hideSourceMaps: true,
            // Automatically tree-shake Sentry logger statements to reduce bundle size
            disableLogger: true,
          },
        );
        return sentryConfig;
      }
      return withAllConfig;
    });
}

export default nextConfig;
