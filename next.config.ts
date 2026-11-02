import type { NextConfig } from 'next';

const config: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  serverExternalPackages: ['pdfkit', 'sharp', 'bcryptjs', 'nodemailer', 'pg'],
  // Resize one image at a time, in WebP only: AVIF encoding and parallel resizes ran a 512 MB instance out of memory
  experimental: { serverActions: { bodySizeLimit: '55mb' }, imgOptConcurrency: 1 },
  images: { formats: ['image/webp'], deviceSizes: [480, 768, 1080, 1440, 1920], qualities: [85] },
  async headers() {
    // Content-Security-Policy is set per request with a nonce in src/proxy.ts
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
        ],
      },
    ];
  },
};

export default config;
