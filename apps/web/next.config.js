const path = require('node:path');
const { loadEnvConfig } = require('@next/env');

// Single .env at the monorepo root, shared with the worker and packages/db.
// forceReload: Next has already loaded (and cached) env for apps/web by this point.
loadEnvConfig(path.resolve(__dirname, '../..'), process.env.NODE_ENV !== 'production', console, true);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@pod-vector-studio/shared', '@pod-vector-studio/db'],
  images: {
    // TODO: add R2 public hostname once bucket is provisioned.
    remotePatterns: [{ protocol: 'https', hostname: '**.r2.dev' }],
  },
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
    // Node-only queue clients: load from node_modules at runtime instead of bundling
    // (bundling BullMQ trips over its optional @valkey/valkey-glide import).
    serverComponentsExternalPackages: ['bullmq', 'ioredis'],
  },
};

module.exports = nextConfig;
