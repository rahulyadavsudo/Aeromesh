import type { NextConfig } from 'next';

const appUrlHost = (() => {
  try {
    return process.env.APP_URL ? [new URL(process.env.APP_URL).hostname] : [];
  } catch {
    return [];
  }
})();

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: [
    '**.run.app',
    '*.run.app',
    '**.aistudio.google.com',
    '**.googleusercontent.com',
    'localhost',
    '127.0.0.1',
    ...appUrlHost,
  ],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
