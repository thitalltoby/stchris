import type { MetadataRoute } from 'next';
import { env } from '@/server/env';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/portal', '/api', '/files', '/quotation-pdf', '/request/confirmation', '/staff'] }],
    sitemap: `${env.APP_URL.replace(/\/$/, '')}/sitemap.xml`,
  };
}
