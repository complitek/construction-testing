import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
  serverExternalPackages: [
    '@react-pdf/renderer',
    'pdf-lib',
    'exceljs',
    'canvas',
    '@anthropic-ai/sdk',
  ],
};

export default nextConfig;
